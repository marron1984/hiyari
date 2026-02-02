/**
 * チケット管理 型定義
 *
 * 問い合わせ・対応チケットの統一管理
 */

import type { AppRole } from '@/config/appRoles';

/**
 * チケットステータス
 */
export type TicketStatus =
  | 'open'
  | 'in_progress'
  | 'waiting'
  | 'resolved'
  | 'closed'
  | 'archived';

/**
 * チケット優先度
 */
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

/**
 * チケットカテゴリ
 */
export type TicketCategory =
  | 'general'
  | 'ops'
  | 'it'
  | 'facility'
  | 'client'
  | 'finance'
  | 'hr';

/**
 * チケット関連タイプ
 */
export type TicketRelatedType =
  | 'handover'
  | 'incident'
  | 'approval'
  | 'alert'
  | null;

/**
 * チケットイベントアクション
 */
export type TicketEventAction =
  | 'create'
  | 'assign'
  | 'unassign'
  | 'status_change'
  | 'priority_change'
  | 'category_change'
  | 'comment'
  | 'resolve'
  | 'close'
  | 'reopen'
  | 'update';

/**
 * チケット
 */
export interface Ticket {
  id: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  businessUnitId: string | null;      // Task 030: 事業単位スコープ
  requesterUserId: string;
  requesterUserName?: string;
  assigneeUserId: string | null;
  assigneeUserName?: string | null;
  assigneeRole: AppRole | null;
  dueAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  tagsJson: string[] | null;
  relatedType: TicketRelatedType;
  relatedId: string | null;
  location: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * チケットコメント
 */
export interface TicketComment {
  id: string;
  ticketId: string;
  userId: string;
  userName?: string;
  message: string;
  createdAt: string;
}

/**
 * チケットイベント（監査ログ）
 */
export interface TicketEvent {
  id: string;
  ticketId: string;
  actorUserId: string | null;
  actorUserName?: string | null;
  action: TicketEventAction;
  beforeJson: Record<string, unknown> | null;
  afterJson: Record<string, unknown> | null;
  createdAt: string;
  note: string | null;
}

/**
 * チケットウォッチャー
 */
export interface TicketWatcher {
  id: string;
  ticketId: string;
  userId: string;
  createdAt: string;
}

/**
 * チケット作成リクエスト
 */
export interface CreateTicketRequest {
  title: string;
  description: string;
  priority?: TicketPriority;
  category?: TicketCategory;
  businessUnitId?: string | null;     // Task 030: 事業単位スコープ
  dueAt?: string | null;
  tags?: string[] | null;
  relatedType?: TicketRelatedType;
  relatedId?: string | null;
  location?: string | null;
}

/**
 * チケット更新リクエスト
 */
export interface UpdateTicketRequest {
  title?: string;
  description?: string;
  priority?: TicketPriority;
  category?: TicketCategory;
  businessUnitId?: string | null;  // Task 033: backfill用
  dueAt?: string | null;
  tags?: string[] | null;
  location?: string | null;
}

/**
 * チケット一覧フィルタ
 */
export interface TicketListFilter {
  status?: TicketStatus;
  priority?: TicketPriority;
  category?: TicketCategory;
  businessUnitId?: string | null;     // Task 030: 事業単位スコープ
  q?: string;
  my?: 'assigned' | 'requested' | 'watching';
  overdue?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * チケット統計
 */
export interface TicketStats {
  open: number;
  urgentOpen: number;
  overdue: number;
  myAssignedOpen: number;
  myRequestedOpen: number;
  inProgress: number;
  waiting: number;
  resolvedThisWeek: number;
  createdThisWeek: number;
}

/**
 * ビューアーコンテキスト（RBAC用）
 */
export interface ViewerContext {
  userId: string;
  role: AppRole;
}

/**
 * ステータス表示設定
 */
export const TICKET_STATUS_CONFIG: Record<
  TicketStatus,
  { label: string; color: string; bg: string; border: string }
> = {
  open: {
    label: '未着手',
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
  },
  in_progress: {
    label: '対応中',
    color: 'text-yellow-700',
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
  },
  waiting: {
    label: '待機中',
    color: 'text-purple-700',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
  },
  resolved: {
    label: '解決済',
    color: 'text-green-700',
    bg: 'bg-green-50',
    border: 'border-green-200',
  },
  closed: {
    label: 'クローズ',
    color: 'text-zinc-700',
    bg: 'bg-zinc-100',
    border: 'border-zinc-300',
  },
  archived: {
    label: 'アーカイブ',
    color: 'text-zinc-500',
    bg: 'bg-zinc-50',
    border: 'border-zinc-200',
  },
};

/**
 * 優先度表示設定
 */
export const TICKET_PRIORITY_CONFIG: Record<
  TicketPriority,
  { label: string; color: string; bg: string; border: string; emoji: string }
> = {
  urgent: {
    label: '緊急',
    color: 'text-red-700',
    bg: 'bg-red-50',
    border: 'border-red-200',
    emoji: '🔴',
  },
  high: {
    label: '高',
    color: 'text-orange-700',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    emoji: '🟠',
  },
  normal: {
    label: '通常',
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    emoji: '🔵',
  },
  low: {
    label: '低',
    color: 'text-zinc-600',
    bg: 'bg-zinc-50',
    border: 'border-zinc-200',
    emoji: '⚪',
  },
};

/**
 * カテゴリ表示設定
 */
export const TICKET_CATEGORY_CONFIG: Record<
  TicketCategory,
  { label: string; icon: string }
> = {
  general: { label: '一般', icon: '📋' },
  ops: { label: '業務', icon: '⚙️' },
  it: { label: 'IT', icon: '💻' },
  facility: { label: '設備', icon: '🏢' },
  client: { label: '利用者対応', icon: '👤' },
  finance: { label: '財務', icon: '💰' },
  hr: { label: '人事', icon: '👥' },
};

/**
 * イベントアクション表示設定
 */
export const TICKET_EVENT_ACTION_LABELS: Record<TicketEventAction, string> = {
  create: '作成',
  assign: '担当割当',
  unassign: '担当解除',
  status_change: 'ステータス変更',
  priority_change: '優先度変更',
  category_change: 'カテゴリ変更',
  comment: 'コメント',
  resolve: '解決',
  close: 'クローズ',
  reopen: '再オープン',
  update: '更新',
};

/**
 * 権限チェック：チケットを閲覧できるか
 */
export function canViewTicket(
  ticket: Ticket,
  viewer: ViewerContext
): boolean {
  // manager以上は全て閲覧可
  if (['manager', 'executive', 'admin', 'auditor'].includes(viewer.role)) {
    return true;
  }
  // staff/leaderは関係者のみ
  return (
    ticket.requesterUserId === viewer.userId ||
    ticket.assigneeUserId === viewer.userId
  );
}

/**
 * 権限チェック：チケットを更新できるか
 */
export function canUpdateTicket(
  ticket: Ticket,
  viewer: ViewerContext
): boolean {
  // manager以上は全て更新可
  if (['manager', 'executive', 'admin'].includes(viewer.role)) {
    return true;
  }
  // assigneeは更新可
  if (ticket.assigneeUserId === viewer.userId) {
    return true;
  }
  // requesterは限定的に更新可（タイトル、説明など）
  if (ticket.requesterUserId === viewer.userId) {
    return true;
  }
  return false;
}

/**
 * 権限チェック：担当を割り当てできるか
 */
export function canAssignTicket(viewer: ViewerContext): boolean {
  return ['manager', 'executive', 'admin'].includes(viewer.role);
}

/**
 * 権限チェック：強制クローズ/アーカイブできるか
 */
export function canForceCloseTicket(viewer: ViewerContext): boolean {
  return ['manager', 'executive', 'admin'].includes(viewer.role);
}
