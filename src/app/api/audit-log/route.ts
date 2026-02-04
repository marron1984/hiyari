/**
 * 監査ログ API
 *
 * GET /api/audit-log
 *   - 横断ログ一覧を取得
 *   - admin/auditor のみアクセス可能
 *
 * Implementation Ticket 064
 */

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import {
  queryAuditLog,
  canViewAuditLog,
  type AuditLogFilter,
  type AuditSource,
  type AuditSeverity,
  type AuditTargetType,
} from '@/lib/audit';
import type { AppRole } from '@/config/appRoles';

// 有効なAppRoleかチェック
function isValidAppRole(role: string): role is AppRole {
  return ['staff', 'leader', 'manager', 'executive', 'admin', 'auditor'].includes(role);
}

// ヘッダーからユーザー情報を取得
async function getViewerFromHeaders(): Promise<{ userId: string; role: AppRole }> {
  const headersList = await headers();
  const userIdHeader = headersList.get('x-user-id');
  const roleHeader = headersList.get('x-user-role');

  const userId = userIdHeader ?? 'user_001';
  const role: AppRole =
    roleHeader && isValidAppRole(roleHeader) ? (roleHeader as AppRole) : 'staff';

  return { userId, role };
}

export async function GET(request: NextRequest) {
  try {
    const { userId, role } = await getViewerFromHeaders();

    // 権限チェック
    if (!canViewAuditLog(role)) {
      return NextResponse.json(
        { success: false, error: '監査ログの閲覧権限がありません' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);

    // フィルタ構築
    const filter: AuditLogFilter = {};

    // 期間
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    if (from) filter.from = from;
    if (to) filter.to = to;

    // ソース
    const source = searchParams.get('source');
    const sources = searchParams.get('sources');
    if (source) {
      filter.source = source as AuditSource;
    } else if (sources) {
      filter.sources = sources.split(',') as AuditSource[];
    }

    // 重要度
    const severity = searchParams.get('severity');
    if (severity) filter.severity = severity as AuditSeverity;

    // アクター
    const actorUserId = searchParams.get('actorUserId');
    if (actorUserId) filter.actorUserId = actorUserId;

    // ターゲット
    const targetType = searchParams.get('targetType');
    const targetId = searchParams.get('targetId');
    if (targetType) filter.targetType = targetType as AuditTargetType;
    if (targetId) filter.targetId = targetId;

    // テキスト検索
    const q = searchParams.get('q');
    if (q) filter.q = q;

    // ページネーション
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');
    if (limit) filter.limit = parseInt(limit, 10);
    if (offset) filter.offset = parseInt(offset, 10);

    // クエリ実行
    const result = queryAuditLog(filter);

    return NextResponse.json({
      success: true,
      ...result,
      _meta: {
        viewerUserId: userId,
        viewerRole: role,
        filter,
      },
    });
  } catch (error) {
    console.error('[AuditLog] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
