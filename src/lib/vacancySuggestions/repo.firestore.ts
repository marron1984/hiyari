/**
 * 空室更新提案 リポジトリ（Firestore版）
 *
 * Ticket 075: 空室情報の自動更新支援
 *
 * Firestore永続化実装
 */

import { getAdminDb } from '@/lib/firebase-admin';
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

// ========== コレクション名 ==========

const SUGGESTIONS_COLLECTION = 'vacancy_update_suggestions';

// ========== ドキュメント変換 ==========

function docToSuggestion(doc: FirebaseFirestore.DocumentSnapshot): VacancyUpdateSuggestion {
  const d = doc.data()!;
  return {
    id: doc.id,
    businessUnitId: d.businessUnitId,
    vacancyUnitId: d.vacancyUnitId,
    suggestionType: d.suggestionType,
    suggestedPatchJson: d.suggestedPatchJson,
    reason: d.reason,
    sourceType: d.sourceType,
    sourceId: d.sourceId,
    status: d.status,
    createdAt: d.createdAt,
    createdBy: d.createdBy ?? 'system',
    appliedAt: d.appliedAt ?? null,
    appliedByUserId: d.appliedByUserId ?? null,
    dismissedAt: d.dismissedAt ?? null,
    dismissedByUserId: d.dismissedByUserId ?? null,
    dismissedReason: d.dismissedReason ?? null,
  };
}

function now(): string {
  return new Date().toISOString();
}

// ========== CRUD ==========

export async function listSuggestions(
  filter: SuggestionListFilter = {}
): Promise<{ items: VacancyUpdateSuggestion[]; total: number }> {
  const db = getAdminDb();
  let query: FirebaseFirestore.Query = db.collection(SUGGESTIONS_COLLECTION);

  if (filter.businessUnitId) {
    query = query.where('businessUnitId', '==', filter.businessUnitId);
  }
  if (filter.status) {
    query = query.where('status', '==', filter.status);
  }
  if (filter.sourceType) {
    query = query.where('sourceType', '==', filter.sourceType);
  }
  if (filter.vacancyUnitId) {
    query = query.where('vacancyUnitId', '==', filter.vacancyUnitId);
  }

  query = query.orderBy('createdAt', 'desc');

  const snapshot = await query.get();
  const allItems = snapshot.docs.map(docToSuggestion);

  const total = allItems.length;
  const offset = filter.offset ?? 0;
  const limit = filter.limit ?? 100;
  const items = allItems.slice(offset, offset + limit);

  return { items, total };
}

export async function getSuggestionById(id: string): Promise<VacancyUpdateSuggestion | null> {
  const db = getAdminDb();
  const doc = await db.collection(SUGGESTIONS_COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  return docToSuggestion(doc);
}

export async function createSuggestion(
  request: CreateSuggestionRequest
): Promise<VacancyUpdateSuggestion> {
  const db = getAdminDb();
  const timestamp = now();

  const docRef = db.collection(SUGGESTIONS_COLLECTION).doc();

  const suggestionData = {
    businessUnitId: request.businessUnitId,
    vacancyUnitId: request.vacancyUnitId,
    suggestionType: request.suggestionType,
    suggestedPatchJson: request.suggestedPatchJson,
    reason: request.reason,
    sourceType: request.sourceType,
    sourceId: request.sourceId,
    status: 'open' as const,
    createdAt: timestamp,
    createdBy: 'system' as const,
    appliedAt: null,
    appliedByUserId: null,
    dismissedAt: null,
    dismissedByUserId: null,
    dismissedReason: null,
  };

  await docRef.set(suggestionData);

  const suggestion: VacancyUpdateSuggestion = {
    id: docRef.id,
    ...suggestionData,
  };

  // 通知（非同期、エラー無視）
  notifyNewSuggestionAsync(suggestion).catch(console.error);

  return suggestion;
}

async function notifyNewSuggestionAsync(
  suggestion: VacancyUpdateSuggestion
): Promise<void> {
  const assignResult = await autoAssign({
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

export async function applySuggestion(
  id: string,
  actorUserId: string,
  actorUserName?: string
): Promise<{ success: boolean; error?: string; suggestion?: VacancyUpdateSuggestion }> {
  const db = getAdminDb();
  const docRef = db.collection(SUGGESTIONS_COLLECTION).doc(id);
  const doc = await docRef.get();

  if (!doc.exists) {
    return { success: false, error: '提案が見つかりません' };
  }

  const suggestion = docToSuggestion(doc);

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
  const timestamp = now();
  await docRef.update({
    status: 'applied',
    appliedAt: timestamp,
    appliedByUserId: actorUserId,
  });

  const updatedSuggestion: VacancyUpdateSuggestion = {
    ...suggestion,
    status: 'applied',
    appliedAt: timestamp,
    appliedByUserId: actorUserId,
  };

  return { success: true, suggestion: updatedSuggestion };
}

export async function dismissSuggestion(
  id: string,
  actorUserId: string,
  reason?: string
): Promise<{ success: boolean; error?: string; suggestion?: VacancyUpdateSuggestion }> {
  const db = getAdminDb();
  const docRef = db.collection(SUGGESTIONS_COLLECTION).doc(id);
  const doc = await docRef.get();

  if (!doc.exists) {
    return { success: false, error: '提案が見つかりません' };
  }

  const suggestion = docToSuggestion(doc);

  if (suggestion.status !== 'open') {
    return { success: false, error: 'この提案は既に処理済みです' };
  }

  const timestamp = now();
  await docRef.update({
    status: 'dismissed',
    dismissedAt: timestamp,
    dismissedByUserId: actorUserId,
    dismissedReason: reason ?? null,
  });

  const updatedSuggestion: VacancyUpdateSuggestion = {
    ...suggestion,
    status: 'dismissed',
    dismissedAt: timestamp,
    dismissedByUserId: actorUserId,
    dismissedReason: reason ?? null,
  };

  return { success: true, suggestion: updatedSuggestion };
}

// ========== 提案生成ルール ==========

export async function createSuggestionForAcceptedInquiry(
  ticketId: string,
  businessUnitId: string,
  vacancyUnitId: string
): Promise<VacancyUpdateSuggestion | null> {
  const db = getAdminDb();

  // 重複チェック：同じソースIDで open な提案があれば作らない
  const existing = await db
    .collection(SUGGESTIONS_COLLECTION)
    .where('sourceId', '==', ticketId)
    .where('sourceType', '==', 'vacancy_inquiry')
    .where('status', '==', 'open')
    .limit(1)
    .get();

  if (!existing.empty) {
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

  const suggestion = await createSuggestion({
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

export async function handleRejectedInquiry(ticketId: string): Promise<void> {
  const db = getAdminDb();

  const snapshot = await db
    .collection(SUGGESTIONS_COLLECTION)
    .where('sourceId', '==', ticketId)
    .where('sourceType', '==', 'vacancy_inquiry')
    .where('status', '==', 'open')
    .limit(1)
    .get();

  if (!snapshot.empty) {
    const openSuggestion = docToSuggestion(snapshot.docs[0]);
    console.log(
      `[VacancySuggestions] Inquiry ${ticketId} rejected/closed, suggestion ${openSuggestion.id} may need review`
    );
  }
}

export async function createSuggestionForCanceledInquiry(
  ticketId: string,
  businessUnitId: string,
  vacancyUnitId: string,
  stage: 'rejected' | 'closed'
): Promise<VacancyUpdateSuggestion | null> {
  const db = getAdminDb();

  // 重複チェック
  const existingIncrease = await db
    .collection(SUGGESTIONS_COLLECTION)
    .where('sourceId', '==', ticketId)
    .where('sourceType', '==', 'vacancy_inquiry')
    .where('suggestionType', '==', 'increase_available')
    .where('status', '==', 'open')
    .limit(1)
    .get();

  if (!existingIncrease.empty) {
    console.log(
      `[VacancySuggestions] increase_available suggestion already exists for ticket ${ticketId}`
    );
    return null;
  }

  // 対象の vacancy_unit を取得
  const vacancyUnit = await getVacancyUnitByIdAsync(vacancyUnitId);
  if (!vacancyUnit) {
    console.warn(`[VacancySuggestions] vacancyUnit not found: ${vacancyUnitId}`);
    return null;
  }

  const newAvailableCount = vacancyUnit.availableCount + 1;
  const stageLabel = stage === 'rejected' ? '不成立' : 'クローズ';

  const suggestion = await createSuggestion({
    businessUnitId,
    vacancyUnitId,
    suggestionType: 'increase_available',
    suggestedPatchJson: {
      availableCount: newAvailableCount,
    },
    reason: `問い合わせチケット(${ticketId})が${stageLabel}のため、空室を ${vacancyUnit.availableCount} → ${newAvailableCount} に戻す提案`,
    sourceType: 'vacancy_inquiry',
    sourceId: ticketId,
  });

  console.log(
    `[VacancySuggestions] Created increase_available suggestion ${suggestion.id} for ticket ${ticketId}`
  );

  return suggestion;
}

// ========== 統計 ==========

export async function getSuggestionStats(businessUnitId?: string): Promise<{
  open: number;
  applied: number;
  dismissed: number;
}> {
  const db = getAdminDb();
  let query: FirebaseFirestore.Query = db.collection(SUGGESTIONS_COLLECTION);

  if (businessUnitId) {
    query = query.where('businessUnitId', '==', businessUnitId);
  }

  const snapshot = await query.get();

  let open = 0;
  let applied = 0;
  let dismissed = 0;

  for (const doc of snapshot.docs) {
    const status = doc.data().status;
    if (status === 'open') open++;
    else if (status === 'applied') applied++;
    else if (status === 'dismissed') dismissed++;
  }

  return { open, applied, dismissed };
}

// ========== シードデータ ==========

export async function seedSuggestionsIfEmpty(): Promise<void> {
  const db = getAdminDb();
  const snapshot = await db.collection(SUGGESTIONS_COLLECTION).limit(1).get();
  if (!snapshot.empty) return;
  // シードは作成しない（テスト時に手動で）
}
