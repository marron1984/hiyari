/**
 * AI副社長 スコアリング設定
 *
 * Implementation Ticket 062: AI副社長Top3の重み（スコアリング）を管理画面から調整
 *
 * - 事業別Top3（042/050）のスコアリング重みをUIから編集可能
 * - 変更は即反映（AI副社長/Role Home/朝ダイジェスト）
 * - 監査ログ（いつ誰が何を変えたか）
 * - デフォルトにリセット可能
 *
 * 注意: fs/path はサーバーサイドのみで使用（動的インポート）
 */

// ========== 型定義 ==========

export interface ScoringWeights {
  // 資格
  licenses_expired: number;
  licenses_expiring30: number;

  // 修繕
  repairs_highRiskOpen: number;
  repairs_overdue: number;

  // 是正措置
  correctiveActions_criticalOpen: number;
  correctiveActions_overdue: number;
  correctiveActions_open: number;

  // チケット
  tickets_urgentOpen: number;
  tickets_overdue: number;
  tickets_open: number;

  // アラート
  alerts_criticalOpen: number;
  alerts_warningOpen: number;

  // 未収・売掛（拡張用）
  receivables_criticalOverdue?: number;
  receivables_warningOverdue?: number;

  // 契約（拡張用）
  contracts_decisionOverdue?: number;

  // 回収フロー（拡張用）
  collection_overdueSteps?: number;
}

export interface ScoringThresholds {
  /** 重大判定のスコア閾値 */
  severityCritical: number;
  /** 警告判定のスコア閾値 */
  severityWarning: number;

  /** リスクレベル: critical閾値 */
  riskCritical: number;
  /** リスクレベル: high閾値 */
  riskHigh: number;
  /** リスクレベル: medium閾値 */
  riskMedium: number;

  /** 未収金: critical判定金額 */
  receivablesCriticalAmount?: number;
  /** 未収金: warning判定金額 */
  receivablesWarningAmount?: number;
}

export interface DiversitySettings {
  /** カテゴリごとの最大候補数 */
  maxPerCategory: number;
  /** 財務系候補の最大数 */
  maxFinanceCandidates: number;
  /** Top3の表示件数 */
  top3Limit: number;
  /** 全事業Top5の表示件数 */
  globalTopLimit: number;
}

export interface AiVpScoringConfig {
  weights: ScoringWeights;
  thresholds: ScoringThresholds;
  diversity: DiversitySettings;
}

export interface AiVpSettings {
  id: string;
  scope: 'global' | 'businessUnit';
  businessUnitId: string | null;
  config: AiVpScoringConfig;
  updatedAt: string;
  updatedByUserId: string;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  settingsId: string;
  action: 'create' | 'update' | 'reset';
  previousConfig: AiVpScoringConfig | null;
  newConfig: AiVpScoringConfig;
  userId: string;
  timestamp: string;
  changes: string[];  // 変更された項目のリスト
}

// ========== デフォルト設定 ==========

export const DEFAULT_WEIGHTS: ScoringWeights = {
  // 資格
  licenses_expired: 10,
  licenses_expiring30: 4,

  // 修繕
  repairs_highRiskOpen: 8,
  repairs_overdue: 6,

  // 是正措置
  correctiveActions_criticalOpen: 8,
  correctiveActions_overdue: 6,
  correctiveActions_open: 2,

  // チケット
  tickets_urgentOpen: 5,
  tickets_overdue: 4,
  tickets_open: 1,

  // アラート
  alerts_criticalOpen: 6,
  alerts_warningOpen: 2,

  // 拡張用
  receivables_criticalOverdue: 7,
  receivables_warningOverdue: 4,
  contracts_decisionOverdue: 9,
  collection_overdueSteps: 5,
};

export const DEFAULT_THRESHOLDS: ScoringThresholds = {
  severityCritical: 20,
  severityWarning: 10,

  riskCritical: 50,
  riskHigh: 30,
  riskMedium: 15,

  receivablesCriticalAmount: 1000000,
  receivablesWarningAmount: 500000,
};

export const DEFAULT_DIVERSITY: DiversitySettings = {
  maxPerCategory: 2,
  maxFinanceCandidates: 2,
  top3Limit: 3,
  globalTopLimit: 5,
};

export const DEFAULT_CONFIG: AiVpScoringConfig = {
  weights: DEFAULT_WEIGHTS,
  thresholds: DEFAULT_THRESHOLDS,
  diversity: DEFAULT_DIVERSITY,
};

/** 重みのラベル（UI表示用） */
export const WEIGHT_LABELS: Record<keyof ScoringWeights, { label: string; category: string }> = {
  licenses_expired: { label: '資格期限切れ', category: '資格・研修' },
  licenses_expiring30: { label: '資格期限迫る（30日以内）', category: '資格・研修' },
  repairs_highRiskOpen: { label: '高リスク修繕', category: '設備・修繕' },
  repairs_overdue: { label: '期限超過修繕', category: '設備・修繕' },
  correctiveActions_criticalOpen: { label: '重大是正措置', category: 'コンプライアンス' },
  correctiveActions_overdue: { label: '期限超過是正措置', category: 'コンプライアンス' },
  correctiveActions_open: { label: '是正措置（未完了）', category: 'コンプライアンス' },
  tickets_urgentOpen: { label: '緊急チケット', category: '運用・チケット' },
  tickets_overdue: { label: '期限超過チケット', category: '運用・チケット' },
  tickets_open: { label: 'チケット（未完了）', category: '運用・チケット' },
  alerts_criticalOpen: { label: '重大アラート', category: 'アラート' },
  alerts_warningOpen: { label: '警告アラート', category: 'アラート' },
  receivables_criticalOverdue: { label: '未収金（重大）', category: '財務' },
  receivables_warningOverdue: { label: '未収金（警告）', category: '財務' },
  contracts_decisionOverdue: { label: '契約判断期限超過', category: '財務' },
  collection_overdueSteps: { label: '回収フロー超過', category: '財務' },
};

/** 閾値のラベル（UI表示用） */
export const THRESHOLD_LABELS: Record<keyof ScoringThresholds, string> = {
  severityCritical: '重大判定スコア閾値',
  severityWarning: '警告判定スコア閾値',
  riskCritical: 'リスクレベル「critical」閾値',
  riskHigh: 'リスクレベル「high」閾値',
  riskMedium: 'リスクレベル「medium」閾値',
  receivablesCriticalAmount: '未収金「重大」金額（円）',
  receivablesWarningAmount: '未収金「警告」金額（円）',
};

// ========== 永続化ストレージ ==========
// サーバーサイドのみファイル永続化、クライアントはインメモリのみ

let settingsStore = new Map<string, AiVpSettings>();
let auditLog: AuditLogEntry[] = [];
let isInitialized = false;

// サーバーサイドかどうかを判定
function isServer(): boolean {
  return typeof window === 'undefined';
}

// ファイルパスを取得（サーバーサイドのみ）
function getFilePaths(): { dataDir: string; settingsFile: string; auditFile: string } | null {
  if (!isServer()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    const dataDir = path.join(process.cwd(), '.data');
    return {
      dataDir,
      settingsFile: path.join(dataDir, 'ai_vp_settings.json'),
      auditFile: path.join(dataDir, 'ai_vp_settings_audit.json'),
    };
  } catch {
    return null;
  }
}

function initializeStorage(): void {
  if (isInitialized) return;

  // クライアントサイドの場合はデフォルト設定のみ
  if (!isServer()) {
    isInitialized = true;
    return;
  }

  const paths = getFilePaths();
  if (!paths) {
    isInitialized = true;
    return;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');

    if (!fs.existsSync(paths.dataDir)) {
      fs.mkdirSync(paths.dataDir, { recursive: true });
    }

    // 設定ファイル読み込み
    if (fs.existsSync(paths.settingsFile)) {
      const data = JSON.parse(fs.readFileSync(paths.settingsFile, 'utf-8'));
      if (data.settings && Array.isArray(data.settings)) {
        for (const s of data.settings) {
          settingsStore.set(s.id, s);
        }
      }
    }

    // 監査ログ読み込み
    if (fs.existsSync(paths.auditFile)) {
      const data = JSON.parse(fs.readFileSync(paths.auditFile, 'utf-8'));
      if (data.entries && Array.isArray(data.entries)) {
        auditLog = data.entries;
      }
    }

    isInitialized = true;
    console.log(`[AiVpSettings] Loaded ${settingsStore.size} settings, ${auditLog.length} audit entries`);
  } catch (error) {
    console.error('[AiVpSettings] Failed to load:', error);
    isInitialized = true;
  }
}

function saveStorage(): void {
  // クライアントサイドでは保存しない
  if (!isServer()) return;

  const paths = getFilePaths();
  if (!paths) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');

    const settingsData = {
      settings: Array.from(settingsStore.values()),
      savedAt: new Date().toISOString(),
    };
    fs.writeFileSync(paths.settingsFile, JSON.stringify(settingsData, null, 2), 'utf-8');

    const auditData = {
      entries: auditLog,
      savedAt: new Date().toISOString(),
    };
    fs.writeFileSync(paths.auditFile, JSON.stringify(auditData, null, 2), 'utf-8');
  } catch (error) {
    console.error('[AiVpSettings] Failed to save:', error);
  }
}

initializeStorage();

function now(): string {
  return new Date().toISOString();
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ========== グローバル設定ID ==========

const GLOBAL_SETTINGS_ID = 'ai_vp_global';

// ========== CRUD ==========

/**
 * グローバル設定を取得（なければデフォルトを返す）
 */
export function getGlobalSettings(): AiVpSettings {
  const existing = settingsStore.get(GLOBAL_SETTINGS_ID);
  if (existing) return existing;

  // デフォルト設定を返す（永続化はしない）
  return {
    id: GLOBAL_SETTINGS_ID,
    scope: 'global',
    businessUnitId: null,
    config: { ...DEFAULT_CONFIG },
    updatedAt: now(),
    updatedByUserId: 'system',
    createdAt: now(),
  };
}

/**
 * 設定IDで取得
 */
export function getById(id: string): AiVpSettings | null {
  return settingsStore.get(id) ?? null;
}

/**
 * グローバル設定を更新
 */
export function updateGlobalSettings(
  config: Partial<AiVpScoringConfig>,
  userId: string
): AiVpSettings {
  const existing = getGlobalSettings();
  const timestamp = now();

  // 変更点を検出
  const changes = detectChanges(existing.config, config);

  // 新しい設定をマージ
  const newConfig: AiVpScoringConfig = {
    weights: { ...existing.config.weights, ...config.weights },
    thresholds: { ...existing.config.thresholds, ...config.thresholds },
    diversity: { ...existing.config.diversity, ...config.diversity },
  };

  const updated: AiVpSettings = {
    id: GLOBAL_SETTINGS_ID,
    scope: 'global',
    businessUnitId: null,
    config: newConfig,
    updatedAt: timestamp,
    updatedByUserId: userId,
    createdAt: existing.id ? existing.createdAt : timestamp,
  };

  // 監査ログ追加
  addAuditLog({
    settingsId: GLOBAL_SETTINGS_ID,
    action: existing.id ? 'update' : 'create',
    previousConfig: existing.id ? existing.config : null,
    newConfig,
    userId,
    changes,
  });

  settingsStore.set(GLOBAL_SETTINGS_ID, updated);
  saveStorage();

  return updated;
}

/**
 * グローバル設定をデフォルトにリセット
 */
export function resetGlobalSettings(userId: string): AiVpSettings {
  const existing = getGlobalSettings();
  const timestamp = now();

  const reset: AiVpSettings = {
    id: GLOBAL_SETTINGS_ID,
    scope: 'global',
    businessUnitId: null,
    config: { ...DEFAULT_CONFIG },
    updatedAt: timestamp,
    updatedByUserId: userId,
    createdAt: existing.createdAt || timestamp,
  };

  // 監査ログ追加
  addAuditLog({
    settingsId: GLOBAL_SETTINGS_ID,
    action: 'reset',
    previousConfig: existing.config,
    newConfig: DEFAULT_CONFIG,
    userId,
    changes: ['全設定をデフォルトにリセット'],
  });

  settingsStore.set(GLOBAL_SETTINGS_ID, reset);
  saveStorage();

  return reset;
}

// ========== 有効な設定を取得（スコアリング用） ==========

/**
 * 有効なスコアリング重みを取得
 *
 * businessTop3.ts から呼び出される
 */
export function getEffectiveWeights(businessUnitId?: string): ScoringWeights {
  // TODO: 将来的に事業別設定に対応
  const settings = getGlobalSettings();
  return settings.config.weights;
}

/**
 * 有効な閾値を取得
 */
export function getEffectiveThresholds(businessUnitId?: string): ScoringThresholds {
  const settings = getGlobalSettings();
  return settings.config.thresholds;
}

/**
 * 有効な多様性設定を取得
 */
export function getEffectiveDiversity(businessUnitId?: string): DiversitySettings {
  const settings = getGlobalSettings();
  return settings.config.diversity;
}

// ========== 監査ログ ==========

function detectChanges(
  oldConfig: AiVpScoringConfig,
  newConfig: Partial<AiVpScoringConfig>
): string[] {
  const changes: string[] = [];

  // 重みの変更を検出
  if (newConfig.weights) {
    for (const [key, value] of Object.entries(newConfig.weights)) {
      const oldValue = oldConfig.weights[key as keyof ScoringWeights];
      if (oldValue !== value) {
        const label = WEIGHT_LABELS[key as keyof ScoringWeights]?.label || key;
        changes.push(`${label}: ${oldValue} → ${value}`);
      }
    }
  }

  // 閾値の変更を検出
  if (newConfig.thresholds) {
    for (const [key, value] of Object.entries(newConfig.thresholds)) {
      const oldValue = oldConfig.thresholds[key as keyof ScoringThresholds];
      if (oldValue !== value) {
        const label = THRESHOLD_LABELS[key as keyof ScoringThresholds] || key;
        changes.push(`${label}: ${oldValue} → ${value}`);
      }
    }
  }

  // 多様性設定の変更を検出
  if (newConfig.diversity) {
    for (const [key, value] of Object.entries(newConfig.diversity)) {
      const oldValue = oldConfig.diversity[key as keyof DiversitySettings];
      if (oldValue !== value) {
        changes.push(`${key}: ${oldValue} → ${value}`);
      }
    }
  }

  return changes;
}

function addAuditLog(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): void {
  const logEntry: AuditLogEntry = {
    id: generateId('audit'),
    ...entry,
    timestamp: now(),
  };
  auditLog.push(logEntry);

  // 最大1000件保持
  if (auditLog.length > 1000) {
    auditLog = auditLog.slice(-1000);
  }
}

/**
 * 監査ログを取得
 */
export function getAuditLog(
  options: { limit?: number; settingsId?: string } = {}
): AuditLogEntry[] {
  const { limit = 50, settingsId } = options;

  let filtered = auditLog;
  if (settingsId) {
    filtered = auditLog.filter(e => e.settingsId === settingsId);
  }

  return filtered
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}

// ========== 統計 ==========

export function getStats(): {
  totalSettings: number;
  totalAuditEntries: number;
  lastUpdated: string | null;
} {
  const global = settingsStore.get(GLOBAL_SETTINGS_ID);
  return {
    totalSettings: settingsStore.size,
    totalAuditEntries: auditLog.length,
    lastUpdated: global?.updatedAt ?? null,
  };
}
