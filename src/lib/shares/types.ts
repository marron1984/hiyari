/**
 * 外部共有ダッシュボード 型定義
 *
 * 金融機関・投資家向けのセキュアな共有機能
 * セキュリティ原則：最小権限・最小情報・監査可能
 * Task 040: 承認フロー追加
 */

import type { ExternalTemplateId } from '@/config/externalShareTemplates';

// 共有ステータス（Task 040: 承認フロー対応）
export type SharePackageStatus =
  | 'draft'              // 下書き（承認前）
  | 'pending_approval'   // 承認待ち
  | 'issued'             // 発行済み（URL有効）
  | 'revoked'            // 失効
  | 'expired';           // 期限切れ

// 共有パッケージ
export type SharePackage = {
  id: string;

  // 外部URLのトークン（DBにはハッシュのみ保存）
  // Task 040: 承認前はnull、issued時にのみ生成
  tokenHash: string | null;

  name: string; // 例：「〇〇銀行向け 2026年2月 共有」
  description?: string;
  status: SharePackageStatus;
  createdAt: string; // ISO
  createdByUserId?: string; // 内部ユーザー
  createdByUserName?: string;
  expiresAt: string; // ISO（発行後の有効期限）

  // テンプレートID（銀行/投資家/監査）
  templateId: ExternalTemplateId;

  // スナップショット内容（凍結データ）
  // Task 040: issued時に生成（draft時はnull可）
  snapshot: ExternalSnapshot | null;

  // 監査補助
  lastAccessedAt?: string; // ISO
  accessCount: number;

  // Task 040: 承認フロー関連
  approvalRequestId?: string | null;   // 承認申請ID（approvals連携）
  issuedAt?: string | null;            // 発行日時
  issuedByUserId?: string | null;      // 発行者（承認者）
  issuedByUserName?: string | null;    // 発行者名
};

// 外部公開用スナップショット（サニタイズ済みデータ）
export type ExternalSnapshot = {
  generatedAt: string; // ISO

  // テンプレートID
  templateId: ExternalTemplateId;

  // A. Executive Summary
  executiveSummary: ExternalExecutiveSummary;

  // B. KPIハイライト
  kpiHighlights: ExternalKPIHighlights;

  // C. ガバナンス＆運用証跡
  governance: ExternalGovernance;

  // D. ロードマップ
  roadmap: ExternalRoadmap;

  // E. WBR証跡（監査向け）
  wbrProof?: ExternalWBRProof;

  // F. アラートサマリー
  alertsSummary?: ExternalAlertsSummary;

  // G. 補足メモ
  notes?: string;
};

// E. WBR証跡（監査向け詳細）
export type ExternalWBRProof = {
  records: {
    weekLabel: string;
    executedAt: string;
    attendeeCount?: number;
    decisionsCount: number;
    issuesCount: number;
  }[];
  totalExecuted: number;
  executionRate: number; // %
};

// F. アラートサマリー
export type ExternalAlertsSummary = {
  period: string;
  totalRaised: number;
  resolved: number;
  pending: number;
  avgResolutionDays: number;
  categories: {
    category: string;
    count: number;
  }[];
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
  templateId?: ExternalTemplateId; // デフォルトは'bank'
  notes?: string; // 補足メモ
};

// 共有作成レスポンス（Task 040: draft作成時はtoken無し）
export type CreateShareResponse = {
  shareId: string;
  shareUrl: string;
  token: string; // 一度だけ表示（以後は取得不可）
  expiresAt: string;
};

// Task 040: 下書き作成レスポンス（承認前）
export type CreateShareDraftResponse = {
  shareId: string;
  status: 'draft';
  expiresAt: string;  // 発行後の有効期限予定
};

// Task 040: 承認依頼レスポンス
export type RequestApprovalResponse = {
  shareId: string;
  approvalRequestId: string;
  status: 'pending_approval';
};

// Task 040: 発行レスポンス（承認後）
export type IssueShareResponse = {
  shareId: string;
  shareUrl: string;
  token: string; // 一度だけ表示
  status: 'issued';
  issuedAt: string;
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
