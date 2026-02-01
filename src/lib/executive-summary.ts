/**
 * 経営会議用 1枚サマリー自動生成
 *
 * OSマップ・優先度スコア・チケット情報を統合し、
 * 経営会議にそのまま出せる1枚サマリーを生成する
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

// サマリーデータ型
export interface ExecutiveSummary {
  generatedAt: Date;
  overview: OverviewSection;
  topPriority: TopPrioritySection;
  riskWarnings: RiskWarningSection;
  roadmap: RoadmapSection;
  ticketStatus: TicketStatusSection;
  aiComment: string;
}

export interface OverviewSection {
  activeCount: number;
  developingCount: number;
  plannedCount: number;
  totalCount: number;
  progressPercent: number;
  summary: string;
}

export interface TopPriorityItem {
  name: string;
  score: number;
  reason: string;
  riskIfIgnored: string;
}

export interface TopPrioritySection {
  items: TopPriorityItem[];
}

export interface RiskWarningItem {
  name: string;
  category: string;
  riskType: string;
  description: string;
}

export interface RiskWarningSection {
  items: RiskWarningItem[];
}

export interface RoadmapSection {
  thisMonth: string[];
  nextMonth: string[];
  thisQuarter: string[];
}

export interface TicketStatusSection {
  totalCount: number;
  thisMonthCount: number;
  sampleTickets: { title: string; category: string; phase: string }[];
}

/**
 * カテゴリ別の重要度を判定
 */
function getCategoryImportance(categoryId: string): string {
  const importanceMap: Record<string, string> = {
    core: '経営基盤',
    risk: 'リスク管理',
    finance: '財務',
    document: 'コンプライアンス',
    people: '人材・組織',
    communication: '情報共有',
    approval: 'ガバナンス',
    operation: '業務効率',
    education: '人材育成',
    family: '顧客対応',
  };
  return importanceMap[categoryId] || '業務';
}

/**
 * リスク種別を判定
 */
function getRiskType(feature: OSFeature): string {
  const category = feature.category;
  if (category === 'risk') return '事故・炎上リスク';
  if (category === 'people') return '属人化リスク';
  if (category === 'document') return 'コンプライアンスリスク';
  if (category === 'finance') return '財務リスク';
  if (category === 'communication') return '情報伝達不全リスク';
  if (category === 'approval') return 'ガバナンスリスク';
  return '業務停滞リスク';
}

/**
 * 全体像サマリーを生成
 */
function generateOverview(): OverviewSection {
  const counts = getFeatureCountByStatus();
  const total = OS_FEATURES.length;
  const implemented = counts.active;
  const progressPercent = Math.round((implemented / total) * 100);

  // 次の焦点を特定
  const plannedByCategory: Record<string, number> = {};
  OS_FEATURES.filter((f) => f.status === 'planned').forEach((f) => {
    plannedByCategory[f.category] = (plannedByCategory[f.category] || 0) + 1;
  });

  const topCategory = Object.entries(plannedByCategory)
    .sort((a, b) => b[1] - a[1])[0];

  const categoryName = topCategory
    ? OS_CATEGORIES.find((c) => c.id === topCategory[0])?.name || topCategory[0]
    : '';

  let summary: string;
  if (progressPercent >= 70) {
    summary = `OS基盤は概ね整備完了。残り${counts.planned}件の機能実装で全体完成となります。`;
  } else if (progressPercent >= 50) {
    summary = `OS基盤は整いつつあり、次の焦点は${categoryName}領域です。`;
  } else if (progressPercent >= 30) {
    summary = `基幹機能の整備を進行中。${categoryName}領域への着手が次の課題です。`;
  } else {
    summary = `OS構築初期フェーズ。まず${categoryName}領域の基盤整備を優先します。`;
  }

  return {
    activeCount: counts.active,
    developingCount: counts.developing,
    plannedCount: counts.planned,
    totalCount: total,
    progressPercent,
    summary,
  };
}

/**
 * 今月の最重要事項を生成
 */
function generateTopPriority(): TopPrioritySection {
  const actionableFeatures = OS_FEATURES
    .filter((f) => f.status === 'planned' || f.status === 'developing')
    .sort((a, b) => calculateCompositeScore(b) - calculateCompositeScore(a))
    .slice(0, 3);

  const items: TopPriorityItem[] = actionableFeatures.map((feature) => {
    const score = calculateCompositeScore(feature);
    const importance = getCategoryImportance(feature.category);

    let reason: string;
    if (score >= 14) {
      reason = `${importance}領域の中核機能であり、経営判断に直結するため最優先。`;
    } else if (score >= 12) {
      reason = `ROI・優先度ともに高く、短期的な効果が期待できる。`;
    } else if ((feature.risk ?? 0) >= 4) {
      reason = `放置リスクが高く、早期対応により損失を回避できる。`;
    } else {
      reason = `${importance}領域の基盤として、後続機能の前提となる。`;
    }

    let riskIfIgnored: string;
    if ((feature.risk ?? 0) >= 5) {
      riskIfIgnored = '重大インシデントの発生リスクがあります。';
    } else if ((feature.risk ?? 0) >= 4) {
      riskIfIgnored = '業務効率の低下・属人化が進行します。';
    } else {
      riskIfIgnored = '機会損失・競争力低下につながります。';
    }

    return {
      name: feature.name,
      score,
      reason,
      riskIfIgnored,
    };
  });

  return { items };
}

/**
 * 放置リスク警告を生成
 */
function generateRiskWarnings(): RiskWarningSection {
  const riskFeatures = OS_FEATURES
    .filter((f) => (f.risk ?? 0) >= 4 && f.status !== 'active')
    .sort((a, b) => (b.risk ?? 0) - (a.risk ?? 0))
    .slice(0, 5);

  const items: RiskWarningItem[] = riskFeatures.map((feature) => {
    const category = OS_CATEGORIES.find((c) => c.id === feature.category);
    return {
      name: feature.name,
      category: category?.name || feature.category,
      riskType: getRiskType(feature),
      description: `${feature.name}は${getRiskType(feature)}が高く、早期対応が必要です。`,
    };
  });

  return { items };
}

/**
 * ロードマップ要約を生成
 */
function generateRoadmap(): RoadmapSection {
  const tickets = generateTickets();

  const thisMonth = tickets
    .filter((t) => t.phase === 'thisMonth')
    .slice(0, 5)
    .map((t) => t.title.replace('【', '').replace('】機能実装', ''));

  const nextMonth = tickets
    .filter((t) => t.phase === 'nextMonth')
    .slice(0, 5)
    .map((t) => t.title.replace('【', '').replace('】機能実装', ''));

  const thisQuarter = tickets
    .filter((t) => t.phase === 'thisQuarter')
    .slice(0, 5)
    .map((t) => t.title.replace('【', '').replace('】機能実装', ''));

  return { thisMonth, nextMonth, thisQuarter };
}

/**
 * チケット状況を生成
 */
function generateTicketStatus(): TicketStatusSection {
  const tickets = generateTickets();
  const phaseCounts = getTicketCountByPhase();

  const sampleTickets = tickets
    .slice(0, 3)
    .map((t) => ({
      title: t.title,
      category: t.categoryName,
      phase: TICKET_PHASES[t.phase].name,
    }));

  return {
    totalCount: tickets.length,
    thisMonthCount: phaseCounts.thisMonth,
    sampleTickets,
  };
}

/**
 * AI副社長コメントを生成
 */
function generateAIComment(overview: OverviewSection, topPriority: TopPrioritySection): string {
  const progress = overview.progressPercent;
  const topItem = topPriority.items[0];

  if (progress >= 70) {
    return `OS基盤は十分に整備されています。残る課題に集中投資し、今四半期中の全機能稼働を目指す判断が妥当です。`;
  } else if (progress >= 50) {
    if (topItem) {
      return `今月は「${topItem.name}」を筆頭に基盤整備を完了させ、来月からスケールフェーズに入る判断が妥当です。`;
    }
    return `基盤整備は順調に進行中。今月の計画を確実に実行し、来月の加速に備えることを推奨します。`;
  } else if (progress >= 30) {
    return `OS構築フェーズの中盤です。焦らず着実に、重要度の高い機能から順次稼働させていくことを推奨します。`;
  } else {
    return `OS構築の初期段階です。まずは経営基盤となる中核機能の整備に集中し、土台を固めることを最優先としてください。`;
  }
}

/**
 * エグゼクティブサマリーを生成
 */
export function generateExecutiveSummary(): ExecutiveSummary {
  const overview = generateOverview();
  const topPriority = generateTopPriority();
  const riskWarnings = generateRiskWarnings();
  const roadmap = generateRoadmap();
  const ticketStatus = generateTicketStatus();
  const aiComment = generateAIComment(overview, topPriority);

  return {
    generatedAt: new Date(),
    overview,
    topPriority,
    riskWarnings,
    roadmap,
    ticketStatus,
    aiComment,
  };
}

/**
 * サマリーをプレーンテキスト形式でエクスポート
 */
export function exportSummaryToText(summary: ExecutiveSummary): string {
  const lines: string[] = [];
  const date = summary.generatedAt.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  lines.push('══════════════════════════════════════════════════════════════');
  lines.push('                   AA-HUB 経営サマリー');
  lines.push(`                     ${date}`);
  lines.push('══════════════════════════════════════════════════════════════');
  lines.push('');

  // ① 現在の全体像
  lines.push('■ 現在の全体像（Overview）');
  lines.push('──────────────────────────────────────────────────────────────');
  lines.push(`  運用中: ${summary.overview.activeCount}件`);
  lines.push(`  開発中: ${summary.overview.developingCount}件`);
  lines.push(`  未着手: ${summary.overview.plannedCount}件`);
  lines.push(`  進捗率: ${summary.overview.progressPercent}%`);
  lines.push('');
  lines.push(`  ${summary.overview.summary}`);
  lines.push('');

  // ② 今月の最重要事項
  lines.push('■ 今月の最重要事項（Top Priority）');
  lines.push('──────────────────────────────────────────────────────────────');
  summary.topPriority.items.forEach((item, i) => {
    lines.push(`  ${i + 1}. ${item.name}（スコア: ${item.score}/15）`);
    lines.push(`     理由: ${item.reason}`);
    lines.push(`     放置時: ${item.riskIfIgnored}`);
    lines.push('');
  });

  // ③ 放置リスク・注意領域
  if (summary.riskWarnings.items.length > 0) {
    lines.push('■ 放置リスク・注意領域');
    lines.push('──────────────────────────────────────────────────────────────');
    summary.riskWarnings.items.forEach((item) => {
      lines.push(`  ・${item.name}（${item.category}）`);
      lines.push(`    ${item.description}`);
    });
    lines.push('');
  }

  // ④ ロードマップ要約
  lines.push('■ ロードマップ要約');
  lines.push('──────────────────────────────────────────────────────────────');
  lines.push('  【今月】');
  summary.roadmap.thisMonth.forEach((item) => lines.push(`    ・${item}`));
  lines.push('  【来月】');
  summary.roadmap.nextMonth.forEach((item) => lines.push(`    ・${item}`));
  lines.push('  【今四半期】');
  summary.roadmap.thisQuarter.forEach((item) => lines.push(`    ・${item}`));
  lines.push('');

  // ⑤ 実行フェーズ
  lines.push('■ 実行フェーズ（チケット状況）');
  lines.push('──────────────────────────────────────────────────────────────');
  lines.push(`  総チケット数: ${summary.ticketStatus.totalCount}件`);
  lines.push(`  今月対応予定: ${summary.ticketStatus.thisMonthCount}件`);
  lines.push('');
  lines.push('  代表的なチケット:');
  summary.ticketStatus.sampleTickets.forEach((t) => {
    lines.push(`    ・${t.title}（${t.category} / ${t.phase}）`);
  });
  lines.push('');

  // ⑥ AI副社長コメント
  lines.push('■ AI副社長コメント');
  lines.push('══════════════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`  ${summary.aiComment}`);
  lines.push('');
  lines.push('══════════════════════════════════════════════════════════════');
  lines.push('                      Generated by AA-HUB');
  lines.push('══════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

/**
 * サマリーをHTML形式でエクスポート（PDF出力用）
 */
export function exportSummaryToHTML(summary: ExecutiveSummary): string {
  const date = summary.generatedAt.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>AA-HUB 経営サマリー - ${date}</title>
  <style>
    body {
      font-family: "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px;
      line-height: 1.6;
      color: #1a1a1a;
    }
    h1 {
      text-align: center;
      border-bottom: 3px solid #4f46e5;
      padding-bottom: 16px;
      margin-bottom: 8px;
    }
    .date {
      text-align: center;
      color: #666;
      margin-bottom: 32px;
    }
    h2 {
      background: linear-gradient(90deg, #4f46e5, #7c3aed);
      color: white;
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 16px;
      margin-top: 32px;
    }
    .overview-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin: 16px 0;
    }
    .overview-item {
      text-align: center;
      padding: 16px;
      background: #f5f5f5;
      border-radius: 8px;
    }
    .overview-item .number {
      font-size: 32px;
      font-weight: bold;
      color: #4f46e5;
    }
    .overview-item .label {
      font-size: 12px;
      color: #666;
    }
    .summary-text {
      background: #fef3c7;
      padding: 16px;
      border-radius: 8px;
      border-left: 4px solid #f59e0b;
    }
    .priority-item {
      background: #fff7ed;
      padding: 16px;
      border-radius: 8px;
      margin: 12px 0;
      border-left: 4px solid #ea580c;
    }
    .priority-item h3 {
      margin: 0 0 8px 0;
      color: #ea580c;
    }
    .risk-item {
      background: #fef2f2;
      padding: 12px 16px;
      border-radius: 8px;
      margin: 8px 0;
      border-left: 4px solid #dc2626;
    }
    .roadmap-section {
      margin: 16px 0;
    }
    .roadmap-section h4 {
      margin: 8px 0;
      color: #4f46e5;
    }
    .roadmap-section ul {
      margin: 0;
      padding-left: 24px;
    }
    .ai-comment {
      background: linear-gradient(135deg, #ede9fe, #ddd6fe);
      padding: 24px;
      border-radius: 12px;
      font-size: 18px;
      text-align: center;
      margin-top: 32px;
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
  <h1>AA-HUB 経営サマリー</h1>
  <p class="date">${date}</p>

  <h2>1. 現在の全体像</h2>
  <div class="overview-grid">
    <div class="overview-item">
      <div class="number">${summary.overview.activeCount}</div>
      <div class="label">運用中</div>
    </div>
    <div class="overview-item">
      <div class="number">${summary.overview.developingCount}</div>
      <div class="label">開発中</div>
    </div>
    <div class="overview-item">
      <div class="number">${summary.overview.plannedCount}</div>
      <div class="label">未着手</div>
    </div>
    <div class="overview-item">
      <div class="number">${summary.overview.progressPercent}%</div>
      <div class="label">進捗率</div>
    </div>
  </div>
  <div class="summary-text">${summary.overview.summary}</div>

  <h2>2. 今月の最重要事項</h2>
  ${summary.topPriority.items.map((item, i) => `
    <div class="priority-item">
      <h3>${i + 1}. ${item.name}（スコア: ${item.score}/15）</h3>
      <p><strong>理由:</strong> ${item.reason}</p>
      <p><strong>放置時リスク:</strong> ${item.riskIfIgnored}</p>
    </div>
  `).join('')}

  ${summary.riskWarnings.items.length > 0 ? `
    <h2>3. 放置リスク・注意領域</h2>
    ${summary.riskWarnings.items.map((item) => `
      <div class="risk-item">
        <strong>${item.name}</strong>（${item.category}）<br>
        ${item.description}
      </div>
    `).join('')}
  ` : ''}

  <h2>4. ロードマップ要約</h2>
  <div class="roadmap-section">
    <h4>今月</h4>
    <ul>${summary.roadmap.thisMonth.map((item) => `<li>${item}</li>`).join('')}</ul>
    <h4>来月</h4>
    <ul>${summary.roadmap.nextMonth.map((item) => `<li>${item}</li>`).join('')}</ul>
    <h4>今四半期</h4>
    <ul>${summary.roadmap.thisQuarter.map((item) => `<li>${item}</li>`).join('')}</ul>
  </div>

  <h2>5. 実行フェーズ</h2>
  <p>
    <strong>総チケット数:</strong> ${summary.ticketStatus.totalCount}件<br>
    <strong>今月対応予定:</strong> ${summary.ticketStatus.thisMonthCount}件
  </p>
  <p><strong>代表的なチケット:</strong></p>
  <ul>
    ${summary.ticketStatus.sampleTickets.map((t) => `
      <li>${t.title}（${t.category} / ${t.phase}）</li>
    `).join('')}
  </ul>

  <div class="ai-comment">
    <strong>AI副社長より</strong><br><br>
    ${summary.aiComment}
  </div>

  <div class="footer">
    Generated by AA-HUB | ${date}
  </div>
</body>
</html>
  `;
}
