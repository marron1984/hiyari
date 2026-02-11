/**
 * 紹介元（ref）管理 Firestoreリポジトリ
 *
 * PROD-003: 本番永続化
 * Ticket 073: 紹介元refトラッキング
 *
 * コレクション: ref_sources（ドキュメントID = refコード）
 * コレクション: ref_access_logs
 *
 * 対応関数:
 * - listRefSources: 一覧取得
 * - getRefSourceByRef: refコードで取得
 * - createRefSource: 作成
 * - updateRefSource: 更新
 * - deleteRefSource: 削除
 * - validateRef: refバリデーション
 * - logRefAccess: アクセスログ記録
 * - getRefAccessLogs: アクセスログ取得
 * - getRefStats: 統計
 * - seedRefSourcesIfEmpty: シード（Firestore版はno-op）
 */

import { getAdminDb } from '@/lib/firebase-admin';
import type {
  RefSource,
  RefAccessLog,
  CreateRefSourceRequest,
  UpdateRefSourceRequest,
  RefSourceListFilter,
} from './types';

// ========== 定数 ==========

const REF_SOURCES_COLLECTION = 'ref_sources';
const REF_ACCESS_LOGS_COLLECTION = 'ref_access_logs';

// ========== ユーティリティ ==========

function now(): string {
  return new Date().toISOString();
}

/**
 * refコードを自動生成（6文字の英数字）
 */
function generateRefCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * IPアドレスをマスク
 */
function maskIpAddress(ip?: string): string | undefined {
  if (!ip) return undefined;
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.xxx.xxx`;
  }
  return 'xxx.xxx.xxx.xxx';
}

function docToRefSource(
  doc: FirebaseFirestore.DocumentSnapshot
): RefSource {
  const data = doc.data()!;
  return {
    ref: data.ref ?? doc.id,
    name: data.name ?? '',
    type: data.type ?? 'other',
    status: data.status ?? 'active',
    allowedBusinessUnitIds: data.allowedBusinessUnitIds ?? [],
    createdAt: data.createdAt ?? now(),
    createdByUserId: data.createdByUserId ?? 'system',
    updatedAt: data.updatedAt ?? now(),
    note: data.note,
  };
}

// ========== 紹介元CRUD ==========

/**
 * 紹介元一覧取得
 */
export async function listRefSources(
  filter: RefSourceListFilter = {}
): Promise<{ items: RefSource[]; total: number }> {
  const db = getAdminDb();
  let q: FirebaseFirestore.Query = db.collection(REF_SOURCES_COLLECTION);

  // ステータスフィルタ
  if (filter.status) {
    q = q.where('status', '==', filter.status);
  }

  // タイプフィルタ
  if (filter.type) {
    q = q.where('type', '==', filter.type);
  }

  const snap = await q.get();
  let sources = snap.docs.map(docToRefSource);

  // 事業単位フィルタ（メモリ内）
  if (filter.businessUnitId) {
    sources = sources.filter(
      (s) =>
        s.allowedBusinessUnitIds.length === 0 ||
        s.allowedBusinessUnitIds.includes(filter.businessUnitId!)
    );
  }

  // 検索（メモリ内）
  if (filter.q) {
    const searchTerm = filter.q.toLowerCase();
    sources = sources.filter(
      (s) =>
        s.ref.toLowerCase().includes(searchTerm) ||
        s.name.toLowerCase().includes(searchTerm)
    );
  }

  // ソート（作成日時降順）
  sources.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const total = sources.length;

  // ページネーション
  const limit = filter.limit ?? 50;
  const offset = filter.offset ?? 0;
  sources = sources.slice(offset, offset + limit);

  return { items: sources, total };
}

/**
 * 紹介元取得（refコードで）
 */
export async function getRefSourceByRef(
  ref: string
): Promise<RefSource | null> {
  const db = getAdminDb();
  const doc = await db.collection(REF_SOURCES_COLLECTION).doc(ref).get();
  if (!doc.exists) return null;
  return docToRefSource(doc);
}

/**
 * 紹介元作成
 */
export async function createRefSource(
  input: CreateRefSourceRequest,
  actorUserId: string
): Promise<RefSource> {
  const db = getAdminDb();
  let refCode = input.ref;

  // refコード自動生成（重複チェック付き）
  if (!refCode) {
    let attempts = 0;
    do {
      refCode = generateRefCode();
      const existing = await db
        .collection(REF_SOURCES_COLLECTION)
        .doc(refCode)
        .get();
      if (!existing.exists) break;
      attempts++;
    } while (attempts < 10);
  }

  // 既存チェック
  const existing = await db
    .collection(REF_SOURCES_COLLECTION)
    .doc(refCode!)
    .get();
  if (existing.exists) {
    throw new Error(`refコード "${refCode}" は既に使用されています`);
  }

  const timestamp = now();
  const source: RefSource = {
    ref: refCode!,
    name: input.name,
    type: input.type,
    status: 'active',
    allowedBusinessUnitIds: input.allowedBusinessUnitIds ?? [],
    createdAt: timestamp,
    createdByUserId: actorUserId,
    updatedAt: timestamp,
    note: input.note,
  };

  await db
    .collection(REF_SOURCES_COLLECTION)
    .doc(refCode!)
    .set(source);
  return source;
}

/**
 * 紹介元更新
 */
export async function updateRefSource(
  ref: string,
  patch: UpdateRefSourceRequest
): Promise<RefSource | null> {
  const db = getAdminDb();
  const docRef = db.collection(REF_SOURCES_COLLECTION).doc(ref);
  const doc = await docRef.get();

  if (!doc.exists) return null;

  const updateData: Record<string, unknown> = { updatedAt: now() };
  if (patch.name !== undefined) updateData.name = patch.name;
  if (patch.type !== undefined) updateData.type = patch.type;
  if (patch.status !== undefined) updateData.status = patch.status;
  if (patch.allowedBusinessUnitIds !== undefined) {
    updateData.allowedBusinessUnitIds = patch.allowedBusinessUnitIds;
  }
  if (patch.note !== undefined) updateData.note = patch.note;

  await docRef.update(updateData);

  const updatedDoc = await docRef.get();
  return docToRefSource(updatedDoc);
}

/**
 * 紹介元削除（物理削除）
 */
export async function deleteRefSource(ref: string): Promise<boolean> {
  const db = getAdminDb();
  const docRef = db.collection(REF_SOURCES_COLLECTION).doc(ref);
  const doc = await docRef.get();

  if (!doc.exists) return false;

  await docRef.delete();
  return true;
}

// ========== refバリデーション ==========

/**
 * refが有効かチェック
 *
 * @param ref refコード
 * @param businessUnitId 問い合わせ対象の事業単位ID
 * @returns 有効な紹介元情報、無効ならnull
 */
export async function validateRef(
  ref: string,
  businessUnitId: string
): Promise<RefSource | null> {
  const source = await getRefSourceByRef(ref);

  // 存在しない
  if (!source) return null;

  // 無効化されている
  if (source.status !== 'active') return null;

  // 事業単位スコープチェック
  if (source.allowedBusinessUnitIds.length > 0) {
    if (!source.allowedBusinessUnitIds.includes(businessUnitId)) {
      return null; // スコープ外
    }
  }

  return source;
}

// ========== アクセスログ ==========

/**
 * refアクセスログを記録
 */
export async function logRefAccess(
  ref: string,
  path: string,
  ip?: string,
  userAgent?: string
): Promise<void> {
  const db = getAdminDb();
  const logId = `${ref}_${Date.now()}`;

  const log: RefAccessLog = {
    id: logId,
    ref,
    path,
    occurredAt: now(),
    ipHint: maskIpAddress(ip),
    userAgent: userAgent?.slice(0, 200),
  };

  await db.collection(REF_ACCESS_LOGS_COLLECTION).doc(logId).set(log);
}

/**
 * refアクセスログ取得
 */
export async function getRefAccessLogs(
  ref: string,
  limit: number = 50
): Promise<RefAccessLog[]> {
  const db = getAdminDb();
  const snap = await db
    .collection(REF_ACCESS_LOGS_COLLECTION)
    .where('ref', '==', ref)
    .orderBy('occurredAt', 'desc')
    .limit(limit)
    .get();

  return snap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: data.id ?? doc.id,
      ref: data.ref,
      path: data.path,
      occurredAt: data.occurredAt,
      ipHint: data.ipHint,
      userAgent: data.userAgent,
    };
  });
}

// ========== 統計 ==========

/**
 * ref別の問い合わせ統計（簡易版）
 */
export async function getRefStats(): Promise<
  { ref: string; name: string; type: string; accessCount: number }[]
> {
  const db = getAdminDb();

  // アクティブな紹介元を取得
  const sourcesSnap = await db
    .collection(REF_SOURCES_COLLECTION)
    .where('status', '==', 'active')
    .get();

  const sources = sourcesSnap.docs.map(docToRefSource);

  // 各紹介元のアクセスカウントを取得
  const results: {
    ref: string;
    name: string;
    type: string;
    accessCount: number;
  }[] = [];

  for (const source of sources) {
    const logsSnap = await db
      .collection(REF_ACCESS_LOGS_COLLECTION)
      .where('ref', '==', source.ref)
      .count()
      .get();

    results.push({
      ref: source.ref,
      name: source.name,
      type: source.type,
      accessCount: logsSnap.data().count,
    });
  }

  return results.sort((a, b) => b.accessCount - a.accessCount);
}

// ========== シード（Firestore版はno-op） ==========

/**
 * シードデータ投入（Firestoreでは外部スクリプトで実施）
 */
export async function seedRefSourcesIfEmpty(): Promise<void> {
  // Firestoreでは外部シードスクリプトで初期化するため no-op
}
