/**
 * AI副社長 - チケット自動生成
 *
 * 事業別Top3のアクション候補を実行チケットに変換
 * fingerprint による冪等性保証
 *
 * Task 043: AI VP Business Top3 → Ticket Auto-generation
 * Task 058: 自動割当連動 + 未割当アラート/通知
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

// Task 058: 未割当アラート/通知
import { createAlert } from '@/lib/alerts/repo';
import { getUnassignedQueue } from '@/lib/assignment/autoAssign';

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
  // Task 058: 未割当追跡
  unassignedCount: number;
  unassignedAlertIds: string[];
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
 * Task 058: 未割当時のアラート/通知も作成
 */
function generateTicketFromAction(
  action: ActionCandidate,
  actorUserId: string = 'system_ai_vp'
): { ticket: Ticket; isAssigned: boolean; alertId: string | null } {
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

  // Task 058: 自動割当チェック
  const isAssigned = ticket.assigneeUserId !== null;
  let alertId: string | null = null;

  if (!isAssigned) {
    // 未割当アラートを作成
    alertId = createUnassignedAiVpAlert(ticket, action);
    // 未割当通知を作成（manager/adminへ）
    createUnassignedAiVpNotification(ticket, action);
  }

  return { ticket, isAssigned, alertId };
}

/**
 * Task 058: 未割当AI-VPチケットのアラートを作成
 */
function createUnassignedAiVpAlert(ticket: Ticket, action: ActionCandidate): string {
  const fingerprint = `unassigned:ai_vp:${ticket.id}`;
  const businessUnitId = action.businessUnitId === 'global' ? null : action.businessUnitId;

  const result = createAlert({
    type: 'unassigned_item',
    sourceId: ticket.id,
    title: '未割当チケットが発生（AI副社長）',
    message: `チケット「${ticket.title}」が自動生成されましたが、担当者を割り当てできませんでした。\n\n事業単位ID: ${businessUnitId ?? '未設定'}\n事業名: ${action.businessUnitName}\n理由: businessUnitに責任者が設定されていないか、組織マネージャーが見つかりませんでした。`,
    severity: 'warning',
    fingerprint,
    meta: {
      ticketId: ticket.id,
      ticketTitle: ticket.title,
      businessUnitId,
      businessUnitName: action.businessUnitName,
      actionFingerprint: action.fingerprint,
      generatedBy: 'ai_vp',
      url: `/dashboard/tickets?relatedType=ai_vp&assigned=false`,
    },
  });

  return result.alert?.id ?? '';
}

/**
 * Task 058: 未割当AI-VPチケットの通知を作成（manager/adminへ）
 *
 * 注: notifications/repoはサーバーサイドのみで使用可能（fs/pathを使用）
 * そのため動的インポートを使用
 */
async function createUnassignedAiVpNotification(ticket: Ticket, action: ActionCandidate): Promise<void> {
  // サーバーサイドのみで実行（クライアントでは何もしない）
  if (typeof window !== 'undefined') {
    return;
  }

  try {
    const fingerprint = `notif:unassigned:ai_vp:${ticket.id}`;
    const businessUnitId = action.businessUnitId === 'global' ? null : action.businessUnitId;

    // 動的インポートでサーバーサイドモジュールを読み込み
    const { create: createNotification } = await import('@/lib/notifications/repo');

    // manager/admin向け通知を作成
    createNotification({
      tenantId: 'default',
      userId: 'admin',  // 管理者向け
      type: 'system',
      severity: 'warning',
      title: '未割当チケット（AI副社長生成）',
      message: `「${ticket.title}」の担当者を割り当ててください。事業: ${action.businessUnitName}`,
      url: `/dashboard/tickets/${ticket.id}`,
      fingerprint,
    });
  } catch {
    // クライアントサイドでのインポート失敗は無視
    console.warn('[AI-VP] Notification creation skipped (client-side)');
  }
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

  // Task 058: 未割当追跡
  let unassignedCount = 0;
  const unassignedAlertIds: string[] = [];

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
      const result = generateTicketFromAction(action);
      created.push({
        ticket: result.ticket,
        action,
        isNew: true,
      });

      // Task 058: 未割当追跡
      if (!result.isAssigned) {
        unassignedCount++;
        if (result.alertId) {
          unassignedAlertIds.push(result.alertId);
        }
      }
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
    unassignedCount,
    unassignedAlertIds,
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
  // Task 058: 未割当件数
  lines.push(`未割当: ${result.unassignedCount}`);
  lines.push('');

  if (result.created.length > 0) {
    lines.push('--- 新規作成チケット ---');
    for (const item of result.created) {
      const assigneeStatus = item.ticket.assigneeUserId
        ? `担当: ${item.ticket.assigneeUserName}`
        : '【未割当】';
      lines.push(`  - ${item.ticket.title}`);
      lines.push(`    優先度: ${item.ticket.priority} / カテゴリ: ${item.ticket.category}`);
      lines.push(`    事業: ${item.action.businessUnitName}`);
      lines.push(`    期限: ${item.ticket.dueAt}`);
      lines.push(`    ${assigneeStatus}`);
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

  // Task 058: 未割当アラート
  if (result.unassignedCount > 0) {
    lines.push('--- 未割当チケット（要対応） ---');
    lines.push(`  ${result.unassignedCount}件のチケットに担当者を割り当てできませんでした。`);
    lines.push(`  アラートID: ${result.unassignedAlertIds.join(', ')}`);
    lines.push(`  対応URL: /dashboard/tickets?relatedType=ai_vp&assigned=false`);
    lines.push('');
  }

  return lines.join('\n');
}
