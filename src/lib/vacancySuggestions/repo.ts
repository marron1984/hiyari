/**
 * 空室更新提案 リポジトリ
 *
 * Ticket 075: 空室情報の自動更新支援
 *
 * インメモリストア実装（本番ではFirestoreに置き換え）
 */

import type {
  VacancyUpdateSuggestion,
  CreateSuggestionRequest,
  SuggestionListFilter,
  VacancySuggestionStatus,
  SuggestedPatch,
} from './types';
import {
  updateAsync as updateVacancyUnitAsync,
  getByIdAsync as getVacancyUnitByIdAsync,
} from '@/lib/vacancyUnits/repo';
import { revalidateVacanciesForBusinessUnit } from '@/lib/cache/vacancyTags';
import { createAsync as createNotificationAsync } from '@/lib/notifications/index';
import { autoAssign } from '@/lib/assignment/autoAssign';

// ========== インメモリストア ==========

const suggestionsStore = new Map<string, VacancyUpdateSuggestion>();

let idCounter = 1;

function now(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `vsug_${String(idCounter++).padStart(6, '0')}`;
}

// ========== CRUD ==========

/**
 * 提案一覧取得
 */
export function listSuggestions(
  filter: SuggestionListFilter = {}
): { items: VacancyUpdateSuggestion[]; total: number } {
  let items = Array.from(suggestionsStore.values());

  if (filter.businessUnitId) {
    items = items.filter((s) => s.businessUnitId === filter.businessUnitId);
  }
  if (filter.vacancyUnitId) {
    items = items.filter((s) => s.vacancyUnitId === filter.vacancyUnitId);
  }
  if (filter.status) {
    items = items.filter((s) => s.status === filter.status);
  }
  if (filter.sourceType) {
    items = items.filter((s) => s.sourceType === filter.sourceType);
  }

  // 作成日時降順
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const total = items.length;

  const offset = filter.offset ?? 0;
  const limit = filter.limit ?? 100;
  items = items.slice(offset, offset + limit);

  return { items, total };
}

/**
 * 提案取得
 */
export function getSuggestionById(id: string): VacancyUpdateSuggestion | null {
  return suggestionsStore.get(id) ?? null;
}

/**
 * 提案作成
 */
export function createSuggestion(
  request: CreateSuggestionRequest
): VacancyUpdateSuggestion {
  const id = generateId();
  const timestamp = now();

  const suggestion: VacancyUpdateSuggestion = {
    id,
    businessUnitId: request.businessUnitId,
    vacancyUnitId: request.vacancyUnitId,
    suggestionType: request.suggestionType,
    suggestedPatchJson: request.suggestedPatchJson,
    reason: request.reason,
    sourceType: request.sourceType,
    sourceId: request.sourceId,
    status: 'open',
    createdAt: timestamp,
    createdBy: 'system',
    appliedAt: null,
    appliedByUserId: null,
    dismissedAt: null,
    dismissedByUserId: null,
    dismissedReason: null,
  };

  suggestionsStore.set(id, suggestion);

  // 通知（非同期、エラー無視）
  notifyNewSuggestionAsync(suggestion).catch(console.error);

  return suggestion;
}

/**
 * 新規提案通知
 */
async function notifyNewSuggestionAsync(
  suggestion: VacancyUpdateSuggestion
): Promise<void> {
  const assignResult = autoAssign({
    entityType: 'ticket',
    businessUnitId: suggestion.businessUnitId,
  });
  if (!assignResult.ok) return;

  const fingerprint = `notif:vacancy_suggestion:${suggestion.id}`;

  try {
    await createNotificationAsync({
      tenantId: 'default',
      userId: assignResult.assigneeUserId,
      type: 'vacancy_suggestion_created',
      severity: 'info',
      title: '空室更新提案',
      message: suggestion.reason,
      url: '/dashboard/vacancies/suggestions',
      fingerprint,
    });
  } catch (error) {
    console.error('[VacancySuggestions] Failed to send notification:', error);
  }
}

/**
 * 提案を適用
 */
export async function applySuggestion(
  id: string,
  actorUserId: string,
  actorUserName?: string
): Promise<{ success: boolean; error?: string; suggestion?: VacancyUpdateSuggestion }> {
  const suggestion = suggestionsStore.get(id);
  if (!suggestion) {
    return { success: false, error: '提案が見つかりません' };
  }

  if (suggestion.status !== 'open') {
    return { success: false, error: 'この提案は既に処理済みです' };
  }

  // vacancy_unit を更新
  const vacancyUnit = await getVacancyUnitByIdAsync(suggestion.vacancyUnitId);
  if (!vacancyUnit) {
    return { success: false, error: '対象の空室情報が見つかりません' };
  }

  const patch = suggestion.suggestedPatchJson;
  const updateResult = await updateVacancyUnitAsync(
    suggestion.vacancyUnitId,
    {
      availableCount: patch.availableCount,
      availableFrom: patch.availableFrom,
      status: patch.status,
    },
    actorUserId,
    actorUserName
  );

  if (!updateResult) {
    return { success: false, error: '空室情報の更新に失敗しました' };
  }

  // キャッシュ無効化
  revalidateVacanciesForBusinessUnit(suggestion.businessUnitId);

  // 提案ステータス更新
  suggestion.status = 'applied';
  suggestion.appliedAt = now();
  suggestion.appliedByUserId = actorUserId;

  return { success: true, suggestion };
}

/**
 * 提案を却下
 */
export function dismissSuggestion(
  id: string,
  actorUserId: string,
  reason?: string
): { success: boolean; error?: string; suggestion?: VacancyUpdateSuggestion } {
  const suggestion = suggestionsStore.get(id);
  if (!suggestion) {
    return { success: false, error: '提案が見つかりません' };
  }

  if (suggestion.status !== 'open') {
    return { success: false, error: 'この提案は既に処理済みです' };
  }

  suggestion.status = 'dismissed';
  suggestion.dismissedAt = now();
  suggestion.dismissedByUserId = actorUserId;
  suggestion.dismissedReason = reason ?? null;

  return { success: true, suggestion };
}

// ========== 提案生成ルール ==========

/**
 * vacancy_inquiry accepted 時の提案生成
 *
 * @param ticketId チケットID
 * @param businessUnitId 事業単位ID
 * @param vacancyUnitId 空室情報ID（meta.vacancyUnitId）
 * @returns 作成された提案、または既存の提案がある場合はnull
 */
export async function createSuggestionForAcceptedInquiry(
  ticketId: string,
  businessUnitId: string,
  vacancyUnitId: string
): Promise<VacancyUpdateSuggestion | null> {
  // 重複チェック：同じソースIDで open な提案があれば作らない
  const existing = Array.from(suggestionsStore.values()).find(
    (s) =>
      s.sourceId === ticketId &&
      s.sourceType === 'vacancy_inquiry' &&
      s.status === 'open'
  );
  if (existing) {
    return null;
  }

  // 対象の vacancy_unit を取得
  const vacancyUnit = await getVacancyUnitByIdAsync(vacancyUnitId);
  if (!vacancyUnit) {
    console.warn(`[VacancySuggestions] vacancyUnit not found: ${vacancyUnitId}`);
    return null;
  }

  // 提案内容: availableCount を 1 減らす（最小 0）
  const newAvailableCount = Math.max(0, vacancyUnit.availableCount - 1);

  const suggestion = createSuggestion({
    businessUnitId,
    vacancyUnitId,
    suggestionType: 'decrease_available',
    suggestedPatchJson: {
      availableCount: newAvailableCount,
    },
    reason: `問い合わせチケット(${ticketId})が成約(accepted)のため、空室を ${vacancyUnit.availableCount} → ${newAvailableCount} に減らす提案`,
    sourceType: 'vacancy_inquiry',
    sourceId: ticketId,
  });

  return suggestion;
}

/**
 * vacancy_inquiry rejected/closed 時の処理
 *
 * 以前に作成した提案が open なら dismiss を検討
 * （自動却下ではなく、通知のみ）
 */
export function handleRejectedInquiry(ticketId: string): void {
  // 同じソースIDで open な提案を探す
  const openSuggestion = Array.from(suggestionsStore.values()).find(
    (s) =>
      s.sourceId === ticketId &&
      s.sourceType === 'vacancy_inquiry' &&
      s.status === 'open'
  );

  if (openSuggestion) {
    // 自動却下せず、ログのみ（運用判断に委ねる）
    console.log(
      `[VacancySuggestions] Inquiry ${ticketId} rejected/closed, suggestion ${openSuggestion.id} may need review`
    );
  }
}

// ========== 統計 ==========

export function getSuggestionStats(businessUnitId?: string): {
  open: number;
  applied: number;
  dismissed: number;
} {
  let items = Array.from(suggestionsStore.values());
  if (businessUnitId) {
    items = items.filter((s) => s.businessUnitId === businessUnitId);
  }

  return {
    open: items.filter((s) => s.status === 'open').length,
    applied: items.filter((s) => s.status === 'applied').length,
    dismissed: items.filter((s) => s.status === 'dismissed').length,
  };
}

// ========== シードデータ ==========

export function seedSuggestionsIfEmpty(): void {
  if (suggestionsStore.size > 0) return;

  // サンプル提案（デモ用）
  const sample: CreateSuggestionRequest = {
    businessUnitId: 'bu_housing',
    vacancyUnitId: 'vunit_1738681200000_abc1234',
    suggestionType: 'decrease_available',
    suggestedPatchJson: { availableCount: 9 },
    reason: '問い合わせチケット(ticket_001)が成約のため、空室を10→9に減らす提案',
    sourceType: 'vacancy_inquiry',
    sourceId: 'ticket_001',
  };

  // シードは作成しない（テスト時に手動で）
  // createSuggestion(sample);
}
