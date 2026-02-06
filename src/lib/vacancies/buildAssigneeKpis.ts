/**
 * 空室問い合わせ担当者別KPI集計
 *
 * Ticket 082: 空室問い合わせ KPI（担当者別SLA/成約率）
 *
 * 指標（担当者別）:
 * - inquiriesAssigned: 担当割当された件数
 * - firstResponseOnTime: 初動SLA内で contacted に進んだ件数
 * - slaBreach: slaDueAt超過のまま stage=new の件数
 * - accepted: stage=accepted 件数
 * - acceptRate: accepted / inquiriesAssigned
 * - slaOkRate: firstResponseOnTime / inquiriesAssigned
 */

import type { Ticket, TicketEvent, ViewerContext } from '@/lib/tickets/types';

/**
 * 担当者別KPI行
 */
export interface AssigneeKpiRow {
  assigneeUserId: string;
  assigneeName?: string;
  inquiriesAssigned: number;
  slaBreach: number;
  slaOkRate: number;
  accepted: number;
  acceptRate: number;
}

/**
 * KPI集計オプション
 */
export interface AssigneeKpiOptions {
  /** 集計期間（日数、デフォルト7） */
  days?: number;
  /** 事業単位ID（managerスコープで絞る場合） */
  businessUnitId?: string;
}

/**
 * KPI集計結果
 */
export interface AssigneeKpiResult {
  rows: AssigneeKpiRow[];
  summary: {
    totalInquiries: number;
    totalSlaBreach: number;
    totalAccepted: number;
    overallSlaOkRate: number;
    overallAcceptRate: number;
  };
  period: {
    startDate: string;
    endDate: string;
    days: number;
  };
}

// デモユーザーマスタ（本番ではAPIから取得）
const DEMO_USERS: Record<string, string> = {
  user_001: '山田太郎',
  user_002: '佐藤次郎',
  user_003: '鈴木花子',
  user_004: '高橋三郎',
  user_005: '田中美咲',
};

/**
 * 期間の開始日を計算
 */
function getStartDate(days: number): Date {
  const start = new Date();
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);
  return start;
}

/**
 * SLA超過かどうかを判定
 */
function isSlaBreached(ticket: Ticket): boolean {
  if (!ticket.slaDueAt) return false;
  if (ticket.stage !== 'new') return false;
  return new Date(ticket.slaDueAt) < new Date();
}

/**
 * SLA内で contacted に進んだかを判定
 * （slaDueAt前に stage が new から contacted に変わった）
 */
function wasContactedOnTime(ticket: Ticket, events: TicketEvent[]): boolean {
  // 現在のステージがnewより先に進んでいる
  if (ticket.stage === 'new') return false;

  // slaDueAtがない場合は判定不可
  if (!ticket.slaDueAt) return true; // SLAなしの場合はOKとみなす

  const slaDue = new Date(ticket.slaDueAt);

  // stage_changeイベントでcontactedに変わった最初の時刻を探す
  const stageChangeEvents = events
    .filter(e => e.ticketId === ticket.id && e.action === 'stage_change')
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  // contactedへの遷移イベントを探す
  for (const event of stageChangeEvents) {
    // afterJson に新しいステージ情報が入っている
    const after = event.afterJson as { stage?: string } | null;
    if (after?.stage === 'contacted') {
      const eventTime = new Date(event.createdAt);
      return eventTime <= slaDue;
    }
  }

  // イベントが見つからない場合、stageが進んでいればOKとみなす
  // （遷移時刻が記録されていない場合のフォールバック）
  // 既に stage !== 'new' を確認済みなので、ここに到達した時点でstageは進んでいる
  return true;
}

/**
 * 担当者別KPIを集計
 */
export function buildAssigneeKpis(
  tickets: Ticket[],
  events: TicketEvent[],
  options: AssigneeKpiOptions = {}
): AssigneeKpiResult {
  const days = options.days ?? 7;
  const startDate = getStartDate(days);
  const endDate = new Date();

  // 期間内の vacancy_inquiry チケットをフィルタ
  let targetTickets = tickets.filter(t => {
    if (t.pipeline !== 'vacancy_inquiry') return false;
    if (t.relatedType !== 'vacancy_inquiry') return false;

    const created = new Date(t.createdAt);
    return created >= startDate && created <= endDate;
  });

  // 事業単位フィルタ
  if (options.businessUnitId) {
    targetTickets = targetTickets.filter(t => t.businessUnitId === options.businessUnitId);
  }

  // 担当者ごとに集計
  const assigneeMap = new Map<string, {
    inquiriesAssigned: number;
    slaBreach: number;
    contactedOnTime: number;
    accepted: number;
  }>();

  for (const ticket of targetTickets) {
    // 担当者なしはスキップ（集計対象外）
    if (!ticket.assigneeUserId) continue;

    const assigneeId = ticket.assigneeUserId;

    if (!assigneeMap.has(assigneeId)) {
      assigneeMap.set(assigneeId, {
        inquiriesAssigned: 0,
        slaBreach: 0,
        contactedOnTime: 0,
        accepted: 0,
      });
    }

    const data = assigneeMap.get(assigneeId)!;
    data.inquiriesAssigned++;

    // SLA超過チェック
    if (isSlaBreached(ticket)) {
      data.slaBreach++;
    }

    // SLA内でcontactedに進んだかチェック
    if (wasContactedOnTime(ticket, events)) {
      data.contactedOnTime++;
    }

    // 成約チェック
    if (ticket.stage === 'accepted') {
      data.accepted++;
    }
  }

  // 結果行を生成
  const rows: AssigneeKpiRow[] = [];
  let totalInquiries = 0;
  let totalSlaBreach = 0;
  let totalContactedOnTime = 0;
  let totalAccepted = 0;

  for (const [assigneeId, data] of assigneeMap.entries()) {
    const slaOkRate = data.inquiriesAssigned > 0
      ? data.contactedOnTime / data.inquiriesAssigned
      : 0;

    const acceptRate = data.inquiriesAssigned > 0
      ? data.accepted / data.inquiriesAssigned
      : 0;

    rows.push({
      assigneeUserId: assigneeId,
      assigneeName: DEMO_USERS[assigneeId] ?? assigneeId,
      inquiriesAssigned: data.inquiriesAssigned,
      slaBreach: data.slaBreach,
      slaOkRate: Math.round(slaOkRate * 100) / 100,
      accepted: data.accepted,
      acceptRate: Math.round(acceptRate * 100) / 100,
    });

    totalInquiries += data.inquiriesAssigned;
    totalSlaBreach += data.slaBreach;
    totalContactedOnTime += data.contactedOnTime;
    totalAccepted += data.accepted;
  }

  // 件数順にソート
  rows.sort((a, b) => b.inquiriesAssigned - a.inquiriesAssigned);

  // サマリー計算
  const overallSlaOkRate = totalInquiries > 0
    ? Math.round((totalContactedOnTime / totalInquiries) * 100) / 100
    : 0;

  const overallAcceptRate = totalInquiries > 0
    ? Math.round((totalAccepted / totalInquiries) * 100) / 100
    : 0;

  return {
    rows,
    summary: {
      totalInquiries,
      totalSlaBreach,
      totalAccepted,
      overallSlaOkRate,
      overallAcceptRate,
    },
    period: {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      days,
    },
  };
}
