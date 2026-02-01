/**
 * 外部共有サービス
 *
 * 共有リンクの作成・検証・管理
 * セキュリティ：トークンはハッシュ保存、有効期限必須、監査ログ
 */

import type {
  SharePackage,
  SharePackageStatus,
  CreateShareRequest,
  CreateShareResponse,
  ShareAccessLog,
  ExternalSnapshot,
} from './types';
import { generateExternalSnapshot } from './snapshot-generator';

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
 * 共有パッケージを作成
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

  // スナップショット生成（凍結）
  const snapshot = generateExternalSnapshot();

  const sharePackage: SharePackage = {
    id: shareId,
    tokenHash,
    name: request.name,
    description: request.description,
    status: 'active',
    createdAt: now.toISOString(),
    createdByUserId,
    createdByUserName,
    expiresAt: expiresAt.toISOString(),
    snapshot,
    accessCount: 0,
  };

  shareStore.set(shareId, sharePackage);

  // トークンはハッシュ化してDBに保存、平文は一度だけ返す
  const baseUrl = process.env.APP_BASE_URL || 'https://aa-hub.example.com';
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
 */
export function findShareByToken(token: string): SharePackage | null {
  const tokenHash = hashToken(token);

  for (const share of shareStore.values()) {
    if (share.tokenHash === tokenHash) {
      // ステータスチェック
      if (share.status === 'revoked') {
        return null;
      }

      // 有効期限チェック
      if (new Date(share.expiresAt) < new Date()) {
        share.status = 'expired';
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
 */
export function listShares(): SharePackage[] {
  const shares = Array.from(shareStore.values());

  // 期限切れを自動更新
  const now = new Date();
  shares.forEach((share) => {
    if (share.status === 'active' && new Date(share.expiresAt) < now) {
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
 */
export function getShareStats(): {
  total: number;
  active: number;
  revoked: number;
  expired: number;
  totalAccesses: number;
} {
  const shares = listShares();
  return {
    total: shares.length,
    active: shares.filter((s) => s.status === 'active').length,
    revoked: shares.filter((s) => s.status === 'revoked').length,
    expired: shares.filter((s) => s.status === 'expired').length,
    totalAccesses: shares.reduce((sum, s) => sum + s.accessCount, 0),
  };
}

/**
 * デモ用：サンプル共有を作成
 */
export function createDemoShares(): void {
  if (shareStore.size > 0) return;

  // サンプル1
  const demo1 = createSharePackage(
    {
      name: '〇〇銀行向け 2026年2月 共有',
      description: '融資審査用の経営状況レポート',
      expiresInDays: 30,
    },
    'admin',
    '吉田太郎'
  );

  // サンプル2（期限切れ）
  const demo2Id = generateId();
  const demo2Snapshot = generateExternalSnapshot();
  const expiredShare: SharePackage = {
    id: demo2Id,
    tokenHash: hashToken('expired_token_demo'),
    name: '△△ファンド向け 2025年12月 共有',
    status: 'expired',
    createdAt: '2025-12-01T09:00:00Z',
    expiresAt: '2025-12-31T23:59:59Z',
    snapshot: demo2Snapshot,
    accessCount: 5,
    lastAccessedAt: '2025-12-28T14:30:00Z',
  };
  shareStore.set(demo2Id, expiredShare);

  // サンプル3（失効済み）
  const demo3Id = generateId();
  const demo3Snapshot = generateExternalSnapshot();
  const revokedShare: SharePackage = {
    id: demo3Id,
    tokenHash: hashToken('revoked_token_demo'),
    name: '内部テスト用（失効済み）',
    status: 'revoked',
    createdAt: '2026-01-15T10:00:00Z',
    expiresAt: '2026-02-15T23:59:59Z',
    snapshot: demo3Snapshot,
    accessCount: 2,
  };
  shareStore.set(demo3Id, revokedShare);
}
