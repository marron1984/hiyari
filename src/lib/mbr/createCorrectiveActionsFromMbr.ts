/**
 * MBR → 改善タスク自動起票
 *
 * Ticket 128: MBRのnextMonthFocusを是正措置として自動起票
 *
 * - corrective_actions へ sourceType='mbr_focus' で起票
 * - sourceId で冪等（同一月+同一フォーカスの重複を防ぐ）
 * - autoAssign で担当者を自動割当
 * - 担当者へ通知
 */

import { create as createCorrectiveAction, listCorrectiveActions } from '@/lib/correctiveActions/repo';
import type { CreateCorrectiveActionRequest, ViewerContext } from '@/lib/correctiveActions/types';
import { create as createNotification } from '@/lib/notifications/repo';
import type { Mbr } from './types';

// ======== ヘルパー ========

/**
 * フォーカスアイテムから冪等なIDを生成
 * sourceId: `mbr:{YYYY-MM}:{hash}`
 */
function buildSourceId(month: string, focusItem: string): string {
  // 簡易ハッシュ: 文字列の各コードポイントを加算
  let hash = 0;
  for (let i = 0; i < focusItem.length; i++) {
    const char = focusItem.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  // 正の整数に変換
  const positiveHash = Math.abs(hash).toString(36);
  return `mbr:${month}:${positiveHash}`;
}

/**
 * 翌月末を計算
 */
function getNextMonthEnd(month: string): string {
  const [year, mon] = month.split('-').map(Number);
  // 翌月 = mon + 1, 翌々月の0日 = 翌月の最終日
  const nextNextMonth = new Date(year, mon + 1, 0);
  return nextNextMonth.toISOString().split('T')[0] + 'T23:59:59Z';
}

/**
 * 既存の open な是正措置と重複するか確認
 */
function isDuplicate(sourceId: string): boolean {
  const viewer: ViewerContext = { userId: 'system', role: 'admin' };
  const { items } = listCorrectiveActions(viewer, {
    sourceType: 'mbr_focus',
    limit: 1000,
  });
  return items.some(
    (ca) => ca.sourceId === sourceId && ['open', 'in_progress', 'blocked', 'pending_review'].includes(ca.status)
  );
}

// ======== 起票結果 ========

export interface CreateActionsResult {
  createdCount: number;
  skippedCount: number;
  created: Array<{ id: string; title: string; sourceId: string }>;
  skipped: Array<{ sourceId: string; reason: string }>;
}

// ======== メイン関数 ========

/**
 * MBRの nextMonthFocus から是正措置を自動起票
 *
 * @param mbr 対象のMBR
 * @param actorUserId 起票者（通常はシステムまたはadmin）
 * @returns 起票結果
 */
export function createCorrectiveActionsFromMbr(
  mbr: Mbr,
  actorUserId: string
): CreateActionsResult {
  const result: CreateActionsResult = {
    createdCount: 0,
    skippedCount: 0,
    created: [],
    skipped: [],
  };

  // 最大5件
  const focusItems = mbr.sections.nextMonthFocus.slice(0, 5);

  for (const focusItem of focusItems) {
    const sourceId = buildSourceId(mbr.month, focusItem);

    // 冪等チェック: 同一sourceIdでopen/in_progressがあればスキップ
    if (isDuplicate(sourceId)) {
      result.skippedCount++;
      result.skipped.push({ sourceId, reason: '既に起票済み' });
      continue;
    }

    // 起票
    const title = `[MBR改善] ${mbr.month} ${focusItem}`;
    const description = buildDescription(mbr, focusItem);
    const dueAt = getNextMonthEnd(mbr.month);

    const request: CreateCorrectiveActionRequest = {
      title,
      description,
      severity: 'major',
      sourceType: 'mbr_focus',
      sourceId,
      businessUnitId: null, // 全体改善
      rootCause: `MBR ${mbr.month} で検出された改善ポイント`,
      actionPlan: focusItem,
      dueAt,
    };

    const ca = createCorrectiveAction(request, actorUserId);

    result.createdCount++;
    result.created.push({ id: ca.id, title: ca.title, sourceId });

    // 担当者への通知
    if (ca.ownerUserId) {
      notifyAssignee(ca.ownerUserId, ca.id, ca.title, mbr.month);
    }
  }

  return result;
}

/**
 * 是正措置の説明文を生成
 */
function buildDescription(mbr: Mbr, focusItem: string): string {
  const lines: string[] = [];

  lines.push(`MBR ${mbr.month} の月次改善レビューで検出された改善フォーカスです。`);
  lines.push('');

  // 改善根拠
  lines.push('【改善根拠】');
  if (mbr.sections.funnel.slaBreachRate > 20) {
    lines.push(`- SLA超過率: ${mbr.sections.funnel.slaBreachRate}% (基準: 20%以下)`);
  }
  if (mbr.sections.sales.completionRate < 60) {
    lines.push(`- 営業タスク完了率: ${mbr.sections.sales.completionRate}% (基準: 60%以上)`);
  }
  if (mbr.sections.ops.failedRunCount > 0) {
    lines.push(`- 運用失敗: ${mbr.sections.ops.failedRunCount}回`);
  }
  if (mbr.sections.suggestions.openCount > 0) {
    lines.push(`- 未対応提案: ${mbr.sections.suggestions.openCount}件`);
  }
  lines.push('');

  // 関連リンク
  lines.push('【関連リンク】');
  lines.push('- /dashboard/mbr');
  lines.push('- /dashboard/vacancy');
  lines.push('- /dashboard/leads/suggestions');

  return lines.join('\n');
}

/**
 * 担当者へ通知
 */
function notifyAssignee(
  userId: string,
  correctiveActionId: string,
  title: string,
  month: string
): void {
  try {
    createNotification({
      tenantId: 'default',
      userId,
      type: 'mbr_action_created',
      severity: 'info',
      title: `MBR改善タスクが割り当てられました`,
      message: `${title} (${month})`,
      url: `/dashboard/corrective-actions`,
      fingerprint: `notif:mbr_action:${correctiveActionId}`,
    });
  } catch (error) {
    console.error('[MBR] Failed to notify assignee:', error);
  }
}

/**
 * テスト用: sourceIdビルダーをエクスポート
 */
export { buildSourceId };
