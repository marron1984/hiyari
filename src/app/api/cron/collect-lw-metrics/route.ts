// ======== LINE WORKS 行動メトリクス収集 Cron ========
// 毎日 JST 06:00（UTC 21:00）に実行
// 前日分のメッセージ活動データを収集・集計

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  isLineWorksAdminConfigured,
  collectBehaviorMetrics,
  saveMetricsSnapshot,
} from '@/lib/lineworks-admin';
import {
  saveConditionScore,
  generateMockBehaviorMetrics,
} from '@/lib/condition-analysis';

const DEFAULT_TENANT_ID = 'defaultTenant';

// ======== 認証 ========

function verifyCronRequest(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');

  if (process.env.CRON_SECRET) {
    return authHeader === `Bearer ${process.env.CRON_SECRET}`;
  }

  if (process.env.NODE_ENV === 'development') {
    return true;
  }

  return false;
}

// ======== メイン処理 ========

export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = new Date();
  console.log('[LW Metrics Cron] Starting behavior metrics collection...');

  const db = getAdminDb();

  // 期間: 過去7日間（週次ウィンドウ）
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setHours(0, 0, 0, 0); // 今日の0時まで
  const periodStart = new Date(periodEnd);
  periodStart.setDate(periodStart.getDate() - 7);

  try {
    // メトリクスを収集
    let metricsMap = await collectBehaviorMetrics(periodStart, periodEnd);
    let source: 'admin_api' | 'firestore_webhook' | 'mock' = isLineWorksAdminConfigured()
      ? 'admin_api'
      : 'firestore_webhook';

    // データがない場合はモックデータ使用（開発環境用）
    if (metricsMap.size === 0) {
      console.log('[LW Metrics Cron] No real data found, using mock data');
      source = 'mock';

      // ユーザー一覧を取得してモックデータを生成
      const usersSnapshot = await db
        .collection('users')
        .where('tenantId', '==', DEFAULT_TENANT_ID)
        .where('status', '!=', 'terminated')
        .limit(100)
        .get();

      for (const userDoc of usersSnapshot.docs) {
        metricsMap.set(userDoc.id, generateMockBehaviorMetrics());
      }
    }

    // スナップショットを保存
    const snapshotId = await saveMetricsSnapshot(metricsMap, periodStart, periodEnd, source);
    console.log(`[LW Metrics Cron] Saved snapshot: ${snapshotId} (${metricsMap.size} users, source: ${source})`);

    // コンディションスコアを更新
    const results: { userId: string; userName: string; score: number; alertLevel: string }[] = [];

    for (const [userId, metrics] of metricsMap) {
      try {
        // ユーザー名を取得
        const userDoc = await db.collection('users').doc(userId).get();
        const userName = userDoc.data()?.name || userDoc.data()?.email || 'Unknown';

        const conditionScore = await saveConditionScore(
          userId,
          userName,
          metrics,
          periodStart,
          periodEnd
        );

        results.push({
          userId,
          userName,
          score: conditionScore.score,
          alertLevel: conditionScore.alertLevel,
        });
      } catch (error) {
        console.error(`[LW Metrics Cron] Error processing user ${userId}:`, error);
      }
    }

    // 実行ログを保存
    const completedAt = new Date();
    await db.collection('cronLogs').add({
      tenantId: DEFAULT_TENANT_ID,
      jobName: 'collect-lw-metrics',
      startedAt,
      completedAt,
      durationMs: completedAt.getTime() - startedAt.getTime(),
      source,
      usersProcessed: results.length,
      alertedUsers: results.filter((r) => r.alertLevel !== 'none').length,
      summary: {
        healthy: results.filter((r) => r.alertLevel === 'none').length,
        watch: results.filter((r) => r.alertLevel === 'watch').length,
        warning: results.filter((r) => r.alertLevel === 'warning').length,
        critical: results.filter((r) => r.alertLevel === 'critical').length,
      },
      createdAt: FieldValue.serverTimestamp(),
    });

    console.log(`[LW Metrics Cron] Completed: ${results.length} users processed`);

    return NextResponse.json({
      success: true,
      source,
      snapshotId,
      usersProcessed: results.length,
      summary: {
        healthy: results.filter((r) => r.alertLevel === 'none').length,
        watch: results.filter((r) => r.alertLevel === 'watch').length,
        warning: results.filter((r) => r.alertLevel === 'warning').length,
        critical: results.filter((r) => r.alertLevel === 'critical').length,
      },
      results,
    });
  } catch (error) {
    console.error('[LW Metrics Cron] Fatal error:', error);

    // エラーログを保存
    await db.collection('cronLogs').add({
      tenantId: DEFAULT_TENANT_ID,
      jobName: 'collect-lw-metrics',
      startedAt,
      completedAt: new Date(),
      error: error instanceof Error ? error.message : 'Unknown error',
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
