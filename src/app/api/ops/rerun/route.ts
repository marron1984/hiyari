/**
 * Ops 手動再実行 API
 *
 * Implementation Ticket 067: 手動再実行導線（adminのみ）
 *
 * POST /api/ops/rerun
 *   - admin ロールのみ実行可能
 *   - secret をフロントに出さない（サーバ側代理実行）
 *
 * Body:
 *   - job: 'daily-ops' | 'weekly-ops' | 'notify-digest'
 *   - steps?: string[] (失敗ステップのみ再実行する場合)
 *   - force?: boolean (強制実行)
 */

import { NextRequest, NextResponse } from 'next/server';
import { executeDailyOps, type DailyOpsStepName } from '@/lib/dailyOps';
import { executeWeeklyOps, type WeeklyOpsStepName } from '@/lib/weeklyOps';
import { buildMorningDigest, formatDigestNotification } from '@/lib/digest/morningDigest';
import { createAlert } from '@/lib/alerts/repo';
import { OPS_FAILURE_NOTIFICATION } from '@/config/opsSchedule';

// TODO: 実際の認証ミドルウェアに置き換え
async function checkAdminAuth(request: NextRequest): Promise<{
  authorized: boolean;
  userId?: string;
  role?: string;
}> {
  // 開発環境ではadmin扱い
  if (process.env.NODE_ENV !== 'production') {
    return { authorized: true, userId: 'dev-admin', role: 'admin' };
  }

  // 実際の認証ロジック（セッション/JWTから取得）
  // ここではヘッダーからロールを取得する仮実装
  const role = request.headers.get('x-user-role');
  const userId = request.headers.get('x-user-id');

  if (role === 'admin') {
    return { authorized: true, userId: userId || undefined, role };
  }

  return { authorized: false };
}

export async function POST(request: NextRequest) {
  // 認証チェック
  const auth = await checkAdminAuth(request);
  if (!auth.authorized) {
    return NextResponse.json(
      { error: 'Unauthorized: admin role required' },
      { status: 403 }
    );
  }

  let body: { job?: string; steps?: string[]; force?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const { job, steps, force = true } = body;

  if (!job) {
    return NextResponse.json(
      { error: 'job parameter is required' },
      { status: 400 }
    );
  }

  console.log(`[OpsRerun] Admin ${auth.userId} requesting rerun of ${job}`, { steps, force });

  try {
    switch (job) {
      case 'daily-ops': {
        const result = await executeDailyOps({
          force,
          steps: steps as DailyOpsStepName[] | undefined,
        });

        return NextResponse.json({
          success: result.run.ok,
          job: 'daily-ops',
          skipped: result.skipped,
          reason: result.reason,
          message: result.run.ok
            ? `日次オペ完了: ${result.run.totalAlertsCreated}件のアラートを作成`
            : `日次オペ失敗: ${result.run.errorMessage}`,
          run: {
            id: result.run.id,
            date: result.run.date,
            ok: result.run.ok,
            stepsOk: result.run.steps.filter((s) => s.ok).length,
            stepsFailed: result.run.steps.filter((s) => !s.ok).length,
            totalAlertsCreated: result.run.totalAlertsCreated,
          },
        });
      }

      case 'weekly-ops': {
        const result = await executeWeeklyOps({
          force,
          steps: steps as WeeklyOpsStepName[] | undefined,
        });

        return NextResponse.json({
          success: result.run.ok,
          job: 'weekly-ops',
          skipped: result.skipped,
          reason: result.reason,
          message: result.run.ok
            ? `週次オペ完了: ${result.run.totalItemsProcessed}件を処理`
            : `週次オペ失敗: ${result.run.errorMessage}`,
          run: {
            id: result.run.id,
            weekStart: result.run.weekStart,
            ok: result.run.ok,
            stepsOk: result.run.steps.filter((s) => s.ok).length,
            stepsFailed: result.run.steps.filter((s) => !s.ok).length,
            totalItemsProcessed: result.run.totalItemsProcessed,
          },
        });
      }

      case 'notify-digest': {
        try {
          const digest = buildMorningDigest();
          const notification = formatDigestNotification(digest);

          // 実際の通知送信はここで行う
          // TODO: 通知送信の実装

          return NextResponse.json({
            success: true,
            job: 'notify-digest',
            message: `ダイジェスト生成完了: ${digest.totalCount}件の対応事項`,
            digest: {
              date: digest.date,
              totalCount: digest.totalCount,
              criticalCount: digest.criticalCount,
              summary: digest.summary,
            },
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);

          // システムエラーアラートを作成
          const date = new Date().toISOString().split('T')[0];
          createAlert({
            type: 'system_error',
            sourceId: 'notify-digest',
            title: 'ダイジェスト生成失敗',
            message: `${errorMessage}\n\n日付: ${date}`,
            severity: 'critical',
            fingerprint: `notify_digest:error:${date}`,
            meta: {
              opsType: 'digest',
              date,
              errorMessage,
              notifyRoles: OPS_FAILURE_NOTIFICATION.targetRoles,
            },
          });

          return NextResponse.json({
            success: false,
            job: 'notify-digest',
            error: errorMessage,
            message: `ダイジェスト失敗: ${errorMessage}`,
          });
        }
      }

      default:
        return NextResponse.json(
          { error: `Unknown job: ${job}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[OpsRerun] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
