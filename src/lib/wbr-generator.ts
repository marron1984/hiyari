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
// Task 041: KPI辞書参照
import { getKPIDictionaryEntry } from '@/lib/kpiDictionary/repo';

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
 */
function generateKPIHighlights(): KPIHighlightSection {
  const counts = getFeatureCountByStatus();
  const tickets = generateTickets();
  const phaseCounts = getTicketCountByPhase();

  // シミュレートされたKPI変動（実際のシステムではDBから取得）
  const highlights: KPIHighlight[] = [];

  // Task 041: KPI辞書から direction/whyItMatters を取得するヘルパー
  const getDictMetadata = (kpiId: string) => {
    const entry = getKPIDictionaryEntry(kpiId);
    return {
      directionMeaning: entry?.direction ?? null,
      whyItMatters: entry?.whyItMatters ?? null,
    };
  };

  // 機能実装進捗
  const progressPercent = Math.round((counts.active / OS_FEATURES.length) * 100);
  const prevProgress = progressPercent - Math.floor(Math.random() * 5 + 2); // 仮の前週値
  highlights.push({
    name: 'OS機能実装進捗',
    currentValue: `${progressPercent}%`,
    previousValue: `${prevProgress}%`,
    changePercent: progressPercent - prevProgress,
    direction: 'up',
    impact: 'high',
    insight: `前週比+${progressPercent - prevProgress}%。計画通りの進捗を維持。`,
    directionMeaning: 'higher_is_better',
    whyItMatters: 'OS機能の実装進捗は経営基盤整備の直接指標。計画通りの進捗が組織の成長を支える。',
  });

  // 高リスク未着手件数
  const highRiskCount = OS_FEATURES.filter(
    (f) => f.status !== 'active' && (f.risk ?? 0) >= 4
  ).length;
  highlights.push({
    name: '高リスク未着手機能',
    currentValue: highRiskCount,
    previousValue: highRiskCount + 1,
    changePercent: -1,
    direction: 'down',
    impact: highRiskCount >= 5 ? 'high' : 'medium',
    insight:
      highRiskCount >= 5
        ? '放置リスクが高い機能が残存。優先的な対応を推奨。'
        : 'リスク管理は概ね適正。引き続き監視を継続。',
    directionMeaning: 'lower_is_better',
    whyItMatters: '高リスク機能の放置は業務停滞や事故発生リスクを高める。早期対応が組織の安定につながる。',
  });

  // 今月対応予定チケット
  highlights.push({
    name: '今月対応予定チケット',
    currentValue: phaseCounts.thisMonth,
    previousValue: phaseCounts.thisMonth + 2,
    changePercent: Math.round((-2 / (phaseCounts.thisMonth + 2)) * 100),
    direction: 'down',
    impact: 'medium',
    insight: 'チケット消化が進行中。計画的な実行を継続。',
    directionMeaning: 'neutral',
    whyItMatters: 'チケット消化は開発リズムの指標。適切なペースでの消化が品質と速度のバランスを保つ。',
  });

  // Task 041: KPI辞書ベースのハイライト追加
  const occupancyEntry = getKPIDictionaryEntry('occupancy_rate');
  if (occupancyEntry) {
    highlights.push({
      name: occupancyEntry.name,
      currentValue: '92.5%',
      previousValue: '91.2%',
      changePercent: 1.4,
      direction: 'up',
      impact: 'high',
      insight: '入居率は順調に推移。目標の95%に向けて継続注力。',
      ...getDictMetadata('occupancy_rate'),
    });
  }

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
export function generateWBR(date: Date = new Date()): WBRReport {
  const week = getWeekRange(date);
  const executiveSummary = generateExecutiveSummary();
  const kpiHighlights = generateKPIHighlights();
  const progressReview = generateProgressReview();
  const riskAlerts = generateRiskAlerts();
  const nextActions = generateNextActions();
  const aiComment = generateAIComment(executiveSummary, riskAlerts);

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
