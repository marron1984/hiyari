/**
 * キーパーソン管理 型定義
 *
 * 利用者ごとの連絡先（キーパーソン）を管理
 * PIIを含むためRBAC厳格に管理
 */

// 対象種別
export type KeyPersonSubjectType = 'client' | 'case' | 'other';

// 推奨連絡手段
export type PreferredContactType = 'phone' | 'sms' | 'line' | 'email' | 'any';

// 同意状況
export type ConsentStatus = 'unknown' | 'granted' | 'denied';

// 連絡先
export interface KeyPersonContact {
  id: string;
  subjectType: KeyPersonSubjectType;
  subjectId: string;
  priorityOrder: number;
  name: string;
  relation: string | null;
  phone: string | null;
  email: string | null;
  lineIdOrHint: string | null;
  preferredContactType: PreferredContactType | null;
  availableTimeHint: string | null;
  notes: string | null;
  isEmergency: boolean;
  consentStatus: ConsentStatus | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
}

// 監査イベント
export interface KeyPersonEvent {
  id: string;
  contactId: string;
  actorUserId: string;
  action: 'create' | 'update' | 'deactivate' | 'reorder';
  beforeJson: Record<string, unknown> | null;
  afterJson: Record<string, unknown> | null;
  createdAt: string;
  note: string | null;
}

// 作成リクエスト
export interface CreateKeyPersonRequest {
  subjectType: KeyPersonSubjectType;
  subjectId: string;
  priorityOrder?: number;
  name: string;
  relation?: string | null;
  phone?: string | null;
  email?: string | null;
  lineIdOrHint?: string | null;
  preferredContactType?: PreferredContactType | null;
  availableTimeHint?: string | null;
  notes?: string | null;
  isEmergency?: boolean;
  consentStatus?: ConsentStatus | null;
}

// 更新リクエスト
export interface UpdateKeyPersonRequest {
  name?: string;
  relation?: string | null;
  phone?: string | null;
  email?: string | null;
  lineIdOrHint?: string | null;
  preferredContactType?: PreferredContactType | null;
  availableTimeHint?: string | null;
  notes?: string | null;
  isEmergency?: boolean;
  consentStatus?: ConsentStatus | null;
}

// ラベル定義
export const KEY_PERSON_SUBJECT_TYPE_LABELS: Record<KeyPersonSubjectType, string> = {
  client: '利用者',
  case: '案件',
  other: 'その他',
};

export const PREFERRED_CONTACT_TYPE_LABELS: Record<PreferredContactType, string> = {
  phone: '電話',
  sms: 'SMS',
  line: 'LINE',
  email: 'メール',
  any: '指定なし',
};

export const CONSENT_STATUS_LABELS: Record<ConsentStatus, string> = {
  unknown: '未確認',
  granted: '同意済',
  denied: '拒否',
};

// 設定
export const PREFERRED_CONTACT_TYPE_CONFIG: Record<
  PreferredContactType,
  { label: string; bg: string; text: string }
> = {
  phone: { label: '電話', bg: 'bg-blue-100', text: 'text-blue-700' },
  sms: { label: 'SMS', bg: 'bg-green-100', text: 'text-green-700' },
  line: { label: 'LINE', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  email: { label: 'メール', bg: 'bg-purple-100', text: 'text-purple-700' },
  any: { label: '指定なし', bg: 'bg-zinc-100', text: 'text-zinc-700' },
};

export const CONSENT_STATUS_CONFIG: Record<
  ConsentStatus,
  { label: string; bg: string; text: string }
> = {
  unknown: { label: '未確認', bg: 'bg-zinc-100', text: 'text-zinc-700' },
  granted: { label: '同意済', bg: 'bg-green-100', text: 'text-green-700' },
  denied: { label: '拒否', bg: 'bg-red-100', text: 'text-red-700' },
};

// RBAC
export type UserRole = 'staff' | 'leader' | 'manager' | 'admin' | 'executive' | 'auditor';

export interface ViewerContext {
  userId: string;
  role: UserRole;
}

/**
 * キーパーソンを管理できるか（作成/編集/全件閲覧）
 */
export function canManageKeyPerson(role: UserRole): boolean {
  return ['manager', 'admin', 'executive'].includes(role);
}

/**
 * キーパーソンを閲覧できるか
 * 初期はmanager以上のみ（安全優先）
 */
export function canViewKeyPerson(role: UserRole): boolean {
  return ['manager', 'admin', 'executive', 'auditor'].includes(role);
}

/**
 * キーパーソンを編集できるか
 */
export function canEditKeyPerson(role: UserRole): boolean {
  return ['manager', 'admin', 'executive'].includes(role);
}

/**
 * PIIをマスクなしで表示できるか
 */
export function canViewPII(role: UserRole): boolean {
  return ['manager', 'admin', 'executive'].includes(role);
}

/**
 * 監査ログを閲覧できるか
 */
export function canViewAuditLog(role: UserRole): boolean {
  return ['manager', 'admin', 'executive', 'auditor'].includes(role);
}

/**
 * PIIマスク（電話番号）
 */
export function maskPhone(phone: string | null): string {
  if (!phone) return '-';
  if (phone.length <= 4) return '****';
  return phone.slice(0, -4) + '****';
}

/**
 * PIIマスク（メール）
 */
export function maskEmail(email: string | null): string {
  if (!email) return '-';
  const atIndex = email.indexOf('@');
  if (atIndex <= 2) return '***@***';
  return email.slice(0, 2) + '***@***';
}
