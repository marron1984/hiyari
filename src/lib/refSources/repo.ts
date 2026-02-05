/**
 * 紹介元（ref）管理リポジトリ
 *
 * Ticket 073: 紹介元refトラッキング
 *
 * インメモリストア実装（本番ではFirestoreに置き換え）
 */

import type {
  RefSource,
  RefAccessLog,
  CreateRefSourceRequest,
  UpdateRefSourceRequest,
  RefSourceListFilter,
  RefSourceStatus,
} from './types';

// ========== インメモリストア ==========

const refSourcesStore = new Map<string, RefSource>();
const refAccessLogsStore: RefAccessLog[] = [];

let logIdCounter = 1;

// ========== ヘルパー関数 ==========

/**
 * refコードを自動生成（6文字の英数字）
 */
function generateRefCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  // 既存チェック
  if (refSourcesStore.has(code)) {
    return generateRefCode(); // 重複時は再生成
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

// ========== 紹介元CRUD ==========

/**
 * 紹介元一覧取得
 */
export function listRefSources(
  filter: RefSourceListFilter = {}
): { items: RefSource[]; total: number } {
  let sources = Array.from(refSourcesStore.values());

  // ステータスフィルタ
  if (filter.status) {
    sources = sources.filter((s) => s.status === filter.status);
  }

  // タイプフィルタ
  if (filter.type) {
    sources = sources.filter((s) => s.type === filter.type);
  }

  // 事業単位フィルタ
  if (filter.businessUnitId) {
    sources = sources.filter(
      (s) =>
        s.allowedBusinessUnitIds.length === 0 ||
        s.allowedBusinessUnitIds.includes(filter.businessUnitId!)
    );
  }

  // 検索
  if (filter.q) {
    const q = filter.q.toLowerCase();
    sources = sources.filter(
      (s) =>
        s.ref.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q)
    );
  }

  // ソート（作成日時降順）
  sources.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
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
export function getRefSourceByRef(ref: string): RefSource | null {
  return refSourcesStore.get(ref) ?? null;
}

/**
 * 紹介元作成
 */
export function createRefSource(
  input: CreateRefSourceRequest,
  actorUserId: string
): RefSource {
  const now = new Date().toISOString();
  const ref = input.ref || generateRefCode();

  // 既存チェック
  if (refSourcesStore.has(ref)) {
    throw new Error(`refコード "${ref}" は既に使用されています`);
  }

  const source: RefSource = {
    ref,
    name: input.name,
    type: input.type,
    status: 'active',
    allowedBusinessUnitIds: input.allowedBusinessUnitIds ?? [],
    createdAt: now,
    createdByUserId: actorUserId,
    updatedAt: now,
    note: input.note,
  };

  refSourcesStore.set(ref, source);
  return source;
}

/**
 * 紹介元更新
 */
export function updateRefSource(
  ref: string,
  patch: UpdateRefSourceRequest
): RefSource | null {
  const source = refSourcesStore.get(ref);
  if (!source) return null;

  if (patch.name !== undefined) source.name = patch.name;
  if (patch.type !== undefined) source.type = patch.type;
  if (patch.status !== undefined) source.status = patch.status;
  if (patch.allowedBusinessUnitIds !== undefined) {
    source.allowedBusinessUnitIds = patch.allowedBusinessUnitIds;
  }
  if (patch.note !== undefined) source.note = patch.note;

  source.updatedAt = new Date().toISOString();

  return source;
}

/**
 * 紹介元削除（物理削除ではなく無効化を推奨）
 */
export function deleteRefSource(ref: string): boolean {
  return refSourcesStore.delete(ref);
}

// ========== refバリデーション ==========

/**
 * refが有効かチェック
 *
 * @param ref refコード
 * @param businessUnitId 問い合わせ対象の事業単位ID
 * @returns 有効な紹介元情報、無効ならnull
 */
export function validateRef(
  ref: string,
  businessUnitId: string
): RefSource | null {
  const source = refSourcesStore.get(ref);

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
export function logRefAccess(
  ref: string,
  path: string,
  ip?: string,
  userAgent?: string
): void {
  const log: RefAccessLog = {
    id: `ral_${String(logIdCounter++).padStart(6, '0')}`,
    ref,
    path,
    occurredAt: new Date().toISOString(),
    ipHint: maskIpAddress(ip),
    userAgent: userAgent?.slice(0, 200), // 長すぎる場合は切り詰め
  };

  refAccessLogsStore.push(log);

  // メモリ節約：1000件を超えたら古いものを削除
  if (refAccessLogsStore.length > 1000) {
    refAccessLogsStore.shift();
  }
}

/**
 * refアクセスログ取得
 */
export function getRefAccessLogs(
  ref: string,
  limit: number = 50
): RefAccessLog[] {
  return refAccessLogsStore
    .filter((log) => log.ref === ref)
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, limit);
}

// ========== 統計 ==========

/**
 * ref別の問い合わせ統計（簡易版）
 * ※ 本格的な統計は tickets repo から取得
 */
export function getRefStats(): { ref: string; name: string; type: string; accessCount: number }[] {
  const accessCounts = new Map<string, number>();

  for (const log of refAccessLogsStore) {
    accessCounts.set(log.ref, (accessCounts.get(log.ref) ?? 0) + 1);
  }

  return Array.from(refSourcesStore.values())
    .filter((s) => s.status === 'active')
    .map((s) => ({
      ref: s.ref,
      name: s.name,
      type: s.type,
      accessCount: accessCounts.get(s.ref) ?? 0,
    }))
    .sort((a, b) => b.accessCount - a.accessCount);
}

// ========== シードデータ ==========

export function seedRefSourcesIfEmpty(): void {
  if (refSourcesStore.size > 0) return;

  const seeds: CreateRefSourceRequest[] = [
    {
      ref: 'HSP001',
      name: '○○病院 地域連携室',
      type: 'hospital',
      allowedBusinessUnitIds: ['bu_001', 'bu_002'],
      note: '紹介実績多数',
    },
    {
      ref: 'CM0001',
      name: '鈴木ケアマネ事務所',
      type: 'care_manager',
      allowedBusinessUnitIds: ['bu_001'],
    },
    {
      ref: 'AGN001',
      name: 'シニアライフ紹介センター',
      type: 'agency',
      allowedBusinessUnitIds: [], // 全事業許可
    },
    {
      ref: 'HSP002',
      name: '△△総合病院',
      type: 'hospital',
      allowedBusinessUnitIds: ['bu_003'],
    },
  ];

  for (const seed of seeds) {
    createRefSource(seed, 'system');
  }
}
