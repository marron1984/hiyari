/**
 * 同意書管理（Agreements）リポジトリ
 *
 * 現状は in-memory ストレージ（将来 DB 置換）
 */

import type {
  AgreementType,
  AgreementDocument,
  AgreementConsent,
  AgreementEvent,
  AgreementStats,
  AgreementStatsOptions,
  AgreementEntityType,
  AgreementEventAction,
  AgreementCategory,
  DocumentStatus,
  ConsentStatus,
  SubjectType,
  ViewerContext,
  CreateAgreementTypeInput,
  UpdateAgreementTypeInput,
  CreateDocumentInput,
  RecordConsentInput,
  ListConsentsFilter,
} from './types';
import {
  canManageAgreementTypes,
  canViewConsents,
  canRecordConsents,
  canViewOwnConsentsOnly,
  isExpiring,
  isExpired,
  addDays,
} from './types';

// ========== ストレージ ==========

const typesStore = new Map<string, AgreementType>();
const documentsStore = new Map<string, AgreementDocument>();
const consentsStore = new Map<string, AgreementConsent>();
const eventsStore = new Map<string, AgreementEvent>();

// Task 054: ユーザー→組織マッピング（user_org_memberships相当）
interface UserInfo {
  id: string;
  name: string | null;
  orgUnitId: string | null;  // primaryOrgUnitId
}
const usersStore = new Map<string, UserInfo>();

// ========== ユーティリティ ==========

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function now(): string {
  return new Date().toISOString();
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

// ========== 監査ログ記録 ==========

function logEvent(
  entityType: AgreementEntityType,
  entityId: string,
  actorUserId: string | null,
  action: AgreementEventAction,
  beforeData: unknown | null,
  afterData: unknown | null,
  note: string | null = null
): void {
  const event: AgreementEvent = {
    id: generateId('agevt'),
    entityType,
    entityId,
    actorUserId,
    action,
    beforeJson: beforeData ? JSON.stringify(beforeData) : null,
    afterJson: afterData ? JSON.stringify(afterData) : null,
    createdAt: now(),
    note,
  };
  eventsStore.set(event.id, event);
}

// ========== 同意書種別 CRUD ==========

export interface ListTypesFilter {
  q?: string;
  category?: AgreementCategory;
  active?: boolean;
}

export function listAgreementTypes(filter: ListTypesFilter = {}): AgreementType[] {
  let items = Array.from(typesStore.values());

  if (filter.q) {
    const q = filter.q.toLowerCase();
    items = items.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.key.toLowerCase().includes(q)
    );
  }

  if (filter.category) {
    items = items.filter((t) => t.category === filter.category);
  }

  if (filter.active !== undefined) {
    items = items.filter((t) => t.isActive === filter.active);
  }

  items.sort((a, b) => a.title.localeCompare(b.title, 'ja'));
  return items;
}

export function getAgreementTypeById(id: string): AgreementType | null {
  return typesStore.get(id) ?? null;
}

export function getAgreementTypeByKey(key: string): AgreementType | null {
  return Array.from(typesStore.values()).find((t) => t.key === key) ?? null;
}

export function createAgreementType(
  input: CreateAgreementTypeInput,
  actorUserId: string
): { success: true; type: AgreementType } | { success: false; error: string } {
  // keyの重複チェック
  if (getAgreementTypeByKey(input.key)) {
    return { success: false, error: `キー「${input.key}」は既に使用されています` };
  }

  const timestamp = now();
  const agreementType: AgreementType = {
    id: generateId('agtyp'),
    key: input.key,
    title: input.title,
    description: input.description ?? null,
    category: input.category,
    requiresRenewal: input.requiresRenewal ?? false,
    defaultValidDays: input.defaultValidDays ?? null,
    defaultWarnDays: input.defaultWarnDays ?? null,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  typesStore.set(agreementType.id, agreementType);
  logEvent('type', agreementType.id, actorUserId, 'create', null, agreementType);

  return { success: true, type: agreementType };
}

export function updateAgreementType(
  id: string,
  patch: UpdateAgreementTypeInput,
  actorUserId: string
): { success: true; type: AgreementType } | { success: false; error: string } {
  const existing = typesStore.get(id);
  if (!existing) {
    return { success: false, error: '同意書種別が見つかりません' };
  }

  const before = { ...existing };
  const updated: AgreementType = {
    ...existing,
    ...patch,
    updatedAt: now(),
  };

  typesStore.set(id, updated);
  logEvent('type', id, actorUserId, 'update', before, updated);

  return { success: true, type: updated };
}

// ========== 同意書本文（版）CRUD ==========

export function listDocuments(agreementTypeId: string): AgreementDocument[] {
  return Array.from(documentsStore.values())
    .filter((d) => d.agreementTypeId === agreementTypeId)
    .sort((a, b) => b.templateVersion - a.templateVersion);
}

export function getDocumentById(id: string): AgreementDocument | null {
  return documentsStore.get(id) ?? null;
}

export function getActiveDocument(agreementTypeId: string): AgreementDocument | null {
  return (
    Array.from(documentsStore.values()).find(
      (d) => d.agreementTypeId === agreementTypeId && d.status === 'active'
    ) ?? null
  );
}

export function createDocument(
  agreementTypeId: string,
  input: CreateDocumentInput,
  actorUserId: string
): { success: true; document: AgreementDocument } | { success: false; error: string } {
  const agreementType = typesStore.get(agreementTypeId);
  if (!agreementType) {
    return { success: false, error: '同意書種別が見つかりません' };
  }

  // 重複チェック
  const existing = Array.from(documentsStore.values()).find(
    (d) =>
      d.agreementTypeId === agreementTypeId &&
      d.templateKey === input.templateKey &&
      d.templateVersion === input.templateVersion
  );
  if (existing) {
    return { success: false, error: '同じテンプレート・バージョンの本文が既に存在します' };
  }

  const timestamp = now();
  const document: AgreementDocument = {
    id: generateId('agdoc'),
    agreementTypeId,
    templateKey: input.templateKey,
    templateVersion: input.templateVersion,
    titleOverride: input.titleOverride ?? null,
    status: 'archived', // 作成時はarchived、activateで有効化
    effectiveFrom: input.effectiveFrom ?? null,
    effectiveTo: input.effectiveTo ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
    createdByUserId: actorUserId,
  };

  documentsStore.set(document.id, document);
  logEvent('document', document.id, actorUserId, 'create', null, document);

  return { success: true, document };
}

export function setActiveDocument(
  documentId: string,
  actorUserId: string
): { success: true; document: AgreementDocument } | { success: false; error: string } {
  const document = documentsStore.get(documentId);
  if (!document) {
    return { success: false, error: '本文が見つかりません' };
  }

  // 同じtypeの他のactive documentをarchive
  const sameTypeDocuments = Array.from(documentsStore.values()).filter(
    (d) => d.agreementTypeId === document.agreementTypeId && d.id !== documentId
  );
  for (const d of sameTypeDocuments) {
    if (d.status === 'active') {
      d.status = 'archived';
      d.updatedAt = now();
    }
  }

  const before = { ...document };
  document.status = 'active';
  document.updatedAt = now();

  logEvent('document', documentId, actorUserId, 'activate_document', before, document);

  return { success: true, document };
}

export function archiveDocument(
  documentId: string,
  actorUserId: string
): { success: true; document: AgreementDocument } | { success: false; error: string } {
  const document = documentsStore.get(documentId);
  if (!document) {
    return { success: false, error: '本文が見つかりません' };
  }

  const before = { ...document };
  document.status = 'archived';
  document.updatedAt = now();

  logEvent('document', documentId, actorUserId, 'archive_document', before, document);

  return { success: true, document };
}

// ========== 同意レコード CRUD ==========

export function listConsents(
  viewer: ViewerContext,
  filter: ListConsentsFilter = {}
): { consents: AgreementConsent[]; total: number } {
  let items = Array.from(consentsStore.values());

  // RBAC
  if (canViewOwnConsentsOnly(viewer.role)) {
    // staff/leaderは自分のstaffタイプの同意のみ
    items = items.filter(
      (c) => c.subjectType === 'staff' && c.subjectId === viewer.userId
    );
  } else if (!canViewConsents(viewer.role)) {
    return { consents: [], total: 0 };
  }

  // フィルタリング
  if (filter.agreementTypeId) {
    items = items.filter((c) => c.agreementTypeId === filter.agreementTypeId);
  }

  if (filter.subjectType) {
    items = items.filter((c) => c.subjectType === filter.subjectType);
  }

  if (filter.consentStatus) {
    items = items.filter((c) => c.consentStatus === filter.consentStatus);
  }

  if (filter.expiringWithinDays !== undefined) {
    items = items.filter((c) => {
      if (!c.validUntil) return false;
      const daysLeft =
        (new Date(c.validUntil).getTime() - new Date().getTime()) /
        (1000 * 60 * 60 * 24);
      return daysLeft > 0 && daysLeft <= filter.expiringWithinDays!;
    });
  }

  if (filter.expired === true) {
    items = items.filter((c) => isExpired(c.validUntil));
  }

  if (filter.q) {
    const q = filter.q.toLowerCase();
    items = items.filter((c) => c.subjectName.toLowerCase().includes(q));
  }

  // ソート（更新日時降順）
  items.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  const total = items.length;

  // ページネーション
  const offset = filter.offset ?? 0;
  const limit = filter.limit ?? 50;
  items = items.slice(offset, offset + limit);

  return { consents: items, total };
}

export function getConsentById(
  id: string,
  viewer: ViewerContext
): AgreementConsent | null {
  const consent = consentsStore.get(id);
  if (!consent) return null;

  // RBAC
  if (canViewOwnConsentsOnly(viewer.role)) {
    if (consent.subjectType !== 'staff' || consent.subjectId !== viewer.userId) {
      return null;
    }
  } else if (!canViewConsents(viewer.role)) {
    return null;
  }

  return consent;
}

export function recordConsent(
  input: RecordConsentInput,
  actorUserId: string
): { success: true; consent: AgreementConsent } | { success: false; error: string } {
  const agreementType = typesStore.get(input.agreementTypeId);
  if (!agreementType) {
    return { success: false, error: '同意書種別が見つかりません' };
  }

  // activeDocument を取得
  const activeDocument = getActiveDocument(input.agreementTypeId);
  if (!activeDocument) {
    return { success: false, error: 'この同意書種別に有効な本文がありません' };
  }

  const timestamp = now();
  const consentedAt = input.consentedAt ?? timestamp;

  // validUntil の計算
  let validUntil = input.validUntil ?? null;
  if (
    agreementType.requiresRenewal &&
    agreementType.defaultValidDays &&
    !validUntil
  ) {
    validUntil = addDays(consentedAt.split('T')[0], agreementType.defaultValidDays);
  }

  const consent: AgreementConsent = {
    id: generateId('agcon'),
    agreementTypeId: input.agreementTypeId,
    agreementDocumentId: activeDocument.id,
    subjectType: input.subjectType,
    subjectId: input.subjectId ?? null,
    subjectName: input.subjectName,
    consentStatus: input.consentStatus,
    consentedAt: input.consentStatus === 'consented' ? consentedAt : null,
    consentedByUserId: actorUserId,
    method: input.method,
    note: input.note ?? null,
    validUntil,
    revokedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  consentsStore.set(consent.id, consent);
  logEvent('consent', consent.id, actorUserId, 'record_consent', null, consent);

  return { success: true, consent };
}

export function withdrawConsent(
  consentId: string,
  actorUserId: string,
  note?: string
): { success: true; consent: AgreementConsent } | { success: false; error: string } {
  const consent = consentsStore.get(consentId);
  if (!consent) {
    return { success: false, error: '同意レコードが見つかりません' };
  }

  const before = { ...consent };
  consent.consentStatus = 'withdrawn';
  consent.revokedAt = now();
  consent.updatedAt = now();
  if (note) {
    consent.note = (consent.note ? consent.note + '\n' : '') + `[撤回] ${note}`;
  }

  logEvent('consent', consentId, actorUserId, 'withdraw', before, consent, note);

  return { success: true, consent };
}

export function renewConsent(
  consentId: string,
  newValidUntil: string,
  actorUserId: string,
  note?: string
): { success: true; consent: AgreementConsent } | { success: false; error: string } {
  const consent = consentsStore.get(consentId);
  if (!consent) {
    return { success: false, error: '同意レコードが見つかりません' };
  }

  const before = { ...consent };
  consent.validUntil = newValidUntil;
  consent.updatedAt = now();
  if (note) {
    consent.note = (consent.note ? consent.note + '\n' : '') + `[更新] ${note}`;
  }

  logEvent('consent', consentId, actorUserId, 'renew', before, consent, note);

  return { success: true, consent };
}

// ========== スキャン ==========

export function scanExpiringConsents(days: number = 30): AgreementConsent[] {
  const items = Array.from(consentsStore.values());
  return items.filter((c) => {
    if (c.consentStatus !== 'consented') return false;
    if (!c.validUntil) return false;

    const agreementType = typesStore.get(c.agreementTypeId);
    const warnDays = agreementType?.defaultWarnDays ?? days;

    return isExpiring(c.validUntil, warnDays);
  });
}

export function scanExpiredConsents(): AgreementConsent[] {
  const items = Array.from(consentsStore.values());
  return items.filter((c) => {
    if (c.consentStatus !== 'consented') return false;
    return isExpired(c.validUntil);
  });
}

// ========== 統計 ==========

/**
 * 統計を取得（orgUnitIdsによるスコープ対応）
 *
 * Task 054: business-summary スコープ拡張 Phase2
 * - orgUnitIds が指定された場合、職員（staff）の所属組織でフィルタ
 * - subjectType が指定された場合、そのタイプのみを集計
 */
export function getStats(
  viewer: ViewerContext,
  options?: AgreementStatsOptions
): AgreementStats | null {
  if (!canViewConsents(viewer.role)) {
    return null;
  }

  let consents = Array.from(consentsStore.values());
  const types = Array.from(typesStore.values());

  // Task 054: subjectType フィルタ
  if (options?.subjectType) {
    consents = consents.filter((c) => c.subjectType === options.subjectType);
  }

  // Task 054: orgUnitIds スコープフィルタ
  // staff タイプの同意は subjectId でユーザーを特定し、orgUnitId でフィルタ
  if (options?.orgUnitIds && options.orgUnitIds.length > 0) {
    consents = consents.filter((c) => {
      // staff タイプは組織フィルタ対象
      if (c.subjectType === 'staff' && c.subjectId) {
        const user = usersStore.get(c.subjectId);
        return user?.orgUnitId && options.orgUnitIds!.includes(user.orgUnitId);
      }
      // client/family/other は組織フィルタ対象外（全て含む）
      // 将来的に resident -> orgUnit の紐付けで対応可能
      return true;
    });
  }

  const thisMonth = new Date();
  thisMonth.setDate(1);
  thisMonth.setHours(0, 0, 0, 0);

  // フィルタ後の同意から期限切れ/期限接近を計算
  const expiringConsents = consents.filter((c) => {
    if (c.consentStatus !== 'consented') return false;
    if (!c.validUntil) return false;
    const agreementType = typesStore.get(c.agreementTypeId);
    const warnDays = agreementType?.defaultWarnDays ?? 30;
    const today = new Date();
    const validDate = new Date(c.validUntil);
    const daysUntilExpiry = Math.ceil((validDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiry > 0 && daysUntilExpiry <= warnDays;
  });

  const expiredConsents = consents.filter((c) => {
    if (c.consentStatus !== 'consented') return false;
    return isExpired(c.validUntil);
  });

  const consentedCountThisMonth = consents.filter(
    (c) =>
      c.consentStatus === 'consented' &&
      c.consentedAt &&
      new Date(c.consentedAt) >= thisMonth
  ).length;

  const byType: Record<string, { consented: number; expired: number }> = {};
  for (const t of types) {
    const typeConsents = consents.filter((c) => c.agreementTypeId === t.id);
    byType[t.key] = {
      consented: typeConsents.filter((c) => c.consentStatus === 'consented').length,
      expired: typeConsents.filter((c) => isExpired(c.validUntil)).length,
    };
  }

  return {
    expiringCount: expiringConsents.length,
    expiredCount: expiredConsents.length,
    consentedCountThisMonth,
    totalActiveTypes: types.filter((t) => t.isActive).length,
    totalConsents: consents.length,
    byType,
  };
}

// ========== イベント取得 ==========

export function getEvents(entityId: string): AgreementEvent[] {
  return Array.from(eventsStore.values())
    .filter((e) => e.entityId === entityId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * 全イベントを取得（監査ビュー用）
 * Ticket 064-final
 */
export function getEventsAll(limit: number = 1000): AgreementEvent[] {
  return Array.from(eventsStore.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

// ========== デモデータ ==========

function initDemoData(): void {
  if (typesStore.size > 0) return;

  // Task 054: ユーザー→組織マッピングを初期化
  const users: UserInfo[] = [
    { id: 'user_staff', name: '田中太郎', orgUnitId: 'org_nishi' },
    { id: 'user_manager', name: '管理者', orgUnitId: 'org_corp' },
    { id: 'user_leader', name: 'リーダー', orgUnitId: 'org_higashi' },
  ];
  users.forEach((u) => usersStore.set(u.id, u));

  const todayStr = today();

  // 同意書種別
  const types: AgreementType[] = [
    {
      id: 'agtyp_001',
      key: 'privacy_consent',
      title: '個人情報取扱い同意書',
      description: '個人情報の取得・利用・提供に関する同意',
      category: 'client',
      requiresRenewal: true,
      defaultValidDays: 365,
      defaultWarnDays: 30,
      isActive: true,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    },
    {
      id: 'agtyp_002',
      key: 'service_agreement',
      title: 'サービス利用契約同意書',
      description: '介護サービス利用に関する同意',
      category: 'client',
      requiresRenewal: true,
      defaultValidDays: 365,
      defaultWarnDays: 60,
      isActive: true,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    },
    {
      id: 'agtyp_003',
      key: 'photo_consent',
      title: '写真撮影・掲載同意書',
      description: '広報等での写真撮影・掲載に関する同意',
      category: 'client',
      requiresRenewal: false,
      defaultValidDays: null,
      defaultWarnDays: null,
      isActive: true,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    },
    {
      id: 'agtyp_004',
      key: 'emergency_contact',
      title: '緊急連絡先・医療同意書',
      description: '緊急時の連絡先および医療行為への同意',
      category: 'family',
      requiresRenewal: true,
      defaultValidDays: 365,
      defaultWarnDays: 30,
      isActive: true,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    },
    {
      id: 'agtyp_005',
      key: 'staff_confidentiality',
      title: '守秘義務誓約書',
      description: '職員の守秘義務に関する誓約',
      category: 'staff',
      requiresRenewal: false,
      defaultValidDays: null,
      defaultWarnDays: null,
      isActive: true,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    },
  ];

  types.forEach((t) => typesStore.set(t.id, t));

  // 同意書本文
  const documents: AgreementDocument[] = [
    {
      id: 'agdoc_001',
      agreementTypeId: 'agtyp_001',
      templateKey: 'privacy_consent_v1',
      templateVersion: 1,
      titleOverride: null,
      status: 'active',
      effectiveFrom: '2025-01-01',
      effectiveTo: null,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      createdByUserId: 'system',
    },
    {
      id: 'agdoc_002',
      agreementTypeId: 'agtyp_002',
      templateKey: 'service_agreement_v1',
      templateVersion: 1,
      titleOverride: null,
      status: 'active',
      effectiveFrom: '2025-01-01',
      effectiveTo: null,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      createdByUserId: 'system',
    },
    {
      id: 'agdoc_003',
      agreementTypeId: 'agtyp_003',
      templateKey: 'photo_consent_v1',
      templateVersion: 1,
      titleOverride: null,
      status: 'active',
      effectiveFrom: '2025-01-01',
      effectiveTo: null,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      createdByUserId: 'system',
    },
    {
      id: 'agdoc_004',
      agreementTypeId: 'agtyp_004',
      templateKey: 'emergency_contact_v1',
      templateVersion: 1,
      titleOverride: null,
      status: 'active',
      effectiveFrom: '2025-01-01',
      effectiveTo: null,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      createdByUserId: 'system',
    },
    {
      id: 'agdoc_005',
      agreementTypeId: 'agtyp_005',
      templateKey: 'staff_confidentiality_v1',
      templateVersion: 1,
      titleOverride: null,
      status: 'active',
      effectiveFrom: '2025-01-01',
      effectiveTo: null,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      createdByUserId: 'system',
    },
  ];

  documents.forEach((d) => documentsStore.set(d.id, d));

  // 同意レコード
  const consents: AgreementConsent[] = [
    // 利用者：山田太郎
    {
      id: 'agcon_001',
      agreementTypeId: 'agtyp_001',
      agreementDocumentId: 'agdoc_001',
      subjectType: 'client',
      subjectId: 'resident_001',
      subjectName: '山田太郎',
      consentStatus: 'consented',
      consentedAt: '2025-03-01T10:00:00Z',
      consentedByUserId: 'user_manager',
      method: 'paper',
      note: null,
      validUntil: '2026-03-01', // 期限接近
      revokedAt: null,
      createdAt: '2025-03-01T10:00:00Z',
      updatedAt: '2025-03-01T10:00:00Z',
    },
    {
      id: 'agcon_002',
      agreementTypeId: 'agtyp_002',
      agreementDocumentId: 'agdoc_002',
      subjectType: 'client',
      subjectId: 'resident_001',
      subjectName: '山田太郎',
      consentStatus: 'consented',
      consentedAt: '2025-03-01T10:00:00Z',
      consentedByUserId: 'user_manager',
      method: 'paper',
      note: null,
      validUntil: '2026-03-01',
      revokedAt: null,
      createdAt: '2025-03-01T10:00:00Z',
      updatedAt: '2025-03-01T10:00:00Z',
    },
    // 利用者：鈴木花子（期限切れ）
    {
      id: 'agcon_003',
      agreementTypeId: 'agtyp_001',
      agreementDocumentId: 'agdoc_001',
      subjectType: 'client',
      subjectId: 'resident_002',
      subjectName: '鈴木花子',
      consentStatus: 'consented',
      consentedAt: '2024-12-01T10:00:00Z',
      consentedByUserId: 'user_manager',
      method: 'paper',
      note: null,
      validUntil: '2025-12-01', // 期限切れ
      revokedAt: null,
      createdAt: '2024-12-01T10:00:00Z',
      updatedAt: '2024-12-01T10:00:00Z',
    },
    // 家族：山田様（家族）
    {
      id: 'agcon_004',
      agreementTypeId: 'agtyp_004',
      agreementDocumentId: 'agdoc_004',
      subjectType: 'family',
      subjectId: null,
      subjectName: '山田一郎（ご家族）',
      consentStatus: 'consented',
      consentedAt: '2025-06-01T10:00:00Z',
      consentedByUserId: 'user_manager',
      method: 'in_person',
      note: '緊急連絡先として登録',
      validUntil: '2026-06-01',
      revokedAt: null,
      createdAt: '2025-06-01T10:00:00Z',
      updatedAt: '2025-06-01T10:00:00Z',
    },
    // 職員：田中スタッフ
    {
      id: 'agcon_005',
      agreementTypeId: 'agtyp_005',
      agreementDocumentId: 'agdoc_005',
      subjectType: 'staff',
      subjectId: 'user_staff',
      subjectName: '田中太郎',
      consentStatus: 'consented',
      consentedAt: '2025-04-01T09:00:00Z',
      consentedByUserId: 'user_manager',
      method: 'paper',
      note: '入社時署名',
      validUntil: null, // 更新不要
      revokedAt: null,
      createdAt: '2025-04-01T09:00:00Z',
      updatedAt: '2025-04-01T09:00:00Z',
    },
    // 写真同意（不同意の例）
    {
      id: 'agcon_006',
      agreementTypeId: 'agtyp_003',
      agreementDocumentId: 'agdoc_003',
      subjectType: 'client',
      subjectId: 'resident_003',
      subjectName: '佐藤一郎',
      consentStatus: 'declined',
      consentedAt: null,
      consentedByUserId: 'user_manager',
      method: 'in_person',
      note: 'ご家族の意向により不同意',
      validUntil: null,
      revokedAt: null,
      createdAt: '2025-05-15T10:00:00Z',
      updatedAt: '2025-05-15T10:00:00Z',
    },
    // 期限接近の例
    {
      id: 'agcon_007',
      agreementTypeId: 'agtyp_001',
      agreementDocumentId: 'agdoc_001',
      subjectType: 'client',
      subjectId: 'resident_004',
      subjectName: '田中美咲',
      consentStatus: 'consented',
      consentedAt: '2025-02-15T10:00:00Z',
      consentedByUserId: 'user_manager',
      method: 'paper',
      note: null,
      validUntil: '2026-02-15', // 期限接近
      revokedAt: null,
      createdAt: '2025-02-15T10:00:00Z',
      updatedAt: '2025-02-15T10:00:00Z',
    },
  ];

  consents.forEach((c) => consentsStore.set(c.id, c));
}

// 初期化
initDemoData();
