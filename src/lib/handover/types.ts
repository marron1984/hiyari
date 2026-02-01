/**
 * 申し送り（Handover）型定義
 */

import type { AppRole } from '@/config/appRoles';

/**
 * 優先度
 */
export type HandoverPriority = 'normal' | 'urgent';

/**
 * ステータス
 */
export type HandoverStatus = 'open' | 'resolved' | 'archived';

/**
 * シフト区分
 */
export type HandoverShift = 'day' | 'evening' | 'night';

/**
 * 申し送りアイテム
 */
export interface HandoverItem {
  id: string;
  title: string;
  body: string;
  priority: HandoverPriority;
  status: HandoverStatus;
  createdByUserId: string;
  createdByUserName?: string;
  targetRolesJson: AppRole[] | null;
  targetUserIdsJson: string[] | null;
  dueAt: string | null;
  shift: HandoverShift | null;
  tagsJson: string[] | null;
  relatedType: string | null;
  relatedId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 申し送りコメント
 */
export interface HandoverComment {
  id: string;
  itemId: string;
  userId: string;
  userName?: string;
  message: string;
  createdAt: string;
}

/**
 * 申し送り作成リクエスト
 */
export interface CreateHandoverRequest {
  title: string;
  body: string;
  priority?: HandoverPriority;
  targetRoles?: AppRole[];
  targetUserIds?: string[];
  dueAt?: string;
  shift?: HandoverShift;
  tags?: string[];
  relatedType?: string;
  relatedId?: string;
}

/**
 * 申し送り更新リクエスト
 */
export interface UpdateHandoverRequest {
  title?: string;
  body?: string;
  priority?: HandoverPriority;
  targetRoles?: AppRole[] | null;
  targetUserIds?: string[] | null;
  dueAt?: string | null;
  shift?: HandoverShift | null;
  tags?: string[] | null;
}

/**
 * 申し送りフィルタ
 */
export interface HandoverFilter {
  status?: HandoverStatus;
  priority?: HandoverPriority;
  shift?: HandoverShift;
  tag?: string;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

/**
 * 一覧表示用アイテム（既読情報付き）
 */
export interface HandoverListItem extends HandoverItem {
  isRead?: boolean;
  commentCount?: number;
}

/**
 * 既読統計
 */
export interface HandoverReadStats {
  itemId: string;
  targetCount: number;
  readCount: number;
  unreadCount: number;
  readRate: number;
  unreadUsers?: { id: string; name: string }[];
}
