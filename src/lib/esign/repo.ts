/**
 * 電子署名ログ リポジトリ
 *
 * Implementation Ticket 048
 */

import type { AppRole } from '@/config/appRoles';
import type {
  ESignRecord,
  ESignEvent,
  ESignStats,
  CreateESignRecordInput,
  UpdateESignRecordInput,
  ListESignRecordsFilter,
  SignStatus,
  SignEventAction,
} from './types';
import {
  canViewESignRecords,
  canViewAllESignRecords,
  canCreateESignRecord,
  canUpdateESignRecord,
  canSearchBySubjectName,
  maskSubjectName,
  isOverdue,
  isExpiringSoon,
} from './types';

// =========================================
// ストア（In-Memory）
// =========================================

const esignRecordsStore = new Map<string, ESignRecord>();
const esignEventsStore: ESignEvent[] = [];

// =========================================
// ユーティリティ
// =========================================

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function now(): string {
  return new Date().toISOString();
}

// =========================================
// 監査ログ
// =========================================

function logEvent(
  recordId: string,
  action: SignEventAction,
  actorUserId: string | null,
  beforeData: unknown | null,
  afterData: unknown | null,
  note: string | null = null
): void {
  const event: ESignEvent = {
    id: generateId('esev'),
    recordId,
    actorUserId,
    action,
    beforeJson: beforeData ? JSON.stringify(beforeData) : null,
    afterJson: afterData ? JSON.stringify(afterData) : null,
    createdAt: now(),
    note,
  };
  esignEventsStore.push(event);
}

// =========================================
// ビューアーコンテキスト
// =========================================

export interface ViewerContext {
  userId: string;
  role: AppRole;
}

// =========================================
// CRUD操作
// =========================================

/**
 * 署名レコード一覧取得
 */
export function listESignRecords(
  viewer: ViewerContext,
  filter: ListESignRecordsFilter = {}
): { records: ESignRecord[]; total: number } {
  if (!canViewESignRecords(viewer.role)) {
    return { records: [], total: 0 };
  }

  let items = Array.from(esignRecordsStore.values());

  // staff/leader は自分のレコードのみ
  if (!canViewAllESignRecords(viewer.role)) {
    items = items.filter(
      (r) => r.subjectType === 'staff' && r.subjectId === viewer.userId
    );
  }

  // フィルタ適用
  if (filter.status) {
    items = items.filter((r) => r.status === filter.status);
  }
  if (filter.subjectType) {
    items = items.filter((r) => r.subjectType === filter.subjectType);
  }
  if (filter.documentId) {
    items = items.filter((r) => r.documentId === filter.documentId);
  }
  if (filter.expiringWithinDays !== undefined && filter.expiringWithinDays > 0) {
    items = items.filter((r) => isExpiringSoon(r, filter.expiringWithinDays));
  }
  // 検索（manager以上のみ）
  if (filter.q && canSearchBySubjectName(viewer.role)) {
    const q = filter.q.toLowerCase();
    items = items.filter((r) => r.subjectName.toLowerCase().includes(q));
  }

  // ソート（新しい順）
  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const total = items.length;

  // ページネーション
  const offset = filter.offset ?? 0;
  const limit = filter.limit ?? 50;
  items = items.slice(offset, offset + limit);

  // PIIマスク（staff/leader向け）
  if (!canViewAllESignRecords(viewer.role)) {
    items = items.map((r) => ({
      ...r,
      subjectName: r.subjectId === viewer.userId ? r.subjectName : maskSubjectName(r.subjectName),
    }));
  }

  return { records: items, total };
}

/**
 * 署名レコード取得（ID指定）
 */
export function getESignRecordById(
  id: string,
  viewer: ViewerContext
): ESignRecord | null {
  if (!canViewESignRecords(viewer.role)) {
    return null;
  }

  const record = esignRecordsStore.get(id);
  if (!record) return null;

  // staff/leader は自分のレコードのみ
  if (!canViewAllESignRecords(viewer.role)) {
    if (!(record.subjectType === 'staff' && record.subjectId === viewer.userId)) {
      return null;
    }
  }

  return record;
}

/**
 * 署名レコード作成
 */
export function createESignRecord(
  input: CreateESignRecordInput,
  actorUserId: string,
  actorRole: AppRole
): { success: true; record: ESignRecord } | { success: false; error: string } {
  if (!canCreateESignRecord(actorRole)) {
    return { success: false, error: '署名ログ作成権限がありません' };
  }

  if (!input.subjectName?.trim()) {
    return { success: false, error: '署名者名は必須です' };
  }

  const timestamp = now();
  const record: ESignRecord = {
    id: generateId('esig'),
    subjectType: input.subjectType,
    subjectId: input.subjectId ?? null,
    subjectName: input.subjectName.trim(),
    documentId: input.documentId ?? null,
    documentVersionId: input.documentVersionId ?? null,
    agreementConsentId: input.agreementConsentId ?? null,
    contractId: input.contractId ?? null,
    status: input.status ?? 'requested',
    method: input.method,
    requestedAt: input.requestedAt ?? (input.status === 'requested' ? timestamp : null),
    signedAt: input.signedAt ?? (input.status === 'signed' ? timestamp : null),
    expiresAt: input.expiresAt ?? null,
    recordedByUserId: actorUserId,
    note: input.note ?? null,
    externalProvider: input.externalProvider ?? 'none',
    externalEnvelopeId: input.externalEnvelopeId ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  esignRecordsStore.set(record.id, record);
  logEvent(record.id, 'create', actorUserId, null, record);

  return { success: true, record };
}

/**
 * 署名レコード更新
 */
export function updateESignRecord(
  id: string,
  input: UpdateESignRecordInput,
  actorUserId: string,
  actorRole: AppRole
): { success: true; record: ESignRecord } | { success: false; error: string } {
  if (!canUpdateESignRecord(actorRole)) {
    return { success: false, error: '署名ログ更新権限がありません' };
  }

  const record = esignRecordsStore.get(id);
  if (!record) {
    return { success: false, error: '署名レコードが見つかりません' };
  }

  const before = { ...record };

  if (input.subjectName !== undefined) {
    record.subjectName = input.subjectName.trim();
  }
  if (input.method !== undefined) {
    record.method = input.method;
  }
  if (input.expiresAt !== undefined) {
    record.expiresAt = input.expiresAt;
  }
  if (input.note !== undefined) {
    record.note = input.note;
  }
  record.updatedAt = now();

  logEvent(id, 'update', actorUserId, before, record);

  return { success: true, record };
}

/**
 * ステータス変更
 */
export function changeStatus(
  id: string,
  newStatus: SignStatus,
  actorUserId: string,
  actorRole: AppRole,
  note?: string
): { success: true; record: ESignRecord } | { success: false; error: string } {
  if (!canUpdateESignRecord(actorRole)) {
    return { success: false, error: '署名ログ更新権限がありません' };
  }

  const record = esignRecordsStore.get(id);
  if (!record) {
    return { success: false, error: '署名レコードが見つかりません' };
  }

  const before = { ...record };
  const oldStatus = record.status;
  record.status = newStatus;
  record.updatedAt = now();

  // ステータスに応じた日時更新
  if (newStatus === 'signed' && !record.signedAt) {
    record.signedAt = now();
  }

  // アクション決定
  let action: SignEventAction = 'update';
  if (newStatus === 'signed') action = 'sign';
  else if (newStatus === 'declined') action = 'decline';
  else if (newStatus === 'voided') action = 'void';
  else if (newStatus === 'expired') action = 'expire';
  else if (newStatus === 'requested' && oldStatus !== 'requested') action = 'request';

  logEvent(id, action, actorUserId, before, record, note ?? null);

  return { success: true, record };
}

/**
 * 監査ログ取得
 */
export function getESignEvents(recordId: string): ESignEvent[] {
  return esignEventsStore
    .filter((e) => e.recordId === recordId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * 全監査ログ取得（監査ビュー用）
 * Ticket 064-final
 */
export function getAllESignEvents(limit: number = 1000): ESignEvent[] {
  return [...esignEventsStore]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

/**
 * 統計情報取得
 */
export function getStats(viewer: ViewerContext): ESignStats | null {
  if (!canViewAllESignRecords(viewer.role)) {
    return null;
  }

  const records = Array.from(esignRecordsStore.values());
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  return {
    totalRequested: records.filter((r) => r.status === 'requested').length,
    totalSigned: records.filter((r) => r.status === 'signed').length,
    totalDeclined: records.filter((r) => r.status === 'declined').length,
    totalVoided: records.filter((r) => r.status === 'voided').length,
    totalExpired: records.filter((r) => r.status === 'expired').length,
    expiringWithin7Days: records.filter((r) => isExpiringSoon(r, 7)).length,
    signedThisMonth: records.filter(
      (r) => r.status === 'signed' && r.signedAt && new Date(r.signedAt) >= startOfMonth
    ).length,
  };
}

/**
 * 期限超過レコード取得（アラート用）
 */
export function getOverdueRecords(): ESignRecord[] {
  return Array.from(esignRecordsStore.values()).filter(isOverdue);
}

/**
 * 期限間近レコード取得（通知用）
 */
export function getExpiringSoonRecords(days: number = 7): ESignRecord[] {
  return Array.from(esignRecordsStore.values()).filter((r) => isExpiringSoon(r, days));
}

// =========================================
// シードデータ
// =========================================

export function seedESignRecords(): void {
  if (esignRecordsStore.size > 0) return;

  const seedData: CreateESignRecordInput[] = [
    {
      subjectType: 'client',
      subjectId: 'client_001',
      subjectName: '山田 太郎',
      documentId: 'doc_001',
      documentVersionId: 'docv_001',
      agreementConsentId: 'consent_001',
      method: 'paper',
      status: 'signed',
      requestedAt: '2025-01-10T09:00:00Z',
      signedAt: '2025-01-15T14:30:00Z',
      note: '重要事項説明書への署名',
    },
    {
      subjectType: 'client',
      subjectId: 'client_002',
      subjectName: '佐藤 花子',
      documentId: 'doc_002',
      documentVersionId: 'docv_002',
      method: 'in_person',
      status: 'requested',
      requestedAt: '2025-01-20T10:00:00Z',
      expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3日後
      note: '利用契約書への署名依頼',
    },
    {
      subjectType: 'staff',
      subjectId: 'user_001',
      subjectName: '鈴木 一郎',
      documentId: 'doc_003',
      method: 'online',
      status: 'signed',
      requestedAt: '2025-01-05T09:00:00Z',
      signedAt: '2025-01-05T09:15:00Z',
      note: '就業規則改定への同意',
    },
    {
      subjectType: 'family',
      subjectId: null,
      subjectName: '山田 次郎（ご家族）',
      documentId: 'doc_004',
      agreementConsentId: 'consent_002',
      method: 'paper',
      status: 'requested',
      requestedAt: '2025-01-25T11:00:00Z',
      expiresAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2日前（期限切れ）
      note: '身元保証契約への署名',
    },
    {
      subjectType: 'vendor',
      subjectId: 'vendor_001',
      subjectName: '株式会社サービス',
      contractId: 'contract_001',
      method: 'vendor',
      status: 'signed',
      signedAt: '2025-01-18T16:00:00Z',
      note: '業務委託契約書',
      externalProvider: 'docusign',
      externalEnvelopeId: 'env_abc123',
    },
    {
      subjectType: 'client',
      subjectId: 'client_003',
      subjectName: '田中 三郎',
      documentId: 'doc_005',
      method: 'in_person',
      status: 'declined',
      requestedAt: '2025-01-22T09:00:00Z',
      note: '本人確認書類の提出を拒否',
    },
  ];

  const systemUserId = 'system';
  const systemRole: AppRole = 'admin';

  for (const data of seedData) {
    createESignRecord(data, systemUserId, systemRole);
  }

  console.log(`[ESign] Seeded ${seedData.length} records`);
}

// 初期シード実行
seedESignRecords();
