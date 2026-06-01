/**
 * 外部共有サービス
 *
 * 共有リンクの作成・検証・管理
 * セキュリティ：トークンはハッシュ保存、有効期限必須、監査ログ
 * Task 040: 承認フロー追加
 */

import type {
  SharePackage,
  SharePackageStatus,
  CreateShareRequest,
  CreateShareResponse,
  CreateShareDraftResponse,
  RequestApprovalResponse,
  IssueShareResponse,
  ShareAccessLog,
  ExternalSnapshot,
} from './types';
import { generateExternalSnapshot } from './snapshot-generator';
import {
  createApprovalRequest,
  submitApprovalRequest,
  approveRequest as approveApprovalRequest,
  getApprovalRequest
} from '@/lib/approvals/requestRepo';

// インメモリストレージ（本番ではDBに置き換え）
const shareStore = new Map<string, SharePackage>();
const accessLogStore: ShareAccessLog[] = [];

/**
 * トークン生成（URLセーフな32文字）
 */
function generateToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/**
 * トークンのハッシュ化（簡易実装、本番ではbcryptやargon2を使用）
 */
function hashToken(token: string): string {
  // 簡易ハッシュ（本番ではcrypto.subtle.digestを使用）
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    const char = token.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return `hash_${Math.abs(hash).toString(16)}`;
}

/**
 * ID生成
 */
function generateId(): string {
  return `share_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Task 040: 共有パッケージを下書きとして作成（トークン無し）
 */
export function createShareDraft(
  request: CreateShareRequest,
  createdByUserId?: string,
  createdByUserName?: string
): CreateShareDraftResponse {
  const shareId = generateId();

  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + request.expiresInDays);

  // テンプレートIDを取得（デフォルトは銀行向け）
  const templateId = request.templateId ?? 'bank';

  // Task 040: 下書き時はスナップショット・トークンは生成しない
  const sharePackage: SharePackage = {
    id: shareId,
    tokenHash: null,  // 承認前はnull
    name: request.name,
    description: request.description,
    status: 'draft',
    createdAt: now.toISOString(),
    createdByUserId,
    createdByUserName,
    expiresAt: expiresAt.toISOString(),
    templateId,
    snapshot: null,  // 発行時に生成
    accessCount: 0,
    approvalRequestId: null,
    issuedAt: null,
    issuedByUserId: null,
    issuedByUserName: null,
  };

  shareStore.set(shareId, sharePackage);

  return {
    shareId,
    status: 'draft',
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Task 040: 承認依頼を作成
 */
export function requestShareApproval(
  shareId: string,
  requesterUserId: string,
  requesterUserName: string
): { success: true; response: RequestApprovalResponse } | { success: false; error: string } {
  const share = shareStore.get(shareId);
  if (!share) {
    return { success: false, error: '共有パッケージが見つかりません' };
  }

  if (share.status !== 'draft') {
    return { success: false, error: '下書き状態でのみ承認依頼が可能です' };
  }

  // 承認申請を作成
  const approvalResult = createApprovalRequest(
    {
      requestType: 'share_issue',
      entityId: shareId,
      title: `外部共有承認依頼: ${share.name}`,
      summary: `テンプレート: ${share.templateId}、有効期限: ${share.expiresAt}`,
      meta: {
        shareId,
        templateId: share.templateId,
        expiresAt: share.expiresAt,
      },
    },
    requesterUserId,
    requesterUserName
  );

  if (!approvalResult.success || !approvalResult.request) {
    return { success: false, error: approvalResult.error ?? '承認申請の作成に失敗しました' };
  }

  const approvalRequest = approvalResult.request;

  // 承認申請を提出（draft → pending）
  const submitResult = submitApprovalRequest(
    approvalRequest.id,
    requesterUserId,
    requesterUserName
  );

  if (!submitResult.success) {
    return { success: false, error: submitResult.error ?? '承認申請の提出に失敗しました' };
  }

  // 共有パッケージを更新
  share.status = 'pending_approval';
  share.approvalRequestId = approvalRequest.id;

  return {
    success: true,
    response: {
      shareId,
      approvalRequestId: approvalRequest.id,
      status: 'pending_approval',
    },
  };
}

/**
 * Task 040: 共有を発行（承認後）
 */
export function issueShare(
  shareId: string,
  approverUserId: string,
  approverUserName: string
): { success: true; response: IssueShareResponse } | { success: false; error: string } {
  const share = shareStore.get(shareId);
  if (!share) {
    return { success: false, error: '共有パッケージが見つかりません' };
  }

  if (share.status !== 'pending_approval') {
    return { success: false, error: '承認待ち状態でのみ発行が可能です' };
  }

  // 承認申請の状態を確認
  if (share.approvalRequestId) {
    const approvalReq = getApprovalRequest(share.approvalRequestId);
    if (!approvalReq || approvalReq.status !== 'approved') {
      return { success: false, error: '承認が完了していません' };
    }
  }

  const now = new Date();
  const token = generateToken();
  const tokenHash = hashToken(token);

  // スナップショット生成（発行時点で凍結）
  const snapshot = generateExternalSnapshot(share.templateId, share.description);

  // 共有パッケージを更新
  share.tokenHash = tokenHash;
  share.snapshot = snapshot;
  share.status = 'issued';
  share.issuedAt = now.toISOString();
  share.issuedByUserId = approverUserId;
  share.issuedByUserName = approverUserName;

  const baseUrl = process.env.APP_BASE_URL || 'https://dhp-hub.example.com';
  const shareUrl = `${baseUrl}/share/${token}`;

  return {
    success: true,
    response: {
      shareId,
      shareUrl,
      token,  // 一度だけ表示
      status: 'issued',
      issuedAt: share.issuedAt,
      expiresAt: share.expiresAt,
    },
  };
}

/**
 * 共有パッケージを取得
 */
export function getShareById(shareId: string): SharePackage | null {
  return shareStore.get(shareId) ?? null;
}

/**
 * 旧API互換: 共有パッケージを作成（即座にissued状態）
 * @deprecated Task 040以降は createShareDraft + requestShareApproval + issueShare を使用
 */
export function createSharePackage(
  request: CreateShareRequest,
  createdByUserId?: string,
  createdByUserName?: string
): CreateShareResponse {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const shareId = generateId();

  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + request.expiresInDays);

  // テンプレートIDを取得（デフォルトは銀行向け）
  const templateId = request.templateId ?? 'bank';

  // スナップショット生成（凍結、テンプレートに基づく）
  const snapshot = generateExternalSnapshot(templateId, request.notes);

  const sharePackage: SharePackage = {
    id: shareId,
    tokenHash,
    name: request.name,
    description: request.description,
    status: 'issued',  // Task 040: 旧APIは即座にissued
    createdAt: now.toISOString(),
    createdByUserId,
    createdByUserName,
    expiresAt: expiresAt.toISOString(),
    templateId,
    snapshot,
    accessCount: 0,
    issuedAt: now.toISOString(),
    issuedByUserId: createdByUserId,
    issuedByUserName: createdByUserName,
  };

  shareStore.set(shareId, sharePackage);

  // トークンはハッシュ化してDBに保存、平文は一度だけ返す
  const baseUrl = process.env.APP_BASE_URL || 'https://dhp-hub.example.com';
  const shareUrl = `${baseUrl}/share/${token}`;

  return {
    shareId,
    shareUrl,
    token, // 一度だけ表示
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * トークンで共有パッケージを検索
 * Task 040: issued状態のみアクセス可能
 */
export function findShareByToken(token: string): SharePackage | null {
  const tokenHash = hashToken(token);

  for (const share of shareStore.values()) {
    if (share.tokenHash === tokenHash) {
      // 有効期限チェック（issued状態で期限切れの場合はステータス更新）
      if (share.status === 'issued' && new Date(share.expiresAt) < new Date()) {
        share.status = 'expired';
      }

      // Task 040: issued のみアクセス可能（draft/pending_approval/revoked/expired は不可）
      if (share.status !== 'issued') {
        return null;
      }

      return share;
    }
  }

  return null;
}

/**
 * 共有パッケージにアクセス（ログ記録）
 */
export function accessShare(
  token: string,
  ipAddress?: string,
  userAgent?: string
): { success: boolean; share?: SharePackage; error?: string } {
  const share = findShareByToken(token);

  if (!share) {
    return { success: false, error: 'Invalid or expired share link' };
  }

  // アクセスログ記録
  const log: ShareAccessLog = {
    id: `log_${Date.now()}`,
    shareId: share.id,
    accessedAt: new Date().toISOString(),
    ipAddress,
    userAgent,
  };
  accessLogStore.push(log);

  // 統計更新
  share.accessCount += 1;
  share.lastAccessedAt = log.accessedAt;

  return { success: true, share };
}

/**
 * 共有を失効（revoke）
 */
export function revokeShare(shareId: string): boolean {
  const share = shareStore.get(shareId);
  if (!share) return false;

  share.status = 'revoked';
  return true;
}

/**
 * 全共有一覧を取得
 * Task 040: 新ステータス対応
 */
export function listShares(): SharePackage[] {
  const shares = Array.from(shareStore.values());

  // 期限切れを自動更新（issuedのみ）
  const now = new Date();
  shares.forEach((share) => {
    if (share.status === 'issued' && new Date(share.expiresAt) < now) {
      share.status = 'expired';
    }
  });

  // 新しい順にソート
  return shares.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * アクセスログを取得
 */
export function getAccessLogs(shareId?: string): ShareAccessLog[] {
  if (shareId) {
    return accessLogStore.filter((log) => log.shareId === shareId);
  }
  return [...accessLogStore].sort(
    (a, b) => new Date(b.accessedAt).getTime() - new Date(a.accessedAt).getTime()
  );
}

/**
 * 共有の統計情報を取得
 * Task 040: 新ステータス対応
 */
export function getShareStats(): {
  total: number;
  draft: number;
  pendingApproval: number;
  issued: number;
  revoked: number;
  expired: number;
  totalAccesses: number;
} {
  const shares = listShares();
  return {
    total: shares.length,
    draft: shares.filter((s) => s.status === 'draft').length,
    pendingApproval: shares.filter((s) => s.status === 'pending_approval').length,
    issued: shares.filter((s) => s.status === 'issued').length,
    revoked: shares.filter((s) => s.status === 'revoked').length,
    expired: shares.filter((s) => s.status === 'expired').length,
    totalAccesses: shares.reduce((sum, s) => sum + s.accessCount, 0),
  };
}

/**
 * Task 040: 承認却下/差戻し時に下書きに戻す
 */
export function returnShareToDraft(shareId: string): boolean {
  const share = shareStore.get(shareId);
  if (!share) return false;

  if (share.status !== 'pending_approval') {
    return false;
  }

  share.status = 'draft';
  share.approvalRequestId = null;
  return true;
}

/**
 * デモ用：サンプル共有を作成
 * Task 040: 新ステータス対応
 */
export function createDemoShares(): void {
  if (shareStore.size > 0) return;

  // サンプル1: 銀行向け（発行済み）
  createSharePackage(
    {
      name: '〇〇銀行向け 2026年2月 共有',
      description: '融資審査用の経営状況レポート',
      expiresInDays: 30,
      templateId: 'bank',
    },
    'admin',
    '吉田太郎'
  );

  // サンプル2: 下書き（Task 040デモ）
  const draftId = generateId();
  const draftShare: SharePackage = {
    id: draftId,
    tokenHash: null,
    name: '□□信用金庫向け 2026年3月 共有（下書き）',
    description: '新規融資申請用',
    status: 'draft',
    createdAt: new Date().toISOString(),
    createdByUserId: 'admin',
    createdByUserName: '吉田太郎',
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    templateId: 'bank',
    snapshot: null,
    accessCount: 0,
    approvalRequestId: null,
    issuedAt: null,
    issuedByUserId: null,
    issuedByUserName: null,
  };
  shareStore.set(draftId, draftShare);

  // サンプル3（投資家向け・期限切れ）
  const demo2Id = generateId();
  const demo2Snapshot = generateExternalSnapshot('investor');
  const expiredShare: SharePackage = {
    id: demo2Id,
    tokenHash: hashToken('expired_token_demo'),
    name: '△△ファンド向け 2025年12月 共有',
    status: 'expired',
    createdAt: '2025-12-01T09:00:00Z',
    createdByUserId: 'admin',
    createdByUserName: '吉田太郎',
    expiresAt: '2025-12-31T23:59:59Z',
    templateId: 'investor',
    snapshot: demo2Snapshot,
    accessCount: 5,
    lastAccessedAt: '2025-12-28T14:30:00Z',
    issuedAt: '2025-12-01T09:00:00Z',
    issuedByUserId: 'admin',
    issuedByUserName: '吉田太郎',
  };
  shareStore.set(demo2Id, expiredShare);

  // サンプル4（監査向け・失効済み）
  const demo3Id = generateId();
  const demo3Snapshot = generateExternalSnapshot('audit');
  const revokedShare: SharePackage = {
    id: demo3Id,
    tokenHash: hashToken('revoked_token_demo'),
    name: '内部テスト用（失効済み）',
    status: 'revoked',
    createdAt: '2026-01-15T10:00:00Z',
    createdByUserId: 'admin',
    createdByUserName: '吉田太郎',
    expiresAt: '2026-02-15T23:59:59Z',
    templateId: 'audit',
    snapshot: demo3Snapshot,
    accessCount: 2,
    issuedAt: '2026-01-15T10:00:00Z',
    issuedByUserId: 'admin',
    issuedByUserName: '吉田太郎',
  };
  shareStore.set(demo3Id, revokedShare);
}
