/**
 * 周知事項の型定義
 */

import type { AppRole } from '@/config/appRoles';

/**
 * 周知事項のステータス
 */
export type AnnouncementStatus = 'draft' | 'published' | 'archived';

/**
 * 周知事項の優先度
 */
export type AnnouncementPriority = 'low' | 'normal' | 'high' | 'urgent';

/**
 * 周知事項
 */
export interface Announcement {
  id: string;
  title: string;
  content: string;
  status: AnnouncementStatus;
  priority: AnnouncementPriority;
  // 対象設定
  targetRoles: AppRole[];
  targetUserIds?: string[];
  targetBranchIds?: string[];
  // 日時
  publishedAt?: string;
  expiresAt?: string; // 期限（未読アラート用）
  ackDueAt?: string; // 確認期限（将来用）
  createdAt: string;
  updatedAt: string;
  // 作成者
  authorId: string;
  authorName: string;
}

/**
 * 周知事項一覧アイテム（既読情報付き）
 */
export interface AnnouncementListItem extends Announcement {
  isRead?: boolean;
}

/**
 * 周知事項作成リクエスト
 */
export interface CreateAnnouncementRequest {
  title: string;
  content: string;
  priority?: AnnouncementPriority;
  targetRoles: AppRole[];
  targetUserIds?: string[];
  targetBranchIds?: string[];
  publishedAt?: string;
  expiresAt?: string;
}

/**
 * 周知事項フィルタ
 */
export interface AnnouncementFilter {
  status?: AnnouncementStatus;
  priority?: AnnouncementPriority;
  onlyUnread?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * 周知事項一覧レスポンス
 */
export interface AnnouncementListResponse {
  announcements: AnnouncementListItem[];
  total: number;
  unreadCount?: number;
}
