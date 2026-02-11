/**
 * オンボーディング未完了リマインド Cron API
 *
 * Ticket 095: 未署名放置の自動リマインド
 * Ticket 099: 未署名者への強制連絡オペ（エスカレーション→チケット自動生成）
 *
 * GET /api/cron/onboarding-reminder?secret=...
 *   - 未完了ユーザーをスキャン
 *   - 本人通知を作成（1日1回、冪等）
 *   - manager/admin ダイジェストを作成
 *   - escalation 通知を作成
 *   - Ticket 099: escalationLevel >= 2 でチケットを自動生成
 *
 * GET /api/cron/onboarding-reminder?secret=...&preview=true
 *   - プレビュー実行（通知・チケットを作成しない）
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  scanPendingUsers,
  executeReminders,
  getAllUserOnboardings,
  createEscalationTickets,
} from '@/lib/onboarding';
import { listUsers, getUserById } from '@/lib/roles/user-store';
import type { AppRole } from '@/config/appRoles';

// Cron認証用シークレット
const CRON_SECRET = process.env.ONBOARDING_CRON_SECRET || process.env.ALERT_CRON_SECRET;

/**
 * 認証チェック
 */
function checkAuth(request: NextRequest): boolean {
  const { searchParams } = new URL(request.url);
  const secretParam = searchParams.get('secret');
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  // シークレットが設定されていない場合（開発環境）
  if (!CRON_SECRET) {
    console.warn('[OnboardingReminder] CRON_SECRET is not configured');
    if (process.env.NODE_ENV === 'production') {
      return false;
    }
    return true;
  }

  return secretParam === CRON_SECRET || token === CRON_SECRET;
}

/**
 * ユーザー情報取得ヘルパー
 */
function getUserInfo(userId: string): { role: AppRole; orgUnitIds: string[] } | null {
  const user = getUserById(userId);
  if (!user) return null;
  return {
    role: user.role,
    orgUnitIds: [], // 将来的に orgUnit 対応
  };
}

/**
 * GET /api/cron/onboarding-reminder
 */
export async function GET(request: NextRequest) {
  // 認証チェック
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const preview = searchParams.get('preview') === 'true';

  try {
    // 1. 未完了ユーザーをスキャン
    const scanResult = await scanPendingUsers(getAllUserOnboardings, getUserInfo);

    // プレビューの場合は通知・チケットを作成しない
    if (preview) {
      // エスカレーション対象をカウント
      const escalationTargets = scanResult.pendingUsers.filter(
        (u) => u.escalationLevel !== 'normal' || u.oldestPendingDays >= 3
      );

      return NextResponse.json({
        success: true,
        mode: 'preview',
        scan: {
          totalPendingCount: scanResult.totalPendingCount,
          warningCount: scanResult.warningCount,
          criticalCount: scanResult.criticalCount,
          scanTime: scanResult.scanTime,
        },
        pendingUsers: scanResult.pendingUsers.map((u) => ({
          userId: u.userId,
          role: u.role,
          pendingCount: u.pendingCount,
          oldestPendingDays: u.oldestPendingDays,
          escalationLevel: u.escalationLevel,
        })),
        escalationPreview: {
          targetCount: escalationTargets.length,
          targets: escalationTargets.map((u) => ({
            userId: u.userId,
            escalationLevel: u.escalationLevel,
            oldestPendingDays: u.oldestPendingDays,
          })),
        },
      });
    }

    // 2. Manager/Admin ユーザーIDを取得
    const { users: managers } = await listUsers({ role: 'manager' });
    const { users: admins } = await listUsers({ role: 'admin' });
    const { users: executives } = await listUsers({ role: 'executive' });

    const managerUserIds = managers.map((u) => u.id);
    const adminUserIds = [...admins.map((u) => u.id), ...executives.map((u) => u.id)];

    // 3. リマインド通知を作成
    const reminderResult = executeReminders(
      scanResult,
      managerUserIds,
      adminUserIds
    );

    // 4. Ticket 099: エスカレーションチケットを作成
    const escalationResult = await createEscalationTickets(scanResult.pendingUsers);

    return NextResponse.json({
      success: true,
      mode: 'execute',
      scan: {
        totalPendingCount: scanResult.totalPendingCount,
        warningCount: scanResult.warningCount,
        criticalCount: scanResult.criticalCount,
        scanTime: scanResult.scanTime,
      },
      reminder: {
        userNotificationsCreated: reminderResult.userNotificationsCreated,
        managerDigestsCreated: reminderResult.managerDigestsCreated,
        escalationsCreated: reminderResult.escalationsCreated,
        skippedDuplicates: reminderResult.skippedDuplicates,
        errors: reminderResult.errors,
      },
      escalation: {
        ticketsCreated: escalationResult.ticketsCreated,
        ticketsSkipped: escalationResult.ticketsSkipped,
        notificationsCreated: escalationResult.notificationsCreated,
        createdTickets: escalationResult.createdTickets,
        errors: escalationResult.errors,
      },
    });
  } catch (error) {
    console.error('[OnboardingReminder] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
