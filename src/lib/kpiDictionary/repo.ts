/**
 * KPI辞書リポジトリ
 *
 * インメモリストレージ（本番ではDBに置き換え）
 */

import type {
  KPIDictionaryEntry,
  KPIDictionaryFilter,
  CreateKPIDictionaryRequest,
  UpdateKPIDictionaryRequest,
  KPIDefinitionEvent,
  DefinitionEventAction,
} from './types';

// インメモリストレージ
const dictionaryStore = new Map<string, KPIDictionaryEntry>();
const eventStore: KPIDefinitionEvent[] = [];

// ID生成
let eventIdCounter = 1;

function generateEventId(): string {
  return `kpi_event_${Date.now()}_${eventIdCounter++}`;
}

// 初期化フラグ
let isInitialized = false;

/**
 * デモ用データで初期化
 */
function initializeStore(): void {
  if (isInitialized) return;

  const now = new Date().toISOString();
  const demoEntries: KPIDictionaryEntry[] = [
    {
      id: 'pending_approvals',
      name: '未承認申請数',
      description: '承認待ちの申請件数',
      unit: '件',
      category: 'operation',
      frequency: 'daily',
      status: 'active',
      ownerRole: 'manager',
      ownerUserId: null,
      isExternalAllowed: false,
      direction: 'lower_is_better',
      targetText: '3件以下を維持',
      thresholds: { warning: 5, critical: 10 },
      whyItMatters: '承認遅延は業務のボトルネックとなり、従業員の不満や意思決定の遅れを招く。迅速な承認フローの維持が組織効率の鍵。',
      definition: '申請ステータスが「承認待ち」の申請の総数。下書きや差戻し済みは含まない。',
      calculationMethod: 'sql',
      calculationRef: 'kpi_sql_v1:pending_approvals',
      calculationNotes: 'SELECT COUNT(*) FROM applications WHERE status = "pending_approval"',
      dataSource: 'DB: applications',
      refreshCadence: 'realtime',
      tags: ['operation', 'approval'],
      dashboardPath: '/dashboard/approvals',
      createdAt: now,
      updatedAt: now,
      lastDefinitionUpdatedAt: null,
    },
    {
      id: 'occupancy_rate',
      name: '入居率',
      description: '施設の入居率',
      unit: '%',
      category: 'sales',
      frequency: 'weekly',
      status: 'active',
      ownerRole: 'executive',
      ownerUserId: null,
      isExternalAllowed: true,
      direction: 'higher_is_better',
      targetText: '95%以上を維持',
      thresholds: { warning: 90, critical: 85 },
      whyItMatters: '入居率は売上に直結する最重要KPI。95%を下回ると固定費の回収が困難になり、経営に影響。',
      definition: '(現在入居者数 / 定員) × 100。空室予約（1ヶ月以内入居予定）は入居者に含める。',
      calculationMethod: 'sql',
      calculationRef: 'kpi_sql_v1:occupancy_rate',
      calculationNotes: 'SELECT (occupied_rooms / total_capacity) * 100 FROM facilities',
      dataSource: 'DB: facilities, residents',
      refreshCadence: 'daily',
      tags: ['sales', 'core', 'external'],
      dashboardPath: '/dashboard/residents',
      createdAt: now,
      updatedAt: now,
      lastDefinitionUpdatedAt: null,
    },
    {
      id: 'incident_count',
      name: '事故件数',
      description: '月間の事故発生件数',
      unit: '件',
      category: 'risk',
      frequency: 'weekly',
      status: 'active',
      ownerRole: 'manager',
      ownerUserId: null,
      isExternalAllowed: false,
      direction: 'lower_is_better',
      targetText: '月間5件以下',
      thresholds: { warning: 3, critical: 5 },
      whyItMatters: '事故は入居者の安全に直結し、信頼と評判に影響。ゼロ事故を目指すが、発生時は迅速な対応と再発防止が重要。',
      definition: '報告された事故件数。ヒヤリハットは含まない。',
      calculationMethod: 'sql',
      calculationRef: 'kpi_sql_v1:incident_count',
      calculationNotes: 'SELECT COUNT(*) FROM incidents WHERE type = "accident" AND created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)',
      dataSource: 'DB: incidents',
      refreshCadence: 'daily',
      tags: ['risk', 'safety'],
      dashboardPath: '/admin/incidents',
      createdAt: now,
      updatedAt: now,
      lastDefinitionUpdatedAt: null,
    },
    {
      id: 'hiyari_count',
      name: 'ヒヤリハット報告数',
      description: '月間のヒヤリハット報告件数',
      unit: '件',
      category: 'risk',
      frequency: 'weekly',
      status: 'active',
      ownerRole: 'leader',
      ownerUserId: null,
      isExternalAllowed: false,
      direction: 'higher_is_better',
      targetText: '月間20件以上（報告文化の定着）',
      thresholds: { warning: 10, critical: 5 },
      whyItMatters: 'ヒヤリハット報告は事故予防の先行指標。報告数が多いほど安全意識が高く、潜在リスクを早期発見できる。',
      definition: '報告されたヒヤリハットの件数。',
      calculationMethod: 'sql',
      calculationRef: 'kpi_sql_v1:hiyari_count',
      calculationNotes: 'SELECT COUNT(*) FROM incidents WHERE type = "hiyari" AND created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)',
      dataSource: 'DB: incidents',
      refreshCadence: 'daily',
      tags: ['risk', 'safety', 'culture'],
      dashboardPath: '/admin/incidents',
      createdAt: now,
      updatedAt: now,
      lastDefinitionUpdatedAt: null,
    },
    {
      id: 'staff_turnover',
      name: '離職率',
      description: '年間離職率',
      unit: '%',
      category: 'people',
      frequency: 'weekly',
      status: 'active',
      ownerRole: 'executive',
      ownerUserId: null,
      isExternalAllowed: true,
      direction: 'lower_is_better',
      targetText: '15%以下',
      thresholds: { warning: 15, critical: 20 },
      whyItMatters: '離職は採用・教育コストの増大とサービス品質の低下を招く。介護業界平均は16%程度。',
      definition: '(年間退職者数 / 期初従業員数) × 100',
      calculationMethod: 'manual',
      calculationRef: 'kpi_code:staff_turnover',
      calculationNotes: '毎月の退職者数を人事部が集計し、手動で登録。',
      dataSource: 'CSV: HR monthly report',
      refreshCadence: 'monthly',
      tags: ['people', 'hr', 'external'],
      dashboardPath: '/admin/employees',
      createdAt: now,
      updatedAt: now,
      lastDefinitionUpdatedAt: null,
    },
    {
      id: 'revenue_per_resident',
      name: '入居者単価',
      description: '入居者1人あたりの月間売上',
      unit: '万円',
      category: 'finance',
      frequency: 'weekly',
      status: 'active',
      ownerRole: 'executive',
      ownerUserId: null,
      isExternalAllowed: true,
      direction: 'higher_is_better',
      targetText: '25万円以上',
      thresholds: { warning: 23, critical: 20 },
      whyItMatters: '入居者単価は収益性の直接指標。介護度と付帯サービスの提供状況を反映。',
      definition: '月間総売上 / 平均入居者数',
      calculationMethod: 'vendor',
      calculationRef: 'vendor:freee:revenue_per_resident',
      calculationNotes: '会計ソフト（freee）のAPIから月次売上を取得し、入居者数で除算。',
      dataSource: 'Vendor API: freee',
      refreshCadence: 'monthly',
      tags: ['finance', 'core', 'external'],
      createdAt: now,
      updatedAt: now,
      lastDefinitionUpdatedAt: null,
    },
    {
      id: 'approval_lead_time',
      name: '承認リードタイム',
      description: '申請から承認までの平均日数',
      unit: '日',
      category: 'operation',
      frequency: 'daily',
      status: 'active',
      ownerRole: 'manager',
      ownerUserId: null,
      isExternalAllowed: false,
      direction: 'lower_is_better',
      targetText: '2日以内',
      thresholds: { warning: 3, critical: 5 },
      whyItMatters: '承認リードタイムが長いと業務が停滞し、従業員のモチベーション低下につながる。',
      definition: '過去30日間に承認された申請の「申請日から承認日までの日数」の平均',
      calculationMethod: 'sql',
      calculationRef: 'kpi_sql_v1:approval_lead_time',
      calculationNotes: 'SELECT AVG(DATEDIFF(approved_at, submitted_at)) FROM applications WHERE approved_at IS NOT NULL AND approved_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)',
      dataSource: 'DB: applications',
      refreshCadence: 'daily',
      tags: ['operation', 'efficiency'],
      dashboardPath: '/dashboard/approvals',
      createdAt: now,
      updatedAt: now,
      lastDefinitionUpdatedAt: null,
    },
    {
      id: 'old_kpi_deprecated',
      name: '旧指標（廃止）',
      description: '使用されなくなった旧KPI',
      unit: '件',
      category: 'operation',
      frequency: 'daily',
      status: 'deprecated',
      ownerRole: null,
      ownerUserId: null,
      isExternalAllowed: false,
      direction: 'neutral',
      targetText: null,
      whyItMatters: null,
      definition: null,
      calculationMethod: 'manual',
      calculationRef: null,
      calculationNotes: null,
      dataSource: null,
      refreshCadence: null,
      tags: [],
      createdAt: now,
      updatedAt: now,
      lastDefinitionUpdatedAt: null,
    },
  ];

  for (const entry of demoEntries) {
    dictionaryStore.set(entry.id, entry);
  }

  isInitialized = true;
}

/**
 * KPI辞書一覧を取得
 */
export function listKPIDictionary(filter: KPIDictionaryFilter = {}): {
  entries: KPIDictionaryEntry[];
  total: number;
} {
  initializeStore();

  let entries = Array.from(dictionaryStore.values());

  // ステータスフィルタ（デフォルトはactive）
  if (filter.status) {
    entries = entries.filter((e) => e.status === filter.status);
  }

  // カテゴリフィルタ
  if (filter.category) {
    entries = entries.filter((e) => e.category === filter.category);
  }

  // タグフィルタ
  if (filter.tag) {
    entries = entries.filter((e) => e.tags.includes(filter.tag!));
  }

  // オーナーロールフィルタ
  if (filter.ownerRole) {
    entries = entries.filter((e) => e.ownerRole === filter.ownerRole);
  }

  // 検索フィルタ
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

/**
 * KPI辞書エントリを取得
 */
export function getKPIDictionaryEntry(kpiId: string): KPIDictionaryEntry | null {
  initializeStore();
  return dictionaryStore.get(kpiId) ?? null;
}

/**
 * KPI辞書エントリを作成
 */
export function createKPIDictionaryEntry(
  request: CreateKPIDictionaryRequest,
  actorUserId?: string
): { success: boolean; entry?: KPIDictionaryEntry; error?: string } {
  initializeStore();

  // ID重複チェック
  if (dictionaryStore.has(request.id)) {
    return { success: false, error: 'KPI IDは既に存在します' };
  }

  const now = new Date().toISOString();
  const entry: KPIDictionaryEntry = {
    id: request.id,
    name: request.name,
    description: request.description,
    unit: request.unit,
    category: request.category,
    frequency: request.frequency,
    status: 'active',
    ownerRole: request.ownerRole ?? null,
    ownerUserId: request.ownerUserId ?? null,
    isExternalAllowed: request.isExternalAllowed ?? false,
    direction: request.direction,
    targetText: request.targetText ?? null,
    thresholds: request.thresholds,
    whyItMatters: request.whyItMatters ?? null,
    definition: request.definition ?? null,
    calculationMethod: request.calculationMethod ?? 'manual',
    calculationRef: request.calculationRef ?? null,
    calculationNotes: request.calculationNotes ?? null,
    dataSource: request.dataSource ?? null,
    refreshCadence: request.refreshCadence ?? null,
    tags: request.tags ?? [],
    createdAt: now,
    updatedAt: now,
    lastDefinitionUpdatedAt: null,
  };

  dictionaryStore.set(entry.id, entry);

  // 監査ログ
  addEvent(entry.id, 'create', actorUserId ?? null, null, entry);

  return { success: true, entry };
}

/**
 * KPI辞書エントリを更新
 */
export function updateKPIDictionaryEntry(
  kpiId: string,
  patch: UpdateKPIDictionaryRequest,
  actorUserId?: string,
  note?: string
): { success: boolean; entry?: KPIDictionaryEntry; error?: string } {
  initializeStore();

  const existing = dictionaryStore.get(kpiId);
  if (!existing) {
    return { success: false, error: 'KPIが見つかりません' };
  }

  const before = { ...existing };
  const now = new Date().toISOString();

  // 定義変更があるかチェック
  const definitionFields = ['definition', 'calculationMethod', 'calculationRef', 'calculationNotes', 'dataSource'];
  const hasDefinitionChange = definitionFields.some(
    (field) => patch[field as keyof UpdateKPIDictionaryRequest] !== undefined
  );

  // 更新
  const updated: KPIDictionaryEntry = {
    ...existing,
    ...patch,
    updatedAt: now,
    lastDefinitionUpdatedAt: hasDefinitionChange ? now : existing.lastDefinitionUpdatedAt,
  };

  dictionaryStore.set(kpiId, updated);

  // 監査ログ
  addEvent(kpiId, 'update', actorUserId ?? null, before, updated, note);

  return { success: true, entry: updated };
}

/**
 * KPI辞書エントリを廃止
 */
export function deprecateKPIDictionaryEntry(
  kpiId: string,
  actorUserId?: string,
  note?: string
): { success: boolean; entry?: KPIDictionaryEntry; error?: string } {
  initializeStore();

  const existing = dictionaryStore.get(kpiId);
  if (!existing) {
    return { success: false, error: 'KPIが見つかりません' };
  }

  if (existing.status === 'deprecated') {
    return { success: false, error: '既に廃止されています' };
  }

  const before = { ...existing };
  const now = new Date().toISOString();

  const updated: KPIDictionaryEntry = {
    ...existing,
    status: 'deprecated',
    updatedAt: now,
  };

  dictionaryStore.set(kpiId, updated);

  // 監査ログ
  addEvent(kpiId, 'deprecate', actorUserId ?? null, before, updated, note);

  return { success: true, entry: updated };
}

/**
 * KPI辞書エントリを復元
 */
export function restoreKPIDictionaryEntry(
  kpiId: string,
  actorUserId?: string,
  note?: string
): { success: boolean; entry?: KPIDictionaryEntry; error?: string } {
  initializeStore();

  const existing = dictionaryStore.get(kpiId);
  if (!existing) {
    return { success: false, error: 'KPIが見つかりません' };
  }

  if (existing.status === 'active') {
    return { success: false, error: '既にアクティブです' };
  }

  const before = { ...existing };
  const now = new Date().toISOString();

  const updated: KPIDictionaryEntry = {
    ...existing,
    status: 'active',
    updatedAt: now,
  };

  dictionaryStore.set(kpiId, updated);

  // 監査ログ
  addEvent(kpiId, 'restore', actorUserId ?? null, before, updated, note);

  return { success: true, entry: updated };
}

/**
 * 監査ログを追加
 */
function addEvent(
  kpiId: string,
  action: DefinitionEventAction,
  actorUserId: string | null,
  before: KPIDictionaryEntry | null,
  after: KPIDictionaryEntry | null,
  note?: string
): void {
  const event: KPIDefinitionEvent = {
    id: generateEventId(),
    kpiId,
    actorUserId,
    action,
    beforeJson: before ? JSON.stringify(before) : null,
    afterJson: after ? JSON.stringify(after) : null,
    note: note ?? null,
    createdAt: new Date().toISOString(),
  };

  eventStore.push(event);
}

/**
 * 監査ログを取得
 */
export function listKPIDefinitionEvents(
  kpiId: string,
  options?: { limit?: number; offset?: number }
): { events: KPIDefinitionEvent[]; total: number } {
  initializeStore();

  let events = eventStore.filter((e) => e.kpiId === kpiId);

  // 新しい順にソート
  events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const total = events.length;

  // ページネーション
  const offset = options?.offset ?? 0;
  const limit = options?.limit ?? 50;
  events = events.slice(offset, offset + limit);

  return { events, total };
}

/**
 * 全タグを取得
 */
export function getAllTags(): string[] {
  initializeStore();

  const tagSet = new Set<string>();
  for (const entry of dictionaryStore.values()) {
    for (const tag of entry.tags) {
      tagSet.add(tag);
    }
  }

  return Array.from(tagSet).sort();
}

/**
 * ストアをクリア（テスト用）
 */
export function clearKPIDictionaryStore(): void {
  dictionaryStore.clear();
  eventStore.length = 0;
  eventIdCounter = 1;
  isInitialized = false;
}
