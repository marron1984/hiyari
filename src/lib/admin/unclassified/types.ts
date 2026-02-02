/**
 * Unclassified Management 型定義
 *
 * Implementation Ticket 034: 未分類を現場で即解消できるUI + 一括付与
 */

import type { BackfillEntityType } from '../backfill/types';

// ========== 未分類アイテム ==========

export interface UnclassifiedItem {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  hint: string;        // 追加情報（推定補助用）
  suggestedBuId?: string | null;  // 推定候補 businessUnitId
  suggestedBuName?: string | null; // 推定候補 businessUnit名
}

// ========== 一覧レスポンス ==========

export interface UnclassifiedListResponse {
  items: UnclassifiedItem[];
  totalCount: number;
}

// ========== 一括付与リクエスト ==========

export interface UnclassifiedAssignRequest {
  entityType: BackfillEntityType;
  ids: string[];
  targetBusinessUnitId: string;
}

// ========== 一括付与レスポンス ==========

export interface UnclassifiedAssignResponse {
  affectedCount: number;
  skippedCount: number;
  eventId: string;  // 監査ログID
}

// ========== フィルタ ==========

export interface UnclassifiedListFilter {
  q?: string;
  limit?: number;
  offset?: number;
}

// ========== 権限チェック ==========

export function canAccessUnclassified(role: string): boolean {
  return ['admin', 'manager'].includes(role);
}
