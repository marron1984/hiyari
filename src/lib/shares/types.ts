/**
 * 外部共有ダッシュボード 型定義
 *
 * 金融機関・投資家向けのセキュアな共有機能
 * セキュリティ原則：最小権限・最小情報・監査可能
 */

// 共有ステータス
export type SharePackageStatus = 'active' | 'revoked' | 'expired';

// 共有パッケージ
export type SharePackage = {
  id: string;

  // 外部URLのトークン（DBにはハッシュのみ保存）
  tokenHash: string;

  name: string; // 例：「〇〇銀行向け 2026年2月 共有」
  description?: string;
  status: SharePackageStatus;
  createdAt: string; // ISO
  createdByUserId?: string; // 内部ユーザー
  createdByUserName?: string;
  expiresAt: string; // ISO

  // スナップショット内容（凍結データ）
  snapshot: ExternalSnapshot;

  // 監査補助
  lastAccessedAt?: string; // ISO
  accessCount: number;
};

// 外部公開用スナップショット（サニタイズ済みデータ）
export type ExternalSnapshot = {
  generatedAt: string; // ISO

  // A. Executive Summary
  executiveSummary: ExternalExecutiveSummary;

  // B. KPIハイライト
  kpiHighlights: ExternalKPIHighlights;

  // C. ガバナンス＆運用証跡
  governance: ExternalGovernance;

  // D. ロードマップ
  roadmap: ExternalRoadmap;
};

// A. Executive Summary（外部向け）
export type ExternalExecutiveSummary = {
  // OS進捗
  progress: {
    activeCount: number;
    developingCount: number;
    plannedCount: number;
    totalCount: number;
    progressPercent: number;
  };

  // 今月のTop3（機能名と簡易理由のみ）
  topPriorities: {
    rank: number;
    name: string;
    reason: string; // 内部事情は出さない簡潔な理由
  }[];

  // 主要リスク（カテゴリレベル）
  riskSummary: {
    category: string;
    level: 'low' | 'medium' | 'high';
    description: string;
  }[];

  // 総評（外部向け）
  overview: string;
};

// B. KPIハイライト（外部向け）
export type ExternalKPIHighlights = {
  // 公開許可KPIのみ（allowlist）
  kpis: {
    name: string;
    currentValue: string; // 数値またはレンジ表示
    trend: 'up' | 'down' | 'stable';
    status: 'normal' | 'warning' | 'critical';
  }[];

  // 異常検知の発生有無
  anomalyStats: {
    totalDetected: number;
    resolvedCount: number;
    openCount: number;
  };

  period: string; // 「2026年1月」など
};

// C. ガバナンス＆運用証跡
export type ExternalGovernance = {
  // WBR実施証跡
  wbrRecords: {
    weekLabel: string;
    status: 'completed' | 'in_progress';
    summary?: string; // 外部向け要約
  }[];

  // アラート運用
  alertStats: {
    open: number;
    acknowledged: number;
    resolved: number;
  };

  // 最終確認日
  lastReviewedAt: string;
};

// D. ロードマップ（外部向け）
export type ExternalRoadmap = {
  thisMonth: {
    name: string;
    status: 'planned' | 'in_progress' | 'completed';
  }[];
  nextMonth: {
    name: string;
    status: 'planned' | 'in_progress' | 'completed';
  }[];
  thisQuarter: {
    name: string;
    status: 'planned' | 'in_progress' | 'completed';
  }[];
};

// アクセスログ
export type ShareAccessLog = {
  id: string;
  shareId: string;
  accessedAt: string; // ISO
  ipAddress?: string;
  userAgent?: string;
  country?: string;
};

// 共有作成リクエスト
export type CreateShareRequest = {
  name: string;
  description?: string;
  expiresInDays: number; // 有効期限（日数）
};

// 共有作成レスポンス
export type CreateShareResponse = {
  shareId: string;
  shareUrl: string;
  token: string; // 一度だけ表示（以後は取得不可）
  expiresAt: string;
};

// 公開許可KPI（allowlist）
export const ALLOWED_EXTERNAL_KPIS = [
  'occupancy_rate', // 入居率
  'prospect_conversion', // 見学CV率
  'inquiry_count', // 問い合わせ件数
  'avg_fatigue', // 平均疲労度（レンジ表示）
  'turnover_risk_count', // 離職リスク人数（有無のみ）
] as const;

// 外部向けKPIの表示変換
export type ExternalKPIDisplayConfig = {
  kpiId: string;
  displayName: string;
  showExactValue: boolean; // false ならレンジ表示
  rangeLabels?: { low: string; medium: string; high: string };
};

export const EXTERNAL_KPI_DISPLAY_CONFIG: ExternalKPIDisplayConfig[] = [
  {
    kpiId: 'occupancy_rate',
    displayName: '入居率',
    showExactValue: true,
  },
  {
    kpiId: 'prospect_conversion',
    displayName: '見学→入居転換率',
    showExactValue: true,
  },
  {
    kpiId: 'inquiry_count',
    displayName: '問い合わせ件数',
    showExactValue: true,
  },
  {
    kpiId: 'avg_fatigue',
    displayName: '組織コンディション',
    showExactValue: false,
    rangeLabels: { low: '良好', medium: '注意', high: '要対応' },
  },
  {
    kpiId: 'turnover_risk_count',
    displayName: '人材リスク',
    showExactValue: false,
    rangeLabels: { low: '安定', medium: '一部注意', high: '要対応' },
  },
];
