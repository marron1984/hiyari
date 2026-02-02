/**
 * KPI算出リファレンスリポジトリ
 *
 * 算出ロジックの根拠（SQL/コード/ベンダー）を管理
 * インメモリストレージ（本番ではDBに置き換え）
 */

import type {
  KPICalculationRef,
  CreateCalculationRefRequest,
  UpdateCalculationRefRequest,
} from './types';

// インメモリストレージ
const refsStore = new Map<string, KPICalculationRef>();

// 初期化フラグ
let isInitialized = false;

/**
 * デモ用データで初期化
 */
function initializeStore(): void {
  if (isInitialized) return;

  const now = new Date().toISOString();

  const demoRefs: KPICalculationRef[] = [
    {
      id: 'kpi_sql_v1:pending_approvals',
      type: 'sql',
      title: '未承認申請数 SQL',
      body: `SELECT COUNT(*) AS count
FROM applications
WHERE status = 'pending_approval'
  AND deleted_at IS NULL;`,
      filePath: null,
      ownerUserId: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'kpi_sql_v1:occupancy_rate',
      type: 'sql',
      title: '入居率 SQL',
      body: `SELECT
  ROUND((SUM(occupied_rooms) / SUM(total_capacity)) * 100, 1) AS rate
FROM facilities
WHERE is_active = 1;`,
      filePath: null,
      ownerUserId: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'kpi_sql_v1:incident_count',
      type: 'sql',
      title: '事故件数 SQL',
      body: `SELECT COUNT(*) AS count
FROM incidents
WHERE type = 'accident'
  AND created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH);`,
      filePath: null,
      ownerUserId: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'kpi_sql_v1:hiyari_count',
      type: 'sql',
      title: 'ヒヤリハット報告数 SQL',
      body: `SELECT COUNT(*) AS count
FROM incidents
WHERE type = 'hiyari'
  AND created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH);`,
      filePath: null,
      ownerUserId: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'kpi_sql_v1:approval_lead_time',
      type: 'sql',
      title: '承認リードタイム SQL',
      body: `SELECT AVG(DATEDIFF(approved_at, submitted_at)) AS avg_days
FROM applications
WHERE approved_at IS NOT NULL
  AND approved_at >= DATE_SUB(NOW(), INTERVAL 30 DAY);`,
      filePath: null,
      ownerUserId: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'kpi_code:staff_turnover',
      type: 'code',
      title: '離職率 計算コード',
      body: null,
      filePath: 'src/lib/kpi/calc/staffTurnover.ts',
      ownerUserId: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'vendor:freee:revenue_per_resident',
      type: 'vendor',
      title: '入居者単価（freee連携）',
      body: `freee会計APIから月次売上を取得し、入居者数で除算。
API: GET /api/v1/reports/trial_bs
フィルタ: account_category = "売上高"`,
      filePath: null,
      ownerUserId: null,
      createdAt: now,
      updatedAt: now,
    },
  ];

  for (const ref of demoRefs) {
    refsStore.set(ref.id, ref);
  }

  isInitialized = true;
}

/**
 * 算出リファレンス一覧を取得
 */
export function listCalculationRefs(options?: {
  type?: 'sql' | 'code' | 'vendor';
  q?: string;
}): KPICalculationRef[] {
  initializeStore();

  let refs = Array.from(refsStore.values());

  // タイプフィルタ
  if (options?.type) {
    refs = refs.filter((r) => r.type === options.type);
  }

  // 検索フィルタ
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
export function getCalculationRef(refId: string): KPICalculationRef | null {
  initializeStore();
  return refsStore.get(refId) ?? null;
}

/**
 * 算出リファレンスを作成
 */
export function createCalculationRef(
  request: CreateCalculationRefRequest
): { success: boolean; ref?: KPICalculationRef; error?: string } {
  initializeStore();

  // ID重複チェック
  if (refsStore.has(request.id)) {
    return { success: false, error: 'リファレンスIDは既に存在します' };
  }

  const now = new Date().toISOString();
  const ref: KPICalculationRef = {
    id: request.id,
    type: request.type,
    title: request.title,
    body: request.body ?? null,
    filePath: request.filePath ?? null,
    ownerUserId: request.ownerUserId ?? null,
    createdAt: now,
    updatedAt: now,
  };

  refsStore.set(ref.id, ref);

  return { success: true, ref };
}

/**
 * 算出リファレンスを更新
 */
export function updateCalculationRef(
  refId: string,
  patch: UpdateCalculationRefRequest
): { success: boolean; ref?: KPICalculationRef; error?: string } {
  initializeStore();

  const existing = refsStore.get(refId);
  if (!existing) {
    return { success: false, error: 'リファレンスが見つかりません' };
  }

  const now = new Date().toISOString();
  const updated: KPICalculationRef = {
    ...existing,
    ...patch,
    updatedAt: now,
  };

  refsStore.set(refId, updated);

  return { success: true, ref: updated };
}

/**
 * 算出リファレンスを削除
 */
export function deleteCalculationRef(
  refId: string
): { success: boolean; error?: string } {
  initializeStore();

  if (!refsStore.has(refId)) {
    return { success: false, error: 'リファレンスが見つかりません' };
  }

  refsStore.delete(refId);
  return { success: true };
}

/**
 * タイプ別のリファレンス数を取得
 */
export function getCalculationRefStats(): Record<string, number> {
  initializeStore();

  const stats: Record<string, number> = {
    sql: 0,
    code: 0,
    vendor: 0,
    total: 0,
  };

  for (const ref of refsStore.values()) {
    stats[ref.type]++;
    stats.total++;
  }

  return stats;
}

/**
 * ストアをクリア（テスト用）
 */
export function clearCalculationRefStore(): void {
  refsStore.clear();
  isInitialized = false;
}
