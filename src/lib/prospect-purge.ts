// ======== 入居希望データ パージ（過去データ削除）機能 ========

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { db, DEFAULT_TENANT_ID } from './firebase';
import { Prospect, ProspectStatus } from '@/types/prospect';
import { hasMinRole } from './auth';
import { UserRole } from '@/types';
import { createAuditLog } from './prospect';

// ======== 設定定数 ========

// カットオフ日（この日以降のデータのみ有効）
// UTCで2026-01-01 00:00:00を基準とする（JSTでは2026-01-01 09:00:00）
export const PROSPECTS_CUTOFF_DATE = new Date('2026-01-01T00:00:00.000Z');

// 判定に使用するカラムの優先順位
export const CUTOFF_COLUMN_PRIORITY = ['inquiryDate', 'receivedAt', 'createdAt'] as const;

// パージモード
export type PurgeMode = 'hard_delete' | 'soft_delete';
export const PROSPECTS_PURGE_MODE: PurgeMode = 'hard_delete';

// 退避を行うかどうか
export const PROSPECTS_PURGE_ARCHIVE = true;

// ======== ユーティリティ ========

function getDb() {
  if (!db) throw new Error('Firestore not initialized');
  return db;
}

/**
 * プロスペクトの判定日を取得（優先順位に従う）
 */
export function getProspectCutoffDate(prospect: Prospect): Date {
  // 1. inquiryDate（文字列なのでパース）
  if (prospect.inquiryDate) {
    const parsed = new Date(prospect.inquiryDate);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  // 2. receivedAt
  if (prospect.receivedAt) {
    return prospect.receivedAt;
  }

  // 3. createdAt
  return prospect.createdAt;
}

/**
 * プロスペクトがカットオフ日以降かどうかを判定
 */
export function isProspectValid(prospect: Prospect, cutoffDate: Date = PROSPECTS_CUTOFF_DATE): boolean {
  const prospectDate = getProspectCutoffDate(prospect);
  return prospectDate >= cutoffDate;
}

/**
 * プロスペクトがカットオフ日より前（削除対象）かどうかを判定
 */
export function isProspectPurgeTarget(prospect: Prospect, cutoffDate: Date = PROSPECTS_CUTOFF_DATE): boolean {
  return !isProspectValid(prospect, cutoffDate);
}

// ======== dry-run（削除対象の確認） ========

export interface PurgeDryRunResult {
  cutoffDate: string;
  cutoffColumn: string;
  totalProspects: number;
  purgeTargetCount: number;
  validCount: number;
  purgeTargets: {
    id: string;
    customerName?: string;
    internalNo?: number | null;
    status: ProspectStatus;
    cutoffDateUsed: string;
    cutoffColumnUsed: string;
  }[];
  relatedData: {
    roomLocks: number;
    scoringRuns: number;
    funnelEvents: number;
    attachments: number;
    notificationLogs: number;
  };
  warnings: string[];
}

/**
 * パージ対象の確認（dry-run）
 */
export async function purgeDryRun(
  tenantId: string = DEFAULT_TENANT_ID,
  cutoffDate: Date = PROSPECTS_CUTOFF_DATE
): Promise<PurgeDryRunResult> {
  const firestore = getDb();

  // 全プロスペクトを取得
  const q = query(
    collection(firestore, 'prospects'),
    where('tenantId', '==', tenantId)
  );
  const snapshot = await getDocs(q);

  const prospects = snapshot.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      receivedAt: data.receivedAt?.toDate() || new Date(),
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate(),
    } as Prospect;
  });

  const purgeTargets: PurgeDryRunResult['purgeTargets'] = [];
  const warnings: string[] = [];
  let validCount = 0;

  for (const prospect of prospects) {
    if (isProspectPurgeTarget(prospect, cutoffDate)) {
      // 判定に使用したカラムを特定
      let cutoffColumnUsed = 'createdAt';
      let cutoffDateUsed = prospect.createdAt;

      if (prospect.inquiryDate) {
        const parsed = new Date(prospect.inquiryDate);
        if (!isNaN(parsed.getTime())) {
          cutoffColumnUsed = 'inquiryDate';
          cutoffDateUsed = parsed;
        }
      } else if (prospect.receivedAt) {
        cutoffColumnUsed = 'receivedAt';
        cutoffDateUsed = prospect.receivedAt;
      }

      purgeTargets.push({
        id: prospect.id,
        customerName: prospect.customerName,
        internalNo: prospect.internalNo,
        status: prospect.status,
        cutoffDateUsed: cutoffDateUsed.toISOString(),
        cutoffColumnUsed,
      });

      // 警告：アクティブなステータスの場合
      if (!['クローズ', '見送り', '入居決定'].includes(prospect.status)) {
        warnings.push(`警告: ID ${prospect.id}（${prospect.customerName || '名前なし'}）はステータス「${prospect.status}」ですが削除対象です`);
      }
    } else {
      validCount++;
    }
  }

  // 関連データのカウント（簡易版：実際のコレクションがある場合のみ）
  const relatedData = {
    roomLocks: 0,
    scoringRuns: 0,
    funnelEvents: 0,
    attachments: 0,
    notificationLogs: 0,
  };

  // 部屋ロックの確認
  try {
    const roomsQuery = query(
      collection(firestore, 'rooms'),
      where('tenantId', '==', tenantId)
    );
    const roomsSnapshot = await getDocs(roomsQuery);
    const purgeTargetIds = new Set(purgeTargets.map((p) => p.id));

    roomsSnapshot.docs.forEach((d) => {
      const data = d.data();
      if (data.lockedCaseId && purgeTargetIds.has(data.lockedCaseId)) {
        relatedData.roomLocks++;
        warnings.push(`警告: 部屋 ${data.buildingName} ${data.roomNumber} は削除対象のプロスペクト ${data.lockedCaseId} にロックされています`);
      }
    });
  } catch {
    // roomsコレクションが存在しない場合は無視
  }

  // 通知ログの確認
  try {
    const notifQuery = query(
      collection(firestore, 'notificationLogs'),
      where('tenantId', '==', tenantId)
    );
    const notifSnapshot = await getDocs(notifQuery);
    const purgeTargetIds = new Set(purgeTargets.map((p) => p.id));

    notifSnapshot.docs.forEach((d) => {
      const data = d.data();
      if (data.prospectId && purgeTargetIds.has(data.prospectId)) {
        relatedData.notificationLogs++;
      }
    });
  } catch {
    // notificationLogsコレクションが存在しない場合は無視
  }

  return {
    cutoffDate: cutoffDate.toISOString(),
    cutoffColumn: CUTOFF_COLUMN_PRIORITY.join(' > '),
    totalProspects: prospects.length,
    purgeTargetCount: purgeTargets.length,
    validCount,
    purgeTargets,
    relatedData,
    warnings,
  };
}

// ======== 退避（Archive） ========

export interface ArchiveResult {
  archivedCount: number;
  archiveCollectionName: string;
  archivedIds: string[];
}

/**
 * 削除対象データを退避コレクションにコピー
 */
export async function archiveProspects(
  prospects: Prospect[],
  archiveReason: string = 'purge_before_2026',
  tenantId: string = DEFAULT_TENANT_ID
): Promise<ArchiveResult> {
  const firestore = getDb();
  const archiveCollectionName = `prospects_archive_${new Date().getFullYear()}`;
  const now = Timestamp.now();
  const archivedIds: string[] = [];

  // バッチで退避（500件ずつ）
  const batchSize = 500;
  for (let i = 0; i < prospects.length; i += batchSize) {
    const batch = writeBatch(firestore);
    const chunk = prospects.slice(i, i + batchSize);

    for (const prospect of chunk) {
      const archiveRef = doc(collection(firestore, archiveCollectionName));
      batch.set(archiveRef, {
        ...prospect,
        originalId: prospect.id,
        archivedAt: now,
        archiveReason,
        receivedAt: prospect.receivedAt ? Timestamp.fromDate(prospect.receivedAt) : null,
        createdAt: prospect.createdAt ? Timestamp.fromDate(prospect.createdAt) : null,
        updatedAt: prospect.updatedAt ? Timestamp.fromDate(prospect.updatedAt) : null,
      });
      archivedIds.push(prospect.id);
    }

    await batch.commit();
  }

  return {
    archivedCount: archivedIds.length,
    archiveCollectionName,
    archivedIds,
  };
}

// ======== 実削除（Execute） ========

export interface PurgeExecuteResult {
  success: boolean;
  deletedCounts: {
    prospects: number;
    roomLocks: number;
    notificationLogs: number;
  };
  archiveResult?: ArchiveResult;
  errors: string[];
  executedAt: string;
  executedBy: string;
}

/**
 * パージを実行（関連データも含めて削除）
 */
export async function purgeExecute(
  userId: string,
  userName: string,
  userRole: UserRole,
  tenantId: string = DEFAULT_TENANT_ID,
  cutoffDate: Date = PROSPECTS_CUTOFF_DATE,
  options: {
    archive?: boolean;
    dryRunFirst?: boolean;
  } = { archive: true, dryRunFirst: true }
): Promise<PurgeExecuteResult> {
  // 管理者権限チェック
  if (!hasMinRole(userRole, 'admin')) {
    throw new Error('パージには管理者権限が必要です');
  }

  const firestore = getDb();
  const errors: string[] = [];
  const deletedCounts = {
    prospects: 0,
    roomLocks: 0,
    notificationLogs: 0,
  };

  // 1. dry-runで削除対象を確認
  const dryRunResult = await purgeDryRun(tenantId, cutoffDate);

  if (dryRunResult.purgeTargetCount === 0) {
    return {
      success: true,
      deletedCounts,
      errors: [],
      executedAt: new Date().toISOString(),
      executedBy: userName,
    };
  }

  // 削除対象のプロスペクトを取得
  const q = query(
    collection(firestore, 'prospects'),
    where('tenantId', '==', tenantId)
  );
  const snapshot = await getDocs(q);

  const prospectsToDelete = snapshot.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        receivedAt: data.receivedAt?.toDate() || new Date(),
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate(),
      } as Prospect;
    })
    .filter((p) => isProspectPurgeTarget(p, cutoffDate));

  const purgeTargetIds = new Set(prospectsToDelete.map((p) => p.id));

  // 2. 退避（オプション）
  let archiveResult: ArchiveResult | undefined;
  if (options.archive && PROSPECTS_PURGE_ARCHIVE) {
    try {
      archiveResult = await archiveProspects(prospectsToDelete, 'purge_before_2026', tenantId);
    } catch (err) {
      errors.push(`退避エラー: ${err instanceof Error ? err.message : String(err)}`);
      return {
        success: false,
        deletedCounts,
        archiveResult,
        errors,
        executedAt: new Date().toISOString(),
        executedBy: userName,
      };
    }
  }

  // 3. 関連データの削除・解除

  // 3-1. 部屋ロックの解除
  try {
    const roomsQuery = query(
      collection(firestore, 'rooms'),
      where('tenantId', '==', tenantId)
    );
    const roomsSnapshot = await getDocs(roomsQuery);

    for (const roomDoc of roomsSnapshot.docs) {
      const data = roomDoc.data();
      if (data.lockedCaseId && purgeTargetIds.has(data.lockedCaseId)) {
        await updateDoc(doc(firestore, 'rooms', roomDoc.id), {
          status: '空室',
          lockedCaseId: null,
          lockedAt: null,
          lockedBy: null,
          lockedByName: null,
          updatedAt: Timestamp.now(),
        });
        deletedCounts.roomLocks++;
      }
    }
  } catch (err) {
    errors.push(`部屋ロック解除エラー: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3-2. 通知ログの削除
  try {
    const notifQuery = query(
      collection(firestore, 'notificationLogs'),
      where('tenantId', '==', tenantId)
    );
    const notifSnapshot = await getDocs(notifQuery);

    const batchSize = 500;
    const notifsToDelete = notifSnapshot.docs.filter((d) => {
      const data = d.data();
      return data.prospectId && purgeTargetIds.has(data.prospectId);
    });

    for (let i = 0; i < notifsToDelete.length; i += batchSize) {
      const batch = writeBatch(firestore);
      const chunk = notifsToDelete.slice(i, i + batchSize);

      for (const notifDoc of chunk) {
        batch.delete(doc(firestore, 'notificationLogs', notifDoc.id));
        deletedCounts.notificationLogs++;
      }

      await batch.commit();
    }
  } catch {
    // notificationLogsコレクションが存在しない場合は無視
  }

  // 4. プロスペクトの削除
  try {
    const batchSize = 500;
    for (let i = 0; i < prospectsToDelete.length; i += batchSize) {
      const batch = writeBatch(firestore);
      const chunk = prospectsToDelete.slice(i, i + batchSize);

      for (const prospect of chunk) {
        batch.delete(doc(firestore, 'prospects', prospect.id));
        deletedCounts.prospects++;
      }

      await batch.commit();
    }
  } catch (err) {
    errors.push(`プロスペクト削除エラー: ${err instanceof Error ? err.message : String(err)}`);
    return {
      success: false,
      deletedCounts,
      archiveResult,
      errors,
      executedAt: new Date().toISOString(),
      executedBy: userName,
    };
  }

  // 5. 監査ログに記録
  await createAuditLog({
    tenantId,
    actor: userId,
    actorName: userName,
    action: 'delete',
    entity: 'prospect',
    entityId: 'purge_batch',
    diff: {
      before: { count: dryRunResult.purgeTargetCount },
      after: { count: 0 },
    },
    note: `パージ実行: ${cutoffDate.toISOString()}以前のデータ ${deletedCounts.prospects}件を削除。` +
      `部屋ロック解除: ${deletedCounts.roomLocks}件。` +
      `通知ログ削除: ${deletedCounts.notificationLogs}件。` +
      (archiveResult ? `退避先: ${archiveResult.archiveCollectionName}` : '退避なし'),
  });

  return {
    success: errors.length === 0,
    deletedCounts,
    archiveResult,
    errors,
    executedAt: new Date().toISOString(),
    executedBy: userName,
  };
}

// ======== API用エイリアス ========

// PROSPECTS_CUTOFF_DATEの短縮エイリアス
export const CUTOFF_DATE = PROSPECTS_CUTOFF_DATE;
