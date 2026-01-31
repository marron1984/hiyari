// AI副社長・週次組織温度レポート Cron API
// Vercel Cronで毎週月曜 09:00 (JST) に実行

import { NextRequest, NextResponse } from 'next/server';
import { generateOrganizationHealthReport } from '@/lib/ai-organization-health';
import { createNotificationsServer } from '@/lib/notifications-server';
import { getAdminDb } from '@/lib/firebase-admin';
import { CreateNotificationInput } from '@/types/notification';

const DEFAULT_TENANT_ID = 'defaultTenant';

// Vercel Cronからのリクエストを認証
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

// アラートレベルのラベル
const ALERT_LEVEL_LABELS: Record<string, string> = {
  normal: '正常',
  attention: '注意',
  warning: '警戒',
};

// GET: レポート生成と通知送信（Vercel Cronから呼び出し）
export async function GET(request: NextRequest) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('[Cron] Starting weekly organization health report generation...');

    const report = await generateOrganizationHealthReport();

    console.log('[Cron] Report generated:', {
      period: report.period,
      overallLevel: report.overallLevel,
      totalUsers: report.totalUsers,
      attentionUsersCount: report.attentionUsers.length,
    });

    // 通知対象ユーザーを取得（リーダー以上）
    const db = getAdminDb();
    const usersSnapshot = await db
      .collection('users')
      .where('tenantId', '==', DEFAULT_TENANT_ID)
      .get();

    const roleHierarchy = ['user', 'leader', 'manager', 'admin', 'exec', 'owner'];
    const minRoleIndex = roleHierarchy.indexOf('leader');

    const notificationTargets: Array<{ id: string; name: string }> = [];
    usersSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      const userRoleIndex = roleHierarchy.indexOf(data.role || 'user');
      if (userRoleIndex >= minRoleIndex) {
        notificationTargets.push({
          id: doc.id,
          name: data.name || data.email || 'Unknown',
        });
      }
    });

    // 通知を作成
    if (notificationTargets.length > 0) {
      const levelLabel = ALERT_LEVEL_LABELS[report.overallLevel] || '正常';
      const notifications: CreateNotificationInput[] = notificationTargets.map((user) => ({
        tenantId: DEFAULT_TENANT_ID,
        userId: user.id,
        type: 'ai_organization_health',
        title: `AI副社長・組織温度レポート【${levelLabel}】`,
        message: report.aiReport.summary || `${report.period}の組織温度レポートが生成されました。`,
        actionUrl: '/dashboard/ai-vp/organization-health',
        metadata: {
          reportId: report.id,
          period: report.period,
          alertLevel: report.overallLevel,
        },
      }));

      await createNotificationsServer(notifications);
      console.log('[Cron] Notifications sent to', notificationTargets.length, 'users');
    }

    return NextResponse.json({
      success: true,
      reportId: report.id,
      period: report.period,
      overallLevel: report.overallLevel,
      totalUsers: report.totalUsers,
      totalMessages: report.totalMessages,
      attentionUsersCount: report.attentionUsers.length,
      notificationsSent: notificationTargets.length,
    });
  } catch (error) {
    console.error('[Cron] Weekly organization health report error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Report generation failed' },
      { status: 500 }
    );
  }
}

// POST: 手動でレポート生成（管理者用）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { date } = body;

    let targetDate: Date | undefined;
    if (date) {
      targetDate = new Date(date);
    }

    console.log('[Manual] Generating organization health report...', { targetDate: date });

    const report = await generateOrganizationHealthReport(targetDate);

    return NextResponse.json({
      success: true,
      report: {
        id: report.id,
        period: report.period,
        overallLevel: report.overallLevel,
        totalUsers: report.totalUsers,
        totalMessages: report.totalMessages,
        attentionUsers: report.attentionUsers.map((u) => ({
          userId: u.userId,
          userName: u.userName,
          alertLevel: u.alertLevel,
          alertReasons: u.alertReasons,
        })),
        aiReport: report.aiReport,
      },
    });
  } catch (error) {
    console.error('[Manual] Report generation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Report generation failed' },
      { status: 500 }
    );
  }
}
