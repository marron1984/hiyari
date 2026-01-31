// AI副社長・組織温度レポート取得 API

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';
import {
  getLatestOrganizationHealthReport,
  getOrganizationHealthReportHistory,
} from '@/lib/ai-organization-health';

// GET: 最新のレポートを取得
export async function GET(request: NextRequest) {
  try {
    // 認証チェック
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const auth = getAdminAuth();

    try {
      await auth.verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // クエリパラメータ
    const { searchParams } = new URL(request.url);
    const history = searchParams.get('history') === 'true';
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    if (history) {
      // 履歴を取得
      const reports = await getOrganizationHealthReportHistory(limit);
      return NextResponse.json({
        success: true,
        reports: reports.map((r) => ({
          id: r.id,
          period: r.period,
          periodStart: r.periodStart.toISOString(),
          periodEnd: r.periodEnd.toISOString(),
          generatedAt: r.generatedAt.toISOString(),
          overallLevel: r.overallLevel,
          totalUsers: r.totalUsers,
          totalMessages: r.totalMessages,
          attentionUsersCount: r.attentionUsers.length,
        })),
      });
    }

    // 最新のレポートを取得
    const report = await getLatestOrganizationHealthReport();

    if (!report) {
      return NextResponse.json({ error: 'レポートが見つかりません' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      report: {
        id: report.id,
        period: report.period,
        periodStart: report.periodStart.toISOString(),
        periodEnd: report.periodEnd.toISOString(),
        generatedAt: report.generatedAt.toISOString(),
        overallLevel: report.overallLevel,
        totalUsers: report.totalUsers,
        totalMessages: report.totalMessages,
        attentionUsers: report.attentionUsers.map((u) => ({
          userId: u.userId,
          userName: u.userName,
          baseId: u.baseId,
          baseName: u.baseName,
          messageCount: u.messageCount,
          avgReplyTimeSec: u.avgReplyTimeSec,
          nightMessageRate: u.nightMessageRate,
          alertLevel: u.alertLevel,
          alertReasons: u.alertReasons,
        })),
        baseMetrics: report.baseMetrics.map((b) => ({
          baseId: b.baseId,
          baseName: b.baseName,
          totalMessages: b.totalMessages,
          avgReplyTimeSec: b.avgReplyTimeSec,
          nightMessageRate: b.nightMessageRate,
          activeUserCount: b.activeUserCount,
          alertLevel: b.alertLevel,
        })),
        stats: report.stats,
        aiReport: report.aiReport,
      },
    });
  } catch (error) {
    console.error('Failed to get organization health report:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'レポートの取得に失敗しました' },
      { status: 500 }
    );
  }
}
