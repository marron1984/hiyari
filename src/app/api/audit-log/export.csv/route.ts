/**
 * 監査ログCSVエクスポートAPI
 *
 * Ticket 064-final: 横断監査ビュー
 *
 * GET /api/audit-log/export.csv - 監査ログをCSV出力
 *
 * 同じqueryでCSV出力（admin/auditorのみ）
 */

import { NextRequest, NextResponse } from 'next/server';
import type { AppRole } from '@/config/appRoles';
import { canExportAuditCsv, type AuditSource, type AuditSeverity } from '@/lib/audit/types';
import { exportAuditLogsToCsv } from '@/lib/audit/query';

// デモユーザー情報（本番ではセッションから取得）
const DEMO_USER = {
  id: 'user_admin',
  name: '管理者',
  role: 'admin' as AppRole,
};

export async function GET(request: NextRequest) {
  try {
    // RBAC: admin/auditor のみアクセス可
    if (!canExportAuditCsv(DEMO_USER.role)) {
      return NextResponse.json(
        { error: 'アクセス権限がありません' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);

    // クエリパラメータを解析
    const from = searchParams.get('from') ?? undefined;
    const to = searchParams.get('to') ?? undefined;
    const sourceParam = searchParams.get('source');
    const severityParam = searchParams.get('severity');
    const actorUserId = searchParams.get('actorUserId') ?? undefined;
    const targetType = searchParams.get('targetType') ?? undefined;
    const targetId = searchParams.get('targetId') ?? undefined;
    const q = searchParams.get('q') ?? undefined;

    // source（複数可）
    let source: AuditSource | AuditSource[] | undefined;
    if (sourceParam) {
      const sources = sourceParam.split(',').filter(Boolean) as AuditSource[];
      source = sources.length === 1 ? sources[0] : sources;
    }

    // severity（複数可）
    let severity: AuditSeverity | AuditSeverity[] | undefined;
    if (severityParam) {
      const severities = severityParam.split(',').filter(Boolean) as AuditSeverity[];
      severity = severities.length === 1 ? severities[0] : severities;
    }

    // CSV生成
    const csv = exportAuditLogsToCsv({
      from,
      to,
      source,
      severity,
      actorUserId,
      targetType,
      targetId,
      q,
    });

    // 日付をファイル名に含める
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const filename = `audit-log-${dateStr}.csv`;

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('audit-log export.csv GET error:', error);
    return NextResponse.json(
      { error: 'CSVエクスポートに失敗しました' },
      { status: 500 }
    );
  }
}
