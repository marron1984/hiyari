/**
 * 監査ログAPI
 *
 * Ticket 064-final: 横断監査ビュー
 *
 * GET /api/audit-log - 監査ログを横断検索
 *
 * query params:
 * - from/to: ISO or YYYY-MM-DD
 * - source: ソース（複数可、カンマ区切り）
 * - severity: 重要度（複数可、カンマ区切り）
 * - actorUserId: アクターユーザーID
 * - targetType: 対象種別
 * - targetId: 対象ID
 * - q: テキスト検索
 * - limit/offset: ページネーション
 */

import { NextRequest, NextResponse } from 'next/server';
import type { AppRole } from '@/config/appRoles';
import { canAccessAuditView, type AuditSource, type AuditSeverity } from '@/lib/audit/types';
import { queryAuditLogs } from '@/lib/audit/query';
import { requireApiUser, isApiUser } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    // RBAC: admin/auditor のみアクセス可
    if (!canAccessAuditView(user.role as AppRole)) {
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
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 100;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : 0;

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

    // クエリ実行
    const result = queryAuditLogs({
      from,
      to,
      source,
      severity,
      actorUserId,
      targetType,
      targetId,
      q,
      limit,
      offset,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('audit-log GET error:', error);
    return NextResponse.json(
      { error: '監査ログの取得に失敗しました' },
      { status: 500 }
    );
  }
}
