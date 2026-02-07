/**
 * スプレッドシートスナップショットの適用ロジック
 *
 * - UPSERT vacancy_units
 * - 上書き判定: sourcePriority / sourceUpdatedAt
 * - 差分がある場合のみ vacancy_updates にログ保存
 * - systemImporter からも同じ関数を呼べる設計
 */

import { getAdminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import type { VacancyUnit, VacancyUpdate, VacancySource } from '@/lib/vacancyUnits/types';
import { SOURCE_PRIORITY } from '@/lib/vacancyUnits/types';
import { toUnitKey } from '@/lib/vacancyUnits/unitKey';
import type { NormalizedRow, SheetVacancyStatus } from './normalizeRow';

const UNITS_COLLECTION = 'vacancy_units';
const UPDATES_COLLECTION = 'vacancy_updates';

// ========== 型 ==========

export interface ImportItem {
  unitKey: string;
  row: NormalizedRow;
}

export interface DiffField {
  before: unknown;
  after: unknown;
}

export interface DiffEntry {
  unitKey: string;
  action: 'create' | 'update' | 'skip';
  skipReason?: string;
  fields?: Record<string, DiffField>;
  row: NormalizedRow;
}

export interface ApplyResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  diffs: DiffEntry[];
}

// ========== ヘルパー ==========

function sheetStatusToUnitStatus(s: SheetVacancyStatus): 'active' | 'paused' {
  return s === 'available' ? 'active' : 'paused';
}

function sheetStatusToAvailableCount(s: SheetVacancyStatus): number {
  return s === 'available' ? 1 : 0;
}

function generateId(): string {
  return `vu_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function now(): string {
  return new Date().toISOString();
}

/**
 * 既存ユニットを unitKey (buildingName slug + roomNo) でインデックス
 */
async function loadExistingByUnitKey(): Promise<Map<string, VacancyUnit>> {
  const db = getAdminDb();
  const snap = await db.collection(UNITS_COLLECTION).get();
  const map = new Map<string, VacancyUnit>();

  for (const doc of snap.docs) {
    const data = doc.data();
    const building = data.buildingName ?? '';
    const roomNo = data.roomNo ?? '';
    if (building && roomNo) {
      const key = toUnitKey(building, roomNo);
      map.set(key, docToUnit(doc));
    }
  }

  return map;
}

function docToUnit(doc: FirebaseFirestore.DocumentSnapshot): VacancyUnit {
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    businessUnitId: data.businessUnitId ?? '',
    buildingName: data.buildingName ?? '',
    area: data.area ?? '',
    roomType: data.roomType ?? '',
    capacity: data.capacity ?? 0,
    availableCount: data.availableCount ?? 0,
    availableFrom: data.availableFrom ?? null,
    conditionsJson: data.conditionsJson ?? {},
    priceRangeJson: data.priceRangeJson ?? {},
    status: data.status ?? 'active',
    updatedAt: data.updatedAt ?? new Date().toISOString(),
    updatedByUserId: data.updatedByUserId ?? 'system',
    updatedByUserName: data.updatedByUserName,
    createdAt: data.createdAt ?? new Date().toISOString(),
    source: data.source,
    sourcePriority: data.sourcePriority,
    sourceUpdatedAt: data.sourceUpdatedAt,
    roomNo: data.roomNo,
    residentName: data.residentName,
    residentKana: data.residentKana,
    careLevel: data.careLevel,
    notes: data.notes,
  };
}

/**
 * 差分計算（比較対象フィールド）
 */
function computeDiff(
  existing: VacancyUnit,
  row: NormalizedRow,
): Record<string, DiffField> | null {
  const diff: Record<string, DiffField> = {};

  const pairs: [string, unknown, unknown][] = [
    ['buildingName', existing.buildingName, row.facilityName],
    ['roomNo', existing.roomNo, row.roomNo],
    ['status', existing.status, sheetStatusToUnitStatus(row.status)],
    ['availableCount', existing.availableCount, sheetStatusToAvailableCount(row.status)],
    ['availableFrom', existing.availableFrom, row.moveInDate],
    ['residentName', existing.residentName ?? '', row.residentName],
    ['residentKana', existing.residentKana ?? '', row.residentKana],
    ['careLevel', existing.careLevel ?? '', row.careLevel],
    ['notes', existing.notes ?? '', row.notes],
  ];

  for (const [field, before, after] of pairs) {
    if (String(before ?? '') !== String(after ?? '')) {
      diff[field] = { before, after };
    }
  }

  return Object.keys(diff).length > 0 ? diff : null;
}

/**
 * 上書き可否を判定
 */
function canOverwrite(
  existing: VacancyUnit,
  source: VacancySource,
  sourceUpdatedAt: string,
): boolean {
  const existingPriority = existing.sourcePriority ?? 0;
  const incomingPriority = SOURCE_PRIORITY[source];

  // 優先度が低ければスキップ
  if (incomingPriority < existingPriority) return false;

  // 優先度が高ければ上書き
  if (incomingPriority > existingPriority) return true;

  // 同一優先度: sourceUpdatedAt が新しければ上書き
  const existingTs = existing.sourceUpdatedAt ?? existing.updatedAt;
  return sourceUpdatedAt >= existingTs;
}

// ========== メインロジック ==========

/**
 * dry-run: 差分プレビューのみ（Firestoreに書き込まない）
 */
export async function dryRun(
  rows: NormalizedRow[],
  source: VacancySource = 'sheet',
): Promise<ApplyResult> {
  return applyInternal(rows, source, true);
}

/**
 * apply: 実際にFirestoreに書き込む
 */
export async function apply(
  rows: NormalizedRow[],
  source: VacancySource = 'sheet',
): Promise<ApplyResult> {
  return applyInternal(rows, source, false);
}

async function applyInternal(
  rows: NormalizedRow[],
  source: VacancySource,
  dryRunMode: boolean,
): Promise<ApplyResult> {
  const existing = await loadExistingByUnitKey();
  const timestamp = now();
  const sourceUpdatedAt = timestamp;

  const result: ApplyResult = {
    total: rows.length,
    created: 0,
    updated: 0,
    skipped: 0,
    diffs: [],
  };

  const db = dryRunMode ? null : getAdminDb();

  for (const row of rows) {
    const unitKey = toUnitKey(row.facilityName, row.roomNo);
    const ex = existing.get(unitKey);

    if (!ex) {
      // 新規作成
      const newUnit: VacancyUnit = {
        id: generateId(),
        businessUnitId: '',
        buildingName: row.facilityName,
        area: '',
        roomType: '',
        capacity: 1,
        availableCount: sheetStatusToAvailableCount(row.status),
        availableFrom: row.moveInDate,
        conditionsJson: {},
        priceRangeJson: {},
        status: sheetStatusToUnitStatus(row.status),
        updatedAt: timestamp,
        updatedByUserId: 'system:sheet-import',
        createdAt: timestamp,
        source,
        sourcePriority: SOURCE_PRIORITY[source],
        sourceUpdatedAt: row.moveInDate ?? timestamp,
        roomNo: row.roomNo,
        residentName: row.residentName,
        residentKana: row.residentKana,
        careLevel: row.careLevel,
        notes: row.notes,
      };

      result.created++;
      result.diffs.push({ unitKey, action: 'create', row });

      if (db) {
        await db.collection(UNITS_COLLECTION).doc(newUnit.id).set({
          ...newUnit,
          _updatedAt: Timestamp.fromDate(new Date(timestamp)),
          _createdAt: Timestamp.fromDate(new Date(timestamp)),
        });
      }
      continue;
    }

    // 上書き可否チェック
    if (!canOverwrite(ex, source, row.moveInDate ?? timestamp)) {
      result.skipped++;
      result.diffs.push({
        unitKey,
        action: 'skip',
        skipReason: `priority: existing=${ex.sourcePriority ?? 0} (${ex.source ?? 'unknown'}), incoming=${SOURCE_PRIORITY[source]} (${source})`,
        row,
      });
      continue;
    }

    // 差分計算
    const diff = computeDiff(ex, row);
    if (!diff) {
      result.skipped++;
      result.diffs.push({
        unitKey,
        action: 'skip',
        skipReason: 'no changes',
        row,
      });
      continue;
    }

    // 更新
    const patch: Partial<VacancyUnit> = {
      buildingName: row.facilityName,
      roomNo: row.roomNo,
      status: sheetStatusToUnitStatus(row.status),
      availableCount: sheetStatusToAvailableCount(row.status),
      availableFrom: row.moveInDate,
      residentName: row.residentName,
      residentKana: row.residentKana,
      careLevel: row.careLevel,
      notes: row.notes,
      updatedAt: timestamp,
      updatedByUserId: 'system:sheet-import',
      source,
      sourcePriority: SOURCE_PRIORITY[source],
      sourceUpdatedAt: row.moveInDate ?? timestamp,
    };

    result.updated++;
    result.diffs.push({ unitKey, action: 'update', fields: diff, row });

    if (db) {
      await db.collection(UNITS_COLLECTION).doc(ex.id).update({
        ...patch,
        _updatedAt: Timestamp.now(),
      });

      // 変更ログ
      const updateLog: VacancyUpdate = {
        id: `vupd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        vacancyUnitId: ex.id,
        businessUnitId: ex.businessUnitId,
        changedFieldsJson: diff,
        createdAt: timestamp,
        createdByUserId: 'system:sheet-import',
      };
      await db.collection(UPDATES_COLLECTION).doc(updateLog.id).set({
        ...updateLog,
        _createdAt: Timestamp.fromDate(new Date(timestamp)),
      });
    }
  }

  return result;
}
