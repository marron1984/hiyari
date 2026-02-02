/**
 * 同意書管理（Agreements）型定義
 *
 * 同意書種別、本文（版）、同意レコード、監査ログ
 */

// ========== 権限コンテキスト ==========

export type UserRole = 'staff' | 'leader' | 'manager' | 'admin' | 'executive' | 'auditor';

export interface ViewerContext {
  userId: string;
  role: UserRole;
}

// ========== 同意書種別カテゴリ ==========

export type AgreementCategory = 'client' | 'staff' | 'family' | 'vendor' | 'other';

export const AGREEMENT_CATEGORY_LABELS: Record<AgreementCategory, string> = {
  client: '利用者',
  staff: '職員',
  family: '家族',
  vendor: '取引先',
  other: 'その他',
};

// ========== 同意書種別（マスタ） ==========

export interface AgreementType {
  id: string;
  key: string;                      // 固有キー（例: privacy_consent）
  title: string;                    // 表示名
  description: string | null;
  category: AgreementCategory;

  requiresRenewal: boolean;         // 更新が必要か
  defaultValidDays: number | null;  // 例: 365
  defaultWarnDays: number | null;   // 例: 30

  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ========== 同意書本文（版） ==========

export type DocumentStatus = 'active' | 'archived';

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  active: '有効',
  archived: 'アーカイブ',
};

export interface AgreementDocument {
  id: string;
  agreementTypeId: string;
  templateKey: string;              // templates（022）のkey
  templateVersion: number;          // templates（022）のversion
  titleOverride: string | null;
  status: DocumentStatus;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
}

// ========== 同意レコード ==========

export type SubjectType = 'client' | 'staff' | 'family' | 'other';

export const SUBJECT_TYPE_LABELS: Record<SubjectType, string> = {
  client: '利用者',
  staff: '職員',
  family: '家族',
  other: 'その他',
};

export type ConsentStatus = 'consented' | 'declined' | 'withdrawn';

export const CONSENT_STATUS_LABELS: Record<ConsentStatus, string> = {
  consented: '同意済',
  declined: '不同意',
  withdrawn: '撤回',
};

export const CONSENT_STATUS_CONFIG: Record<
  ConsentStatus,
  { label: string; color: string; bgColor: string }
> = {
  consented: { label: '同意済', color: 'text-green-700', bgColor: 'bg-green-50' },
  declined: { label: '不同意', color: 'text-red-700', bgColor: 'bg-red-50' },
  withdrawn: { label: '撤回', color: 'text-zinc-700', bgColor: 'bg-zinc-100' },
};

export type ConsentMethod = 'in_person' | 'paper' | 'phone' | 'online' | 'other';

export const CONSENT_METHOD_LABELS: Record<ConsentMethod, string> = {
  in_person: '対面',
  paper: '書面',
  phone: '電話',
  online: 'オンライン',
  other: 'その他',
};

export interface AgreementConsent {
  id: string;
  agreementTypeId: string;
  agreementDocumentId: string;      // 版固定
  subjectType: SubjectType;
  subjectId: string | null;         // 利用者ID/職員IDなど
  subjectName: string;              // 表示用（PII）

  consentStatus: ConsentStatus;
  consentedAt: string | null;
  consentedByUserId: string | null; // 記録者
  method: ConsentMethod;
  note: string | null;

  validUntil: string | null;        // 期限（requiresRenewal=true時）
  revokedAt: string | null;

  createdAt: string;
  updatedAt: string;
}

// ========== 監査ログ ==========

export type AgreementEntityType = 'type' | 'document' | 'consent';

export type AgreementEventAction =
  | 'create'
  | 'update'
  | 'activate_document'
  | 'archive_document'
  | 'record_consent'
  | 'withdraw'
  | 'renew';

export const AGREEMENT_EVENT_ACTION_LABELS: Record<AgreementEventAction, string> = {
  create: '作成',
  update: '更新',
  activate_document: '有効化',
  archive_document: 'アーカイブ',
  record_consent: '同意記録',
  withdraw: '撤回',
  renew: '更新',
};

export interface AgreementEvent {
  id: string;
  entityType: AgreementEntityType;
  entityId: string;
  actorUserId: string | null;
  action: AgreementEventAction;
  beforeJson: string | null;
  afterJson: string | null;
  createdAt: string;
  note: string | null;
}

// ========== 統計 ==========

export interface AgreementStats {
  expiringCount: number;            // 期限接近
  expiredCount: number;             // 期限切れ
  consentedCountThisMonth: number;  // 今月の同意件数
  totalActiveTypes: number;
  totalConsents: number;
  byType: Record<string, { consented: number; expired: number }>;
}

// ========== RBAC ==========

/**
 * 同意書種別/本文の管理（作成・編集・切替）が可能か
 */
export function canManageAgreementTypes(role: UserRole): boolean {
  return ['admin', 'executive'].includes(role);
}

/**
 * 同意レコードの閲覧が可能か
 * manager以上 or auditor
 */
export function canViewConsents(role: UserRole): boolean {
  return ['manager', 'admin', 'executive', 'auditor'].includes(role);
}

/**
 * 同意レコードの記録・更新が可能か
 * manager以上（auditorは不可）
 */
export function canRecordConsents(role: UserRole): boolean {
  return ['manager', 'admin', 'executive'].includes(role);
}

/**
 * 自分の同意レコードのみ閲覧可能か（staff/leader）
 */
export function canViewOwnConsentsOnly(role: UserRole): boolean {
  return ['staff', 'leader'].includes(role);
}

/**
 * 特定の同意レコードの閲覧権限チェック
 */
export function canViewConsent(
  viewer: ViewerContext,
  consent: AgreementConsent
): boolean {
  // manager以上/auditorは全件閲覧可
  if (canViewConsents(viewer.role)) {
    return true;
  }
  // staff/leaderは自分の同意のみ
  if (
    canViewOwnConsentsOnly(viewer.role) &&
    consent.subjectType === 'staff' &&
    consent.subjectId === viewer.userId
  ) {
    return true;
  }
  return false;
}

// ========== ユーティリティ ==========

/**
 * 期限警告判定
 */
export function isExpiring(
  validUntil: string | null,
  warnDays: number = 30
): boolean {
  if (!validUntil) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expireDate = new Date(validUntil);
  const warnDate = new Date(expireDate);
  warnDate.setDate(warnDate.getDate() - warnDays);
  return today >= warnDate && today <= expireDate;
}

/**
 * 期限切れ判定
 */
export function isExpired(validUntil: string | null): boolean {
  if (!validUntil) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expireDate = new Date(validUntil);
  return today > expireDate;
}

/**
 * 期限までの日数を計算
 */
export function daysUntilExpiry(validUntil: string | null): number | null {
  if (!validUntil) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expireDate = new Date(validUntil);
  const diffTime = expireDate.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * 日付に日数を加算
 */
export function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

// ========== 入力型 ==========

export interface CreateAgreementTypeInput {
  key: string;
  title: string;
  description?: string | null;
  category: AgreementCategory;
  requiresRenewal?: boolean;
  defaultValidDays?: number | null;
  defaultWarnDays?: number | null;
}

export interface UpdateAgreementTypeInput {
  title?: string;
  description?: string | null;
  category?: AgreementCategory;
  requiresRenewal?: boolean;
  defaultValidDays?: number | null;
  defaultWarnDays?: number | null;
  isActive?: boolean;
}

export interface CreateDocumentInput {
  templateKey: string;
  templateVersion: number;
  titleOverride?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
}

export interface RecordConsentInput {
  agreementTypeId: string;
  subjectType: SubjectType;
  subjectId?: string | null;
  subjectName: string;
  consentStatus: ConsentStatus;
  method: ConsentMethod;
  note?: string | null;
  consentedAt?: string | null;    // 省略時は現在日時
  validUntil?: string | null;     // 省略時はrequiresRenewalなら自動計算
}

export interface ListConsentsFilter {
  agreementTypeId?: string;
  subjectType?: SubjectType;
  consentStatus?: ConsentStatus;
  expiringWithinDays?: number;
  expired?: boolean;
  q?: string;                     // subjectName検索
  limit?: number;
  offset?: number;
}
