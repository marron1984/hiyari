/**
 * Business Unit Inference Engine
 *
 * Implementation Ticket 035: businessUnitId 自動推定 + 422 candidates 誘導
 *
 * staff が tickets/repairs/correctiveActions を作成する際に
 * businessUnitId を高確率で自動付与する
 */

import { createScope, getBusinessUnitIdsFromOrgIds } from '@/lib/access/scope';
import { listBusinessUnits, getBusinessUnitById } from '@/lib/business/repo';
import type { AppRole } from '@/config/appRoles';
import type { BusinessUnit } from '@/lib/business/types';

// ========== 型定義 ==========

export interface BusinessUnitCandidate {
  id: string;
  name: string;
  type: string;
  locationHint: string | null;
}

export type InferBusinessUnitResult =
  | { ok: true; businessUnitId: string; reason: string }
  | { ok: false; candidates: BusinessUnitCandidate[]; reason: string };

export interface InferenceHints {
  /** repairs: location から推定 */
  location?: string;
  /** tickets: category から推定 */
  category?: string;
  /** correctiveActions: sourceId から businessUnitId を継承 */
  sourceBusinessUnitId?: string | null;
}

export type InferenceEntityType = 'tickets' | 'repairs' | 'correctiveActions';

export type InferenceOutcome = 'auto_assigned' | 'needs_selection' | 'failed';

export interface InferenceEvent {
  id: string;
  userId: string;
  entityType: InferenceEntityType;
  outcome: InferenceOutcome;
  candidateCount: number;
  selectedBusinessUnitId: string | null;
  autoAssignedBusinessUnitId: string | null;
  reason: string;
  hints: InferenceHints;
  createdAt: string;
}

// ========== イベントストレージ ==========

const inferenceEventsStore = new Map<string, InferenceEvent>();
let eventIdCounter = 1;

function generateEventId(): string {
  return `inf_${String(eventIdCounter++).padStart(5, '0')}`;
}

function now(): string {
  return new Date().toISOString();
}

// ========== 推定ロジック ==========

/**
 * ユーザーの組織所属から事業単位を推定
 *
 * @param userId - ユーザーID
 * @param role - ロール
 * @param hints - 追加ヒント（location, category, sourceBusinessUnitId）
 * @returns 推定結果（成功時は businessUnitId、失敗時は candidates）
 */
export function inferBusinessUnit(
  userId: string,
  role: AppRole,
  hints: InferenceHints = {}
): InferBusinessUnitResult {
  // 1. sourceBusinessUnitId が指定されている場合は継承（CA用）
  if (hints.sourceBusinessUnitId) {
    const sourceUnit = getBusinessUnitById(hints.sourceBusinessUnitId);
    if (sourceUnit) {
      return {
        ok: true,
        businessUnitId: hints.sourceBusinessUnitId,
        reason: `ソースから継承: ${sourceUnit.name}`,
      };
    }
  }

  // 2. ユーザーのスコープから候補を取得
  const scope = createScope(userId, role);
  const scopedBusinessUnitIds = scope.businessUnitIds ?? [];

  // 3. 候補が0件の場合 → 全事業単位を候補として返す
  if (scopedBusinessUnitIds.length === 0) {
    const allUnits = listBusinessUnits(true);
    return {
      ok: false,
      candidates: allUnits.map(unitToCandidate),
      reason: '組織所属が未設定のため、事業単位を選択してください',
    };
  }

  // 4. 候補が1件の場合 → 自動付与
  if (scopedBusinessUnitIds.length === 1) {
    const unit = getBusinessUnitById(scopedBusinessUnitIds[0]);
    return {
      ok: true,
      businessUnitId: scopedBusinessUnitIds[0],
      reason: unit ? `所属組織から自動推定: ${unit.name}` : '所属組織から自動推定',
    };
  }

  // 5. 候補が複数の場合 → ヒントで絞り込みを試みる
  let narrowedCandidates = scopedBusinessUnitIds
    .map(getBusinessUnitById)
    .filter((u): u is BusinessUnit => u !== null);

  // location ヒントで絞り込み（repairs用）
  if (hints.location && narrowedCandidates.length > 1) {
    const locationLower = hints.location.toLowerCase();
    const matched = narrowedCandidates.filter((u) =>
      u.locationHint?.toLowerCase().includes(locationLower) ||
      u.name.toLowerCase().includes(locationLower)
    );
    if (matched.length === 1) {
      return {
        ok: true,
        businessUnitId: matched[0].id,
        reason: `場所から自動推定: ${matched[0].name}`,
      };
    }
    if (matched.length > 0) {
      narrowedCandidates = matched;
    }
  }

  // 候補が複数 → 選択を要求
  return {
    ok: false,
    candidates: narrowedCandidates.map(unitToCandidate),
    reason: `候補が${narrowedCandidates.length}件あります。事業単位を選択してください`,
  };
}

/**
 * BusinessUnit を Candidate 形式に変換
 */
function unitToCandidate(unit: BusinessUnit): BusinessUnitCandidate {
  return {
    id: unit.id,
    name: unit.name,
    type: unit.type,
    locationHint: unit.locationHint,
  };
}

// ========== イベントログ ==========

/**
 * 推定イベントを記録
 */
export function recordInferenceEvent(
  userId: string,
  entityType: InferenceEntityType,
  result: InferBusinessUnitResult,
  hints: InferenceHints,
  selectedBusinessUnitId?: string
): InferenceEvent {
  const outcome: InferenceOutcome = result.ok
    ? 'auto_assigned'
    : selectedBusinessUnitId
      ? 'needs_selection'
      : 'failed';

  const event: InferenceEvent = {
    id: generateEventId(),
    userId,
    entityType,
    outcome,
    candidateCount: result.ok ? 1 : result.candidates.length,
    selectedBusinessUnitId: selectedBusinessUnitId ?? null,
    autoAssignedBusinessUnitId: result.ok ? result.businessUnitId : null,
    reason: result.reason,
    hints,
    createdAt: now(),
  };

  inferenceEventsStore.set(event.id, event);
  console.log(`[Inference] ${event.id}: ${entityType} - ${outcome} - ${result.reason}`);

  return event;
}

/**
 * 推定イベント一覧を取得（管理用）
 */
export function listInferenceEvents(limit: number = 50): InferenceEvent[] {
  return Array.from(inferenceEventsStore.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

/**
 * 推定統計を取得
 */
export function getInferenceStats(): {
  total: number;
  autoAssigned: number;
  needsSelection: number;
  failed: number;
  autoAssignRate: number;
} {
  const events = Array.from(inferenceEventsStore.values());
  const total = events.length;
  const autoAssigned = events.filter((e) => e.outcome === 'auto_assigned').length;
  const needsSelection = events.filter((e) => e.outcome === 'needs_selection').length;
  const failed = events.filter((e) => e.outcome === 'failed').length;

  return {
    total,
    autoAssigned,
    needsSelection,
    failed,
    autoAssignRate: total > 0 ? Math.round((autoAssigned / total) * 100) : 0,
  };
}

// ========== API ヘルパー ==========

/**
 * staff の作成リクエストを処理し、businessUnitId を自動推定または 422 を返す
 *
 * @returns 成功時は businessUnitId、失敗時は 422 レスポンス情報
 */
export function processStaffCreation(
  userId: string,
  role: AppRole,
  entityType: InferenceEntityType,
  providedBusinessUnitId: string | null | undefined,
  hints: InferenceHints = {}
):
  | { needsSelection: false; businessUnitId: string }
  | { needsSelection: true; status: 422; candidates: BusinessUnitCandidate[]; reason: string } {

  // businessUnitId が明示的に指定されている場合はそのまま使用
  if (providedBusinessUnitId) {
    return { needsSelection: false, businessUnitId: providedBusinessUnitId };
  }

  // 推定を実行
  const result = inferBusinessUnit(userId, role, hints);

  // イベントログ
  recordInferenceEvent(userId, entityType, result, hints);

  if (result.ok) {
    return { needsSelection: false, businessUnitId: result.businessUnitId };
  }

  return {
    needsSelection: true,
    status: 422,
    candidates: result.candidates,
    reason: result.reason,
  };
}

/**
 * ロールが推定対象かどうかを判定
 * staff のみが推定対象（manager/leader は必須、admin/executive は自由）
 */
export function requiresInference(role: AppRole): boolean {
  return role === 'staff';
}
