// AI副社長・日次違和感レポート Cron API
// Vercel Cronで毎日08:30 (JST) に実行

import { NextRequest, NextResponse } from 'next/server';
import { generateDailyAnomalyReport } from '@/lib/ai-anomaly-report';
import { createNotificationsServer } from '@/lib/notifications-server';
import { getAdminDb } from '@/lib/firebase-admin';
import { CreateNotificationInput } from '@/types/notification';

const DEFAULT_TENANT_ID = 'defaultTenant';

// Vercel Cronからのリクエストを認証
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

// アラートレベルのラベル
const ALERT_LEVEL_LABELS: Record<string, string> = {
  normal: '正常',
  attention: '注意',
  warning: '警戒',
  priority: '優先',
};

// GET: レポート生成と通知送信（Vercel Cronから呼び出し）
export async function GET(request: NextRequest) {
  // 認証チェック
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('[Cron] Starting daily anomaly report generation...');

    // レポート生成
    const report = await generateDailyAnomalyReport();

    console.log('[Cron] Report generated:', {
      date: report.date,
      overallLevel: report.overallLevel,
      diffsCount: report.diffs.length,
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
        type: 'ai_anomaly_report',
        title: `AI副社長・日次違和感レポート【${levelLabel}】`,
        message: report.aiReport.summary || '本日のレポートが生成されました。',
        actionUrl: '/dashboard/admin',
        metadata: {
          reportId: report.id,
          reportDate: report.date,
          alertLevel: report.overallLevel,
        },
      }));

      await createNotificationsServer(notifications);

      console.log('[Cron] Notifications sent to', notificationTargets.length, 'users');
    }

    return NextResponse.json({
      success: true,
      reportId: report.id,
      date: report.date,
      overallLevel: report.overallLevel,
      diffsCount: report.diffs.length,
      notificationsSent: notificationTargets.length,
    });
  } catch (error) {
    console.error('[Cron] Daily anomaly report error:', error);
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

    // 特定日付のレポート生成
    let targetDate: Date | undefined;
    if (date) {
      targetDate = new Date(date);
      targetDate.setDate(targetDate.getDate() + 1); // 入力日の翌日として処理
    }

    console.log('[Manual] Generating anomaly report...', { targetDate: date });

    const report = await generateDailyAnomalyReport(targetDate);

    return NextResponse.json({
      success: true,
      report: {
        id: report.id,
        date: report.date,
        overallLevel: report.overallLevel,
        diffsCount: report.diffs.length,
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
