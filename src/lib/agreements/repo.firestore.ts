/**
 * 同意書管理（Agreements）Firestoreリポジトリ
 *
 * PROD: Cloud Firestore永続化
 *
 * コレクション:
 * - agreement_types: 同意書種別マスタ
 * - agreement_documents: 同意書本文（版）
 * - agreement_consents: 同意レコード
 * - agreement_events: 監査ログ
 */

import { getAdminDb } from '../firebase-admin';
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

// ========== 定数 ==========

const TYPES_COLLECTION = 'agreement_types';
const DOCUMENTS_COLLECTION = 'agreement_documents';
const CONSENTS_COLLECTION = 'agreement_consents';
const EVENTS_COLLECTION = 'agreement_events';

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

// ========== ドキュメント変換 ==========

function docToAgreementType(doc: FirebaseFirestore.DocumentSnapshot): AgreementType {
  const d = doc.data()!;
  return {
    id: d.id ?? doc.id,
    key: d.key ?? '',
    title: d.title ?? '',
    description: d.description ?? null,
    category: d.category ?? 'other',
    requiresRenewal: d.requiresRenewal ?? false,
    defaultValidDays: d.defaultValidDays ?? null,
    defaultWarnDays: d.defaultWarnDays ?? null,
    isActive: d.isActive ?? true,
    createdAt: d.createdAt ?? now(),
    updatedAt: d.updatedAt ?? now(),
  };
}

function docToAgreementDocument(doc: FirebaseFirestore.DocumentSnapshot): AgreementDocument {
  const d = doc.data()!;
  return {
    id: d.id ?? doc.id,
    agreementTypeId: d.agreementTypeId ?? '',
    templateKey: d.templateKey ?? '',
    templateVersion: d.templateVersion ?? 1,
    titleOverride: d.titleOverride ?? null,
    status: d.status ?? 'archived',
    effectiveFrom: d.effectiveFrom ?? null,
    effectiveTo: d.effectiveTo ?? null,
    createdAt: d.createdAt ?? now(),
    updatedAt: d.updatedAt ?? now(),
    createdByUserId: d.createdByUserId ?? '',
  };
}

function docToAgreementConsent(doc: FirebaseFirestore.DocumentSnapshot): AgreementConsent {
  const d = doc.data()!;
  return {
    id: d.id ?? doc.id,
    agreementTypeId: d.agreementTypeId ?? '',
    agreementDocumentId: d.agreementDocumentId ?? '',
    subjectType: d.subjectType ?? 'other',
    subjectId: d.subjectId ?? null,
    subjectName: d.subjectName ?? '',
    consentStatus: d.consentStatus ?? 'consented',
    consentedAt: d.consentedAt ?? null,
    consentedByUserId: d.consentedByUserId ?? null,
    method: d.method ?? 'other',
    note: d.note ?? null,
    validUntil: d.validUntil ?? null,
    revokedAt: d.revokedAt ?? null,
    createdAt: d.createdAt ?? now(),
    updatedAt: d.updatedAt ?? now(),
  };
}

function docToAgreementEvent(doc: FirebaseFirestore.DocumentSnapshot): AgreementEvent {
  const d = doc.data()!;
  return {
    id: d.id ?? doc.id,
    entityType: d.entityType ?? 'consent',
    entityId: d.entityId ?? '',
    actorUserId: d.actorUserId ?? null,
    action: d.action ?? 'create',
    beforeJson: d.beforeJson ?? null,
    afterJson: d.afterJson ?? null,
    createdAt: d.createdAt ?? now(),
    note: d.note ?? null,
  };
}

// ========== 監査ログ記録 ==========

async function logEvent(
  entityType: AgreementEntityType,
  entityId: string,
  actorUserId: string | null,
  action: AgreementEventAction,
  beforeData: unknown | null,
  afterData: unknown | null,
  note: string | null = null
): Promise<void> {
  try {
    const db = getAdminDb();
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
    await db.collection(EVENTS_COLLECTION).doc(event.id).set(event);
  } catch (error) {
    console.error('[Agreements:Firestore] logEvent error:', error);
  }
}

// ========== 同意書種別 CRUD ==========

export interface ListTypesFilter {
  q?: string;
  category?: AgreementCategory;
  active?: boolean;
}

export async function listAgreementTypes(filter: ListTypesFilter = {}): Promise<AgreementType[]> {
  try {
    const db = getAdminDb();
    let query: FirebaseFirestore.Query = db.collection(TYPES_COLLECTION);

    if (filter.active !== undefined) {
      query = query.where('isActive', '==', filter.active);
    }

    if (filter.category) {
      query = query.where('category', '==', filter.category);
    }

    const snapshot = await query.get();
    let items = snapshot.docs.map(docToAgreementType);

    if (filter.q) {
      const q = filter.q.toLowerCase();
      items = items.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.key.toLowerCase().includes(q)
      );
    }

    items.sort((a, b) => a.title.localeCompare(b.title, 'ja'));
    return items;
  } catch (error) {
    console.error('[Agreements:Firestore] listAgreementTypes error:', error);
    return [];
  }
}

export async function getAgreementTypeById(id: string): Promise<AgreementType | null> {
  try {
    const db = getAdminDb();
    const doc = await db.collection(TYPES_COLLECTION).doc(id).get();
    if (!doc.exists) return null;
    return docToAgreementType(doc);
  } catch (error) {
    console.error('[Agreements:Firestore] getAgreementTypeById error:', error);
    return null;
  }
}

export async function getAgreementTypeByKey(key: string): Promise<AgreementType | null> {
  try {
    const db = getAdminDb();
    const snapshot = await db.collection(TYPES_COLLECTION)
      .where('key', '==', key)
      .limit(1)
      .get();
    if (snapshot.empty) return null;
    return docToAgreementType(snapshot.docs[0]);
  } catch (error) {
    console.error('[Agreements:Firestore] getAgreementTypeByKey error:', error);
    return null;
  }
}

export async function createAgreementType(
  input: CreateAgreementTypeInput,
  actorUserId: string
): Promise<{ success: true; type: AgreementType } | { success: false; error: string }> {
  try {
    // keyの重複チェック
    const existing = await getAgreementTypeByKey(input.key);
    if (existing) {
      return { success: false, error: `キー「${input.key}」は既に使用されています` };
    }

    const db = getAdminDb();
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

    await db.collection(TYPES_COLLECTION).doc(agreementType.id).set(agreementType);
    await logEvent('type', agreementType.id, actorUserId, 'create', null, agreementType);

    return { success: true, type: agreementType };
  } catch (error) {
    console.error('[Agreements:Firestore] createAgreementType error:', error);
    return { success: false, error: '同意書種別の作成に失敗しました' };
  }
}

export async function updateAgreementType(
  id: string,
  patch: UpdateAgreementTypeInput,
  actorUserId: string
): Promise<{ success: true; type: AgreementType } | { success: false; error: string }> {
  try {
    const db = getAdminDb();
    const docRef = db.collection(TYPES_COLLECTION).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return { success: false, error: '同意書種別が見つかりません' };
    }

    const existing = docToAgreementType(doc);
    const before = { ...existing };
    const updated: AgreementType = {
      ...existing,
      ...patch,
      updatedAt: now(),
    };

    await docRef.set(updated);
    await logEvent('type', id, actorUserId, 'update', before, updated);

    return { success: true, type: updated };
  } catch (error) {
    console.error('[Agreements:Firestore] updateAgreementType error:', error);
    return { success: false, error: '同意書種別の更新に失敗しました' };
  }
}

// ========== 同意書本文（版）CRUD ==========

export async function listDocuments(agreementTypeId: string): Promise<AgreementDocument[]> {
  try {
    const db = getAdminDb();
    const snapshot = await db.collection(DOCUMENTS_COLLECTION)
      .where('agreementTypeId', '==', agreementTypeId)
      .get();

    const items = snapshot.docs.map(docToAgreementDocument);
    items.sort((a, b) => b.templateVersion - a.templateVersion);
    return items;
  } catch (error) {
    console.error('[Agreements:Firestore] listDocuments error:', error);
    return [];
  }
}

export async function getDocumentById(id: string): Promise<AgreementDocument | null> {
  try {
    const db = getAdminDb();
    const doc = await db.collection(DOCUMENTS_COLLECTION).doc(id).get();
    if (!doc.exists) return null;
    return docToAgreementDocument(doc);
  } catch (error) {
    console.error('[Agreements:Firestore] getDocumentById error:', error);
    return null;
  }
}

export async function getActiveDocument(agreementTypeId: string): Promise<AgreementDocument | null> {
  try {
    const db = getAdminDb();
    const snapshot = await db.collection(DOCUMENTS_COLLECTION)
      .where('agreementTypeId', '==', agreementTypeId)
      .where('status', '==', 'active')
      .limit(1)
      .get();

    if (snapshot.empty) return null;
    return docToAgreementDocument(snapshot.docs[0]);
  } catch (error) {
    console.error('[Agreements:Firestore] getActiveDocument error:', error);
    return null;
  }
}

export async function createDocument(
  agreementTypeId: string,
  input: CreateDocumentInput,
  actorUserId: string
): Promise<{ success: true; document: AgreementDocument } | { success: false; error: string }> {
  try {
    const agreementType = await getAgreementTypeById(agreementTypeId);
    if (!agreementType) {
      return { success: false, error: '同意書種別が見つかりません' };
    }

    // 重複チェック
    const db = getAdminDb();
    const existingSnapshot = await db.collection(DOCUMENTS_COLLECTION)
      .where('agreementTypeId', '==', agreementTypeId)
      .where('templateKey', '==', input.templateKey)
      .where('templateVersion', '==', input.templateVersion)
      .limit(1)
      .get();

    if (!existingSnapshot.empty) {
      return { success: false, error: '同じテンプレート・バージョンの本文が既に存在します' };
    }

    const timestamp = now();
    const document: AgreementDocument = {
      id: generateId('agdoc'),
      agreementTypeId,
      templateKey: input.templateKey,
      templateVersion: input.templateVersion,
      titleOverride: input.titleOverride ?? null,
      status: 'archived',
      effectiveFrom: input.effectiveFrom ?? null,
      effectiveTo: input.effectiveTo ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdByUserId: actorUserId,
    };

    await db.collection(DOCUMENTS_COLLECTION).doc(document.id).set(document);
    await logEvent('document', document.id, actorUserId, 'create', null, document);

    return { success: true, document };
  } catch (error) {
    console.error('[Agreements:Firestore] createDocument error:', error);
    return { success: false, error: '本文の作成に失敗しました' };
  }
}

export async function setActiveDocument(
  documentId: string,
  actorUserId: string
): Promise<{ success: true; document: AgreementDocument } | { success: false; error: string }> {
  try {
    const db = getAdminDb();
    const docRef = db.collection(DOCUMENTS_COLLECTION).doc(documentId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return { success: false, error: '本文が見つかりません' };
    }

    const document = docToAgreementDocument(doc);
    const before = { ...document };

    // 同じtypeの他のactive documentをarchive
    const sameTypeSnapshot = await db.collection(DOCUMENTS_COLLECTION)
      .where('agreementTypeId', '==', document.agreementTypeId)
      .where('status', '==', 'active')
      .get();

    const batch = db.batch();
    for (const activeDoc of sameTypeSnapshot.docs) {
      if (activeDoc.id !== documentId) {
        batch.update(activeDoc.ref, { status: 'archived', updatedAt: now() });
      }
    }

    // 対象をactiveに
    const updated: AgreementDocument = {
      ...document,
      status: 'active',
      updatedAt: now(),
    };
    batch.set(docRef, updated);

    await batch.commit();
    await logEvent('document', documentId, actorUserId, 'activate_document', before, updated);

    return { success: true, document: updated };
  } catch (error) {
    console.error('[Agreements:Firestore] setActiveDocument error:', error);
    return { success: false, error: '本文の有効化に失敗しました' };
  }
}

export async function archiveDocument(
  documentId: string,
  actorUserId: string
): Promise<{ success: true; document: AgreementDocument } | { success: false; error: string }> {
  try {
    const db = getAdminDb();
    const docRef = db.collection(DOCUMENTS_COLLECTION).doc(documentId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return { success: false, error: '本文が見つかりません' };
    }

    const document = docToAgreementDocument(doc);
    const before = { ...document };
    const updated: AgreementDocument = {
      ...document,
      status: 'archived',
      updatedAt: now(),
    };

    await docRef.set(updated);
    await logEvent('document', documentId, actorUserId, 'archive_document', before, updated);

    return { success: true, document: updated };
  } catch (error) {
    console.error('[Agreements:Firestore] archiveDocument error:', error);
    return { success: false, error: '本文のアーカイブに失敗しました' };
  }
}

// ========== 同意レコード CRUD ==========

export async function listConsents(
  viewer: ViewerContext,
  filter: ListConsentsFilter = {}
): Promise<{ consents: AgreementConsent[]; total: number }> {
  try {
    const db = getAdminDb();
    let query: FirebaseFirestore.Query = db.collection(CONSENTS_COLLECTION);

    if (filter.agreementTypeId) {
      query = query.where('agreementTypeId', '==', filter.agreementTypeId);
    }

    if (filter.subjectType) {
      query = query.where('subjectType', '==', filter.subjectType);
    }

    if (filter.consentStatus) {
      query = query.where('consentStatus', '==', filter.consentStatus);
    }

    const snapshot = await query.get();
    let items = snapshot.docs.map(docToAgreementConsent);

    // RBAC
    if (canViewOwnConsentsOnly(viewer.role)) {
      items = items.filter(
        (c) => c.subjectType === 'staff' && c.subjectId === viewer.userId
      );
    } else if (!canViewConsents(viewer.role)) {
      return { consents: [], total: 0 };
    }

    // Additional filters (client-side)
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
  } catch (error) {
    console.error('[Agreements:Firestore] listConsents error:', error);
    return { consents: [], total: 0 };
  }
}

export async function getConsentById(
  id: string,
  viewer: ViewerContext
): Promise<AgreementConsent | null> {
  try {
    const db = getAdminDb();
    const doc = await db.collection(CONSENTS_COLLECTION).doc(id).get();
    if (!doc.exists) return null;

    const consent = docToAgreementConsent(doc);

    // RBAC
    if (canViewOwnConsentsOnly(viewer.role)) {
      if (consent.subjectType !== 'staff' || consent.subjectId !== viewer.userId) {
        return null;
      }
    } else if (!canViewConsents(viewer.role)) {
      return null;
    }

    return consent;
  } catch (error) {
    console.error('[Agreements:Firestore] getConsentById error:', error);
    return null;
  }
}

export async function recordConsent(
  input: RecordConsentInput,
  actorUserId: string
): Promise<{ success: true; consent: AgreementConsent } | { success: false; error: string }> {
  try {
    const agreementType = await getAgreementTypeById(input.agreementTypeId);
    if (!agreementType) {
      return { success: false, error: '同意書種別が見つかりません' };
    }

    const activeDocument = await getActiveDocument(input.agreementTypeId);
    if (!activeDocument) {
      return { success: false, error: 'この同意書種別に有効な本文がありません' };
    }

    const db = getAdminDb();
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

    await db.collection(CONSENTS_COLLECTION).doc(consent.id).set(consent);
    await logEvent('consent', consent.id, actorUserId, 'record_consent', null, consent);

    return { success: true, consent };
  } catch (error) {
    console.error('[Agreements:Firestore] recordConsent error:', error);
    return { success: false, error: '同意レコードの記録に失敗しました' };
  }
}

export async function withdrawConsent(
  consentId: string,
  actorUserId: string,
  note?: string
): Promise<{ success: true; consent: AgreementConsent } | { success: false; error: string }> {
  try {
    const db = getAdminDb();
    const docRef = db.collection(CONSENTS_COLLECTION).doc(consentId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return { success: false, error: '同意レコードが見つかりません' };
    }

    const consent = docToAgreementConsent(doc);
    const before = { ...consent };

    const updated: AgreementConsent = {
      ...consent,
      consentStatus: 'withdrawn',
      revokedAt: now(),
      updatedAt: now(),
      note: note
        ? (consent.note ? consent.note + '\n' : '') + `[撤回] ${note}`
        : consent.note,
    };

    await docRef.set(updated);
    await logEvent('consent', consentId, actorUserId, 'withdraw', before, updated, note ?? null);

    return { success: true, consent: updated };
  } catch (error) {
    console.error('[Agreements:Firestore] withdrawConsent error:', error);
    return { success: false, error: '同意撤回に失敗しました' };
  }
}

export async function renewConsent(
  consentId: string,
  newValidUntil: string,
  actorUserId: string,
  note?: string
): Promise<{ success: true; consent: AgreementConsent } | { success: false; error: string }> {
  try {
    const db = getAdminDb();
    const docRef = db.collection(CONSENTS_COLLECTION).doc(consentId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return { success: false, error: '同意レコードが見つかりません' };
    }

    const consent = docToAgreementConsent(doc);
    const before = { ...consent };

    const updated: AgreementConsent = {
      ...consent,
      validUntil: newValidUntil,
      updatedAt: now(),
      note: note
        ? (consent.note ? consent.note + '\n' : '') + `[更新] ${note}`
        : consent.note,
    };

    await docRef.set(updated);
    await logEvent('consent', consentId, actorUserId, 'renew', before, updated, note ?? null);

    return { success: true, consent: updated };
  } catch (error) {
    console.error('[Agreements:Firestore] renewConsent error:', error);
    return { success: false, error: '同意更新に失敗しました' };
  }
}

// ========== スキャン ==========

export async function scanExpiringConsents(days: number = 30): Promise<AgreementConsent[]> {
  try {
    const db = getAdminDb();
    const snapshot = await db.collection(CONSENTS_COLLECTION)
      .where('consentStatus', '==', 'consented')
      .get();

    const items = snapshot.docs.map(docToAgreementConsent);

    // types を一括取得してwarnDaysを取得
    const typesSnapshot = await db.collection(TYPES_COLLECTION).get();
    const typesMap = new Map<string, AgreementType>();
    typesSnapshot.docs.forEach((d) => {
      const t = docToAgreementType(d);
      typesMap.set(t.id, t);
    });

    return items.filter((c) => {
      if (!c.validUntil) return false;
      const agreementType = typesMap.get(c.agreementTypeId);
      const warnDays = agreementType?.defaultWarnDays ?? days;
      return isExpiring(c.validUntil, warnDays);
    });
  } catch (error) {
    console.error('[Agreements:Firestore] scanExpiringConsents error:', error);
    return [];
  }
}

export async function scanExpiredConsents(): Promise<AgreementConsent[]> {
  try {
    const db = getAdminDb();
    const snapshot = await db.collection(CONSENTS_COLLECTION)
      .where('consentStatus', '==', 'consented')
      .get();

    return snapshot.docs
      .map(docToAgreementConsent)
      .filter((c) => isExpired(c.validUntil));
  } catch (error) {
    console.error('[Agreements:Firestore] scanExpiredConsents error:', error);
    return [];
  }
}

// ========== 統計 ==========

export async function getStats(
  viewer: ViewerContext,
  options?: AgreementStatsOptions
): Promise<AgreementStats | null> {
  if (!canViewConsents(viewer.role)) {
    return null;
  }

  try {
    const db = getAdminDb();

    // 同意レコード
    const consentsSnapshot = await db.collection(CONSENTS_COLLECTION).get();
    let consents = consentsSnapshot.docs.map(docToAgreementConsent);

    // 種別
    const typesSnapshot = await db.collection(TYPES_COLLECTION).get();
    const types = typesSnapshot.docs.map(docToAgreementType);
    const typesMap = new Map<string, AgreementType>();
    types.forEach((t) => typesMap.set(t.id, t));

    // subjectType フィルタ
    if (options?.subjectType) {
      consents = consents.filter((c) => c.subjectType === options.subjectType);
    }

    // orgUnitIds スコープフィルタ（Firestoreではuser_org_membershipがないため、
    // 将来的にユーザー→組織のマッピングコレクションを参照する必要がある。
    // 現状はフィルタをスキップ）

    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);

    const expiringConsents = consents.filter((c) => {
      if (c.consentStatus !== 'consented') return false;
      if (!c.validUntil) return false;
      const agreementType = typesMap.get(c.agreementTypeId);
      const warnDays = agreementType?.defaultWarnDays ?? 30;
      const todayDate = new Date();
      const validDate = new Date(c.validUntil);
      const daysUntilExpiry = Math.ceil(
        (validDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24)
      );
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
  } catch (error) {
    console.error('[Agreements:Firestore] getStats error:', error);
    return null;
  }
}

// ========== イベント取得 ==========

export async function getEvents(entityId: string): Promise<AgreementEvent[]> {
  try {
    const db = getAdminDb();
    const snapshot = await db.collection(EVENTS_COLLECTION)
      .where('entityId', '==', entityId)
      .get();

    const events = snapshot.docs.map(docToAgreementEvent);
    events.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return events;
  } catch (error) {
    console.error('[Agreements:Firestore] getEvents error:', error);
    return [];
  }
}

export async function getEventsAll(limit: number = 1000): Promise<AgreementEvent[]> {
  try {
    const db = getAdminDb();
    const snapshot = await db.collection(EVENTS_COLLECTION)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map(docToAgreementEvent);
  } catch (error) {
    console.error('[Agreements:Firestore] getEventsAll error:', error);
    return [];
  }
}
