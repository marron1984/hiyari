/**
 * KPI算出リファレンスリポジトリ（Firestore版）
 *
 * 算出ロジックの根拠（SQL/コード/ベンダー）を管理
 * Firestore永続化実装
 */

import { getAdminDb } from '@/lib/firebase-admin';
import type {
  KPICalculationRef,
  CreateCalculationRefRequest,
  UpdateCalculationRefRequest,
} from './types';

// ========== コレクション名 ==========

const REFS_COLLECTION = 'kpi_calculation_refs';

// ========== ドキュメント変換 ==========

function docToRef(doc: FirebaseFirestore.DocumentSnapshot): KPICalculationRef {
  const d = doc.data()!;
  return {
    id: doc.id,
    type: d.type,
    title: d.title,
    body: d.body ?? null,
    filePath: d.filePath ?? null,
    ownerUserId: d.ownerUserId ?? null,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

// ========== CRUD ==========

/**
 * 算出リファレンス一覧を取得
 */
export async function listCalculationRefs(options?: {
  type?: 'sql' | 'code' | 'vendor';
  q?: string;
}): Promise<KPICalculationRef[]> {
  const db = getAdminDb();
  let query: FirebaseFirestore.Query = db.collection(REFS_COLLECTION);

  if (options?.type) {
    query = query.where('type', '==', options.type);
  }

  const snapshot = await query.get();
  let refs = snapshot.docs.map(docToRef);

  // 検索フィルタ (client-side)
  if (options?.q) {
    const q = options.q.toLowerCase();
    refs = refs.filter(
      (r) =>
        r.id.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q) ||
        (r.body && r.body.toLowerCase().includes(q))
    );
  }

  // ID順にソート
  refs.sort((a, b) => a.id.localeCompare(b.id));

  return refs;
}

/**
 * 算出リファレンスを取得
 */
export async function getCalculationRef(refId: string): Promise<KPICalculationRef | null> {
  const db = getAdminDb();
  const doc = await db.collection(REFS_COLLECTION).doc(refId).get();
  if (!doc.exists) return null;
  return docToRef(doc);
}

/**
 * 算出リファレンスを作成
 */
export async function createCalculationRef(
  request: CreateCalculationRefRequest
): Promise<{ success: boolean; ref?: KPICalculationRef; error?: string }> {
  const db = getAdminDb();

  // ID重複チェック
  const existingDoc = await db.collection(REFS_COLLECTION).doc(request.id).get();
  if (existingDoc.exists) {
    return { success: false, error: 'リファレンスIDは既に存在します' };
  }

  const now = new Date().toISOString();
  const refData = {
    type: request.type,
    title: request.title,
    body: request.body ?? null,
    filePath: request.filePath ?? null,
    ownerUserId: request.ownerUserId ?? null,
    createdAt: now,
    updatedAt: now,
  };

  await db.collection(REFS_COLLECTION).doc(request.id).set(refData);

  const ref: KPICalculationRef = {
    id: request.id,
    ...refData,
  };

  return { success: true, ref };
}

/**
 * 算出リファレンスを更新
 */
export async function updateCalculationRef(
  refId: string,
  patch: UpdateCalculationRefRequest
): Promise<{ success: boolean; ref?: KPICalculationRef; error?: string }> {
  const db = getAdminDb();
  const docRef = db.collection(REFS_COLLECTION).doc(refId);
  const doc = await docRef.get();

  if (!doc.exists) {
    return { success: false, error: 'リファレンスが見つかりません' };
  }

  const now = new Date().toISOString();
  await docRef.update({
    ...patch,
    updatedAt: now,
  });

  const updatedDoc = await docRef.get();
  const ref = docToRef(updatedDoc);

  return { success: true, ref };
}

/**
 * 算出リファレンスを削除
 */
export async function deleteCalculationRef(
  refId: string
): Promise<{ success: boolean; error?: string }> {
  const db = getAdminDb();
  const docRef = db.collection(REFS_COLLECTION).doc(refId);
  const doc = await docRef.get();

  if (!doc.exists) {
    return { success: false, error: 'リファレンスが見つかりません' };
  }

  await docRef.delete();
  return { success: true };
}

/**
 * タイプ別のリファレンス数を取得
 */
export async function getCalculationRefStats(): Promise<Record<string, number>> {
  const db = getAdminDb();
  const snapshot = await db.collection(REFS_COLLECTION).get();

  const stats: Record<string, number> = {
    sql: 0,
    code: 0,
    vendor: 0,
    total: 0,
  };

  for (const doc of snapshot.docs) {
    const type = doc.data().type as string;
    if (stats[type] !== undefined) {
      stats[type]++;
    }
    stats.total++;
  }

  return stats;
}

/**
 * ストアをクリア（テスト用）
 */
export async function clearCalculationRefStore(): Promise<void> {
  const db = getAdminDb();
  const snapshot = await db.collection(REFS_COLLECTION).get();
  const batch = db.batch();
  for (const doc of snapshot.docs) {
    batch.delete(doc.ref);
  }
  await batch.commit();
}
