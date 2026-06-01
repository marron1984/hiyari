/**
 * 開発チケット自動生成
 *
 * OSマップのデータから開発実行用のチケットを自動生成する
 * 「決まったこと」を即、実行レベルに落とす
 */

import {
  OS_FEATURES,
  OS_CATEGORIES,
  calculateCompositeScore,
  type OSFeature,
} from '@/config/osFeatures';

// チケットのフェーズ
export type TicketPhase = 'thisMonth' | 'nextMonth' | 'thisQuarter';

// チケットのステータス
export type TicketStatus = 'backlog' | 'ready' | 'in_progress' | 'done';

// 開発チケット型
export interface DevTicket {
  id: string;
  title: string;
  description: string;
  category: string;
  categoryName: string;
  priority: number; // 1-5
  compositeScore: number; // 経営優先度スコア（最大15）
  phase: TicketPhase;
  phaseName: string;
  relatedPath: string;
  status: TicketStatus;
  estimatedEffort: 'XS' | 'S' | 'M' | 'L' | 'XL';
  acceptanceCriteria: string[];
  assignee: 'AI' | 'human' | 'external' | 'unassigned';
  featureId: string;
  roi: number;
  risk: number;
}

// フェーズ設定
export const TICKET_PHASES: Record<TicketPhase, { name: string; color: string; bgColor: string }> = {
  thisMonth: { name: '今月', color: 'text-red-700', bgColor: 'bg-red-100' },
  nextMonth: { name: '来月', color: 'text-orange-700', bgColor: 'bg-orange-100' },
  thisQuarter: { name: '今四半期', color: 'text-blue-700', bgColor: 'bg-blue-100' },
};

// ステータス設定
export const TICKET_STATUS_CONFIG: Record<TicketStatus, { name: string; color: string; bgColor: string }> = {
  backlog: { name: 'バックログ', color: 'text-zinc-600', bgColor: 'bg-zinc-100' },
  ready: { name: '着手可能', color: 'text-green-700', bgColor: 'bg-green-100' },
  in_progress: { name: '進行中', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  done: { name: '完了', color: 'text-purple-700', bgColor: 'bg-purple-100' },
};

// 工数見積もり設定
export const EFFORT_CONFIG: Record<string, { name: string; days: string }> = {
  XS: { name: 'XS', days: '〜0.5日' },
  S: { name: 'S', days: '0.5〜1日' },
  M: { name: 'M', days: '1〜3日' },
  L: { name: 'L', days: '3〜5日' },
  XL: { name: 'XL', days: '5日以上' },
};

/**
 * フェーズを判定
 */
function determinePhase(feature: OSFeature): TicketPhase {
  const score = calculateCompositeScore(feature);
  const risk = feature.risk ?? 0;

  // 放置リスク5 or スコア14以上 → 今月
  if (risk >= 5 || score >= 14) return 'thisMonth';

  // 放置リスク4 or スコア12以上 → 来月
  if (risk >= 4 || score >= 12) return 'nextMonth';

  // それ以外 → 今四半期
  return 'thisQuarter';
}

/**
 * 工数見積もりを判定（仮ロジック）
 */
function estimateEffort(feature: OSFeature): 'XS' | 'S' | 'M' | 'L' | 'XL' {
  const category = feature.category;

  // カテゴリベースの簡易判定
  if (category === 'core') return 'L';
  if (category === 'risk' || category === 'finance') return 'M';
  if (category === 'communication' || category === 'operation') return 'S';

  return 'M';
}

/**
 * 受け入れ基準を生成
 */
function generateAcceptanceCriteria(feature: OSFeature): string[] {
  const criteria: string[] = [];

  // 基本条件
  criteria.push(`${feature.name}ページが正常に表示される`);

  // カテゴリ別の追加条件
  switch (feature.category) {
    case 'core':
      criteria.push('ダッシュボードからアクセス可能');
      criteria.push('権限に応じた表示制御が機能する');
      break;
    case 'document':
      criteria.push('文書の一覧表示・検索が可能');
      criteria.push('必要な文書をダウンロードできる');
      break;
    case 'people':
      criteria.push('管理者のみアクセス可能');
      criteria.push('データの追加・編集が可能');
      break;
    case 'communication':
      criteria.push('通知が正しく送信される');
      criteria.push('既読状態が記録される');
      break;
    case 'approval':
      criteria.push('申請フローが正常に動作');
      criteria.push('承認・却下が記録される');
      break;
    case 'operation':
      criteria.push('日常業務として利用可能');
      criteria.push('データが永続化される');
      break;
    case 'education':
      criteria.push('研修・資格情報が管理できる');
      criteria.push('期限のアラート機能');
      break;
    case 'risk':
      criteria.push('インシデント報告が可能');
      criteria.push('管理者へ通知される');
      break;
    case 'family':
      criteria.push('連絡履歴が記録される');
      criteria.push('検索・フィルタが機能する');
      break;
    case 'finance':
      criteria.push('金額計算が正確');
      criteria.push('未収・回収状況が可視化される');
      break;
  }

  // リスクが高い場合の追加条件
  if ((feature.risk ?? 0) >= 4) {
    criteria.push('エラー時の通知・ログ出力が実装されている');
  }

  return criteria;
}

/**
 * 担当者タイプを判定
 */
function determineAssignee(feature: OSFeature): 'AI' | 'human' | 'external' | 'unassigned' {
  if (feature.owner === 'AI') return 'AI';
  // その他は未割り当て（後から手動で設定）
  return 'unassigned';
}

/**
 * OSFeatureからDevTicketを生成
 */
function featureToTicket(feature: OSFeature): DevTicket {
  const category = OS_CATEGORIES.find((c) => c.id === feature.category);
  const phase = determinePhase(feature);

  return {
    id: `TICKET-${feature.id.toUpperCase()}`,
    title: `【${feature.name}】機能実装`,
    description: feature.description,
    category: feature.category,
    categoryName: category?.name ?? feature.category,
    priority: feature.priority ?? 3,
    compositeScore: calculateCompositeScore(feature),
    phase,
    phaseName: TICKET_PHASES[phase].name,
    relatedPath: feature.path,
    status: 'backlog',
    estimatedEffort: estimateEffort(feature),
    acceptanceCriteria: generateAcceptanceCriteria(feature),
    assignee: determineAssignee(feature),
    featureId: feature.id,
    roi: feature.roi ?? 0,
    risk: feature.risk ?? 0,
  };
}

/**
 * 未実装機能からチケットを自動生成
 */
export function generateTickets(): DevTicket[] {
  const plannedFeatures = OS_FEATURES.filter(
    (f) => f.status === 'planned' || f.status === 'developing'
  );

  return plannedFeatures
    .map(featureToTicket)
    .sort((a, b) => b.compositeScore - a.compositeScore);
}

/**
 * フェーズ別にチケットを取得
 */
export function getTicketsByPhase(phase: TicketPhase): DevTicket[] {
  return generateTickets().filter((t) => t.phase === phase);
}

/**
 * フェーズ別のチケット数を取得
 */
export function getTicketCountByPhase(): Record<TicketPhase, number> {
  const tickets = generateTickets();
  return {
    thisMonth: tickets.filter((t) => t.phase === 'thisMonth').length,
    nextMonth: tickets.filter((t) => t.phase === 'nextMonth').length,
    thisQuarter: tickets.filter((t) => t.phase === 'thisQuarter').length,
  };
}

/**
 * GitHub Issue形式でエクスポート
 */
export function exportToGitHubIssue(ticket: DevTicket): string {
  const lines = [
    `## ${ticket.title}`,
    '',
    `**カテゴリ**: ${ticket.categoryName}`,
    `**優先度**: ${ticket.priority}/5`,
    `**経営スコア**: ${ticket.compositeScore}/15`,
    `**フェーズ**: ${ticket.phaseName}`,
    `**工数見積**: ${EFFORT_CONFIG[ticket.estimatedEffort].name} (${EFFORT_CONFIG[ticket.estimatedEffort].days})`,
    '',
    '### 概要',
    ticket.description,
    '',
    '### 受け入れ基準',
    ...ticket.acceptanceCriteria.map((c) => `- [ ] ${c}`),
    '',
    '### 関連パス',
    `\`${ticket.relatedPath}\``,
    '',
    '---',
    `_Generated by DHPハブ OS Map_`,
  ];

  return lines.join('\n');
}

/**
 * Markdown形式でチケット一覧をエクスポート
 */
export function exportTicketsToMarkdown(tickets: DevTicket[]): string {
  const phases: TicketPhase[] = ['thisMonth', 'nextMonth', 'thisQuarter'];
  const lines: string[] = ['# 開発チケット一覧', ''];

  for (const phase of phases) {
    const phaseTickets = tickets.filter((t) => t.phase === phase);
    if (phaseTickets.length === 0) continue;

    lines.push(`## ${TICKET_PHASES[phase].name}（${phaseTickets.length}件）`, '');
    lines.push('| チケット | カテゴリ | スコア | 工数 |');
    lines.push('|----------|----------|--------|------|');

    for (const ticket of phaseTickets) {
      lines.push(
        `| ${ticket.title} | ${ticket.categoryName} | ${ticket.compositeScore}/15 | ${ticket.estimatedEffort} |`
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}
