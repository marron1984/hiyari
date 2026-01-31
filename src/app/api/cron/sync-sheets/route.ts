// ======== Google Sheets 夜間自動バッチ同期 Cron API ========
// Vercel Cronで毎日 JST 03:00（UTC 18:00）に実行
// 対象: prospects / sales / applications
// HUB優先の双方向同期

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  isServiceAccountConfigured,
  getConnectionConfig,
  executeBidirectionalSync,
} from '@/lib/sheets-bidirectional';
import type { SyncEntity, SyncResult } from '@/types/sheets-sync';

const DEFAULT_TENANT_ID = 'defaultTenant';
const SYNC_ENTITIES: SyncEntity[] = ['prospects', 'sales', 'applications'];

// ======== 認証 ========

function verifyCronRequest(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');

  // Vercel Cron Secretによる認証
  if (process.env.CRON_SECRET) {
    return authHeader === `Bearer ${process.env.CRON_SECRET}`;
  }

  // 開発環境では認証をスキップ
  if (process.env.NODE_ENV === 'development') {
    return true;
  }

  return false;
}

// ======== ロック機構 ========

interface SyncLock {
  entity: SyncEntity;
  lockedAt: Date;
  lockedBy: string;
}

/**
 * entity単位のロックを取得
 */
async function acquireLock(entity: SyncEntity): Promise<boolean> {
  const db = getAdminDb();
  const lockRef = db.collection('syncLocks').doc(`${DEFAULT_TENANT_ID}_${entity}`);

  try {
    const result = await db.runTransaction(async (transaction) => {
      const lockDoc = await transaction.get(lockRef);

      if (lockDoc.exists) {
        const lockData = lockDoc.data() as SyncLock;
        const lockedAt = lockData.lockedAt instanceof Date
          ? lockData.lockedAt
          : (lockData.lockedAt as FirebaseFirestore.Timestamp)?.toDate();

        // 10分以上経過したロックは無効とみなす
        const lockTimeout = 10 * 60 * 1000; // 10 minutes
        if (lockedAt && Date.now() - lockedAt.getTime() < lockTimeout) {
          console.log(`[Cron] Lock already held for ${entity} by ${lockData.lockedBy}`);
          return false;
        }
      }

      // ロックを取得
      transaction.set(lockRef, {
        entity,
        lockedAt: FieldValue.serverTimestamp(),
        lockedBy: 'cron-batch',
      });

      return true;
    });

    return result;
  } catch (error) {
    console.error(`[Cron] Failed to acquire lock for ${entity}:`, error);
    return false;
  }
}

/**
 * ロックを解放
 */
async function releaseLock(entity: SyncEntity): Promise<void> {
  const db = getAdminDb();
  const lockRef = db.collection('syncLocks').doc(`${DEFAULT_TENANT_ID}_${entity}`);

  try {
    await lockRef.delete();
  } catch (error) {
    console.error(`[Cron] Failed to release lock for ${entity}:`, error);
  }
}

// ======== バッチ同期ログ ========

interface BatchSyncLog {
  tenantId: string;
  type: 'nightly-batch';
  startedAt: Date;
  completedAt: Date;
  results: {
    entity: SyncEntity;
    success: boolean;
    rowsProcessed: number;
    rowsCreated: number;
    rowsUpdated: number;
    rowsSkipped: number;
    rowsConflict: number;
    errorCount: number;
    error?: string;
  }[];
  summary: {
    totalEntities: number;
    successfulEntities: number;
    failedEntities: number;
    totalRowsProcessed: number;
    totalRowsCreated: number;
    totalRowsUpdated: number;
  };
}

/**
 * バッチ同期ログを保存
 */
async function saveBatchSyncLog(log: BatchSyncLog): Promise<void> {
  const db = getAdminDb();
  await db.collection('batchSyncLogs').add({
    ...log,
    createdAt: FieldValue.serverTimestamp(),
  });
}

// ======== メイン処理 ========

/**
 * 単一entityの同期を実行
 */
async function syncEntity(
  entity: SyncEntity,
  config: NonNullable<Awaited<ReturnType<typeof getConnectionConfig>>>
): Promise<{
  entity: SyncEntity;
  success: boolean;
  result?: SyncResult;
  error?: string;
}> {
  // シート設定を取得
  const sheetConfig = config.sheets.find((s) => s.entity === entity && s.isActive);

  if (!sheetConfig) {
    return {
      entity,
      success: false,
      error: `シート設定が見つかりません: ${entity}`,
    };
  }

  // ロックを取得
  const locked = await acquireLock(entity);
  if (!locked) {
    return {
      entity,
      success: false,
      error: '他のプロセスが同期中です',
    };
  }

  try {
    console.log(`[Cron] Starting sync for ${entity}...`);

    const result = await executeBidirectionalSync(
      {
        entity,
        spreadsheetId: config.spreadsheetId,
        sheetName: sheetConfig.sheetName,
        gid: sheetConfig.gid,
        dryRun: false,
        conflictResolution: 'HUB_WINS', // HUB優先
      },
      'system-cron',
      'Nightly Batch Sync'
    );

    console.log(`[Cron] Sync completed for ${entity}:`, {
      success: result.success,
      processed: result.rowsProcessed,
      created: result.rowsCreated,
      updated: result.rowsUpdated,
      errors: result.errors.length,
    });

    return {
      entity,
      success: result.success,
      result,
    };
  } catch (error) {
    console.error(`[Cron] Sync failed for ${entity}:`, error);
    return {
      entity,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  } finally {
    // ロックを解放
    await releaseLock(entity);
  }
}

// ======== API Handler ========

export async function GET(request: NextRequest) {
  // 認証チェック
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = new Date();
  console.log('[Cron] Starting nightly Google Sheets sync batch...');

  // Service Account設定チェック
  if (!isServiceAccountConfigured()) {
    console.error('[Cron] Service Account is not configured');
    return NextResponse.json(
      { error: 'Service Account is not configured' },
      { status: 500 }
    );
  }

  // 接続設定を取得
  const connectionConfig = await getConnectionConfig();
  if (!connectionConfig || !connectionConfig.isConnected) {
    console.error('[Cron] Google Sheets connection is not configured');
    return NextResponse.json(
      { error: 'Google Sheets connection is not configured' },
      { status: 500 }
    );
  }

  // 各entityを順番に同期
  const results: BatchSyncLog['results'] = [];

  for (const entity of SYNC_ENTITIES) {
    try {
      const syncResult = await syncEntity(entity, connectionConfig);

      results.push({
        entity,
        success: syncResult.success,
        rowsProcessed: syncResult.result?.rowsProcessed || 0,
        rowsCreated: syncResult.result?.rowsCreated || 0,
        rowsUpdated: syncResult.result?.rowsUpdated || 0,
        rowsSkipped: syncResult.result?.rowsSkipped || 0,
        rowsConflict: syncResult.result?.rowsConflict || 0,
        errorCount: syncResult.result?.errors.length || 0,
        error: syncResult.error,
      });
    } catch (error) {
      console.error(`[Cron] Unexpected error for ${entity}:`, error);
      results.push({
        entity,
        success: false,
        rowsProcessed: 0,
        rowsCreated: 0,
        rowsUpdated: 0,
        rowsSkipped: 0,
        rowsConflict: 0,
        errorCount: 1,
        error: error instanceof Error ? error.message : 'Unexpected error',
      });
    }
  }

  const completedAt = new Date();

  // サマリーを計算
  const summary = {
    totalEntities: results.length,
    successfulEntities: results.filter((r) => r.success).length,
    failedEntities: results.filter((r) => !r.success).length,
    totalRowsProcessed: results.reduce((sum, r) => sum + r.rowsProcessed, 0),
    totalRowsCreated: results.reduce((sum, r) => sum + r.rowsCreated, 0),
    totalRowsUpdated: results.reduce((sum, r) => sum + r.rowsUpdated, 0),
  };

  // バッチログを保存
  const batchLog: BatchSyncLog = {
    tenantId: DEFAULT_TENANT_ID,
    type: 'nightly-batch',
    startedAt,
    completedAt,
    results,
    summary,
  };

  await saveBatchSyncLog(batchLog);

  // 接続設定の最終同期日時を更新
  const db = getAdminDb();
  await db.collection('sheetsConnectionConfigs').doc(DEFAULT_TENANT_ID).update({
    lastSyncAt: FieldValue.serverTimestamp(),
    lastBatchSyncAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  console.log('[Cron] Nightly batch completed:', summary);

  return NextResponse.json({
    success: summary.failedEntities === 0,
    ...batchLog,
  });
}

// 手動トリガー用（POST）
export async function POST(request: NextRequest) {
  // Bearer token認証（管理者API経由）
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // GETと同じ処理を実行
  return GET(request);
}
