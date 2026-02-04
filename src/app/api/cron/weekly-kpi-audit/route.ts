/**
 * 週次KPI辞書棚卸し Cron API（Task 056）
 *
 * GET /api/cron/weekly-kpi-audit?secret=...
 *   - 週次でKPI辞書の未整備項目を検出
 *   - 運用チケットを自動生成
 *   - Vercel Cronで毎週月曜 10:00 (JST) に実行
 *
 * 冪等性：既にopenチケットがあるKPIはスキップ
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  runWeeklyKpiAudit,
  getIncompleteKpiSummary,
  MISSING_FIELD_LABELS,
} from '@/lib/kpiDictionary/findIncompleteKpis';
import { createNotificationsServer } from '@/lib/notifications-server';
import { getAdminDb } from '@/lib/firebase-admin';
import type { CreateNotificationInput } from '@/types/notification';

const DEFAULT_TENANT_ID = 'defaultTenant';

// Cron認証用シークレット
const CRON_SECRET = process.env.CRON_SECRET || process.env.DAILY_OPS_SECRET;

/**
 * Cron認証チェック
 */
function verifyCronRequest(request: NextRequest): boolean {
  const { searchParams } = new URL(request.url);
  const secretParam = searchParams.get('secret');
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!CRON_SECRET) {
    console.warn('[WeeklyKpiAudit] CRON_SECRET is not configured');
    if (process.env.NODE_ENV === 'production') {
      return false;
    }
    return true;
  }

  return secretParam === CRON_SECRET || token === CRON_SECRET;
}

/**
 * 通知対象ユーザーを取得（manager以上）
 */
async function getNotificationTargets(): Promise<Array<{ id: string; name: string }>> {
  try {
    const db = getAdminDb();
    const usersSnapshot = await db
      .collection('users')
      .where('tenantId', '==', DEFAULT_TENANT_ID)
      .get();

    const roleHierarchy = ['user', 'leader', 'manager', 'admin', 'exec', 'owner'];
    const minRoleIndex = roleHierarchy.indexOf('manager');

    const targets: Array<{ id: string; name: string }> = [];
    usersSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      const userRoleIndex = roleHierarchy.indexOf(data.role || 'user');
      if (userRoleIndex >= minRoleIndex) {
        targets.push({
          id: doc.id,
          name: data.name || data.email || 'Unknown',
        });
      }
    });

    return targets;
  } catch (error) {
    console.warn('[WeeklyKpiAudit] Failed to get notification targets:', error);
    return [];
  }
}

/**
 * GET /api/cron/weekly-kpi-audit
 */
export async function GET(request: NextRequest) {
  // 認証チェック
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get('dryRun') === 'true';
  const skipNotification = searchParams.get('skipNotification') === 'true';
  const highSeverityOnly = searchParams.get('highSeverityOnly') === 'true';
  const maxTicketsParam = searchParams.get('maxTickets');

  try {
    console.log('[WeeklyKpiAudit] Starting weekly KPI dictionary audit...');

    // 週次棚卸し実行
    const result = runWeeklyKpiAudit({
      activeOnly: true,
      requiredOnly: false,
      includeAnomalyRules: true,
      highSeverityOnly,
      maxTickets: maxTicketsParam ? parseInt(maxTicketsParam, 10) : 10,
      dueDays: 14,
      dryRun,
    });

    console.log('[WeeklyKpiAudit] Audit completed:', {
      totalIncomplete: result.summary.total,
      bySeverity: result.summary.bySeverity,
      ticketsCreated: result.ticketsGenerated.created,
      ticketsSkipped: result.ticketsGenerated.skipped,
    });

    // 通知送信（チケット作成時のみ）
    let notificationsSent = 0;
    if (!skipNotification && !dryRun && result.ticketsGenerated.created > 0) {
      const targets = await getNotificationTargets();

      if (targets.length > 0) {
        // サマリーメッセージ作成
        const severityParts: string[] = [];
        if (result.summary.bySeverity.high > 0) {
          severityParts.push(`高優先度: ${result.summary.bySeverity.high}件`);
        }
        if (result.summary.bySeverity.medium > 0) {
          severityParts.push(`中優先度: ${result.summary.bySeverity.medium}件`);
        }
        if (result.summary.bySeverity.low > 0) {
          severityParts.push(`低優先度: ${result.summary.bySeverity.low}件`);
        }

        const summaryText = severityParts.join('、') || '0件';

        const notifications: CreateNotificationInput[] = targets.map((user) => ({
          tenantId: DEFAULT_TENANT_ID,
          userId: user.id,
          type: 'kpi_audit',
          title: `KPI辞書棚卸し: ${result.ticketsGenerated.created}件のチケット生成`,
          message: `未整備KPI ${result.summary.total}件を検出（${summaryText}）。チケットで対応をお願いします。`,
          actionUrl: '/dashboard/tickets?category=ops&tags=kpi_maintenance',
          metadata: {
            auditedAt: result.auditedAt,
            totalIncomplete: result.summary.total,
            ticketsCreated: result.ticketsGenerated.created,
          },
        }));

        try {
          await createNotificationsServer(notifications);
          notificationsSent = targets.length;
          console.log('[WeeklyKpiAudit] Notifications sent to', notificationsSent, 'users');
        } catch (notifyError) {
          console.warn('[WeeklyKpiAudit] Notification error:', notifyError);
        }
      }
    }

    return NextResponse.json({
      success: true,
      dryRun,
      auditedAt: result.auditedAt,
      summary: {
        totalIncomplete: result.summary.total,
        bySeverity: result.summary.bySeverity,
        byCategory: result.summary.byCategory,
        byOwnerRole: result.summary.byOwnerRole,
        byMissingField: result.summary.byMissingField,
      },
      tickets: {
        created: result.ticketsGenerated.created,
        skipped: result.ticketsGenerated.skipped,
        existingCount: result.ticketsGenerated.existingTicketIds.length,
        newTicketIds: result.ticketsGenerated.newTickets.map((t) => t.id),
      },
      notificationsSent,
    });
  } catch (error) {
    console.error('[WeeklyKpiAudit] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cron/weekly-kpi-audit
 * POSTでも同様に実行（Cron互換）
 */
export async function POST(request: NextRequest) {
  return GET(request);
}
