/**
 * 電子署名ログ（E-Sign Log）
 *
 * Implementation Ticket 048: 署名/同意の証跡ログを一元管理
 * - documents（025）/ agreements（024）/ contracts（026）と紐づく
 * - 「誰が・いつ・どの版に・どの方法で」署名/同意したか記録
 */

import type { AppRole } from '@/config/appRoles';

// =========================================
// ステータス・メソッド定義
// =========================================

/** 署名対象タイプ */
export type SubjectType = 'client' | 'staff' | 'family' | 'vendor' | 'other';

/** 署名ステータス */
export type SignStatus = 'requested' | 'signed' | 'declined' | 'voided' | 'expired';

/** 署名方法 */
export type SignMethod = 'paper' | 'in_person' | 'online' | 'vendor' | 'other';

/** 外部プロバイダー（将来用） */
export type ExternalProvider = 'none' | 'docusign' | 'adobe' | 'other';

/** 監査ログアクション */
export type SignEventAction = 'create' | 'update' | 'request' | 'sign' | 'void' | 'expire' | 'decline';

// =========================================
// 設定オブジェクト（UI用）
// =========================================

export const SUBJECT_TYPE_CONFIG: Record<SubjectType, { label: string; color: string; bgColor: string }> = {
  client: { label: '利用者', color: 'text-blue-700', bgColor: 'bg-blue-50' },
  staff: { label: '従業員', color: 'text-green-700', bgColor: 'bg-green-50' },
  family: { label: '家族', color: 'text-purple-700', bgColor: 'bg-purple-50' },
  vendor: { label: '取引先', color: 'text-orange-700', bgColor: 'bg-orange-50' },
  other: { label: 'その他', color: 'text-zinc-700', bgColor: 'bg-zinc-50' },
};

export const SIGN_STATUS_CONFIG: Record<SignStatus, { label: string; color: string; bgColor: string; borderColor: string }> = {
  requested: { label: '署名待ち', color: 'text-amber-700', bgColor: 'bg-amber-50', borderColor: 'border-amber-200' },
  signed: { label: '署名済み', color: 'text-green-700', bgColor: 'bg-green-50', borderColor: 'border-green-200' },
  declined: { label: '辞退', color: 'text-red-700', bgColor: 'bg-red-50', borderColor: 'border-red-200' },
  voided: { label: '無効', color: 'text-zinc-700', bgColor: 'bg-zinc-100', borderColor: 'border-zinc-300' },
  expired: { label: '期限切れ', color: 'text-rose-700', bgColor: 'bg-rose-50', borderColor: 'border-rose-200' },
};

export const SIGN_METHOD_CONFIG: Record<SignMethod, { label: string; description: string }> = {
  paper: { label: '紙面署名', description: '紙の書類に直筆で署名' },
  in_person: { label: '対面確認', description: '対面で本人確認の上、同意を取得' },
  online: { label: 'オンライン', description: 'Webフォーム等でオンライン署名' },
  vendor: { label: '外部サービス', description: 'DocuSign等の外部署名サービス' },
  other: { label: 'その他', description: 'その他の方法' },
};

export const SIGN_EVENT_ACTION_CONFIG: Record<SignEventAction, { label: string; color: string }> = {
  create: { label: '作成', color: 'text-blue-600' },
  update: { label: '更新', color: 'text-zinc-600' },
  request: { label: '署名依頼', color: 'text-amber-600' },
  sign: { label: '署名', color: 'text-green-600' },
  decline: { label: '辞退', color: 'text-red-600' },
  void: { label: '無効化', color: 'text-zinc-600' },
  expire: { label: '期限切れ', color: 'text-rose-600' },
};

// =========================================
// エンティティ定義
// =========================================

/**
 * 電子署名レコード
 */
export interface ESignRecord {
  id: string;

  // 署名者情報
  subjectType: SubjectType;
  subjectId: string | null;       // 内部ID（staff ならユーザーID等）
  subjectName: string;            // PII（閲覧制御対象）

  // 紐づく文書
  documentId: string | null;          // documents.id
  documentVersionId: string | null;   // documentsの特定版（推奨：固定）
  agreementConsentId: string | null;  // agreements.consents.id（あれば）
  contractId: string | null;          // contracts.id（あれば）

  // ステータス
  status: SignStatus;
  method: SignMethod;
  requestedAt: string | null;     // 署名依頼日時
  signedAt: string | null;        // 署名日時
  expiresAt: string | null;       // 署名期限（任意）
  recordedByUserId: string | null; // 記録者
  note: string | null;

  // 外部連携（将来用）
  externalProvider: ExternalProvider;
  externalEnvelopeId: string | null;

  // メタ
  createdAt: string;
  updatedAt: string;
}

/**
 * 電子署名イベント（監査ログ）
 */
export interface ESignEvent {
  id: string;
  recordId: string;               // e_sign_records.id
  actorUserId: string | null;     // 操作者
  action: SignEventAction;
  beforeJson: string | null;      // 変更前JSON
  afterJson: string | null;       // 変更後JSON
  createdAt: string;
  note: string | null;
}

/**
 * 統計情報
 */
export interface ESignStats {
  totalRequested: number;
  totalSigned: number;
  totalDeclined: number;
  totalVoided: number;
  totalExpired: number;
  expiringWithin7Days: number;
  signedThisMonth: number;
}

// =========================================
// 入力型
// =========================================

export interface CreateESignRecordInput {
  subjectType: SubjectType;
  subjectId?: string | null;
  subjectName: string;
  documentId?: string | null;
  documentVersionId?: string | null;
  agreementConsentId?: string | null;
  contractId?: string | null;
  method: SignMethod;
  status?: SignStatus;
  requestedAt?: string | null;
  signedAt?: string | null;
  expiresAt?: string | null;
  note?: string | null;
  externalProvider?: ExternalProvider;
  externalEnvelopeId?: string | null;
}

export interface UpdateESignRecordInput {
  subjectName?: string;
  method?: SignMethod;
  expiresAt?: string | null;
  note?: string | null;
}

export interface ListESignRecordsFilter {
  status?: SignStatus;
  subjectType?: SubjectType;
  expiringWithinDays?: number;
  documentId?: string;
  q?: string;  // subjectName検索（manager以上のみ）
  limit?: number;
  offset?: number;
}

// =========================================
// RBAC
// =========================================

/**
 * 署名ログ閲覧権限
 * - staff/leader: 自分のレコードのみ（subjectType='staff' & subjectId=me）
 * - manager/admin/executive/auditor: 全体閲覧可
 */
export function canViewESignRecords(role: AppRole): boolean {
  return ['staff', 'leader', 'manager', 'admin', 'executive', 'auditor'].includes(role);
}

/**
 * 全体一覧閲覧権限（PIIを含む）
 * - manager以上のみ
 */
export function canViewAllESignRecords(role: AppRole): boolean {
  return ['manager', 'admin', 'executive', 'auditor'].includes(role);
}

/**
 * 署名ログ作成権限
 */
export function canCreateESignRecord(role: AppRole): boolean {
  return ['manager', 'admin', 'executive'].includes(role);
}

/**
 * 署名ログ更新権限（ステータス変更含む）
 */
export function canUpdateESignRecord(role: AppRole): boolean {
  return ['manager', 'admin', 'executive'].includes(role);
}

/**
 * subjectName検索権限
 */
export function canSearchBySubjectName(role: AppRole): boolean {
  return ['manager', 'admin', 'executive', 'auditor'].includes(role);
}

// =========================================
// ユーティリティ
// =========================================

/**
 * PIIマスク（staff/leader向け）
 */
export function maskSubjectName(name: string): string {
  if (!name || name.length <= 1) return '***';
  return name.charAt(0) + '***';
}

/**
 * 期限超過判定
 */
export function isOverdue(record: ESignRecord): boolean {
  if (record.status !== 'requested') return false;
  if (!record.expiresAt) return false;
  return new Date(record.expiresAt) < new Date();
}

/**
 * 期限間近判定（7日以内）
 */
export function isExpiringSoon(record: ESignRecord, days: number = 7): boolean {
  if (record.status !== 'requested') return false;
  if (!record.expiresAt) return false;
  const expiresAt = new Date(record.expiresAt);
  const now = new Date();
  const diffDays = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays > 0 && diffDays <= days;
}
