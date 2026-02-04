/**
 * ユーザー通知設定
 *
 * Implementation Ticket 061: 通知設定UI（ユーザーごとのON/OFF + 重要通知は強制）
 *
 * - ユーザーごとに通知モードを設定（immediate/digest/off）
 * - 重要通知（critical系）は off 不可（最低 digest）
 * - role のデフォルト＋個人上書きの2層構造
 * - DB永続化（036準拠）
 */

import * as fs from 'fs';
import * as path from 'path';
import type { AppRole } from '@/config/appRoles';

// ========== 型定義 ==========

export type NotifyMode = 'immediate' | 'digest' | 'off';

export interface UserNotificationSettings {
  id: string;
  userId: string;
  /** 全体の基本モード */
  modeDefault: NotifyMode;
  /** type別上書き設定 */
  overrides: Record<string, NotifyMode>;
  updatedAt: string;
  createdAt: string;
}

export interface CreateSettingsRequest {
  userId: string;
  modeDefault?: NotifyMode;
  overrides?: Record<string, NotifyMode>;
}

export interface UpdateSettingsRequest {
  modeDefault?: NotifyMode;
  overrides?: Record<string, NotifyMode>;
}

// ========== 定数 ==========

/** 強制通知キー（off を許可しない） */
export const ENFORCED_NOTIFICATION_KEYS = [
  'system_error',
  'business_scope_unclassified',
  'kpi_anomaly',
  'esign_overdue',
  'complaint_risk',
] as const;

/** ロール別のデフォルトモード */
export const ROLE_DEFAULT_MODE: Record<AppRole, NotifyMode> = {
  admin: 'immediate',
  executive: 'immediate',
  manager: 'immediate',
  leader: 'digest',
  staff: 'digest',
  auditor: 'digest',
};

/** 通知カテゴリの表示名 */
export const NOTIFICATION_CATEGORY_LABELS: Record<string, string> = {
  morning_digest: '朝イチダイジェスト',
  kpi_anomaly: 'KPI異常',
  training_overdue: '研修期限超過',
  license_risk: '資格リスク',
  contract_risk: '契約リスク',
  receivable_risk: '未収リスク',
  collection_flow_risk: '回収フロー超過',
  business_scope_unclassified: '未分類スコープ',
  system_error: 'システムエラー',
  approval_backlog: '承認滞留',
  ticket_backlog: 'チケット滞留',
  complaint_risk: 'クレームリスク',
  esign_overdue: '電子署名期限超過',
  handover_urgent: '重要申し送り',
};

/** UIに表示するカテゴリ（順序付き） */
export const DISPLAY_CATEGORIES = [
  'morning_digest',
  'system_error',
  'kpi_anomaly',
  'business_scope_unclassified',
  'complaint_risk',
  'training_overdue',
  'license_risk',
  'contract_risk',
  'receivable_risk',
  'approval_backlog',
  'ticket_backlog',
  'handover_urgent',
] as const;

// ========== 永続化ストレージ ==========

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'user_notification_settings.json');

let settingsStore = new Map<string, UserNotificationSettings>();
let isInitialized = false;

function initializeStorage(): void {
  if (isInitialized) return;

  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      if (data.settings && Array.isArray(data.settings)) {
        for (const s of data.settings) {
          settingsStore.set(s.userId, s);
        }
      }
    }

    isInitialized = true;
    console.log(`[NotificationSettings] Loaded ${settingsStore.size} user settings`);
  } catch (error) {
    console.error('[NotificationSettings] Failed to load:', error);
    isInitialized = true;
  }
}

function saveStorage(): void {
  try {
    const data = {
      settings: Array.from(settingsStore.values()),
      savedAt: new Date().toISOString(),
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('[NotificationSettings] Failed to save:', error);
  }
}

initializeStorage();

function now(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `nset_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ========== CRUD ==========

/**
 * ユーザーの通知設定を取得（なければデフォルトを返す）
 */
export function getSettings(userId: string, role?: AppRole): UserNotificationSettings {
  const existing = settingsStore.get(userId);
  if (existing) return existing;

  // デフォルト設定を返す（永続化はしない）
  return {
    id: '',
    userId,
    modeDefault: role ? ROLE_DEFAULT_MODE[role] : 'digest',
    overrides: {},
    createdAt: now(),
    updatedAt: now(),
  };
}

/**
 * ユーザーの通知設定を作成/更新
 */
export function upsertSettings(
  userId: string,
  request: UpdateSettingsRequest
): UserNotificationSettings {
  const existing = settingsStore.get(userId);
  const timestamp = now();

  // 上書き設定を検証・補正
  const overrides = request.overrides
    ? enforceOverrides(request.overrides)
    : existing?.overrides ?? {};

  const settings: UserNotificationSettings = {
    id: existing?.id ?? generateId(),
    userId,
    modeDefault: request.modeDefault ?? existing?.modeDefault ?? 'digest',
    overrides,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  settingsStore.set(userId, settings);
  saveStorage();

  return settings;
}

/**
 * ユーザーの通知設定を削除（デフォルトにリセット）
 */
export function deleteSettings(userId: string): boolean {
  const existed = settingsStore.delete(userId);
  if (existed) {
    saveStorage();
  }
  return existed;
}

// ========== コア関数 ==========

/**
 * ユーザーの通知モードを取得
 *
 * @param userId ユーザーID
 * @param key 通知キー（alertType または 'morning_digest' 等）
 * @param role ユーザーのロール（設定がない場合のデフォルト用）
 */
export function getUserNotifyMode(
  userId: string,
  key: string,
  role?: AppRole
): NotifyMode {
  const settings = getSettings(userId, role);

  // 個別上書きがあればそれを使用
  if (settings.overrides[key]) {
    // 強制チェックを通す
    return enforceMinimumMode(key, settings.overrides[key]);
  }

  // デフォルトモード
  return enforceMinimumMode(key, settings.modeDefault);
}

/**
 * 重要通知の最低モードを強制
 *
 * critical系は off を禁止（最低 digest）
 */
export function enforceMinimumMode(key: string, requestedMode: NotifyMode): NotifyMode {
  // 強制対象キーかチェック
  const isEnforced = ENFORCED_NOTIFICATION_KEYS.includes(key as typeof ENFORCED_NOTIFICATION_KEYS[number]);

  if (isEnforced && requestedMode === 'off') {
    return 'digest'; // 最低でもダイジェストにする
  }

  return requestedMode;
}

/**
 * 上書き設定全体に強制ルールを適用
 */
function enforceOverrides(overrides: Record<string, NotifyMode>): Record<string, NotifyMode> {
  const result: Record<string, NotifyMode> = {};

  for (const [key, mode] of Object.entries(overrides)) {
    result[key] = enforceMinimumMode(key, mode);
  }

  return result;
}

/**
 * キーが off に設定可能かどうか
 */
export function isOffAllowed(key: string): boolean {
  return !ENFORCED_NOTIFICATION_KEYS.includes(key as typeof ENFORCED_NOTIFICATION_KEYS[number]);
}

// ========== クエリ ==========

/**
 * 全ユーザーの設定を取得（admin用）
 */
export function listAllSettings(limit: number = 100): UserNotificationSettings[] {
  return Array.from(settingsStore.values())
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, limit);
}

/**
 * 特定モードのユーザーを取得
 */
export function getUsersByMode(
  key: string,
  mode: NotifyMode
): string[] {
  const result: string[] = [];

  for (const settings of settingsStore.values()) {
    const userMode = settings.overrides[key] ?? settings.modeDefault;
    const enforcedMode = enforceMinimumMode(key, userMode);

    if (enforcedMode === mode) {
      result.push(settings.userId);
    }
  }

  return result;
}

/**
 * 通知を受け取るべきかチェック
 *
 * @returns true = 通知すべき, false = 通知しない
 */
export function shouldNotifyUser(
  userId: string,
  key: string,
  role?: AppRole
): { shouldNotify: boolean; mode: NotifyMode } {
  const mode = getUserNotifyMode(userId, key, role);

  return {
    shouldNotify: mode !== 'off',
    mode,
  };
}

// ========== 統計 ==========

export function getStats(): {
  total: number;
  byModeDefault: Record<NotifyMode, number>;
} {
  const all = Array.from(settingsStore.values());

  const byModeDefault: Record<NotifyMode, number> = {
    immediate: 0,
    digest: 0,
    off: 0,
  };

  for (const s of all) {
    byModeDefault[s.modeDefault]++;
  }

  return {
    total: all.length,
    byModeDefault,
  };
}
