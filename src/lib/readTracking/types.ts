/**
 * 既読管理の型定義
 *
 * 汎用的な既読管理（Announcements, Docs, Training など）
 */

/**
 * エンティティタイプ
 */
export type EntityType = 'announcement' | 'document' | 'training' | 'handover';

/**
 * 既読レシート
 */
export interface ReadReceipt {
  id: string;
  userId: string;
  entityType: EntityType;
  entityId: string;
  readAt: string;
  createdAt: string;
}

/**
 * 既読作成リクエスト
 */
export interface MarkReadRequest {
  entityType: EntityType;
  entityId: string;
}

/**
 * 一括既読ステータスリクエスト
 */
export interface BulkReadStatusRequest {
  entityType: EntityType;
  entityIds: string[];
}

/**
 * 一括既読ステータスレスポンス
 */
export interface BulkReadStatusResponse {
  readEntityIds: string[];
}

/**
 * 既読統計
 */
export interface ReadStats {
  entityId: string;
  targetCount: number;
  readCount: number;
  unreadCount: number;
  readRate: number; // 0-100
}

/**
 * 未読者情報（管理者向け）
 */
export interface UnreadUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

/**
 * 既読統計詳細（未読者一覧付き）
 */
export interface ReadStatsWithUnreadUsers extends ReadStats {
  unreadUsers: UnreadUser[];
}
