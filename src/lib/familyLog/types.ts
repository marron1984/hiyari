/**
 * 家族連絡ログ 型定義
 *
 * 利用者ごとの家族連絡履歴を記録・検索
 * PIIを含むためRBAC厳格に管理
 */

// 対象種別
export type FamilyLogSubjectType = 'client' | 'case' | 'other';

// 連絡手段
export type FamilyLogContactType =
  | 'phone'
  | 'sms'
  | 'line'
  | 'email'
  | 'in_person'
  | 'other';

// 連絡方向
export type FamilyLogDirection = 'outbound' | 'inbound';

// カテゴリ
export type FamilyLogCategory =
  | 'routine'
  | 'medical'
  | 'safety'
  | 'billing'
  | 'complaint'
  | 'other';

// 重要度
export type FamilyLogImportance = 'normal' | 'high' | 'critical';

// 連絡ログ
export interface FamilyContactLog {
  id: string;
  subjectType: FamilyLogSubjectType;
  subjectId: string;
  contactType: FamilyLogContactType;
  direction: FamilyLogDirection;
  category: FamilyLogCategory;
  importance: FamilyLogImportance;
  counterpartName: string | null;
  counterpartRelation: string | null;
  summary: string;
  detail: string | null;
  occurredAt: string;
  recordedByUserId: string;
  relatedType: string | null;
  relatedId: string | null;
  createdAt: string;
  updatedAt: string;
}

// 監査イベント
export interface FamilyContactLogEvent {
  id: string;
  logId: string;
  actorUserId: string;
  action: 'create' | 'update';
  beforeJson: Record<string, unknown> | null;
  afterJson: Record<string, unknown> | null;
  createdAt: string;
}

// 統計
export interface FamilyLogStats {
  total: number;
  criticalCount: number;
  highCount: number;
  thisWeekCount: number;
  byCategory: Record<FamilyLogCategory, number>;
}

// 作成リクエスト
export interface CreateFamilyLogRequest {
  subjectType: FamilyLogSubjectType;
  subjectId: string;
  contactType: FamilyLogContactType;
  direction: FamilyLogDirection;
  category: FamilyLogCategory;
  importance: FamilyLogImportance;
  counterpartName?: string | null;
  counterpartRelation?: string | null;
  summary: string;
  detail?: string | null;
  occurredAt: string;
  relatedType?: string | null;
  relatedId?: string | null;
}

// 更新リクエスト
export interface UpdateFamilyLogRequest {
  contactType?: FamilyLogContactType;
  direction?: FamilyLogDirection;
  category?: FamilyLogCategory;
  importance?: FamilyLogImportance;
  counterpartName?: string | null;
  counterpartRelation?: string | null;
  summary?: string;
  detail?: string | null;
  occurredAt?: string;
  relatedType?: string | null;
  relatedId?: string | null;
}

// 一覧オプション
export interface ListFamilyLogsOptions {
  subjectId?: string;
  subjectType?: FamilyLogSubjectType;
  dateFrom?: string;
  dateTo?: string;
  importance?: FamilyLogImportance;
  category?: FamilyLogCategory;
  contactType?: FamilyLogContactType;
  recordedByUserId?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

// ラベル定義
export const FAMILY_LOG_SUBJECT_TYPE_LABELS: Record<FamilyLogSubjectType, string> = {
  client: '利用者',
  case: '案件',
  other: 'その他',
};

export const FAMILY_LOG_CONTACT_TYPE_LABELS: Record<FamilyLogContactType, string> = {
  phone: '電話',
  sms: 'SMS',
  line: 'LINE',
  email: 'メール',
  in_person: '対面',
  other: 'その他',
};

export const FAMILY_LOG_DIRECTION_LABELS: Record<FamilyLogDirection, string> = {
  outbound: '発信',
  inbound: '着信',
};

export const FAMILY_LOG_CATEGORY_LABELS: Record<FamilyLogCategory, string> = {
  routine: '定期連絡',
  medical: '医療関連',
  safety: '安全関連',
  billing: '請求関連',
  complaint: '苦情対応',
  other: 'その他',
};

export const FAMILY_LOG_IMPORTANCE_LABELS: Record<FamilyLogImportance, string> = {
  normal: '通常',
  high: '重要',
  critical: '緊急',
};

// 重要度設定
export const FAMILY_LOG_IMPORTANCE_CONFIG: Record<
  FamilyLogImportance,
  { label: string; bg: string; text: string; border: string }
> = {
  normal: {
    label: '通常',
    bg: 'bg-zinc-100',
    text: 'text-zinc-700',
    border: 'border-zinc-200',
  },
  high: {
    label: '重要',
    bg: 'bg-amber-100',
    text: 'text-amber-700',
    border: 'border-amber-300',
  },
  critical: {
    label: '緊急',
    bg: 'bg-red-100',
    text: 'text-red-700',
    border: 'border-red-300',
  },
};

// カテゴリ設定
export const FAMILY_LOG_CATEGORY_CONFIG: Record<
  FamilyLogCategory,
  { label: string; bg: string; text: string }
> = {
  routine: { label: '定期連絡', bg: 'bg-blue-100', text: 'text-blue-700' },
  medical: { label: '医療関連', bg: 'bg-purple-100', text: 'text-purple-700' },
  safety: { label: '安全関連', bg: 'bg-orange-100', text: 'text-orange-700' },
  billing: { label: '請求関連', bg: 'bg-green-100', text: 'text-green-700' },
  complaint: { label: '苦情対応', bg: 'bg-red-100', text: 'text-red-700' },
  other: { label: 'その他', bg: 'bg-zinc-100', text: 'text-zinc-700' },
};

// RBAC
export type UserRole = 'staff' | 'leader' | 'manager' | 'admin' | 'executive' | 'auditor';

export interface ViewerContext {
  userId: string;
  role: UserRole;
}

/**
 * 家族連絡ログを管理できるか（作成/全件閲覧）
 */
export function canManageFamilyLogs(role: UserRole): boolean {
  return ['manager', 'admin', 'executive', 'auditor'].includes(role);
}

/**
 * 特定のログを閲覧できるか
 */
export function canViewFamilyLog(
  log: FamilyContactLog,
  viewer: ViewerContext
): boolean {
  // manager以上は全件閲覧可
  if (canManageFamilyLogs(viewer.role)) {
    return true;
  }
  // staff/leaderは自分が記録したログのみ
  return log.recordedByUserId === viewer.userId;
}

/**
 * 特定のログを編集できるか
 */
export function canEditFamilyLog(
  log: FamilyContactLog,
  viewer: ViewerContext
): boolean {
  // manager以上は編集可
  if (['manager', 'admin', 'executive'].includes(viewer.role)) {
    return true;
  }
  // 作成者は編集可
  return log.recordedByUserId === viewer.userId;
}

/**
 * 統計を閲覧できるか
 */
export function canViewFamilyLogStats(role: UserRole): boolean {
  return ['manager', 'admin', 'executive'].includes(role);
}
