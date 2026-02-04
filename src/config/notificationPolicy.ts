/**
 * 通知ポリシー設定
 *
 * Implementation Ticket 055: 通知/アラート ノイズ最適化
 *
 * 方針:
 * - CRITICAL: 即通知（リアルタイム）
 * - WARNING: まとめ通知（ダイジェスト）または即時
 * - INFO: 通知しない（alerts/画面のみ）
 *
 * 役職別に通知ポリシーを持てる
 * 再通知間隔（throttle）が効く
 */

import type { AlertType, AlertSeverity } from '@/lib/alerts/types';
import type { AppRole } from '@/lib/access/scope';

// ========== 通知モード ==========

export type NotifyMode = 'immediate' | 'digest' | 'none';

export const NOTIFY_MODE_LABELS: Record<NotifyMode, string> = {
  immediate: '即時通知',
  digest: 'ダイジェスト',
  none: '通知なし（UI表示のみ）',
};

// ========== 通知ポリシー ==========

export interface NotifyPolicy {
  /** アラートタイプ（'*' は全タイプにマッチ） */
  alertType: AlertType | '*';

  /** 通知する最小重要度（これ以上の重要度で通知） */
  minSeverityToNotify: AlertSeverity;

  /** 通知モード */
  mode: NotifyMode;

  /** 再通知抑制間隔（分）- 同一fingerprintへの通知を抑制 */
  throttleMinutes: number;

  /** 通知対象ロール */
  targetRoles: AppRole[];

  /** ダイジェスト送信時刻（mode='digest'の場合） */
  digestHours?: number[];  // 例: [9, 17] = 9時と17時

  /** エスカレーション設定（未対応時の上位通知） */
  escalation?: {
    /** 何分後にエスカレーションするか */
    afterMinutes: number;
    /** エスカレーション先ロール */
    toRoles: AppRole[];
  };

  /** 説明（管理画面表示用） */
  description?: string;
}

// ========== デフォルトポリシー ==========

/**
 * 通知ポリシー定義
 *
 * 優先順:
 * 1. alertType が完全一致するポリシー
 * 2. alertType='*' のデフォルトポリシー
 */
export const NOTIFY_POLICIES: NotifyPolicy[] = [
  // ========== システム系（即時） ==========
  {
    alertType: 'system_error',
    minSeverityToNotify: 'warning',
    mode: 'immediate',
    throttleMinutes: 30,
    targetRoles: ['admin', 'manager'],
    description: 'システムエラーは即時通知',
  },

  // ========== スコープ・分類系（即時） ==========
  {
    alertType: 'business_scope_unclassified',
    minSeverityToNotify: 'warning',
    mode: 'immediate',
    throttleMinutes: 120,
    targetRoles: ['admin', 'manager'],
    description: '未分類スコープは2時間間隔で通知',
  },

  // ========== KPI異常（critical即時、warning抑制） ==========
  {
    alertType: 'kpi_anomaly',
    minSeverityToNotify: 'critical',
    mode: 'immediate',
    throttleMinutes: 60,
    targetRoles: ['admin', 'executive', 'manager'],
    escalation: {
      afterMinutes: 120,
      toRoles: ['executive'],
    },
    description: 'KPI異常（critical）は即時、2時間未対応でexecutiveへエスカレーション',
  },

  // ========== 研修（ダイジェスト） ==========
  {
    alertType: 'training_overdue',
    minSeverityToNotify: 'warning',
    mode: 'digest',
    throttleMinutes: 1440,  // 24時間
    targetRoles: ['admin', 'manager', 'leader'],
    digestHours: [9],
    description: '研修期限超過は毎朝9時にダイジェスト',
  },

  // ========== 資格リスク（ダイジェスト） ==========
  {
    alertType: 'deadline_overdue',
    minSeverityToNotify: 'warning',
    mode: 'digest',
    throttleMinutes: 1440,
    targetRoles: ['admin', 'manager'],
    digestHours: [9],
    description: '期限超過は毎朝9時にダイジェスト',
  },

  // ========== 契約リスク（ダイジェスト） ==========
  {
    alertType: 'committee_risk',
    minSeverityToNotify: 'warning',
    mode: 'digest',
    throttleMinutes: 1440,
    targetRoles: ['admin', 'manager'],
    digestHours: [9],
    description: '委員会リスクは毎朝9時にダイジェスト',
  },

  // ========== 未収リスク（頻度高め） ==========
  {
    alertType: 'receivable_risk',
    minSeverityToNotify: 'warning',
    mode: 'digest',
    throttleMinutes: 720,  // 12時間
    targetRoles: ['admin', 'manager', 'executive'],
    digestHours: [9, 17],
    escalation: {
      afterMinutes: 1440,  // 24時間
      toRoles: ['executive'],
    },
    description: '未収リスクは1日2回（9時/17時）、24時間未対応でexecutiveへ',
  },

  // ========== 回収フローリスク ==========
  {
    alertType: 'collection_flow_risk',
    minSeverityToNotify: 'warning',
    mode: 'digest',
    throttleMinutes: 720,
    targetRoles: ['admin', 'manager'],
    digestHours: [9, 17],
    description: '回収フロー超過は1日2回',
  },

  // ========== 同意書リスク ==========
  {
    alertType: 'agreement_risk',
    minSeverityToNotify: 'warning',
    mode: 'digest',
    throttleMinutes: 1440,
    targetRoles: ['admin', 'manager'],
    digestHours: [9],
    description: '同意書リスクは毎朝9時にダイジェスト',
  },

  // ========== クレームリスク（即時） ==========
  {
    alertType: 'complaint_risk',
    minSeverityToNotify: 'warning',
    mode: 'immediate',
    throttleMinutes: 60,
    targetRoles: ['admin', 'manager', 'leader'],
    escalation: {
      afterMinutes: 240,  // 4時間
      toRoles: ['executive'],
    },
    description: 'クレームリスクは即時通知、4時間未対応でexecutiveへ',
  },

  // ========== 承認滞留（ダイジェスト） ==========
  {
    alertType: 'approval_backlog',
    minSeverityToNotify: 'warning',
    mode: 'digest',
    throttleMinutes: 720,
    targetRoles: ['admin', 'manager'],
    digestHours: [9, 14],
    description: '承認滞留は1日2回（9時/14時）',
  },

  // ========== チケット滞留（ダイジェスト） ==========
  {
    alertType: 'ticket_backlog',
    minSeverityToNotify: 'warning',
    mode: 'digest',
    throttleMinutes: 1440,
    targetRoles: ['admin', 'manager', 'leader'],
    digestHours: [9],
    description: 'チケット滞留は毎朝9時にダイジェスト',
  },

  // ========== 重要申し送り（即時） ==========
  {
    alertType: 'handover_urgent',
    minSeverityToNotify: 'warning',
    mode: 'immediate',
    throttleMinutes: 30,
    targetRoles: ['admin', 'manager', 'leader', 'staff'],
    description: '重要申し送りは即時通知',
  },

  // ========== デフォルト（フォールバック） ==========
  {
    alertType: '*',
    minSeverityToNotify: 'critical',
    mode: 'immediate',
    throttleMinutes: 60,
    targetRoles: ['admin', 'manager'],
    description: 'デフォルト: criticalのみ即時通知',
  },
];

// ========== ポリシー取得ヘルパー ==========

/**
 * 指定されたアラートタイプに対応するポリシーを取得
 */
export function getNotifyPolicy(alertType: string): NotifyPolicy {
  // 完全一致を優先
  const exactMatch = NOTIFY_POLICIES.find(p => p.alertType === alertType);
  if (exactMatch) return exactMatch;

  // デフォルトポリシー（'*'）にフォールバック
  const defaultPolicy = NOTIFY_POLICIES.find(p => p.alertType === '*');
  if (defaultPolicy) return defaultPolicy;

  // フォールバック（念のため）
  return {
    alertType: '*',
    minSeverityToNotify: 'critical',
    mode: 'immediate',
    throttleMinutes: 60,
    targetRoles: ['admin'],
  };
}

/**
 * 重要度の比較（通知判定用）
 * @returns severity >= minSeverity なら true
 */
export function severityMeetsMinimum(
  severity: AlertSeverity,
  minSeverity: AlertSeverity
): boolean {
  const severityOrder: Record<AlertSeverity, number> = {
    info: 0,
    warning: 1,
    critical: 2,
  };
  return severityOrder[severity] >= severityOrder[minSeverity];
}

/**
 * 指定されたロールがポリシーの通知対象かどうか
 */
export function isRoleTargeted(role: AppRole, policy: NotifyPolicy): boolean {
  return policy.targetRoles.includes(role);
}

/**
 * 通知が必要かどうかを判定
 */
export function shouldNotify(
  alertType: string,
  severity: AlertSeverity,
  role: AppRole
): { shouldNotify: boolean; mode: NotifyMode; policy: NotifyPolicy } {
  const policy = getNotifyPolicy(alertType);

  // 重要度チェック
  if (!severityMeetsMinimum(severity, policy.minSeverityToNotify)) {
    return { shouldNotify: false, mode: 'none', policy };
  }

  // ロールチェック
  if (!isRoleTargeted(role, policy)) {
    return { shouldNotify: false, mode: 'none', policy };
  }

  return { shouldNotify: true, mode: policy.mode, policy };
}

// ========== ダイジェスト設定 ==========

export interface DigestConfig {
  /** ダイジェスト送信時刻（時） */
  hours: number[];

  /** ダイジェストに含めるアラートタイプ */
  alertTypes: (AlertType | '*')[];

  /** ダイジェスト対象ロール */
  targetRoles: AppRole[];
}

/**
 * ダイジェスト送信設定を生成（ポリシーから自動計算）
 */
export function getDigestConfigs(): DigestConfig[] {
  const digestPolicies = NOTIFY_POLICIES.filter(p => p.mode === 'digest' && p.digestHours);

  // 時刻ごとにグループ化
  const byHour = new Map<number, { alertTypes: Set<AlertType | '*'>; roles: Set<AppRole> }>();

  for (const policy of digestPolicies) {
    for (const hour of policy.digestHours || []) {
      if (!byHour.has(hour)) {
        byHour.set(hour, { alertTypes: new Set(), roles: new Set() });
      }
      const entry = byHour.get(hour)!;
      entry.alertTypes.add(policy.alertType);
      policy.targetRoles.forEach(r => entry.roles.add(r));
    }
  }

  const configs: DigestConfig[] = [];
  for (const [hour, entry] of byHour) {
    configs.push({
      hours: [hour],
      alertTypes: Array.from(entry.alertTypes),
      targetRoles: Array.from(entry.roles),
    });
  }

  return configs.sort((a, b) => a.hours[0] - b.hours[0]);
}

// ========== スロットル判定 ==========

/**
 * スロットル判定用のキー生成
 */
export function buildThrottleKey(
  alertType: string,
  fingerprint: string,
  userId: string
): string {
  return `throttle:${alertType}:${fingerprint}:${userId}`;
}

/**
 * スロットル期限切れかどうか
 */
export function isThrottleExpired(
  lastNotifiedAt: string | null,
  throttleMinutes: number
): boolean {
  if (!lastNotifiedAt) return true;

  const lastTime = new Date(lastNotifiedAt).getTime();
  const now = Date.now();
  const throttleMs = throttleMinutes * 60 * 1000;

  return now - lastTime >= throttleMs;
}
