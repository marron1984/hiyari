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

  const docData = {
    ...data,
    docTypeName: template?.name || data.docType,
    version: 1,
    createdAt: Timestamp.now(),
  };

  const docRef = await addDoc(collection(firestore, 'documents'), docData);

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

  const updateData = {
    ...updates,
    updatedAt: Timestamp.now(),
  };

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

export async function generateRequiredDocuments(
  ownerType: DocumentOwnerType,
  ownerId: string,
  ownerName: string,
  tenantId: string = DEFAULT_TENANT_ID,
  actorId: string,
  actorName: string
): Promise<Document[]> {
  const required = getRequiredTemplates(ownerType);
  const created: Document[] = [];

  for (const template of required) {
    const doc = await createDocument(
      {
        tenantId,
        ownerType,
        ownerId,
        ownerName,
        docType: template.key,
        docTypeName: template.name,
        status: 'MISSING',
        signedRequired: template.signedRequired,
      },
      actorId,
      actorName
    );
    created.push(doc);
  }

  return created;
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

  await addDoc(collection(firestore, 'documentEvents'), {
    documentId,
    eventType,
    prevJson: prev ? JSON.parse(JSON.stringify(prev)) : null,
    nextJson: next ? JSON.parse(JSON.stringify(next)) : null,
    actorId,
    actorName,
    createdAt: Timestamp.now(),
  });
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
