// ======== 書類管理 Firestore関数 ========

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db, DEFAULT_TENANT_ID } from './firebase';
import {
  Document,
  DocumentTemplate,
  DocumentEvent,
  DocumentFilter,
  DocumentSummary,
  DocumentStatus,
  DocumentOwnerType,
  DocumentEventType,
} from '@/types/document';
import { DOCUMENT_TEMPLATES, getTemplateByKey, getRequiredTemplates } from '@/data/document-templates';

function ensureDb() {
  if (!db) {
    throw new Error('Firestore is not initialized');
  }
  return db;
}

/**
 * Firestoreに渡す前にundefinedを除去する
 * Firestoreはundefinedを許可しないため、nullまたは値のあるフィールドのみ保持
 * @exported for testing
 */
export function normalizeForFirestore<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  // Firestore Timestampクラスのチェック（テスト環境でも動作するように）
  const isTimestamp = (v: unknown): boolean => {
    return v !== null && typeof v === 'object' && 'toDate' in v && typeof (v as { toDate: unknown }).toDate === 'function';
  };

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      // ネストされたオブジェクトも再帰的に処理
      if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date) && !isTimestamp(value)) {
        result[key] = normalizeForFirestore(value as Record<string, unknown>);
      } else if (Array.isArray(value)) {
        // 配列内のundefinedも除去
        result[key] = value.filter(v => v !== undefined).map(v => {
          if (v !== null && typeof v === 'object' && !(v instanceof Date) && !isTimestamp(v)) {
            return normalizeForFirestore(v as Record<string, unknown>);
          }
          return v;
        });
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}

// ======== テンプレート ========

// 静的データから取得（フォールバック用）
export function getDocumentTemplatesFromStatic(): DocumentTemplate[] {
  return DOCUMENT_TEMPLATES.map((t, idx) => ({
    ...t,
    id: `template_${idx}`,
    createdAt: new Date(),
  })) as DocumentTemplate[];
}

// Firestoreから取得（シード後に使用）
export async function getDocumentTemplatesFromDB(): Promise<DocumentTemplate[]> {
  const firestore = ensureDb();

  const q = query(
    collection(firestore, 'documentTemplates'),
    orderBy('ownerType', 'asc')
  );

  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    // DBにない場合は静的データを返す
    return getDocumentTemplatesFromStatic();
  }

  return snapshot.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate(),
    } as DocumentTemplate;
  });
}

// 互換性のためのエイリアス（静的データ使用）
export function getDocumentTemplates(): DocumentTemplate[] {
  return getDocumentTemplatesFromStatic();
}

export function getDocumentTemplateByKey(key: string): DocumentTemplate | undefined {
  const t = getTemplateByKey(key);
  if (!t) return undefined;
  return {
    ...t,
    id: `template_${key}`,
    createdAt: new Date(),
  } as DocumentTemplate;
}

// ======== 書類取得 ========

export async function getDocuments(
  tenantId: string = DEFAULT_TENANT_ID,
  filter?: DocumentFilter
): Promise<Document[]> {
  const firestore = ensureDb();

  let q = query(
    collection(firestore, 'documents'),
    where('tenantId', '==', tenantId)
  );

  const snapshot = await getDocs(q);

  let results = snapshot.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      dueDate: data.dueDate?.toDate(),
      issuedDate: data.issuedDate?.toDate(),
      signedAt: data.signedAt?.toDate(),
      uploadedAt: data.uploadedAt?.toDate(),
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate(),
    } as Document;
  });

  // フィルタリング
  if (filter) {
    if (filter.ownerType) {
      results = results.filter((d) => d.ownerType === filter.ownerType);
    }
    if (filter.ownerId) {
      results = results.filter((d) => d.ownerId === filter.ownerId);
    }
    if (filter.status) {
      results = results.filter((d) => d.status === filter.status);
    }
    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      results = results.filter(
        (d) =>
          d.docTypeName?.toLowerCase().includes(searchLower) ||
          d.ownerName?.toLowerCase().includes(searchLower) ||
          d.title?.toLowerCase().includes(searchLower)
      );
    }
    if (filter.dueDaysWithin) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + filter.dueDaysWithin);
      results = results.filter(
        (d) => d.dueDate && d.dueDate <= cutoff && d.status !== 'SUBMITTED'
      );
    }
  }

  // 期限切れ判定（表示時）
  const now = new Date();
  results = results.map((d) => {
    if (d.dueDate && d.dueDate < now && d.status !== 'SUBMITTED') {
      return { ...d, status: 'EXPIRED' as DocumentStatus };
    }
    return d;
  });

  // ソート（未回収・期限切れ優先）
  results.sort((a, b) => {
    const statusOrder: Record<DocumentStatus, number> = {
      EXPIRED: 0,
      MISSING: 1,
      RENEWAL_PENDING: 2,
      SUBMITTED: 3,
    };
    const orderA = statusOrder[a.status] ?? 99;
    const orderB = statusOrder[b.status] ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    return (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0);
  });

  return results;
}

export async function getDocument(id: string): Promise<Document | null> {
  const firestore = ensureDb();
  const docRef = doc(firestore, 'documents', id);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) return null;

  const data = docSnap.data();
  return {
    id: docSnap.id,
    ...data,
    dueDate: data.dueDate?.toDate(),
    issuedDate: data.issuedDate?.toDate(),
    signedAt: data.signedAt?.toDate(),
    uploadedAt: data.uploadedAt?.toDate(),
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate(),
  } as Document;
}

// ======== 書類作成・更新 ========

export async function createDocument(
  data: Omit<Document, 'id' | 'createdAt' | 'updatedAt' | 'version'>,
  actorId: string,
  actorName: string
): Promise<Document> {
  const firestore = ensureDb();

  const template = getTemplateByKey(data.docType);

  // 入力データをログ出力（デバッグ用）
  console.log('[createDocument] Input data:', JSON.stringify(data, null, 2));

  // undefinedを除去してFirestoreに渡す
  const rawDocData = {
    tenantId: data.tenantId || '',
    ownerType: data.ownerType,
    ownerId: data.ownerId || '',
    ownerName: data.ownerName || '',
    docType: data.docType || '',
    docTypeName: template?.name || data.docTypeName || data.docType || '',
    status: data.status || 'MISSING',
    signedRequired: data.signedRequired ?? false,
    version: 1,
    createdAt: Timestamp.now(),
  };

  // 正規化前のデータをログ出力
  console.log('[createDocument] Raw doc data:', JSON.stringify(rawDocData, null, 2));

  const docData = normalizeForFirestore(rawDocData);

  // 正規化後のデータをログ出力
  console.log('[createDocument] Normalized doc data:', JSON.stringify(docData, null, 2));

  // undefinedチェック（二重安全策）
  const hasUndefined = Object.entries(docData).some(([key, value]) => {
    if (value === undefined) {
      console.error(`[createDocument] Found undefined value for key: ${key}`);
      return true;
    }
    return false;
  });

  if (hasUndefined) {
    throw new Error('Document data contains undefined values');
  }

  const docRef = await addDoc(collection(firestore, 'documents'), docData);

  console.log('[createDocument] Successfully created document:', docRef.id);

  // イベント記録
  await createDocumentEvent(docRef.id, 'CREATE', null, docData, actorId, actorName);

  return {
    id: docRef.id,
    ...docData,
    createdAt: new Date(),
  } as Document;
}

export async function updateDocument(
  id: string,
  updates: Partial<Document>,
  actorId: string,
  actorName: string
): Promise<void> {
  const firestore = ensureDb();
  const existing = await getDocument(id);
  if (!existing) throw new Error('書類が見つかりません');

  // undefinedを除去してFirestoreに渡す
  const rawUpdateData = {
    ...updates,
    updatedAt: Timestamp.now(),
  };
  const updateData = normalizeForFirestore(rawUpdateData);

  await updateDoc(doc(firestore, 'documents', id), updateData);

  // イベント記録
  await createDocumentEvent(id, 'STATUS_CHANGE', existing, updateData, actorId, actorName);
}

export async function uploadDocumentFile(
  id: string,
  fileData: {
    fileUrl: string;
    fileName: string;
    fileMime: string;
    fileSize: number;
  },
  actorId: string,
  actorName: string
): Promise<void> {
  const firestore = ensureDb();
  const existing = await getDocument(id);
  if (!existing) throw new Error('書類が見つかりません');

  const updateData = {
    ...fileData,
    status: 'SUBMITTED' as DocumentStatus,
    version: existing.version + 1,
    uploadedBy: actorId,
    uploadedByName: actorName,
    uploadedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  await updateDoc(doc(firestore, 'documents', id), updateData);

  // イベント記録
  const eventType: DocumentEventType = existing.version > 0 ? 'REPLACE' : 'UPLOAD';
  await createDocumentEvent(id, eventType, existing, updateData, actorId, actorName);
}

// ======== 必須書類の自動生成 ========

/**
 * 生成結果の詳細
 */
export interface GenerateDocumentsResult {
  created: Document[];
  skipped: { docType: string; reason: string }[];
  errors: { docType: string; error: string }[];
}

/**
 * 必須書類を自動生成
 * - テンプレートに基づいて書類レコードを作成
 * - 既存の書類は重複生成しない（doc_key + ownerIdで判定）
 * - 生成失敗しても他の書類は継続生成
 */
export async function generateRequiredDocuments(
  ownerType: DocumentOwnerType,
  ownerId: string,
  ownerName: string,
  tenantId: string = DEFAULT_TENANT_ID,
  actorId: string,
  actorName: string
): Promise<Document[]> {
  const result = await generateRequiredDocumentsWithDetails(
    ownerType,
    ownerId,
    ownerName,
    tenantId,
    actorId,
    actorName
  );
  return result.created;
}

/**
 * 必須書類を自動生成（詳細結果付き）
 */
export async function generateRequiredDocumentsWithDetails(
  ownerType: DocumentOwnerType,
  ownerId: string,
  ownerName: string,
  tenantId: string = DEFAULT_TENANT_ID,
  actorId: string,
  actorName: string
): Promise<GenerateDocumentsResult> {
  const result: GenerateDocumentsResult = {
    created: [],
    skipped: [],
    errors: [],
  };

  // テンプレート取得
  const required = getRequiredTemplates(ownerType);

  console.log(`[generateRequiredDocuments] ownerType=${ownerType}, ownerId=${ownerId}, templates=${required.length}`);

  // テンプレートが0件の場合は早期リターン
  if (required.length === 0) {
    console.warn(`[generateRequiredDocuments] No required templates found for ownerType=${ownerType}`);
    return result;
  }

  // 有効なテンプレートのみフィルタ（undefinedや不正データ防止）
  const validTemplates = required.filter(t => t && t.key && t.name);
  if (validTemplates.length !== required.length) {
    console.warn(`[generateRequiredDocuments] Filtered ${required.length - validTemplates.length} invalid templates`);
  }

  console.log(`[generateRequiredDocuments] Valid templates:`, validTemplates.map(t => ({ key: t.key, name: t.name })));

  // 既存書類を取得（重複チェック用）
  const existingDocs = await getDocuments(tenantId, { ownerType, ownerId });
  const existingDocTypes = new Set(existingDocs.map(d => d.docType));

  console.log(`[generateRequiredDocuments] Existing doc types:`, Array.from(existingDocTypes));

  for (const template of validTemplates) {
    // 重複チェック（同一 ownerId + docType の書類が既に存在する場合はスキップ）
    if (existingDocTypes.has(template.key)) {
      console.log(`[generateRequiredDocuments] Skipping duplicate: ${template.key}`);
      result.skipped.push({ docType: template.key, reason: '既に存在' });
      continue;
    }

    // 生成するドキュメントデータを構築（undefined防止）
    const docInput = {
      tenantId: tenantId || 'defaultTenant',
      ownerType,
      ownerId: ownerId || '',
      ownerName: ownerName || '',
      docType: template.key || '',
      docTypeName: template.name || '',
      status: 'MISSING' as const,
      signedRequired: Boolean(template.signedRequired),
    };

    // 入力データの検証
    if (!docInput.docType || !docInput.ownerId) {
      console.error(`[generateRequiredDocuments] Invalid input data:`, docInput);
      result.errors.push({ docType: template.key || 'unknown', error: 'Invalid input data' });
      continue;
    }

    console.log(`[generateRequiredDocuments] Creating document:`, docInput);

    try {
      const doc = await createDocument(
        docInput,
        actorId || 'system',
        actorName || 'System'
      );
      result.created.push(doc);
      console.log(`[generateRequiredDocuments] Created document: ${doc.id} (${template.key})`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[generateRequiredDocuments] Failed to create document: ${template.key}`, errorMessage);
      result.errors.push({ docType: template.key, error: errorMessage });
    }
  }

  console.log(`[generateRequiredDocuments] Result: created=${result.created.length}, skipped=${result.skipped.length}, errors=${result.errors.length}`);

  return result;
}

// ======== サマリー取得 ========

export async function getDocumentSummary(
  tenantId: string = DEFAULT_TENANT_ID,
  ownerType?: DocumentOwnerType,
  ownerId?: string
): Promise<DocumentSummary> {
  const docs = await getDocuments(tenantId, { ownerType, ownerId });

  const now = new Date();
  const thirtyDaysLater = new Date();
  thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

  return {
    total: docs.length,
    missing: docs.filter((d) => d.status === 'MISSING').length,
    submitted: docs.filter((d) => d.status === 'SUBMITTED').length,
    expired: docs.filter((d) => d.status === 'EXPIRED').length,
    renewalPending: docs.filter((d) => d.status === 'RENEWAL_PENDING').length,
    dueSoon: docs.filter(
      (d) =>
        d.dueDate &&
        d.dueDate <= thirtyDaysLater &&
        d.dueDate >= now &&
        d.status !== 'SUBMITTED'
    ).length,
  };
}

// ======== 未回収ランキング ========

export async function getMissingDocumentsByOwner(
  tenantId: string = DEFAULT_TENANT_ID
): Promise<{ ownerId: string; ownerName: string; ownerType: DocumentOwnerType; count: number }[]> {
  const docs = await getDocuments(tenantId, { status: 'MISSING' });

  const grouped: Record<string, { ownerName: string; ownerType: DocumentOwnerType; count: number }> = {};

  for (const d of docs) {
    if (!grouped[d.ownerId]) {
      grouped[d.ownerId] = {
        ownerName: d.ownerName || d.ownerId,
        ownerType: d.ownerType,
        count: 0,
      };
    }
    grouped[d.ownerId].count++;
  }

  return Object.entries(grouped)
    .map(([ownerId, data]) => ({ ownerId, ...data }))
    .sort((a, b) => b.count - a.count);
}

// ======== イベント記録 ========

async function createDocumentEvent(
  documentId: string,
  eventType: DocumentEventType,
  prev: unknown,
  next: unknown,
  actorId: string,
  actorName: string
): Promise<void> {
  const firestore = ensureDb();

  // JSON.stringifyでundefinedが自動的に除去されるが、明示的にnullに変換
  const sanitizeForJson = (obj: unknown): unknown => {
    if (obj === null || obj === undefined) return null;
    return JSON.parse(JSON.stringify(obj, (_, v) => v === undefined ? null : v));
  };

  const eventData = normalizeForFirestore({
    documentId,
    eventType,
    prevJson: sanitizeForJson(prev),
    nextJson: sanitizeForJson(next),
    actorId,
    actorName: actorName || '',
    createdAt: Timestamp.now(),
  });

  await addDoc(collection(firestore, 'documentEvents'), eventData);
}

export async function getDocumentEvents(documentId: string): Promise<DocumentEvent[]> {
  const firestore = ensureDb();

  const q = query(
    collection(firestore, 'documentEvents'),
    where('documentId', '==', documentId),
    orderBy('createdAt', 'desc')
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      createdAt: data.createdAt?.toDate() || new Date(),
    } as DocumentEvent;
  });
}
