/**
 * アラート定数
 *
 * Implementation Ticket 038: 未分類アラート type 名の統一
 *
 * 正式名称: business_scope_unclassified
 * レガシー名: unclassified_scope（後方互換のため読み取り可能）
 */

// ========== 未分類スコープアラート ==========

/** 正式な未分類スコープアラートtype */
export const ALERT_TYPE_BUSINESS_SCOPE_UNCLASSIFIED = 'business_scope_unclassified' as const;

/** レガシー未分類スコープアラートtype（後方互換） */
export const ALERT_TYPE_UNCLASSIFIED_SCOPE_LEGACY = 'unclassified_scope' as const;

/** 未分類アラートとして扱うtypeの配列（クエリ用） */
export const UNCLASSIFIED_ALERT_TYPES = [
  ALERT_TYPE_BUSINESS_SCOPE_UNCLASSIFIED,
  ALERT_TYPE_UNCLASSIFIED_SCOPE_LEGACY,
] as const;

/**
 * 指定されたtypeが未分類アラートかどうかを判定
 */
export function isUnclassifiedAlertType(type: string): boolean {
  return UNCLASSIFIED_ALERT_TYPES.includes(type as any);
}

// ========== 通知type ==========

/** 正式な未分類スコープ通知type */
export const NOTIFICATION_TYPE_BUSINESS_SCOPE_UNCLASSIFIED = 'business_scope_unclassified' as const;

/** レガシー未分類スコープ通知type（後方互換） */
export const NOTIFICATION_TYPE_UNCLASSIFIED_SCOPE_LEGACY = 'unclassified_scope' as const;

/** 未分類通知として扱うtypeの配列（クエリ用） */
export const UNCLASSIFIED_NOTIFICATION_TYPES = [
  NOTIFICATION_TYPE_BUSINESS_SCOPE_UNCLASSIFIED,
  NOTIFICATION_TYPE_UNCLASSIFIED_SCOPE_LEGACY,
] as const;

/**
 * 指定されたtypeが未分類通知かどうかを判定
 */
export function isUnclassifiedNotificationType(type: string): boolean {
  return UNCLASSIFIED_NOTIFICATION_TYPES.includes(type as any);
}
