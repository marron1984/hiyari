/**
 * WBR（Weekly Business Review）自動生成
 *
 * AA-HUB内のデータを用いて毎週の経営レビューを自動生成
 * 事実→示唆→行動を一気通貫で提示
 */

import {
  OS_FEATURES,
  OS_CATEGORIES,
  getFeatureCountByStatus,
  calculateCompositeScore,
  type OSFeature,
} from '@/config/osFeatures';
import {
  generateTickets,
  getTicketCountByPhase,
  TICKET_PHASES,
  type DevTicket,
} from '@/lib/generateTickets';
import { getWeeklyAlertSummary } from '@/lib/alerts/repo';
import { getUnclassifiedCounts } from '@/lib/scope/detectUnclassifiedBusinessUnit';
import type { UnclassifiedCounts } from '@/lib/scope/types';
// Task 051: KPIハイライトヘルパー（辞書参照を内包）
import {
  buildKpiHighlights,
  toKPIHighlights,
  getTopHighlights,
  type RawKpiData,
  type WbrKpiHighlight,
} from '@/lib/wbr/buildKpiHighlights';
// Task 042: AI VP Business Top3
import { generateWBRBusinessTop3Summary } from '@/lib/aiVp/businessTop3';
// Task 043: AI VP Generated Tickets
import { getGeneratedTicketsThisWeek } from '@/lib/aiVp/ticketGenerator';
import type { ViewerContext } from '@/lib/business/types';
// Ticket 071: 空室問い合わせファネル
import { getVacancyInquiryStats } from '@/lib/tickets/repo';
import type { VacancyInquiryStats } from '@/lib/tickets/types';
// Ticket 074: 紹介元（ref）別メトリクス
import { buildVacancyInquiryRefMetrics } from '@/lib/wbr/buildVacancyInquiryRefMetrics';
import type { RefMetric, RefMetricsResult } from '@/lib/wbr/buildVacancyInquiryRefMetrics';

// WBRレポート型
export interface WBRReport {
  id: string;
  weekLabel: string;
  weekStart: string;
  weekEnd: string;
  generatedAt: Date;
  executiveSummary: ExecutiveSummarySection;
  kpiHighlights: KPIHighlightSection;
  progressReview: ProgressReviewSection;
  riskAlerts: RiskAlertSection;
  nextActions: NextActionsSection;
  aiComment: AICommentSection;
  businessTop3?: BusinessTop3Section;  // Task 042: 事業別Top3
  generatedTickets?: GeneratedTicketsSection;  // Task 043: 今週生成されたチケット
  vacancyInquiryFunnel?: VacancyInquiryFunnelSection;  // Ticket 071: 空室問い合わせファネル
  refMetrics?: RefMetricsSection;  // Ticket 074: 紹介元別メトリクス
}

// ① 週次サマリー
export interface ExecutiveSummarySection {
  overview: string; // 3-4行の総評
  goodPoints: string[]; // 良かった点（2点以内）
  issues: string[]; // 課題点（2点以内）
}

// ② KPIハイライト
export interface KPIHighlight {
  name: string;
  currentValue: number | string;
  previousValue: number | string;
  changePercent: number;
  direction: 'up' | 'down' | 'stable';
  impact: 'high' | 'medium' | 'low';
  insight: string;
  // Task 041: 辞書参照で方向性・重要性を表示
  directionMeaning?: 'higher_is_better' | 'lower_is_better' | 'neutral' | null;
  whyItMatters?: string | null;
}

export interface KPIHighlightSection {
  highlights: KPIHighlight[];
}

// ③ 進捗レビュー
export interface ProgressReviewSection {
  nearCompletion: { name: string; status: string }[]; // 完了に近づいた機能
  newlyStarted: { name: string; from: string; to: string }[]; // 新たに着手した機能
  stalled: { name: string; reason: string }[]; // 遅延・停滞
}

// ④ リスク・アラート
export interface RiskAlertItem {
  name: string;
  category: string;
  riskLevel: 'critical' | 'high' | 'medium';
  description: string;
  daysIgnored: number;
}

export interface AlertSummaryForWBR {
  newAlerts: number;
  criticalOpen: number;
  topCriticals: { title: string; type: string }[];
}

export interface RiskAlertSection {
  persistentRisks: RiskAlertItem[]; // 放置されている項目
  newRisks: RiskAlertItem[]; // 新たに顕在化したリスク
  alertSummary?: AlertSummaryForWBR; // アラートセンターからのサマリー
  unclassifiedCounts?: UnclassifiedCounts; // Task 033: 未分類スコープ件数
}

// ⑤ 来週のアクション
export interface NextAction {
  title: string;
  purpose: string;
  completionCriteria: string;
}

export interface NextActionsSection {
  top3: NextAction[];
}

// ⑥ AI副社長コメント
export interface AICommentSection {
  judgmentSummary: string; // 今週の判断総括
  nextWeekInsight: string; // 来週への示唆
}

// ⑦ 事業別Top3（Task 042）
export interface BusinessTop3Section {
  topBusinessRisks: { name: string; riskLevel: string; topAction: string | null }[];
  globalTopActions: string[];
}

// ⑧ 今週生成されたAI-VPチケット（Task 043）
export interface GeneratedTicketsSection {
  tickets: {
    id: string;
    title: string;
    priority: string;
    businessUnitId: string | null;
    status: string;
    dueAt: string | null;
  }[];
  totalCount: number;
}

// ⑨ 空室問い合わせファネル（Ticket 071）
export interface VacancyInquiryFunnelSection {
  thisWeek: {
    newCount: number;           // 今週の問い合わせ数（new発生）
    contactedCount: number;     // 連絡済み
    tourScheduledCount: number; // 見学予定
    appliedCount: number;       // 申込み
    acceptedCount: number;      // 成約
    rejectedCount: number;      // 不成約
  };
  slaComplianceRate: number;    // 今週の初動SLA遵守率（%）
  totalActive: number;          // アクティブ案件総数
  slaBreachedCount: number;     // SLA超過中の件数
  conversionRate: number;       // 成約率（accepted / (accepted + rejected)）
}

// ⑩ 紹介元別メトリクス（Ticket 074）
export interface RefMetricsSection {
  topByInquiries: RefMetric[];  // 問い合わせ数上位5ref
  topByConversion: RefMetric[]; // 成約率上位3ref（母数>=3）
  notes: string[];              // 注目ポイント
  weekStart: string;
  weekEnd: string;
}

/**
 * 週の範囲を計算
 */
export function getWeekRange(date: Date = new Date()): { start: Date; end: Date; label: string } {
  const d = new Date(date);
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const format = (d: Date) =>
    `${d.getMonth() + 1}/${d.getDate()}`;

  const year = monday.getFullYear();
  const weekNum = getWeekNumber(monday);

  return {
    start: monday,
    end: sunday,
    label: `${year}年 第${weekNum}週（${format(monday)}〜${format(sunday)}）`,
  };
}

function getWeekNumber(d: Date): number {
  const firstDay = new Date(d.getFullYear(), 0, 1);
  const pastDays = (d.getTime() - firstDay.getTime()) / 86400000;
  return Math.ceil((pastDays + firstDay.getDay() + 1) / 7);
}

/**
 * ① 週次サマリーを生成
 */
function generateExecutiveSummary(): ExecutiveSummarySection {
  const counts = getFeatureCountByStatus();
  const total = OS_FEATURES.length;
  const progressPercent = Math.round((counts.active / total) * 100);
  const tickets = generateTickets();
  const phaseCounts = getTicketCountByPhase();

  // 総評を生成
  let overview: string;
  if (progressPercent >= 70) {
    overview = `OS基盤の整備は順調に進行中。今週は${counts.active}件の機能が運用中となり、全体進捗${progressPercent}%を達成。今月対応予定のチケット${phaseCounts.thisMonth}件のうち、優先度の高い案件から順次着手している状況。経営判断に必要な基盤は概ね整備完了。`;
  } else if (progressPercent >= 50) {
    overview = `OS構築の中盤フェーズ。現在${counts.active}件が運用中で進捗${progressPercent}%。残り${counts.planned}件の未着手機能のうち、リスク緊急度の高い${phaseCounts.thisMonth}件を今月中に対応予定。基盤整備は着実に進行しており、来月からのスケールフェーズに向けた準備が整いつつある。`;
  } else {
    overview = `OS構築の初期フェーズを継続中。${counts.active}件が運用開始済みで進捗${progressPercent}%。今週は${phaseCounts.thisMonth}件のチケットを今月対応として優先設定。経営基盤となる中核機能の整備を最優先とし、着実な土台固めを継続する。`;
  }

  // 良かった点を特定
  const goodPoints: string[] = [];
  const activeFeatures = OS_FEATURES.filter((f) => f.status === 'active');
  if (activeFeatures.length >= 20) {
    goodPoints.push('20件以上の機能が安定運用中で、基盤が着実に整備されている');
  }
  const highROIActive = activeFeatures.filter((f) => (f.roi ?? 0) >= 4);
  if (highROIActive.length >= 5) {
    goodPoints.push(`高ROI機能${highROIActive.length}件が運用中で、投資効果が表れている`);
  }
  if (goodPoints.length === 0) {
    goodPoints.push('計画通りの進捗を維持している');
  }

  // 課題点を特定
  const issues: string[] = [];
  const highRiskPlanned = OS_FEATURES.filter(
    (f) => f.status === 'planned' && (f.risk ?? 0) >= 4
  );
  if (highRiskPlanned.length >= 3) {
    issues.push(`リスクスコア4以上の未着手機能が${highRiskPlanned.length}件あり、早期対応が必要`);
  }
  if (phaseCounts.thisMonth >= 10) {
    issues.push(`今月対応予定${phaseCounts.thisMonth}件は工数面での精査が必要`);
  }
  if (issues.length === 0) {
    issues.push('現時点で重大な課題は検出されていない');
  }

  return {
    overview,
    goodPoints: goodPoints.slice(0, 2),
    issues: issues.slice(0, 2),
  };
}

/**
 * ② KPIハイライトを生成
 *
 * Task 051: buildKpiHighlightsヘルパーを使用して辞書×異常検知を統合
 */
function generateKPIHighlights(): KPIHighlightSection {
  const counts = getFeatureCountByStatus();
  const phaseCounts = getTicketCountByPhase();

  // 機能実装進捗を計算
  const progressPercent = Math.round((counts.active / OS_FEATURES.length) * 100);
  const prevProgress = progressPercent - Math.floor(Math.random() * 5 + 2); // 仮の前週値

  // 高リスク未着手件数を計算
  const highRiskCount = OS_FEATURES.filter(
    (f) => f.status !== 'active' && (f.risk ?? 0) >= 4
  ).length;

  // Task 051: RawKpiData形式でKPIデータを準備
  const rawKpiData: RawKpiData[] = [
    {
      kpiId: 'os_implementation_progress',
      name: 'OS機能実装進捗',
      currentValue: progressPercent,
      previousValue: prevProgress,
      unit: '%',
    },
    {
      kpiId: 'high_risk_features',
      name: '高リスク未着手機能',
      currentValue: highRiskCount,
      previousValue: highRiskCount + 1,
      unit: '件',
    },
    {
      kpiId: 'monthly_tickets',
      name: '今月対応予定チケット',
      currentValue: phaseCounts.thisMonth,
      previousValue: phaseCounts.thisMonth + 2,
      unit: '件',
    },
    // 入居率（辞書登録済み）
    {
      kpiId: 'occupancy_rate',
      currentValue: 92.5,
      previousValue: 91.2,
      unit: '%',
    },
  ];

  // Task 051: ヘルパーでハイライト生成（辞書・異常検知を統合）
  const wbrHighlights = buildKpiHighlights(rawKpiData, {
    applyAnomalyRules: true,
    flatThreshold: 0.5,
  });

  // 影響度順でソート＆トップ5を取得
  const topHighlights = getTopHighlights(wbrHighlights, 5);

  // 旧形式（KPIHighlight）に変換して互換性を維持
  const legacyHighlights = toKPIHighlights(topHighlights);

  // insight を補完（元の詳細コメントを保持）
  const highlights: KPIHighlight[] = legacyHighlights.map((h, i) => {
    const wbr = topHighlights[i];
    let insight = h.insight;

    // 異常検知の説明がない場合はコンテキストベースのコメントを付与
    if (!insight) {
      if (wbr.kpiId === 'os_implementation_progress') {
        insight = `前週比${wbr.changePercent > 0 ? '+' : ''}${wbr.changePercent}%。計画通りの進捗を維持。`;
      } else if (wbr.kpiId === 'high_risk_features') {
        insight =
          wbr.isGood
            ? 'リスク管理は概ね適正。引き続き監視を継続。'
            : '放置リスクが高い機能が残存。優先的な対応を推奨。';
      } else if (wbr.kpiId === 'monthly_tickets') {
        insight = 'チケット消化が進行中。計画的な実行を継続。';
      } else if (wbr.kpiId === 'occupancy_rate') {
        insight = '入居率は順調に推移。目標の95%に向けて継続注力。';
      } else {
        // 辞書のwhyItMattersか、デフォルトメッセージ
        insight = wbr.whyItMatters || `${wbr.name}の変動を確認。`;
      }
    }

    return {
      ...h,
      insight,
    };
  });

  return { highlights };
}

/**
 * ③ 進捗レビューを生成
 */
function generateProgressReview(): ProgressReviewSection {
  const activeFeatures = OS_FEATURES.filter((f) => f.status === 'active');
  const developingFeatures = OS_FEATURES.filter((f) => f.status === 'developing');

  // 完了に近づいた機能（developing状態で高スコアのもの）
  const nearCompletion = developingFeatures.slice(0, 2).map((f) => ({
    name: f.name,
    status: '開発中 → 最終テスト待ち',
  }));

  // 新たに着手（最近activeになったと仮定）
  const newlyStarted = activeFeatures
    .filter((f) => calculateCompositeScore(f) >= 12)
    .slice(0, 2)
    .map((f) => ({
      name: f.name,
      from: 'planned',
      to: 'active',
    }));

  // 遅延・停滞（スコア高いが未着手のもの）
  const stalled = OS_FEATURES.filter(
    (f) => f.status === 'planned' && calculateCompositeScore(f) >= 13
  )
    .slice(0, 2)
    .map((f) => ({
      name: f.name,
      reason: '依存関係の解消待ち',
    }));

  return {
    nearCompletion,
    newlyStarted,
    stalled,
  };
}

/**
 * ④ リスク・アラートを生成
 */
function generateRiskAlerts(): RiskAlertSection {
  // 放置されている高リスク項目
  const persistentRisks = OS_FEATURES.filter(
    (f) => f.status === 'planned' && (f.risk ?? 0) >= 4
  )
    .sort((a, b) => (b.risk ?? 0) - (a.risk ?? 0))
    .slice(0, 3)
    .map((f) => {
      const category = OS_CATEGORIES.find((c) => c.id === f.category);
      return {
        name: f.name,
        category: category?.name ?? f.category,
        riskLevel: (f.risk ?? 0) >= 5 ? 'critical' : 'high',
        description: getRiskDescription(f),
        daysIgnored: Math.floor(Math.random() * 30 + 7), // 仮の放置日数
      } as RiskAlertItem;
    });

  // 新たに顕在化したリスク（シミュレート）
  const newRisks: RiskAlertItem[] = [];
  const highScorePlanned = OS_FEATURES.filter(
    (f) => f.status === 'planned' && calculateCompositeScore(f) >= 12
  );
  if (highScorePlanned.length > 0) {
    const f = highScorePlanned[0];
    const category = OS_CATEGORIES.find((c) => c.id === f.category);
    newRisks.push({
      name: f.name,
      category: category?.name ?? f.category,
      riskLevel: 'medium',
      description: '今週のスコアリングで優先度が上昇。早期着手を検討。',
      daysIgnored: 0,
    });
  }

  // アラートセンターからのサマリー
  const alertSummary = getWeeklyAlertSummary();

  // Task 033: 未分類スコープ件数
  const unclassifiedCounts = getUnclassifiedCounts();

  return { persistentRisks, newRisks, alertSummary, unclassifiedCounts };
}

function getRiskDescription(feature: OSFeature): string {
  const category = feature.category;
  if (category === 'risk') return '事故・インシデント発生時の対応遅延リスク';
  if (category === 'people') return '属人化・人材流出時の業務継続リスク';
  if (category === 'document') return 'コンプライアンス違反リスク';
  if (category === 'finance') return '未収・財務管理の遅延リスク';
  if (category === 'communication') return '情報伝達不全による業務停滞リスク';
  if (category === 'approval') return 'ガバナンス不全リスク';
  return '業務効率低下リスク';
}

/**
 * ⑤ 来週のアクションを生成
 */
function generateNextActions(): NextActionsSection {
  const topFeatures = OS_FEATURES.filter(
    (f) => f.status === 'planned' || f.status === 'developing'
  )
    .sort((a, b) => calculateCompositeScore(b) - calculateCompositeScore(a))
    .slice(0, 3);

  const top3: NextAction[] = topFeatures.map((f, index) => {
    let purpose: string;
    let completionCriteria: string;

    if (index === 0) {
      purpose = '経営基盤の最優先課題として、今週中に着手し基礎設計を完了させる';
      completionCriteria = '基本画面の表示とデータ構造の確定';
    } else if (index === 1) {
      purpose = '放置リスクの軽減と業務効率化のため、設計レビューを実施';
      completionCriteria = '要件定義書と画面モックの作成完了';
    } else {
      purpose = 'ROI観点から短期効果が見込めるため、実装準備を開始';
      completionCriteria = '技術調査と工数見積もりの完了';
    }

    return {
      title: f.name,
      purpose,
      completionCriteria,
    };
  });

  return { top3 };
}

/**
 * ⑥ AI副社長コメントを生成
 */
function generateAIComment(
  summary: ExecutiveSummarySection,
  riskAlerts: RiskAlertSection
): AICommentSection {
  const hasHighRisks = riskAlerts.persistentRisks.some((r) => r.riskLevel === 'critical');
  const hasManyIssues = summary.issues.length >= 2;

  let judgmentSummary: string;
  let nextWeekInsight: string;

  if (hasHighRisks) {
    judgmentSummary =
      '今週は高リスク案件への対応が遅れている。経営判断として、来週は通常開発を一時停止し、リスク解消に集中するべきである。';
    nextWeekInsight =
      'リスク対応を最優先とし、通常開発は翌週に繰り越す判断が妥当。短期的な遅延より、中長期のリスク回避を優先すべき局面である。';
  } else if (hasManyIssues) {
    judgmentSummary =
      '計画は概ね順調だが、課題が顕在化しつつある。来週は課題解消と並行して開発を進め、バランスを取る判断が必要。';
    nextWeekInsight =
      '課題を放置せず、小さな問題のうちに対処する姿勢を維持。開発速度より確実性を重視し、品質を担保すること。';
  } else {
    judgmentSummary =
      '今週は計画通りの進捗を達成。経営基盤の整備は着実に進んでおり、現在の方針を継続して問題ない。';
    nextWeekInsight =
      '現状の速度を維持しつつ、来週はTop3アクションに集中投資する判断が妥当。焦らず着実に、確実な成果を積み上げること。';
  }

  return { judgmentSummary, nextWeekInsight };
}

/**
 * WBRレポートを生成
 */
export function generateWBR(date: Date = new Date(), viewer?: ViewerContext): WBRReport {
  const week = getWeekRange(date);
  const executiveSummary = generateExecutiveSummary();
  const kpiHighlights = generateKPIHighlights();
  const progressReview = generateProgressReview();
  const riskAlerts = generateRiskAlerts();
  const nextActions = generateNextActions();
  const aiComment = generateAIComment(executiveSummary, riskAlerts);

  // Task 042: 事業別Top3を生成（viewerが指定された場合のみ）
  let businessTop3: BusinessTop3Section | undefined;
  if (viewer) {
    businessTop3 = generateWBRBusinessTop3Summary(viewer);
  }

  // Task 043: 今週生成されたAI-VPチケットを取得
  let generatedTickets: GeneratedTicketsSection | undefined;
  if (viewer) {
    const tickets = getGeneratedTicketsThisWeek(viewer);
    if (tickets.length > 0) {
      generatedTickets = {
        tickets: tickets.map((t) => ({
          id: t.id,
          title: t.title,
          priority: t.priority,
          businessUnitId: t.businessUnitId,
          status: t.status,
          dueAt: t.dueAt,
        })),
        totalCount: tickets.length,
      };
    }
  }

  // Ticket 071: 空室問い合わせファネル統計を取得
  let vacancyInquiryFunnel: VacancyInquiryFunnelSection | undefined;
  if (viewer) {
    const stats = getVacancyInquiryStats(viewer);
    // アクティブ案件数（closed/rejected以外）
    const totalActive = stats.total - stats.byStage.closed - stats.byStage.rejected;
    // 成約率計算（completed deals / all concluded deals）
    const concluded = stats.byStage.accepted + stats.byStage.rejected;
    const conversionRate = concluded > 0
      ? Math.round((stats.byStage.accepted / concluded) * 100)
      : 0;

    vacancyInquiryFunnel = {
      thisWeek: {
        newCount: stats.thisWeek.newCount,
        contactedCount: stats.thisWeek.contactedCount,
        tourScheduledCount: stats.thisWeek.tourScheduledCount,
        appliedCount: stats.thisWeek.appliedCount,
        acceptedCount: stats.thisWeek.acceptedCount,
        rejectedCount: stats.thisWeek.rejectedCount,
      },
      slaComplianceRate: stats.slaComplianceRate,
      totalActive,
      slaBreachedCount: stats.slaBreached,
      conversionRate,
    };
  }

  // Ticket 074: 紹介元別メトリクスを取得
  let refMetrics: RefMetricsSection | undefined;
  if (viewer) {
    const refResult = buildVacancyInquiryRefMetrics(viewer);
    // 問い合わせがある場合のみセクションを追加
    if (refResult.topByInquiries.length > 0) {
      refMetrics = {
        topByInquiries: refResult.topByInquiries,
        topByConversion: refResult.topByConversion,
        notes: refResult.notes,
        weekStart: refResult.weekStart,
        weekEnd: refResult.weekEnd,
      };
    }
  }

  const formatDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  return {
    id: `WBR-${formatDate(week.start)}`,
    weekLabel: week.label,
    weekStart: formatDate(week.start),
    weekEnd: formatDate(week.end),
    generatedAt: new Date(),
    executiveSummary,
    kpiHighlights,
    progressReview,
    riskAlerts,
    nextActions,
    aiComment,
    businessTop3,
    generatedTickets,
    vacancyInquiryFunnel,
    refMetrics,
  };
}

/**
 * 過去のWBR履歴を生成（デモ用）
 */
export function generateWBRHistory(count: number = 4): WBRReport[] {
  const reports: WBRReport[] = [];
  const today = new Date();

  for (let i = 0; i < count; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i * 7);
    reports.push(generateWBR(date));
  }

  return reports;
}

/**
 * WBRをテキスト形式でエクスポート
 */
export function exportWBRToText(report: WBRReport): string {
  const lines: string[] = [];

  lines.push('══════════════════════════════════════════════════════════════');
  lines.push('                AA-HUB Weekly Business Review');
  lines.push(`                   ${report.weekLabel}`);
  lines.push('══════════════════════════════════════════════════════════════');
  lines.push('');

  // ① 週次サマリー
  lines.push('■ 1. Executive Summary（週次サマリー）');
  lines.push('──────────────────────────────────────────────────────────────');
  lines.push('');
  lines.push(report.executiveSummary.overview);
  lines.push('');
  lines.push('【良かった点】');
  report.executiveSummary.goodPoints.forEach((p) => lines.push(`  ・${p}`));
  lines.push('');
  lines.push('【課題点】');
  report.executiveSummary.issues.forEach((i) => lines.push(`  ・${i}`));
  lines.push('');

  // ② KPIハイライト
  lines.push('■ 2. KPIハイライト');
  lines.push('──────────────────────────────────────────────────────────────');
  report.kpiHighlights.highlights.forEach((h) => {
    const arrow = h.direction === 'up' ? '↑' : h.direction === 'down' ? '↓' : '→';
    lines.push(`  ${h.name}: ${h.currentValue} ${arrow} (前週: ${h.previousValue})`);
    lines.push(`    → ${h.insight}`);
    lines.push('');
  });

  // ③ 進捗レビュー
  lines.push('■ 3. 進捗レビュー');
  lines.push('──────────────────────────────────────────────────────────────');
  if (report.progressReview.nearCompletion.length > 0) {
    lines.push('【完了間近】');
    report.progressReview.nearCompletion.forEach((f) =>
      lines.push(`  ・${f.name}（${f.status}）`)
    );
  }
  if (report.progressReview.newlyStarted.length > 0) {
    lines.push('【今週着手】');
    report.progressReview.newlyStarted.forEach((f) =>
      lines.push(`  ・${f.name}（${f.from} → ${f.to}）`)
    );
  }
  if (report.progressReview.stalled.length > 0) {
    lines.push('【遅延・停滞】');
    report.progressReview.stalled.forEach((f) =>
      lines.push(`  ・${f.name}（${f.reason}）`)
    );
  }
  lines.push('');

  // ④ リスク・アラート
  lines.push('■ 4. リスク・アラート');
  lines.push('──────────────────────────────────────────────────────────────');
  if (report.riskAlerts.persistentRisks.length > 0) {
    lines.push('【放置リスク】');
    report.riskAlerts.persistentRisks.forEach((r) => {
      const level = r.riskLevel === 'critical' ? '🔴' : r.riskLevel === 'high' ? '🟠' : '🟡';
      lines.push(`  ${level} ${r.name}（${r.category}）`);
      lines.push(`     ${r.description}`);
    });
  }
  if (report.riskAlerts.newRisks.length > 0) {
    lines.push('【新規リスク】');
    report.riskAlerts.newRisks.forEach((r) => {
      lines.push(`  🆕 ${r.name}（${r.category}）`);
      lines.push(`     ${r.description}`);
    });
  }
  // Task 033: 未分類スコープ件数
  if (report.riskAlerts.unclassifiedCounts && report.riskAlerts.unclassifiedCounts.total > 0) {
    lines.push('【未分類スコープ】');
    const uc = report.riskAlerts.unclassifiedCounts;
    const parts: string[] = [];
    if (uc.tickets > 0) parts.push(`チケット ${uc.tickets}件`);
    if (uc.repairs > 0) parts.push(`修繕 ${uc.repairs}件`);
    if (uc.correctiveActions > 0) parts.push(`是正措置 ${uc.correctiveActions}件`);
    lines.push(`  ⚠️ businessUnitId 未設定: ${parts.join('、')}（計 ${uc.total}件）`);
    lines.push('     → Scope Backfill で事業単位を割り当ててください');
  }
  lines.push('');

  // Task 042: 事業別Top3
  if (report.businessTop3) {
    lines.push('■ 4.5. AI副社長 事業別Top3');
    lines.push('──────────────────────────────────────────────────────────────');
    if (report.businessTop3.topBusinessRisks.length > 0) {
      lines.push('【高リスク事業】');
      report.businessTop3.topBusinessRisks.forEach((r) => {
        const levelIcon = r.riskLevel === 'critical' ? '🔴' : r.riskLevel === 'high' ? '🟠' : '🟡';
        lines.push(`  ${levelIcon} ${r.name}（${r.riskLevel}）`);
        if (r.topAction) {
          lines.push(`     最優先: ${r.topAction}`);
        }
      });
    }
    if (report.businessTop3.globalTopActions.length > 0) {
      lines.push('【全社Top3アクション】');
      report.businessTop3.globalTopActions.forEach((a, i) => {
        lines.push(`  ${i + 1}. ${a}`);
      });
    }
    lines.push('');
  }

  // Task 043: 今週生成されたAI-VPチケット
  if (report.generatedTickets && report.generatedTickets.totalCount > 0) {
    lines.push('■ 4.6. 今週生成されたAI-VPチケット（Task 043）');
    lines.push('──────────────────────────────────────────────────────────────');
    lines.push(`  合計 ${report.generatedTickets.totalCount}件 のチケットがAI副社長により自動生成されました`);
    lines.push('');
    report.generatedTickets.tickets.forEach((t, i) => {
      const priorityIcon = t.priority === 'urgent' ? '🔴' : t.priority === 'high' ? '🟠' : '🔵';
      const statusText = t.status === 'open' ? '未着手' : t.status === 'in_progress' ? '対応中' : t.status;
      lines.push(`  ${i + 1}. ${priorityIcon} ${t.title}`);
      lines.push(`     ステータス: ${statusText} / 期限: ${t.dueAt?.slice(0, 10) ?? '未設定'}`);
    });
    lines.push('');
  }

  // Ticket 071: 空室問い合わせファネル
  if (report.vacancyInquiryFunnel) {
    const funnel = report.vacancyInquiryFunnel;
    lines.push('■ 4.7. 空室問い合わせファネル（Ticket 071）');
    lines.push('──────────────────────────────────────────────────────────────');
    lines.push('【今週の実績】');
    lines.push(`  新規問い合わせ: ${funnel.thisWeek.newCount}件`);
    lines.push(`  連絡済み:       ${funnel.thisWeek.contactedCount}件`);
    lines.push(`  見学予定:       ${funnel.thisWeek.tourScheduledCount}件`);
    lines.push(`  申込み:         ${funnel.thisWeek.appliedCount}件`);
    lines.push(`  成約:           ${funnel.thisWeek.acceptedCount}件`);
    lines.push(`  不成約:         ${funnel.thisWeek.rejectedCount}件`);
    lines.push('');
    lines.push('【KPI】');
    lines.push(`  初動SLA遵守率: ${funnel.slaComplianceRate}%`);
    lines.push(`  成約率:        ${funnel.conversionRate}%`);
    lines.push(`  アクティブ案件: ${funnel.totalActive}件`);
    if (funnel.slaBreachedCount > 0) {
      lines.push(`  ⚠️ SLA超過中:   ${funnel.slaBreachedCount}件（要対応）`);
    }
    lines.push('');
  }

  // Ticket 074: 紹介元別メトリクス
  if (report.refMetrics && report.refMetrics.topByInquiries.length > 0) {
    const ref = report.refMetrics;
    lines.push('■ 4.8. 紹介元別メトリクス（Ticket 074）');
    lines.push('──────────────────────────────────────────────────────────────');
    lines.push('【問い合わせ数上位】');
    ref.topByInquiries.forEach((m, i) => {
      const name = m.name || m.ref;
      const slaIcon = m.slaComplianceRate >= 80 ? '✓' : '⚠️';
      lines.push(`  ${i + 1}. ${name}: ${m.inquiries}件 (SLA遵守${m.slaComplianceRate}% ${slaIcon})`);
      lines.push(`     → 連絡${m.contacted} / 見学${m.tour} / 申込${m.applied} / 成約${m.accepted} / 不成約${m.rejected}`);
    });
    lines.push('');
    if (ref.topByConversion.length > 0) {
      lines.push('【成約率上位】（母数3件以上）');
      ref.topByConversion.forEach((m, i) => {
        const name = m.name || m.ref;
        lines.push(`  ${i + 1}. ${name}: 成約率${m.conversionRate}%（${m.accepted}成約/${m.inquiries}件）`);
      });
      lines.push('');
    }
    if (ref.notes.length > 0) {
      lines.push('【注目ポイント】');
      ref.notes.forEach((note) => lines.push(`  ・${note}`));
      lines.push('');
    }
  }

  // ⑤ 来週のアクション
  lines.push('■ 5. 来週のアクション（Next Actions）');
  lines.push('──────────────────────────────────────────────────────────────');
  report.nextActions.top3.forEach((a, i) => {
    lines.push(`  ${i + 1}. ${a.title}`);
    lines.push(`     目的: ${a.purpose}`);
    lines.push(`     完了条件: ${a.completionCriteria}`);
    lines.push('');
  });

  // ⑥ AI副社長コメント
  lines.push('■ 6. AI副社長コメント');
  lines.push('══════════════════════════════════════════════════════════════');
  lines.push('');
  lines.push('【今週の判断総括】');
  lines.push(`  ${report.aiComment.judgmentSummary}`);
  lines.push('');
  lines.push('【来週への示唆】');
  lines.push(`  ${report.aiComment.nextWeekInsight}`);
  lines.push('');
  lines.push('══════════════════════════════════════════════════════════════');
  lines.push(`                Generated: ${report.generatedAt.toLocaleString('ja-JP')}`);
  lines.push('══════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

/**
 * WBRをHTML形式でエクスポート（PDF出力用）
 */
export function exportWBRToHTML(report: WBRReport): string {
  return `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>WBR - ${report.weekLabel}</title>
  <style>
    body {
      font-family: "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif;
      max-width: 900px;
      margin: 0 auto;
      padding: 40px;
      line-height: 1.7;
      color: #1a1a1a;
    }
    h1 {
      text-align: center;
      border-bottom: 3px solid #3b82f6;
      padding-bottom: 16px;
      margin-bottom: 8px;
      font-size: 28px;
    }
    .date {
      text-align: center;
      color: #666;
      margin-bottom: 32px;
      font-size: 14px;
    }
    h2 {
      background: linear-gradient(90deg, #3b82f6, #6366f1);
      color: white;
      padding: 10px 16px;
      border-radius: 4px;
      font-size: 16px;
      margin-top: 32px;
    }
    .summary-box {
      background: #f8fafc;
      padding: 20px;
      border-radius: 8px;
      border-left: 4px solid #3b82f6;
      margin: 16px 0;
    }
    .good-point {
      background: #ecfdf5;
      padding: 12px 16px;
      border-radius: 6px;
      margin: 8px 0;
      border-left: 4px solid #10b981;
    }
    .issue-point {
      background: #fef3c7;
      padding: 12px 16px;
      border-radius: 6px;
      margin: 8px 0;
      border-left: 4px solid #f59e0b;
    }
    .kpi-card {
      display: inline-block;
      background: #f1f5f9;
      padding: 16px 20px;
      border-radius: 8px;
      margin: 8px 8px 8px 0;
      min-width: 200px;
    }
    .kpi-value {
      font-size: 24px;
      font-weight: bold;
      color: #3b82f6;
    }
    .kpi-change-up { color: #10b981; }
    .kpi-change-down { color: #ef4444; }
    .progress-item {
      padding: 12px 16px;
      background: #f8fafc;
      border-radius: 6px;
      margin: 8px 0;
    }
    .risk-critical {
      background: #fef2f2;
      padding: 12px 16px;
      border-radius: 6px;
      margin: 8px 0;
      border-left: 4px solid #ef4444;
    }
    .risk-high {
      background: #fff7ed;
      padding: 12px 16px;
      border-radius: 6px;
      margin: 8px 0;
      border-left: 4px solid #f97316;
    }
    .action-item {
      background: #eff6ff;
      padding: 16px;
      border-radius: 8px;
      margin: 12px 0;
      border-left: 4px solid #3b82f6;
    }
    .action-item h3 {
      margin: 0 0 8px 0;
      color: #1e40af;
    }
    .ai-comment {
      background: linear-gradient(135deg, #ede9fe, #ddd6fe);
      padding: 24px;
      border-radius: 12px;
      margin-top: 32px;
    }
    .ai-comment h3 {
      margin: 0 0 12px 0;
      color: #6d28d9;
    }
    .ai-comment p {
      margin: 8px 0;
    }
    .footer {
      text-align: center;
      color: #999;
      margin-top: 48px;
      font-size: 12px;
    }
    @media print {
      body { padding: 20px; }
      h2 { break-after: avoid; }
    }
  </style>
</head>
<body>
  <h1>Weekly Business Review</h1>
  <p class="date">${report.weekLabel}</p>

  <h2>1. Executive Summary</h2>
  <div class="summary-box">
    ${report.executiveSummary.overview}
  </div>
  <h4>良かった点</h4>
  ${report.executiveSummary.goodPoints.map((p) => `<div class="good-point">✓ ${p}</div>`).join('')}
  <h4>課題点</h4>
  ${report.executiveSummary.issues.map((i) => `<div class="issue-point">△ ${i}</div>`).join('')}

  <h2>2. KPIハイライト</h2>
  <div>
    ${report.kpiHighlights.highlights
      .map(
        (h) => `
      <div class="kpi-card">
        <div>${h.name}</div>
        <div class="kpi-value">${h.currentValue}</div>
        <div class="${h.direction === 'up' ? 'kpi-change-up' : h.direction === 'down' ? 'kpi-change-down' : ''}">
          ${h.direction === 'up' ? '↑' : h.direction === 'down' ? '↓' : '→'} 前週: ${h.previousValue}
        </div>
        <div style="font-size: 12px; color: #666; margin-top: 8px;">${h.insight}</div>
      </div>
    `
      )
      .join('')}
  </div>

  <h2>3. 進捗レビュー</h2>
  ${
    report.progressReview.nearCompletion.length > 0
      ? `
    <h4>完了間近</h4>
    ${report.progressReview.nearCompletion.map((f) => `<div class="progress-item">🏁 ${f.name}（${f.status}）</div>`).join('')}
  `
      : ''
  }
  ${
    report.progressReview.newlyStarted.length > 0
      ? `
    <h4>今週着手</h4>
    ${report.progressReview.newlyStarted.map((f) => `<div class="progress-item">🚀 ${f.name}（${f.from} → ${f.to}）</div>`).join('')}
  `
      : ''
  }
  ${
    report.progressReview.stalled.length > 0
      ? `
    <h4>遅延・停滞</h4>
    ${report.progressReview.stalled.map((f) => `<div class="progress-item">⚠️ ${f.name}（${f.reason}）</div>`).join('')}
  `
      : ''
  }

  <h2>4. リスク・アラート</h2>
  ${
    report.riskAlerts.persistentRisks.length > 0
      ? `
    <h4>放置リスク</h4>
    ${report.riskAlerts.persistentRisks
      .map(
        (r) => `
      <div class="${r.riskLevel === 'critical' ? 'risk-critical' : 'risk-high'}">
        <strong>${r.riskLevel === 'critical' ? '🔴' : '🟠'} ${r.name}</strong>（${r.category}）<br>
        ${r.description}
      </div>
    `
      )
      .join('')}
  `
      : ''
  }
  ${
    report.riskAlerts.newRisks.length > 0
      ? `
    <h4>新規リスク</h4>
    ${report.riskAlerts.newRisks.map((r) => `<div class="risk-high">🆕 <strong>${r.name}</strong>（${r.category}）<br>${r.description}</div>`).join('')}
  `
      : ''
  }
  ${
    report.riskAlerts.unclassifiedCounts && report.riskAlerts.unclassifiedCounts.total > 0
      ? `
    <h4>未分類スコープ（Task 033）</h4>
    <div class="risk-high">
      <strong>⚠️ businessUnitId 未設定レコード: 計 ${report.riskAlerts.unclassifiedCounts.total}件</strong><br>
      ${[
        report.riskAlerts.unclassifiedCounts.tickets > 0 ? `チケット ${report.riskAlerts.unclassifiedCounts.tickets}件` : '',
        report.riskAlerts.unclassifiedCounts.repairs > 0 ? `修繕 ${report.riskAlerts.unclassifiedCounts.repairs}件` : '',
        report.riskAlerts.unclassifiedCounts.correctiveActions > 0 ? `是正措置 ${report.riskAlerts.unclassifiedCounts.correctiveActions}件` : '',
      ].filter(Boolean).join('、')}<br>
      → Scope Backfill で事業単位を割り当ててください
    </div>
  `
      : ''
  }

  ${
    report.businessTop3
      ? `
  <h2>4.5. AI副社長 事業別Top3（Task 042）</h2>
  ${
    report.businessTop3.topBusinessRisks.length > 0
      ? `
    <h4>高リスク事業</h4>
    ${report.businessTop3.topBusinessRisks
      .map(
        (r) => `
      <div class="${r.riskLevel === 'critical' ? 'risk-critical' : 'risk-high'}">
        <strong>${r.riskLevel === 'critical' ? '🔴' : r.riskLevel === 'high' ? '🟠' : '🟡'} ${r.name}</strong>（${r.riskLevel}）
        ${r.topAction ? `<br>最優先: ${r.topAction}` : ''}
      </div>
    `
      )
      .join('')}
  `
      : ''
  }
  ${
    report.businessTop3.globalTopActions.length > 0
      ? `
    <h4>全社Top3アクション</h4>
    <ol>
      ${report.businessTop3.globalTopActions.map((a) => `<li>${a}</li>`).join('')}
    </ol>
  `
      : ''
  }
  `
      : ''
  }

  ${
    report.generatedTickets && report.generatedTickets.totalCount > 0
      ? `
  <h2>4.6. 今週生成されたAI-VPチケット（Task 043）</h2>
  <p>合計 <strong>${report.generatedTickets.totalCount}件</strong> のチケットがAI副社長により自動生成されました</p>
  <div>
    ${report.generatedTickets.tickets
      .map((t, i) => {
        const priorityIcon = t.priority === 'urgent' ? '🔴' : t.priority === 'high' ? '🟠' : '🔵';
        const statusText = t.status === 'open' ? '未着手' : t.status === 'in_progress' ? '対応中' : t.status;
        return `
      <div class="progress-item">
        ${priorityIcon} <strong>${i + 1}. ${t.title}</strong><br>
        ステータス: ${statusText} / 期限: ${t.dueAt?.slice(0, 10) ?? '未設定'}
      </div>
    `;
      })
      .join('')}
  </div>
  `
      : ''
  }

  ${
    report.vacancyInquiryFunnel
      ? `
  <h2>4.7. 空室問い合わせファネル（Ticket 071）</h2>
  <div style="display: flex; flex-wrap: wrap; gap: 12px; margin: 16px 0;">
    <div class="kpi-card">
      <div>新規問い合わせ</div>
      <div class="kpi-value">${report.vacancyInquiryFunnel.thisWeek.newCount}</div>
      <div style="font-size: 12px; color: #666;">今週</div>
    </div>
    <div class="kpi-card">
      <div>連絡済み</div>
      <div class="kpi-value">${report.vacancyInquiryFunnel.thisWeek.contactedCount}</div>
      <div style="font-size: 12px; color: #666;">今週</div>
    </div>
    <div class="kpi-card">
      <div>見学予定</div>
      <div class="kpi-value">${report.vacancyInquiryFunnel.thisWeek.tourScheduledCount}</div>
      <div style="font-size: 12px; color: #666;">今週</div>
    </div>
    <div class="kpi-card">
      <div>申込み</div>
      <div class="kpi-value">${report.vacancyInquiryFunnel.thisWeek.appliedCount}</div>
      <div style="font-size: 12px; color: #666;">今週</div>
    </div>
    <div class="kpi-card" style="background: #ecfdf5;">
      <div>成約</div>
      <div class="kpi-value" style="color: #10b981;">${report.vacancyInquiryFunnel.thisWeek.acceptedCount}</div>
      <div style="font-size: 12px; color: #666;">今週</div>
    </div>
    <div class="kpi-card" style="background: #fef2f2;">
      <div>不成約</div>
      <div class="kpi-value" style="color: #ef4444;">${report.vacancyInquiryFunnel.thisWeek.rejectedCount}</div>
      <div style="font-size: 12px; color: #666;">今週</div>
    </div>
  </div>
  <h4>KPI指標</h4>
  <div style="display: flex; flex-wrap: wrap; gap: 12px;">
    <div class="kpi-card">
      <div>初動SLA遵守率</div>
      <div class="kpi-value ${report.vacancyInquiryFunnel.slaComplianceRate >= 80 ? 'kpi-change-up' : 'kpi-change-down'}">${report.vacancyInquiryFunnel.slaComplianceRate}%</div>
    </div>
    <div class="kpi-card">
      <div>成約率</div>
      <div class="kpi-value">${report.vacancyInquiryFunnel.conversionRate}%</div>
    </div>
    <div class="kpi-card">
      <div>アクティブ案件</div>
      <div class="kpi-value">${report.vacancyInquiryFunnel.totalActive}</div>
    </div>
    ${report.vacancyInquiryFunnel.slaBreachedCount > 0 ? `
    <div class="kpi-card" style="background: #fef2f2; border-left: 4px solid #ef4444;">
      <div>SLA超過中</div>
      <div class="kpi-value" style="color: #ef4444;">${report.vacancyInquiryFunnel.slaBreachedCount}</div>
      <div style="font-size: 12px; color: #ef4444;">要対応</div>
    </div>
    ` : ''}
  </div>
  `
      : ''
  }

  ${
    report.refMetrics && report.refMetrics.topByInquiries.length > 0
      ? `
  <h2>4.8. 紹介元別メトリクス（Ticket 074）</h2>
  <h4>問い合わせ数上位</h4>
  <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
    <thead>
      <tr style="background: #f1f5f9;">
        <th style="padding: 12px; text-align: left; border: 1px solid #e2e8f0;">紹介元</th>
        <th style="padding: 12px; text-align: right; border: 1px solid #e2e8f0;">問い合わせ</th>
        <th style="padding: 12px; text-align: right; border: 1px solid #e2e8f0;">連絡</th>
        <th style="padding: 12px; text-align: right; border: 1px solid #e2e8f0;">見学</th>
        <th style="padding: 12px; text-align: right; border: 1px solid #e2e8f0;">申込</th>
        <th style="padding: 12px; text-align: right; border: 1px solid #e2e8f0;">成約</th>
        <th style="padding: 12px; text-align: right; border: 1px solid #e2e8f0;">SLA遵守</th>
      </tr>
    </thead>
    <tbody>
      ${report.refMetrics.topByInquiries.map((m) => {
        const name = m.name || m.ref;
        const slaColor = m.slaComplianceRate >= 80 ? '#10b981' : '#ef4444';
        return `
        <tr>
          <td style="padding: 12px; border: 1px solid #e2e8f0;">${name}</td>
          <td style="padding: 12px; text-align: right; border: 1px solid #e2e8f0; font-weight: bold;">${m.inquiries}</td>
          <td style="padding: 12px; text-align: right; border: 1px solid #e2e8f0;">${m.contacted}</td>
          <td style="padding: 12px; text-align: right; border: 1px solid #e2e8f0;">${m.tour}</td>
          <td style="padding: 12px; text-align: right; border: 1px solid #e2e8f0;">${m.applied}</td>
          <td style="padding: 12px; text-align: right; border: 1px solid #e2e8f0; color: #10b981;">${m.accepted}</td>
          <td style="padding: 12px; text-align: right; border: 1px solid #e2e8f0; color: ${slaColor};">${m.slaComplianceRate}%</td>
        </tr>
        `;
      }).join('')}
    </tbody>
  </table>
  ${report.refMetrics.topByConversion.length > 0 ? `
    <h4>成約率上位（母数3件以上）</h4>
    <div style="display: flex; flex-wrap: wrap; gap: 12px; margin: 16px 0;">
      ${report.refMetrics.topByConversion.map((m) => {
        const name = m.name || m.ref;
        return `
        <div class="kpi-card" style="background: #ecfdf5;">
          <div>${name}</div>
          <div class="kpi-value" style="color: #10b981;">${m.conversionRate}%</div>
          <div style="font-size: 12px; color: #666;">成約率（${m.accepted}/${m.inquiries}件）</div>
        </div>
        `;
      }).join('')}
    </div>
  ` : ''}
  ${report.refMetrics.notes.length > 0 ? `
    <h4>注目ポイント</h4>
    ${report.refMetrics.notes.map((note) => `<div class="good-point">${note}</div>`).join('')}
  ` : ''}
  `
      : ''
  }

  <h2>5. 来週のアクション</h2>
  ${report.nextActions.top3
    .map(
      (a, i) => `
    <div class="action-item">
      <h3>${i + 1}. ${a.title}</h3>
      <p><strong>目的:</strong> ${a.purpose}</p>
      <p><strong>完了条件:</strong> ${a.completionCriteria}</p>
    </div>
  `
    )
    .join('')}

  <div class="ai-comment">
    <h3>AI副社長コメント</h3>
    <p><strong>今週の判断総括:</strong><br>${report.aiComment.judgmentSummary}</p>
    <p><strong>来週への示唆:</strong><br>${report.aiComment.nextWeekInsight}</p>
  </div>

  <div class="footer">
    Generated: ${report.generatedAt.toLocaleString('ja-JP')} | AA-HUB Weekly Business Review
  </div>
</body>
</html>
  `;
}
