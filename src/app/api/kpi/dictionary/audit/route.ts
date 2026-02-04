/**
 * KPI辞書棚卸しAPI（Task 056）
 *
 * GET /api/kpi/dictionary/audit
 *   - 未整備KPIの検出とサマリーを取得
 *   - ?preview=true: チケット生成のプレビュー
 *
 * POST /api/kpi/dictionary/audit
 *   - 未整備KPIに対してチケットを自動生成
 *   - 冪等（既存チケットがあればスキップ）
 *
 * GET /api/kpi/dictionary/audit?cron=true&secret=...
 *   - Cron用エンドポイント（weekly-opsから呼び出し）
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  findIncompleteKpis,
  getIncompleteKpiSummary,
  generateKpiMaintenanceTickets,
  runWeeklyKpiAudit,
  type FindIncompleteKpisOptions,
  type GenerateKpiMaintenanceTicketsOptions,
} from '@/lib/kpiDictionary/findIncompleteKpis';

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
    console.warn('[KpiAudit] CRON_SECRET is not configured');
    if (process.env.NODE_ENV === 'production') {
      return false;
    }
    return true;
  }

  return secretParam === CRON_SECRET || token === CRON_SECRET;
}

/**
 * GET /api/kpi/dictionary/audit
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const isCron = searchParams.get('cron') === 'true';
  const preview = searchParams.get('preview') === 'true';
  const activeOnly = searchParams.get('activeOnly') !== 'false';
  const requiredOnly = searchParams.get('requiredOnly') === 'true';
  const includeAnomalyRules = searchParams.get('includeAnomalyRules') !== 'false';
  const categoriesParam = searchParams.get('categories');
  const ownerRolesParam = searchParams.get('ownerRoles');
  const highSeverityOnly = searchParams.get('highSeverityOnly') === 'true';
  const maxTicketsParam = searchParams.get('maxTickets');

  // Cronモード
  if (isCron) {
    if (!verifyCronRequest(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
      console.log('[KpiAudit] Cron execution started...');

      const result = runWeeklyKpiAudit({
        activeOnly,
        requiredOnly,
        includeAnomalyRules,
        highSeverityOnly,
        maxTickets: maxTicketsParam ? parseInt(maxTicketsParam, 10) : 10,
        dryRun: false,
      });

      console.log('[KpiAudit] Cron execution completed:', {
        totalIncomplete: result.summary.total,
        ticketsCreated: result.ticketsGenerated.created,
        ticketsSkipped: result.ticketsGenerated.skipped,
      });

      return NextResponse.json({
        success: true,
        ...result,
      });
    } catch (error) {
      console.error('[KpiAudit] Cron error:', error);
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
        { status: 500 }
      );
    }
  }

  // 通常モード（プレビュー/一覧取得）
  try {
    const options: FindIncompleteKpisOptions = {
      activeOnly,
      requiredOnly,
      includeAnomalyRules,
      categories: categoriesParam ? categoriesParam.split(',') : undefined,
      ownerRoles: ownerRolesParam ? ownerRolesParam.split(',') : undefined,
    };

    const summary = getIncompleteKpiSummary(options);
    const incompleteKpis = findIncompleteKpis(options);

    // プレビューモード
    if (preview) {
      const previewResult = generateKpiMaintenanceTickets({
        ...options,
        highSeverityOnly,
        maxTickets: maxTicketsParam ? parseInt(maxTicketsParam, 10) : 10,
        dryRun: true,
      });

      return NextResponse.json({
        success: true,
        preview: true,
        summary,
        incompleteKpis,
        ticketPreview: {
          wouldCreate: previewResult.created,
          wouldSkip: previewResult.skipped,
          existingTicketIds: previewResult.existingTicketIds,
        },
      });
    }

    return NextResponse.json({
      success: true,
      summary,
      incompleteKpis,
    });
  } catch (error) {
    console.error('[KpiAudit] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/kpi/dictionary/audit
 * チケット自動生成を実行
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const options: GenerateKpiMaintenanceTicketsOptions = {
      activeOnly: body.activeOnly ?? true,
      requiredOnly: body.requiredOnly ?? false,
      includeAnomalyRules: body.includeAnomalyRules ?? true,
      categories: body.categories,
      ownerRoles: body.ownerRoles,
      highSeverityOnly: body.highSeverityOnly ?? false,
      maxTickets: body.maxTickets ?? 10,
      dueDays: body.dueDays ?? 14,
      dryRun: body.dryRun ?? false,
    };

    console.log('[KpiAudit] Manual execution started:', options);

    const result = generateKpiMaintenanceTickets(options);

    console.log('[KpiAudit] Manual execution completed:', {
      created: result.created,
      skipped: result.skipped,
    });

    return NextResponse.json({
      success: true,
      dryRun: options.dryRun,
      created: result.created,
      skipped: result.skipped,
      existingTicketIds: result.existingTicketIds,
      newTickets: result.newTickets.map((t) => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        category: t.category,
        dueAt: t.dueAt,
        createdAt: t.createdAt,
      })),
    });
  } catch (error) {
    console.error('[KpiAudit] Manual execution error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
