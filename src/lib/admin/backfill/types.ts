/**
 * Scope Backfill 型定義
 *
 * Implementation Ticket 032: businessUnitId 未分類データの一括付与
 */

// ========== エンティティタイプ ==========

export type BackfillEntityType = 'tickets' | 'repairs' | 'correctiveActions' | 'complaints';

export const ENTITY_TYPE_CONFIG: Record<BackfillEntityType, { label: string; description: string }> = {
  tickets: { label: 'チケット', description: '問い合わせ・対応チケット' },
  repairs: { label: '修繕', description: '設備故障・修繕依頼' },
  correctiveActions: { label: '是正措置', description: '問題の根本原因分析と改善措置' },
  complaints: { label: 'クレーム', description: '苦情・クレーム対応' },
};

// ========== フィルタ ==========

export interface BackfillFilters {
  onlyUnclassified: true;  // 常にtrue（安全装置）
  dateFrom?: string;       // YYYY-MM-DD
  dateTo?: string;         // YYYY-MM-DD
  q?: string;              // 検索キーワード
  status?: string[];       // ステータスフィルタ（任意）
  limit?: number;          // プレビュー時の上限（デフォルト200）
}

// ========== プレビューリクエスト ==========

export interface BackfillPreviewRequest {
  entityType: BackfillEntityType;
  filters: BackfillFilters;
  targetBusinessUnitId: string;
}

// ========== プレビューレスポンス ==========

export interface BackfillSampleItem {
  id: string;
  title: string;
  createdAt: string;
  hint: string;  // 追加情報（ステータス、カテゴリなど）
}

export interface BackfillPreviewResponse {
  count: number;
  sample: BackfillSampleItem[];
}

// ========== 適用リクエスト ==========

export interface BackfillApplyRequest {
  entityType: BackfillEntityType;
  filters: BackfillFilters;
  targetBusinessUnitId: string;
}

// ========== 適用レスポンス ==========

export interface BackfillApplyResponse {
  affectedCount: number;
  eventId: string;  // 監査ログID
}

// ========== 監査ログ（scope_backfill_events） ==========

export interface ScopeBackfillEvent {
  id: string;
  actorUserId: string;
  actorUserName: string | null;
  entityType: BackfillEntityType;
  filterJson: string;  // JSON文字列
  targetBusinessUnitId: string;
  targetBusinessUnitName: string | null;
  affectedCount: number;
  dryRun: boolean;
  createdAt: string;
}

// ========== ビューアーコンテキスト ==========

export interface AdminViewerContext {
  userId: string;
  userName: string | null;
  role: 'admin';
}

// ========== 権限チェック ==========

export function canAccessBackfill(role: string): boolean {
  return role === 'admin';
}
