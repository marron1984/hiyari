/**
 * 朝イチダイジェスト通知 Cron API
 *
 * Implementation Ticket 067: notify-digest の本番運用固定
 *
 * スケジュール: 毎日 09:00 JST
 *
 * GET /api/cron/notify-digest?secret=...
 *   - 朝イチダイジェスト通知を送信
 *
 * GET /api/cron/notify-digest?secret=...&preview=true
 *   - プレビュー（通知を送信しない）
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildMorningDigest, formatDigestNotification } from '@/lib/digest/morningDigest';
import { NOTIFY_DIGEST_SCHEDULE, OPS_FAILURE_NOTIFICATION } from '@/config/opsSchedule';
import { createAlert } from '@/lib/alerts/repo';

// Cron認証用シークレット
const DIGEST_SECRET = process.env.DIGEST_CRON_SECRET || process.env.ALERT_CRON_SECRET;

/**
 * 認証チェック
 */
function checkAuth(request: NextRequest): boolean {
  const { searchParams } = new URL(request.url);
  const secretParam = searchParams.get('secret');
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!DIGEST_SECRET) {
    console.warn('[NotifyDigest] DIGEST_CRON_SECRET is not configured');
    if (process.env.NODE_ENV === 'production') {
      return false;
    }
    return true;
  }

  return secretParam === DIGEST_SECRET || token === DIGEST_SECRET;
}

/**
 * GET /api/cron/notify-digest
 */
export async function GET(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const preview = searchParams.get('preview') === 'true';
  const forceParam = searchParams.get('force') === 'true';

  try {
    console.log(`[NotifyDigest] Building morning digest${preview ? ' (preview)' : ''}...`);

    // ダイジェスト生成
    const digest = buildMorningDigest();
    const notification = formatDigestNotification(digest);

    // プレビューモードなら送信しない
    if (preview) {
      return NextResponse.json({
        success: true,
        preview: true,
        schedule: NOTIFY_DIGEST_SCHEDULE,
        digest,
        notification,
        notificationsSent: 0,
      });
    }

    // 対応事項がなければスキップ
    if (digest.totalCount === 0 && !forceParam) {
      console.log('[NotifyDigest] No items to notify, skipping');
      return NextResponse.json({
        success: true,
        schedule: NOTIFY_DIGEST_SCHEDULE,
        skipped: true,
        reason: '対応事項がないためスキップしました',
        digest,
      });
    }

    // 通知送信（実際の送信ロジックはここに）
    // TODO: 通知対象ユーザーへの送信実装
    const notificationsSent = 0;

    console.log(`[NotifyDigest] Completed: items=${digest.totalCount}, notifications=${notificationsSent}`);

    return NextResponse.json({
      success: true,
      schedule: NOTIFY_DIGEST_SCHEDULE,
      digest,
      notification,
      notificationsSent,
    });
  } catch (error) {
    console.error('[NotifyDigest] Error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const date = new Date().toISOString().split('T')[0];

    // Ticket 067: 失敗時に system_error アラートを作成
    createAlert({
      type: 'system_error',
      sourceId: 'notify-digest',
      title: 'ダイジェスト通知失敗',
      message: `${errorMessage}\n\n日付: ${date}\n\n復旧方法: /api/cron/notify-digest?force=true`,
      severity: 'critical',
      fingerprint: `notify_digest:error:${date}`,
      meta: {
        opsType: 'digest',
        date,
        errorMessage,
        notifyRoles: OPS_FAILURE_NOTIFICATION.targetRoles,
        retryUrl: '/dashboard/ops-report',
      },
    });

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cron/notify-digest
 */
export async function POST(request: NextRequest) {
  return GET(request);
}
