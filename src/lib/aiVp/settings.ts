/**
 * AI副社長 設定管理
 *
 * Implementation Ticket 062: AI副社長Top3スコア設定UIとDB永続化
 *
 * - getAiVpConfig(): DBがあればDB、なければDEFAULT_CONFIG
 * - saveAiVpConfig(configJson, actorUserId, note?): validateして保存＋監査ログ
 * - resetAiVpConfig(actorUserId): DEFAULT_CONFIGで上書き＋監査ログ
 * - validateAiVpConfig(config): 数値型、範囲、必須キーの存在をチェック
 */

import {
  DEFAULT_CONFIG,
  REQUIRED_WEIGHT_KEYS,
  REQUIRED_THRESHOLD_KEYS,
  REQUIRED_DIVERSITY_KEYS,
  type AiVpConfig,
  type AiVpWeights,
  type AiVpThresholds,
  type AiVpDiversity,
} from './defaultConfig';

// ========== 型定義 ==========

export interface AiVpSettings {
  id: string;
  scope: 'global';
  businessUnitId: null;
  configJson: AiVpConfig;
  updatedAt: string;
  updatedByUserId: string;
}

export type AiVpSettingsAction = 'update' | 'reset' | 'rollback' | 'apply_preset';

export interface AiVpSettingsEvent {
  id: string;
  actorUserId: string;
  action: AiVpSettingsAction;
  beforeJson: AiVpConfig | null;
  afterJson: AiVpConfig;
  createdAt: string;
  note: string | null;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// ========== ストレージ ==========

let settingsStore: AiVpSettings | null = null;
let eventsStore: AiVpSettingsEvent[] = [];
let isInitialized = false;

function isServer(): boolean {
  return typeof window === 'undefined';
}

function getFilePaths(): { dataDir: string; settingsFile: string; eventsFile: string } | null {
  if (!isServer()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    const dataDir = path.join(process.cwd(), '.data');
    return {
      dataDir,
      settingsFile: path.join(dataDir, 'ai_vp_settings.json'),
      eventsFile: path.join(dataDir, 'ai_vp_settings_events.json'),
    };
  } catch {
    return null;
  }
}

function initializeStorage(): void {
  if (isInitialized) return;

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
      if (data.settings) {
        settingsStore = data.settings;
      }
    }

    // イベントログ読み込み
    if (fs.existsSync(paths.eventsFile)) {
      const data = JSON.parse(fs.readFileSync(paths.eventsFile, 'utf-8'));
      if (data.events && Array.isArray(data.events)) {
        eventsStore = data.events;
      }
    }

    isInitialized = true;
    console.log(`[AiVpSettings] Loaded settings, ${eventsStore.length} events`);
  } catch (error) {
    console.error('[AiVpSettings] Failed to load:', error);
    isInitialized = true;
  }
}

function saveStorage(): void {
  if (!isServer()) return;

  const paths = getFilePaths();
  if (!paths) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');

    const settingsData = {
      settings: settingsStore,
      savedAt: new Date().toISOString(),
    };
    fs.writeFileSync(paths.settingsFile, JSON.stringify(settingsData, null, 2), 'utf-8');

    const eventsData = {
      events: eventsStore.slice(-500), // 最新500件のみ保持
      savedAt: new Date().toISOString(),
    };
    fs.writeFileSync(paths.eventsFile, JSON.stringify(eventsData, null, 2), 'utf-8');
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

// ========== 設定補完 ==========

/**
 * 不完全な設定をDEFAULT_CONFIGで補完
 */
function mergeWithDefaults(config: Partial<AiVpConfig>): AiVpConfig {
  return {
    weights: { ...DEFAULT_CONFIG.weights, ...config.weights },
    thresholds: { ...DEFAULT_CONFIG.thresholds, ...config.thresholds },
    diversity: { ...DEFAULT_CONFIG.diversity, ...config.diversity },
  };
}

// ========== バリデーション ==========

/**
 * 設定の検証
 *
 * - 必須キーの存在チェック
 * - 数値型チェック
 * - 範囲チェック（負の値は不可）
 */
export function validateAiVpConfig(config: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!config || typeof config !== 'object') {
    return { valid: false, errors: [{ field: 'config', message: '設定が不正です' }] };
  }

  const c = config as Partial<AiVpConfig>;

  // weights の検証
  if (c.weights) {
    if (typeof c.weights !== 'object') {
      errors.push({ field: 'weights', message: 'weightsはオブジェクトである必要があります' });
    } else {
      // 必須キーチェック
      for (const key of REQUIRED_WEIGHT_KEYS) {
        if (c.weights[key] === undefined) {
          errors.push({ field: `weights.${key}`, message: `${key}は必須です` });
        }
      }
      // 数値・範囲チェック
      for (const [key, value] of Object.entries(c.weights)) {
        if (value !== undefined) {
          if (typeof value !== 'number') {
            errors.push({ field: `weights.${key}`, message: '数値である必要があります' });
          } else if (value < 0 || value > 100) {
            errors.push({ field: `weights.${key}`, message: '0〜100の範囲で指定してください' });
          }
        }
      }
    }
  }

  // thresholds の検証
  if (c.thresholds) {
    if (typeof c.thresholds !== 'object') {
      errors.push({ field: 'thresholds', message: 'thresholdsはオブジェクトである必要があります' });
    } else {
      // 必須キーチェック
      for (const key of REQUIRED_THRESHOLD_KEYS) {
        if (c.thresholds[key] === undefined) {
          errors.push({ field: `thresholds.${key}`, message: `${key}は必須です` });
        }
      }
      // 数値・範囲チェック
      for (const [key, value] of Object.entries(c.thresholds)) {
        if (value !== undefined) {
          if (typeof value !== 'number') {
            errors.push({ field: `thresholds.${key}`, message: '数値である必要があります' });
          } else if (value < 0) {
            errors.push({ field: `thresholds.${key}`, message: '0以上の値で指定してください' });
          }
        }
      }
    }
  }

  // diversity の検証
  if (c.diversity) {
    if (typeof c.diversity !== 'object') {
      errors.push({ field: 'diversity', message: 'diversityはオブジェクトである必要があります' });
    } else {
      // 必須キーチェック
      for (const key of REQUIRED_DIVERSITY_KEYS) {
        if (c.diversity[key] === undefined) {
          errors.push({ field: `diversity.${key}`, message: `${key}は必須です` });
        }
      }
      // 数値・範囲チェック
      for (const [key, value] of Object.entries(c.diversity)) {
        if (value !== undefined) {
          if (typeof value !== 'number') {
            errors.push({ field: `diversity.${key}`, message: '数値である必要があります' });
          } else if (value < 1 || !Number.isInteger(value)) {
            errors.push({ field: `diversity.${key}`, message: '1以上の整数で指定してください' });
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ========== 公開関数 ==========

/**
 * 現在の設定を取得
 *
 * DBに設定があればそれを返し、なければDEFAULT_CONFIGを返す
 * 不完全な設定はDEFAULT_CONFIGで補完される
 */
export function getAiVpConfig(): AiVpConfig {
  initializeStorage();

  if (settingsStore?.configJson) {
    // 不完全な設定を補完
    return mergeWithDefaults(settingsStore.configJson);
  }

  return { ...DEFAULT_CONFIG };
}

/**
 * 設定を保存
 *
 * @throws ValidationError[] バリデーションエラー時
 */
export function saveAiVpConfig(
  configJson: AiVpConfig,
  actorUserId: string,
  note?: string
): { success: true; settings: AiVpSettings } | { success: false; errors: ValidationError[] } {
  initializeStorage();

  // バリデーション
  const validation = validateAiVpConfig(configJson);
  if (!validation.valid) {
    return { success: false, errors: validation.errors };
  }

  const timestamp = now();
  const beforeConfig = settingsStore?.configJson ?? null;

  // 補完済み設定を作成
  const mergedConfig = mergeWithDefaults(configJson);

  // 設定を更新
  const newSettings: AiVpSettings = {
    id: settingsStore?.id ?? generateId('aivp_settings'),
    scope: 'global',
    businessUnitId: null,
    configJson: mergedConfig,
    updatedAt: timestamp,
    updatedByUserId: actorUserId,
  };

  // イベントログを追加
  const event: AiVpSettingsEvent = {
    id: generateId('aivp_event'),
    actorUserId,
    action: 'update',
    beforeJson: beforeConfig,
    afterJson: mergedConfig,
    createdAt: timestamp,
    note: note ?? null,
  };

  settingsStore = newSettings;
  eventsStore.push(event);

  saveStorage();

  console.log(`[AiVpSettings] Config saved by ${actorUserId}`);

  return { success: true, settings: newSettings };
}

/**
 * 設定をデフォルトにリセット
 */
export function resetAiVpConfig(actorUserId: string): AiVpSettings {
  initializeStorage();

  const timestamp = now();
  const beforeConfig = settingsStore?.configJson ?? null;

  // デフォルト設定で更新
  const newSettings: AiVpSettings = {
    id: settingsStore?.id ?? generateId('aivp_settings'),
    scope: 'global',
    businessUnitId: null,
    configJson: { ...DEFAULT_CONFIG },
    updatedAt: timestamp,
    updatedByUserId: actorUserId,
  };

  // イベントログを追加
  const event: AiVpSettingsEvent = {
    id: generateId('aivp_event'),
    actorUserId,
    action: 'reset',
    beforeJson: beforeConfig,
    afterJson: DEFAULT_CONFIG,
    createdAt: timestamp,
    note: 'デフォルト設定にリセット',
  };

  settingsStore = newSettings;
  eventsStore.push(event);

  saveStorage();

  console.log(`[AiVpSettings] Config reset by ${actorUserId}`);

  return newSettings;
}

/**
 * 直前の状態にロールバック
 *
 * 最新のイベントの beforeJson に戻す
 */
export function rollbackAiVpConfig(
  actorUserId: string
): { success: true; settings: AiVpSettings } | { success: false; error: string } {
  initializeStorage();

  // 最新のイベントを取得
  const sortedEvents = eventsStore
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (sortedEvents.length === 0) {
    return { success: false, error: 'ロールバックできる履歴がありません' };
  }

  const latestEvent = sortedEvents[0];

  // beforeJson がない場合（最初の設定だった場合）はデフォルトに戻す
  const targetConfig = latestEvent.beforeJson ?? DEFAULT_CONFIG;

  const timestamp = now();
  const beforeConfig = settingsStore?.configJson ?? null;

  // 設定を復元
  const newSettings: AiVpSettings = {
    id: settingsStore?.id ?? generateId('aivp_settings'),
    scope: 'global',
    businessUnitId: null,
    configJson: targetConfig,
    updatedAt: timestamp,
    updatedByUserId: actorUserId,
  };

  // イベントログを追加
  const event: AiVpSettingsEvent = {
    id: generateId('aivp_event'),
    actorUserId,
    action: 'rollback',
    beforeJson: beforeConfig,
    afterJson: targetConfig,
    createdAt: timestamp,
    note: `ロールバック: ${latestEvent.id} の前の状態に復元`,
  };

  settingsStore = newSettings;
  eventsStore.push(event);

  saveStorage();

  console.log(`[AiVpSettings] Config rolled back by ${actorUserId}`);

  return { success: true, settings: newSettings };
}

/**
 * プリセットを適用
 */
export function applyPresetAiVpConfig(
  presetId: string,
  presetConfig: AiVpConfig,
  actorUserId: string
): { success: true; settings: AiVpSettings } | { success: false; errors: ValidationError[] } {
  initializeStorage();

  // バリデーション
  const validation = validateAiVpConfig(presetConfig);
  if (!validation.valid) {
    return { success: false, errors: validation.errors };
  }

  const timestamp = now();
  const beforeConfig = settingsStore?.configJson ?? null;

  // 補完済み設定を作成
  const mergedConfig = mergeWithDefaults(presetConfig);

  // 設定を更新
  const newSettings: AiVpSettings = {
    id: settingsStore?.id ?? generateId('aivp_settings'),
    scope: 'global',
    businessUnitId: null,
    configJson: mergedConfig,
    updatedAt: timestamp,
    updatedByUserId: actorUserId,
  };

  // イベントログを追加
  const event: AiVpSettingsEvent = {
    id: generateId('aivp_event'),
    actorUserId,
    action: 'apply_preset',
    beforeJson: beforeConfig,
    afterJson: mergedConfig,
    createdAt: timestamp,
    note: `プリセット適用: ${presetId}`,
  };

  settingsStore = newSettings;
  eventsStore.push(event);

  saveStorage();

  console.log(`[AiVpSettings] Preset ${presetId} applied by ${actorUserId}`);

  return { success: true, settings: newSettings };
}

/**
 * イベントログを取得
 */
export function getAiVpSettingsEvents(limit: number = 50): AiVpSettingsEvent[] {
  initializeStorage();
  return eventsStore
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

/**
 * 現在の設定メタデータを取得
 */
export function getAiVpSettingsMeta(): {
  updatedAt: string | null;
  updatedByUserId: string | null;
} {
  initializeStorage();
  return {
    updatedAt: settingsStore?.updatedAt ?? null,
    updatedByUserId: settingsStore?.updatedByUserId ?? null,
  };
}

// ========== Re-export ==========

export {
  DEFAULT_CONFIG,
  DEFAULT_WEIGHTS,
  DEFAULT_THRESHOLDS,
  DEFAULT_DIVERSITY,
  WEIGHT_LABELS,
  THRESHOLD_LABELS,
  DIVERSITY_LABELS,
  type AiVpConfig,
  type AiVpWeights,
  type AiVpThresholds,
  type AiVpDiversity,
} from './defaultConfig';
