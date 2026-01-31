// ======== AI副社長・組織温度レポート型定義 ========

/**
 * LINE WORKSメッセージメタデータ
 * ※メッセージ本文は保存・解析しない
 */
export interface LwMessageMeta {
  id?: string;
  tenantId: string;
  userId: string;
  userName?: string;
  baseId: string;
  timestamp: Date;
  messageLength: number;      // メッセージ文字数
  replyTimeSec: number;       // 返信までの秒数
  isNight: boolean;           // 夜間（22:00-6:00）フラグ
  negativeWordRate: number;   // ネガティブワード率（0-1）
  reactionCount: number;      // リアクション数
}

/**
 * ユーザー週次メトリクス
 */
export interface UserWeeklyMetrics {
  userId: string;
  userName?: string;
  baseId: string;
  baseName?: string;
  // 集計値
  messageCount: number;
  avgMessageLength: number;
  avgReplyTimeSec: number;
  nightMessageRate: number;   // 夜間メッセージ率
  avgNegativeWordRate: number;
  avgReactionCount: number;
  // 変動
  diffVs4WeekAvg: {
    messageCount: number;
    avgReplyTimeSec: number;
    nightMessageRate: number;
    avgNegativeWordRate: number;
  };
  // アラートレベル
  alertLevel: 'normal' | 'attention' | 'warning';
  alertReasons: string[];
}

/**
 * 拠点週次メトリクス
 */
export interface BaseWeeklyMetrics {
  baseId: string;
  baseName: string;
  // 集計値
  totalMessages: number;
  avgMessageLength: number;
  avgReplyTimeSec: number;
  nightMessageRate: number;
  avgNegativeWordRate: number;
  avgReactionCount: number;
  // ユーザー数
  activeUserCount: number;
  // アラートレベル
  alertLevel: 'normal' | 'attention' | 'warning';
}

/**
 * 統計情報（標準偏差計算用）
 */
export interface MetricStats {
  mean: number;
  stdDev: number;
  sigma1: number;  // mean + 1σ
  sigma2: number;  // mean + 2σ
}

export interface WeeklyStats {
  replyTimeSec: MetricStats;
  nightMessageRate: MetricStats;
  negativeWordRate: MetricStats;
  messageCount: MetricStats;
}

/**
 * 組織温度レポート
 */
export interface OrganizationHealthReport {
  id?: string;
  tenantId: string;
  period: string;             // YYYY-WW形式
  periodStart: Date;
  periodEnd: Date;
  generatedAt: Date;
  // サマリー
  overallLevel: 'normal' | 'attention' | 'warning';
  totalUsers: number;
  totalMessages: number;
  // 注意が必要なユーザー（最大3人）
  attentionUsers: UserWeeklyMetrics[];
  // 拠点別メトリクス
  baseMetrics: BaseWeeklyMetrics[];
  // 統計情報
  stats: WeeklyStats;
  // AI生成レポート
  aiReport: {
    summary: string;
    observations: string[];  // 最大3つ
    recommendations: string[]; // 最大3つ
  };
  // メタデータ
  createdAt?: Date;
}

/**
 * AI入力用JSON
 */
export interface OrganizationHealthInput {
  period: string;
  users: Array<{
    userId: string;
    userName?: string;
    baseId: string;
    baseName?: string;
    metrics: {
      messageCount: number;
      avgMessageLength: number;
      avgReplyTimeSec: number;
      nightMessageRate: number;
      avgNegativeWordRate: number;
      avgReactionCount: number;
    };
    diffVs4WeekAvg: {
      messageCount: number;
      avgReplyTimeSec: number;
      nightMessageRate: number;
      avgNegativeWordRate: number;
    };
    alertLevel: 'normal' | 'attention' | 'warning';
    alertReasons: string[];
  }>;
  bases: Array<{
    baseId: string;
    baseName: string;
    metrics: {
      totalMessages: number;
      avgReplyTimeSec: number;
      nightMessageRate: number;
      activeUserCount: number;
    };
    alertLevel: 'normal' | 'attention' | 'warning';
  }>;
  stats: WeeklyStats;
}

/**
 * 通知タイプ追加用
 */
export type OrganizationHealthNotificationType = 'ai_organization_health';
