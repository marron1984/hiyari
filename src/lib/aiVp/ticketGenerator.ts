/**
 * AI副社長 - チケット自動生成
 *
 * 事業別Top3のアクション候補を実行チケットに変換
 * fingerprint による冪等性保証
 *
 * Task 043: AI VP Business Top3 → Ticket Auto-generation
 */

import type { ViewerContext } from '@/lib/business/types';
import type { Ticket, TicketPriority, TicketCategory } from '@/lib/tickets/types';
import * as ticketsRepo from '@/lib/tickets/repo';
import type {
  ActionCandidate,
  ActionPriority,
  ActionCategory,
  BusinessTop3Summary,
} from './businessTop3';
import { getAllBusinessTop3, getAlertTop3, getCurrentWeekId } from './businessTop3';

// ========== 型定義 ==========

export interface GeneratedTicket {
  ticket: Ticket;
  action: ActionCandidate;
  isNew: boolean;  // true = 新規作成, false = 既存
}

export interface GenerationResult {
  weekId: string;
  generatedAt: string;
  created: GeneratedTicket[];
  skipped: GeneratedTicket[];  // fingerprint重複でスキップ
  totalProcessed: number;
}

export interface GenerationOptions {
  weekId?: string;        // 指定しない場合は現在週
  dryRun?: boolean;       // true の場合、実際には作成しない
  includeAlerts?: boolean; // 全社アラートも生成するか
  maxTicketsPerRun?: number; // 1回の実行で作成する最大数
}

// ========== 内部ストア（fingerprintの追跡用） ==========

// fingerprint → ticketId のマッピング（インメモリ実装）
const fingerprintStore = new Map<string, string>();

// ========== ヘルパー関数 ==========

/**
 * ActionPriority → TicketPriority への変換
 */
function mapPriority(actionPriority: ActionPriority): TicketPriority {
  switch (actionPriority) {
    case 'urgent':
      return 'urgent';
    case 'high':
      return 'high';
    case 'normal':
    default:
      return 'normal';
  }
}

/**
 * ActionCategory → TicketCategory への変換
 */
function mapCategory(actionCategory: ActionCategory): TicketCategory {
  switch (actionCategory) {
    case 'ops':
      return 'ops';
    case 'facility':
      return 'facility';
    case 'compliance':
      return 'general';  // complianceはgeneralにマップ
    case 'hr':
      return 'hr';
    case 'general':
    default:
      return 'general';
  }
}

/**
 * 期限日を計算
 */
function calculateDueDate(dueDays: number): string {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + dueDays);
  return dueDate.toISOString();
}

/**
 * fingerprint でチケットを検索
 */
export function findTicketByFingerprint(fingerprint: string): Ticket | null {
  // まずストアから確認
  const ticketId = fingerprintStore.get(fingerprint);
  if (ticketId) {
    const ticket = ticketsRepo.getTicketByIdInternal(ticketId);
    if (ticket && !['closed', 'archived'].includes(ticket.status)) {
      return ticket;
    }
  }

  // ストアにない場合、全チケットを検索
  const adminViewer: ViewerContext = { userId: 'system', role: 'admin' };
  const { items } = ticketsRepo.listTickets({}, adminViewer);
  const found = items.find(
    (t) =>
      t.relatedType === 'ai_vp' &&
      t.relatedId === fingerprint &&
      !['closed', 'archived'].includes(t.status)
  );

  if (found) {
    fingerprintStore.set(fingerprint, found.id);
  }

  return found ?? null;
}

/**
 * ActionCandidate からチケットを生成
 */
function generateTicketFromAction(
  action: ActionCandidate,
  actorUserId: string = 'system_ai_vp'
): Ticket {
  const ticket = ticketsRepo.createTicket(
    {
      title: `[AI-VP] ${action.title}`,
      description: `${action.reason}\n\n詳細: ${action.url}\n\n---\n自動生成元: AI副社長 事業別Top3\nfingerprint: ${action.fingerprint}`,
      priority: mapPriority(action.defaultPriority),
      category: mapCategory(action.defaultCategory),
      businessUnitId: action.businessUnitId === 'global' ? null : action.businessUnitId,
      dueAt: calculateDueDate(action.defaultDueDays),
      relatedType: 'ai_vp',
      relatedId: action.fingerprint,
      tags: ['ai_vp_generated', action.domain, action.templateKey],
    },
    actorUserId
  );

  // fingerprint をストアに登録
  fingerprintStore.set(action.fingerprint, ticket.id);

  return ticket;
}

// ========== メイン機能 ==========

/**
 * 事業別Top3からチケットを生成
 */
export function generateTicketsFromTop3(
  viewer: ViewerContext,
  options: GenerationOptions = {}
): GenerationResult {
  const weekId = options.weekId ?? getCurrentWeekId();
  const dryRun = options.dryRun ?? false;
  const includeAlerts = options.includeAlerts ?? true;
  const maxTickets = options.maxTicketsPerRun ?? 10;

  const created: GeneratedTicket[] = [];
  const skipped: GeneratedTicket[] = [];

  // 事業別Top3を取得
  const summary = getAllBusinessTop3(viewer);

  // 全アクションを収集（スコア順）
  const allActions: ActionCandidate[] = [];

  for (const bu of summary.businessUnits) {
    allActions.push(...bu.actions);
  }

  // 全社アラートも追加
  if (includeAlerts) {
    const alertActions = getAlertTop3(viewer);
    allActions.push(...alertActions);
  }

  // スコア順にソート
  allActions.sort((a, b) => b.score - a.score);

  // 最大数まで処理
  const actionsToProcess = allActions.slice(0, maxTickets);

  for (const action of actionsToProcess) {
    // fingerprint で既存チケットをチェック
    const existingTicket = findTicketByFingerprint(action.fingerprint);

    if (existingTicket) {
      // 既存のチケットがある場合はスキップ
      skipped.push({
        ticket: existingTicket,
        action,
        isNew: false,
      });
      continue;
    }

    // dryRun でなければチケットを作成
    if (!dryRun) {
      const ticket = generateTicketFromAction(action);
      created.push({
        ticket,
        action,
        isNew: true,
      });
    } else {
      // dryRun の場合は仮のチケット情報を返す
      created.push({
        ticket: {
          id: `dryrun_${action.fingerprint}`,
          title: `[AI-VP] ${action.title}`,
          description: action.reason,
          status: 'open',
          priority: mapPriority(action.defaultPriority),
          category: mapCategory(action.defaultCategory),
          businessUnitId: action.businessUnitId === 'global' ? null : action.businessUnitId,
          requesterUserId: 'system_ai_vp',
          assigneeUserId: null,
          assigneeUserName: null,
          assigneeRole: null,
          dueAt: calculateDueDate(action.defaultDueDays),
          resolvedAt: null,
          closedAt: null,
          tagsJson: ['ai_vp_generated', action.domain, action.templateKey],
          relatedType: 'ai_vp',
          relatedId: action.fingerprint,
          location: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as Ticket,
        action,
        isNew: true,
      });
    }
  }

  return {
    weekId,
    generatedAt: new Date().toISOString(),
    created,
    skipped,
    totalProcessed: actionsToProcess.length,
  };
}

/**
 * 今週生成されたAI-VPチケットを取得
 */
export function getGeneratedTicketsThisWeek(
  viewer: ViewerContext
): Ticket[] {
  const weekId = getCurrentWeekId();
  const { items } = ticketsRepo.listTickets({}, viewer);

  return items.filter(
    (t) =>
      t.relatedType === 'ai_vp' &&
      t.relatedId?.includes(weekId)
  );
}

/**
 * fingerprint ストアをクリア（テスト用）
 */
export function clearFingerprintStore(): void {
  fingerprintStore.clear();
}

/**
 * 生成レポートをテキスト形式で出力
 */
export function formatGenerationReport(result: GenerationResult): string {
  const lines: string[] = [];

  lines.push('========================================');
  lines.push(`AI副社長 チケット自動生成レポート`);
  lines.push(`週: ${result.weekId}`);
  lines.push(`生成日時: ${result.generatedAt}`);
  lines.push('========================================');
  lines.push('');

  lines.push(`処理件数: ${result.totalProcessed}`);
  lines.push(`新規作成: ${result.created.length}`);
  lines.push(`スキップ: ${result.skipped.length}`);
  lines.push('');

  if (result.created.length > 0) {
    lines.push('--- 新規作成チケット ---');
    for (const item of result.created) {
      lines.push(`  - ${item.ticket.title}`);
      lines.push(`    優先度: ${item.ticket.priority} / カテゴリ: ${item.ticket.category}`);
      lines.push(`    事業: ${item.action.businessUnitName}`);
      lines.push(`    期限: ${item.ticket.dueAt}`);
      lines.push('');
    }
  }

  if (result.skipped.length > 0) {
    lines.push('--- スキップ（既存チケットあり） ---');
    for (const item of result.skipped) {
      lines.push(`  - ${item.action.title}`);
      lines.push(`    既存チケット: ${item.ticket.id}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}
