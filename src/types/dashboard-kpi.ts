// ======== DHPハブ ダッシュボード KPI 型定義 ========

import type { LucideIcon } from 'lucide-react';

// ======== 役割 ========

export type DashboardRole = 'staff' | 'manager' | 'exec';

// ======== KPI状態 ========

export type KPIStatus = 'normal' | 'warning' | 'critical';

// ======== KPI定義 ========

export interface KPIDefinition {
  id: string;
  label: string;
  description: string;
  unit?: string;
  href: string;
  roles: DashboardRole[];
  // 異常判定の閾値
  thresholds?: {
    warning?: number;
    critical?: number;
    // 閾値を超えたら異常か、下回ったら異常か
    direction: 'above' | 'below';
  };
}

// ======== KPI値 ========

export interface KPIValue {
  id: string;
  value: number | null;
  meaning: string;
  status: KPIStatus;
  trend?: 'up' | 'down' | 'stable';
  // 前期比（%）
  change?: number;
}

// ======== AI副社長サマリー ========

export interface AIVPSummary {
  // 一言サマリー
  headline: string;
  // 優先アクション（最大3つ）
  priorityActions: AIVPAction[];
  // アラート数
  alertCount: number;
  // 最終更新
  updatedAt: Date;
}

export interface AIVPAction {
  id: string;
  title: string;
  description: string;
  href: string;
  priority: 'high' | 'medium' | 'low';
  // 異常フラグ
  isAlert?: boolean;
}

// ======== ダッシュボードデータ ========

export interface DashboardData {
  role: DashboardRole;
  aiSummary: AIVPSummary | null;
  kpis: KPIValue[];
  // 読み込み中フラグ
  loading: boolean;
  // エラー
  error: string | null;
}

// ======== 役割別KPI設定 ========

export const ROLE_KPI_CONFIG: Record<DashboardRole, string[]> = {
  // スタッフ: 自分に関するKPI
  staff: [
    'my_checkin',        // 今日のコンディション
    'my_tasks',          // 期限タスク
    'my_approvals',      // 稟議状況
    'my_overtime',       // 今月の残業
    'team_support',      // サポート相談
    'announcements',     // 重要連絡
  ],
  // マネージャー: チームに関するKPI
  manager: [
    'team_condition',    // チームコンディション
    'pending_approvals', // 承認待ち
    'team_overtime',     // チーム残業
    'support_queue',     // サポート待ち
    'intervention_rate', // 介入実施率
    'wbr_tasks',         // WBR宿題
  ],
  // 経営: 全社KPI
  exec: [
    'occupancy_rate',    // 稼働率
    'expected_moveins',  // 入居見込み
    'org_condition',     // 組織コンディション
    'human_risk',        // 人材リスク
    'pending_approvals', // 承認待ち
    'cashflow',          // キャッシュフロー
  ],
};

// ======== KPI定義マスタ ========

export const KPI_DEFINITIONS: Record<string, KPIDefinition> = {
  // === スタッフ向け ===
  my_checkin: {
    id: 'my_checkin',
    label: '今日のコンディション',
    description: '本日の余裕メーター',
    href: '/dashboard/os/checkin',
    roles: ['staff'],
  },
  my_tasks: {
    id: 'my_tasks',
    label: '期限タスク',
    description: '期限が近いタスク数',
    unit: '件',
    href: '/dashboard/ai/todos',
    roles: ['staff'],
    thresholds: { warning: 3, critical: 5, direction: 'above' },
  },
  my_approvals: {
    id: 'my_approvals',
    label: '稟議',
    description: '進行中・差戻し',
    unit: '件',
    href: '/dashboard/approvals',
    roles: ['staff', 'manager', 'exec'],
    thresholds: { warning: 1, critical: 3, direction: 'above' },
  },
  my_overtime: {
    id: 'my_overtime',
    label: '今月の残業',
    description: '当月の残業時間',
    unit: '時間',
    href: '/attendance/overtime',
    roles: ['staff'],
    thresholds: { warning: 30, critical: 45, direction: 'above' },
  },
  team_support: {
    id: 'team_support',
    label: 'サポート相談',
    description: '困っていることはありませんか？',
    href: '/dashboard/chaos/checkin',
    roles: ['staff'],
  },
  announcements: {
    id: 'announcements',
    label: '重要連絡',
    description: '管理者からのお知らせ',
    unit: '件',
    href: '/dashboard/alerts/birthdays',
    roles: ['staff'],
    thresholds: { warning: 1, critical: 3, direction: 'above' },
  },

  // === マネージャー向け ===
  team_condition: {
    id: 'team_condition',
    label: 'チームコンディション',
    description: 'サポートが必要なメンバー',
    unit: '人',
    href: '/dashboard/os/team',
    roles: ['manager', 'exec'],
    thresholds: { warning: 1, critical: 2, direction: 'above' },
  },
  pending_approvals: {
    id: 'pending_approvals',
    label: '承認待ち',
    description: '未処理の承認依頼',
    unit: '件',
    href: '/admin/ringi',
    roles: ['manager', 'exec'],
    thresholds: { warning: 3, critical: 5, direction: 'above' },
  },
  team_overtime: {
    id: 'team_overtime',
    label: 'チーム残業',
    description: '45時間超のメンバー',
    unit: '人',
    href: '/admin/attendance/dashboard',
    roles: ['manager'],
    thresholds: { warning: 1, critical: 3, direction: 'above' },
  },
  support_queue: {
    id: 'support_queue',
    label: 'サポート待ち',
    description: '対応が必要なサポート',
    unit: '件',
    href: '/dashboard/os/team',
    roles: ['manager'],
    thresholds: { warning: 1, critical: 3, direction: 'above' },
  },
  intervention_rate: {
    id: 'intervention_rate',
    label: '介入実施率',
    description: 'サポート対応の完了率',
    unit: '%',
    href: '/dashboard/os/team',
    roles: ['manager', 'exec'],
    thresholds: { warning: 70, critical: 50, direction: 'below' },
  },
  wbr_tasks: {
    id: 'wbr_tasks',
    label: 'WBR宿題',
    description: '週次レビューの残タスク',
    unit: '件',
    href: '/dashboard/wbr',
    roles: ['manager'],
    thresholds: { warning: 2, critical: 5, direction: 'above' },
  },

  // === 経営向け ===
  occupancy_rate: {
    id: 'occupancy_rate',
    label: '稼働率',
    description: '施設全体の入居率',
    unit: '%',
    href: '/dashboard/vacancy',
    roles: ['exec'],
    thresholds: { warning: 85, critical: 75, direction: 'below' },
  },
  expected_moveins: {
    id: 'expected_moveins',
    label: '入居見込み',
    description: '今月の入居予測数',
    unit: '件',
    href: '/dashboard/prospects',
    roles: ['exec'],
  },
  org_condition: {
    id: 'org_condition',
    label: '組織コンディション',
    description: '赤/黄メンバー数',
    href: '/dashboard/os/team',
    roles: ['exec'],
    thresholds: { warning: 2, critical: 4, direction: 'above' },
  },
  human_risk: {
    id: 'human_risk',
    label: '人材リスク',
    description: '組織の不安定化リスク',
    unit: '点',
    href: '/dashboard/ai-vp/human-risk',
    roles: ['exec'],
    thresholds: { warning: 50, critical: 70, direction: 'above' },
  },
  cashflow: {
    id: 'cashflow',
    label: 'キャッシュフロー',
    description: '今月の資金繰り予測',
    unit: '万円',
    href: '/dashboard/admin',
    roles: ['exec'],
  },
};

// ======== ユーティリティ ========

/**
 * KPIのステータスを判定
 */
export function getKPIStatus(
  value: number | null,
  definition: KPIDefinition
): KPIStatus {
  if (value === null) return 'normal';
  if (!definition.thresholds) return 'normal';

  const { warning, critical, direction } = definition.thresholds;

  if (direction === 'above') {
    if (critical !== undefined && value >= critical) return 'critical';
    if (warning !== undefined && value >= warning) return 'warning';
  } else {
    if (critical !== undefined && value <= critical) return 'critical';
    if (warning !== undefined && value <= warning) return 'warning';
  }

  return 'normal';
}

/**
 * KPIの意味テキストを生成
 */
export function getKPIMeaning(
  kpiId: string,
  value: number | null,
  status: KPIStatus
): string {
  if (value === null) return 'データなし';

  const meanings: Record<string, Record<KPIStatus, string>> = {
    my_checkin: {
      normal: '順調です',
      warning: '少し疲れ気味',
      critical: 'サポートが必要かも',
    },
    my_tasks: {
      normal: 'タスクは余裕あり',
      warning: '期限が近いものあり',
      critical: '優先対応が必要',
    },
    my_approvals: {
      normal: '稟議なし',
      warning: '差戻しあり',
      critical: '対応が必要',
    },
    my_overtime: {
      normal: '適正範囲',
      warning: '上限に近づいています',
      critical: '上限超過の恐れ',
    },
    team_condition: {
      normal: 'チームは順調',
      warning: 'フォローが必要なメンバーあり',
      critical: '早急なサポートが必要',
    },
    pending_approvals: {
      normal: '承認待ちなし',
      warning: '承認待ちあり',
      critical: '滞留しています',
    },
    team_overtime: {
      normal: '適正範囲',
      warning: '残業過多のメンバーあり',
      critical: '早急な対応が必要',
    },
    support_queue: {
      normal: 'サポート待ちなし',
      warning: '対応が必要',
      critical: '早急な対応が必要',
    },
    intervention_rate: {
      normal: '順調に対応中',
      warning: '対応が遅れ気味',
      critical: '対応が滞っています',
    },
    wbr_tasks: {
      normal: '完了済み',
      warning: '残タスクあり',
      critical: '未完了が多い',
    },
    occupancy_rate: {
      normal: '順調',
      warning: '空室が増加傾向',
      critical: '要営業強化',
    },
    expected_moveins: {
      normal: '見込みあり',
      warning: '見込み少なめ',
      critical: '要営業強化',
    },
    org_condition: {
      normal: '組織は安定',
      warning: '注意が必要なチームあり',
      critical: '早急なフォローが必要',
    },
    human_risk: {
      normal: '安定',
      warning: '注意が必要',
      critical: '介入検討が必要',
    },
    cashflow: {
      normal: '余裕あり',
      warning: '注意が必要',
      critical: '要確認',
    },
  };

  return meanings[kpiId]?.[status] || (status === 'normal' ? '正常' : '要確認');
}

/**
 * 役割のラベルを取得
 */
export function getRoleLabel(role: DashboardRole): string {
  const labels: Record<DashboardRole, string> = {
    staff: 'スタッフ',
    manager: 'マネージャー',
    exec: '経営',
  };
  return labels[role];
}
