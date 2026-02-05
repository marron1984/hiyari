/**
 * 空室更新提案 型定義
 *
 * Ticket 075: 空室情報の自動更新支援
 *
 * 関連ドメインの変化から「更新提案」を自動生成し、
 * 承認後に反映する仕組み
 */

// ========== 提案タイプ ==========

export type VacancySuggestionType =
  | 'decrease_available'
  | 'increase_available'
  | 'change_availableFrom'
  | 'pause'
  | 'other';

export const SUGGESTION_TYPE_CONFIG: Record<VacancySuggestionType, { label: string; icon: string }> = {
  decrease_available: { label: '空室数減少', icon: '📉' },
  increase_available: { label: '空室数増加', icon: '📈' },
  change_availableFrom: { label: '入居可能日変更', icon: '📅' },
  pause: { label: '一時停止', icon: '⏸️' },
  other: { label: 'その他', icon: '📝' },
};

// ========== ソースタイプ ==========

export type SuggestionSourceType =
  | 'vacancy_inquiry'
  | 'contract'
  | 'other';

export const SOURCE_TYPE_CONFIG: Record<SuggestionSourceType, { label: string }> = {
  vacancy_inquiry: { label: '空室問い合わせ' },
  contract: { label: '契約' },
  other: { label: 'その他' },
};

// ========== ステータス ==========

export type VacancySuggestionStatus = 'open' | 'applied' | 'dismissed';

export const SUGGESTION_STATUS_CONFIG: Record<VacancySuggestionStatus, {
  label: string;
  color: string;
  bg: string;
}> = {
  open: { label: '未対応', color: 'text-yellow-700', bg: 'bg-yellow-100' },
  applied: { label: '適用済', color: 'text-green-700', bg: 'bg-green-100' },
  dismissed: { label: '却下', color: 'text-gray-600', bg: 'bg-gray-100' },
};

// ========== メインエンティティ ==========

/**
 * 空室更新提案
 */
export interface VacancyUpdateSuggestion {
  id: string;
  businessUnitId: string;
  vacancyUnitId: string;
  suggestionType: VacancySuggestionType;
  suggestedPatchJson: SuggestedPatch;
  reason: string;
  sourceType: SuggestionSourceType;
  sourceId: string;
  status: VacancySuggestionStatus;
  createdAt: string;
  createdBy: 'system' | 'user';
  appliedAt: string | null;
  appliedByUserId: string | null;
  dismissedAt: string | null;
  dismissedByUserId: string | null;
  dismissedReason: string | null;
}

/**
 * 提案パッチ（更新内容）
 */
export interface SuggestedPatch {
  availableCount?: number;
  availableFrom?: string | null;
  status?: 'active' | 'paused';
}

// ========== リクエスト型 ==========

export interface CreateSuggestionRequest {
  businessUnitId: string;
  vacancyUnitId: string;
  suggestionType: VacancySuggestionType;
  suggestedPatchJson: SuggestedPatch;
  reason: string;
  sourceType: SuggestionSourceType;
  sourceId: string;
}

export interface SuggestionListFilter {
  businessUnitId?: string;
  vacancyUnitId?: string;
  status?: VacancySuggestionStatus;
  sourceType?: SuggestionSourceType;
  limit?: number;
  offset?: number;
}

// ========== RBAC ==========

export function canManageSuggestions(viewer: { role: string }): boolean {
  return ['admin', 'manager'].includes(viewer.role);
}

export function canViewSuggestions(viewer: { role: string }): boolean {
  return ['admin', 'manager', 'staff'].includes(viewer.role);
}
