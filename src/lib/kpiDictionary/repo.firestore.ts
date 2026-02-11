/**
 * KPI辞書リポジトリ（Firestore版）
 *
 * Firestore永続化実装
 */

import { getAdminDb } from '@/lib/firebase-admin';
import type {
  KPIDictionaryEntry,
  KPIDictionaryFilter,
  CreateKPIDictionaryRequest,
  UpdateKPIDictionaryRequest,
  KPIDefinitionEvent,
  DefinitionEventAction,
} from './types';

// ========== コレクション名 ==========

const DICTIONARY_COLLECTION = 'kpi_dictionary';
const EVENTS_COLLECTION = 'kpi_definition_events';

// ========== ドキュメント変換 ==========

function docToEntry(doc: FirebaseFirestore.DocumentSnapshot): KPIDictionaryEntry {
  const d = doc.data()!;
  return {
    id: doc.id,
    name: d.name,
    description: d.description,
    unit: d.unit,
    category: d.category,
    frequency: d.frequency,
    status: d.status,
    ownerRole: d.ownerRole ?? null,
    ownerUserId: d.ownerUserId ?? null,
    ownerUserName: d.ownerUserName,
    isExternalAllowed: d.isExternalAllowed ?? false,
    direction: d.direction,
    targetText: d.targetText ?? null,
    thresholds: d.thresholds,
    whyItMatters: d.whyItMatters ?? null,
    definition: d.definition ?? null,
    calculationMethod: d.calculationMethod ?? 'manual',
    calculationRef: d.calculationRef ?? null,
    calculationNotes: d.calculationNotes ?? null,
    dataSource: d.dataSource ?? null,
    refreshCadence: d.refreshCadence ?? null,
    tags: d.tags ?? [],
    dashboardPath: d.dashboardPath,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    lastDefinitionUpdatedAt: d.lastDefinitionUpdatedAt ?? null,
  };
}

function docToEvent(doc: FirebaseFirestore.DocumentSnapshot): KPIDefinitionEvent {
  const d = doc.data()!;
  return {
    id: doc.id,
    kpiId: d.kpiId,
    actorUserId: d.actorUserId ?? null,
    actorUserName: d.actorUserName,
    action: d.action,
    beforeJson: d.beforeJson ?? null,
    afterJson: d.afterJson ?? null,
    note: d.note ?? null,
    createdAt: d.createdAt,
  };
}

// ========== CRUD ==========

export async function listKPIDictionary(filter: KPIDictionaryFilter = {}): Promise<{
  entries: KPIDictionaryEntry[];
  total: number;
}> {
  const db = getAdminDb();
  let query: FirebaseFirestore.Query = db.collection(DICTIONARY_COLLECTION);

  if (filter.status) {
    query = query.where('status', '==', filter.status);
  }
  if (filter.category) {
    query = query.where('category', '==', filter.category);
  }
  if (filter.ownerRole) {
    query = query.where('ownerRole', '==', filter.ownerRole);
  }

  const snapshot = await query.get();
  let entries = snapshot.docs.map(docToEntry);

  // タグフィルタ (array-contains)
  if (filter.tag) {
    entries = entries.filter((e) => e.tags.includes(filter.tag!));
  }

  // 検索フィルタ (client-side)
  if (filter.q) {
    const q = filter.q.toLowerCase();
    entries = entries.filter(
      (e) =>
        e.id.toLowerCase().includes(q) ||
        e.name.toLowerCase().includes(q) ||
        (e.definition && e.definition.toLowerCase().includes(q)) ||
        (e.description && e.description.toLowerCase().includes(q))
    );
  }

  // ソート（名前順）
  entries.sort((a, b) => a.name.localeCompare(b.name, 'ja'));

  const total = entries.length;

  // ページネーション
  const offset = filter.offset ?? 0;
  const limit = filter.limit ?? 100;
  entries = entries.slice(offset, offset + limit);

  return { entries, total };
}

export async function getKPIDictionaryEntry(kpiId: string): Promise<KPIDictionaryEntry | null> {
  const db = getAdminDb();
  const doc = await db.collection(DICTIONARY_COLLECTION).doc(kpiId).get();
  if (!doc.exists) return null;
  return docToEntry(doc);
}

export async function createKPIDictionaryEntry(
  request: CreateKPIDictionaryRequest,
  actorUserId?: string
): Promise<{ success: boolean; entry?: KPIDictionaryEntry; error?: string }> {
  const db = getAdminDb();

  // ID重複チェック
  const existingDoc = await db.collection(DICTIONARY_COLLECTION).doc(request.id).get();
  if (existingDoc.exists) {
    return { success: false, error: 'KPI IDは既に存在します' };
  }

  const timestamp = new Date().toISOString();
  const entryData = {
    name: request.name,
    description: request.description,
    unit: request.unit,
    category: request.category,
    frequency: request.frequency,
    status: 'active' as const,
    ownerRole: request.ownerRole ?? null,
    ownerUserId: request.ownerUserId ?? null,
    isExternalAllowed: request.isExternalAllowed ?? false,
    direction: request.direction,
    targetText: request.targetText ?? null,
    thresholds: request.thresholds ?? undefined,
    whyItMatters: request.whyItMatters ?? null,
    definition: request.definition ?? null,
    calculationMethod: request.calculationMethod ?? 'manual',
    calculationRef: request.calculationRef ?? null,
    calculationNotes: request.calculationNotes ?? null,
    dataSource: request.dataSource ?? null,
    refreshCadence: request.refreshCadence ?? null,
    tags: request.tags ?? [],
    createdAt: timestamp,
    updatedAt: timestamp,
    lastDefinitionUpdatedAt: null,
  };

  await db.collection(DICTIONARY_COLLECTION).doc(request.id).set(entryData);

  const entry: KPIDictionaryEntry = {
    id: request.id,
    ...entryData,
  };

  // 監査ログ
  await addEvent(entry.id, 'create', actorUserId ?? null, null, entry);

  return { success: true, entry };
}

export async function updateKPIDictionaryEntry(
  kpiId: string,
  patch: UpdateKPIDictionaryRequest,
  actorUserId?: string,
  note?: string
): Promise<{ success: boolean; entry?: KPIDictionaryEntry; error?: string }> {
  const db = getAdminDb();
  const docRef = db.collection(DICTIONARY_COLLECTION).doc(kpiId);
  const doc = await docRef.get();

  if (!doc.exists) {
    return { success: false, error: 'KPIが見つかりません' };
  }

  const existing = docToEntry(doc);
  const before = { ...existing };
  const timestamp = new Date().toISOString();

  // 定義変更があるかチェック
  const definitionFields = ['definition', 'calculationMethod', 'calculationRef', 'calculationNotes', 'dataSource'];
  const hasDefinitionChange = definitionFields.some(
    (field) => patch[field as keyof UpdateKPIDictionaryRequest] !== undefined
  );

  const updateData: Record<string, unknown> = {
    ...patch,
    updatedAt: timestamp,
  };

  if (hasDefinitionChange) {
    updateData.lastDefinitionUpdatedAt = timestamp;
  }

  await docRef.update(updateData);

  const updatedDoc = await docRef.get();
  const updated = docToEntry(updatedDoc);

  // 監査ログ
  await addEvent(kpiId, 'update', actorUserId ?? null, before, updated, note);

  return { success: true, entry: updated };
}

export async function deprecateKPIDictionaryEntry(
  kpiId: string,
  actorUserId?: string,
  note?: string
): Promise<{ success: boolean; entry?: KPIDictionaryEntry; error?: string }> {
  const db = getAdminDb();
  const docRef = db.collection(DICTIONARY_COLLECTION).doc(kpiId);
  const doc = await docRef.get();

  if (!doc.exists) {
    return { success: false, error: 'KPIが見つかりません' };
  }

  const existing = docToEntry(doc);

  if (existing.status === 'deprecated') {
    return { success: false, error: '既に廃止されています' };
  }

  const before = { ...existing };
  const timestamp = new Date().toISOString();

  await docRef.update({
    status: 'deprecated',
    updatedAt: timestamp,
  });

  const updatedDoc = await docRef.get();
  const updated = docToEntry(updatedDoc);

  await addEvent(kpiId, 'deprecate', actorUserId ?? null, before, updated, note);

  return { success: true, entry: updated };
}

export async function restoreKPIDictionaryEntry(
  kpiId: string,
  actorUserId?: string,
  note?: string
): Promise<{ success: boolean; entry?: KPIDictionaryEntry; error?: string }> {
  const db = getAdminDb();
  const docRef = db.collection(DICTIONARY_COLLECTION).doc(kpiId);
  const doc = await docRef.get();

  if (!doc.exists) {
    return { success: false, error: 'KPIが見つかりません' };
  }

  const existing = docToEntry(doc);

  if (existing.status === 'active') {
    return { success: false, error: '既にアクティブです' };
  }

  const before = { ...existing };
  const timestamp = new Date().toISOString();

  await docRef.update({
    status: 'active',
    updatedAt: timestamp,
  });

  const updatedDoc = await docRef.get();
  const updated = docToEntry(updatedDoc);

  await addEvent(kpiId, 'restore', actorUserId ?? null, before, updated, note);

  return { success: true, entry: updated };
}

// ========== 監査ログ ==========

async function addEvent(
  kpiId: string,
  action: DefinitionEventAction,
  actorUserId: string | null,
  before: KPIDictionaryEntry | null,
  after: KPIDictionaryEntry | null,
  note?: string
): Promise<void> {
  const db = getAdminDb();
  const docRef = db.collection(EVENTS_COLLECTION).doc();

  await docRef.set({
    kpiId,
    actorUserId,
    action,
    beforeJson: before ? JSON.stringify(before) : null,
    afterJson: after ? JSON.stringify(after) : null,
    note: note ?? null,
    createdAt: new Date().toISOString(),
  });
}

export async function listKPIDefinitionEvents(
  kpiId: string,
  options?: { limit?: number; offset?: number }
): Promise<{ events: KPIDefinitionEvent[]; total: number }> {
  const db = getAdminDb();

  const snapshot = await db
    .collection(EVENTS_COLLECTION)
    .where('kpiId', '==', kpiId)
    .orderBy('createdAt', 'desc')
    .get();

  const allEvents = snapshot.docs.map(docToEvent);
  const total = allEvents.length;

  const offset = options?.offset ?? 0;
  const limit = options?.limit ?? 50;
  const events = allEvents.slice(offset, offset + limit);

  return { events, total };
}

// ========== タグ ==========

export async function getAllTags(): Promise<string[]> {
  const db = getAdminDb();
  const snapshot = await db.collection(DICTIONARY_COLLECTION).get();

  const tagSet = new Set<string>();
  for (const doc of snapshot.docs) {
    const tags = doc.data().tags as string[] | undefined;
    if (tags) {
      for (const tag of tags) {
        tagSet.add(tag);
      }
    }
  }

  return Array.from(tagSet).sort();
}

// ========== テスト用 ==========

export async function clearKPIDictionaryStore(): Promise<void> {
  const db = getAdminDb();
  const snapshot = await db.collection(DICTIONARY_COLLECTION).get();
  const batch = db.batch();
  for (const doc of snapshot.docs) {
    batch.delete(doc.ref);
  }
  const eventsSnapshot = await db.collection(EVENTS_COLLECTION).get();
  for (const doc of eventsSnapshot.docs) {
    batch.delete(doc.ref);
  }
  await batch.commit();
}
