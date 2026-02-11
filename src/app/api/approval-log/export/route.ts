/**
 * 承認ログCSVエクスポートAPI
 *
 * GET /api/approval-log/export
 * - admin/auditor のみ
 * - Content-Type: text/csv
 */

import { NextRequest, NextResponse } from 'next/server';
import { exportApprovalLogsForCsv, type ApprovalLogFilter } from '@/lib/approvals/logRepo';
import type { AppRole } from '@/config/appRoles';
import type { RequestType, RequestStatus, ActionType } from '@/lib/approvals/types';
import { requireApiUser, isApiUser } from '@/lib/api-auth';

function escapeCSV(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  // カンマ、改行、ダブルクォートを含む場合はエスケープ
  if (value.includes(',') || value.includes('\n') || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const { searchParams } = new URL(request.url);

    // クエリパラメータからフィルタを構築
    const filter: Omit<ApprovalLogFilter, 'limit' | 'offset'> = {};

    const dateFrom = searchParams.get('dateFrom');
    if (dateFrom) {
      filter.dateFrom = dateFrom;
    }

    const dateTo = searchParams.get('dateTo');
    if (dateTo) {
      filter.dateTo = dateTo;
    }

    const requestType = searchParams.get('requestType');
    if (requestType && ['expense', 'overtime', 'generic'].includes(requestType)) {
      filter.requestType = requestType as RequestType;
    }

    const action = searchParams.get('action');
    if (action && ['submit', 'approve', 'reject', 'return', 'cancel', 'comment'].includes(action)) {
      filter.action = action as ActionType;
    }

    const status = searchParams.get('status');
    if (status && ['draft', 'pending', 'approved', 'rejected', 'returned', 'cancelled'].includes(status)) {
      filter.status = status as RequestStatus;
    }

    const actorUserId = searchParams.get('actorUserId');
    if (actorUserId) {
      filter.actorUserId = actorUserId;
    }

    const requesterUserId = searchParams.get('requesterUserId');
    if (requesterUserId) {
      filter.requesterUserId = requesterUserId;
    }

    // エクスポート実行（RBAC適用）
    const result = exportApprovalLogsForCsv(filter, user.role as AppRole, user.uid);

    if (!result.allowed) {
      return NextResponse.json(
        { error: result.error ?? 'エクスポート権限がありません' },
        { status: 403 }
      );
    }

    const items = result.data ?? [];

    // CSVヘッダー
    const headers = [
      '日時',
      '申請ID',
      '申請種別',
      'タイトル',
      '申請者ID',
      '申請者名',
      '実行者ID',
      '実行者名',
      'アクション',
      '現在ステータス',
      '備考',
    ];

    // CSV行を生成
    const rows = items.map((item) => [
      item.createdAt,
      item.request.id,
      item.request.requestType,
      escapeCSV(item.request.title),
      item.request.requester.id,
      escapeCSV(item.request.requester.name),
      item.actor.id,
      escapeCSV(item.actor.name),
      item.action,
      item.request.status,
      escapeCSV(item.note),
    ]);

    // CSV文字列を生成
    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.join(',')),
    ].join('\n');

    // BOM付きUTF-8で返す（Excelで開けるように）
    const bom = '\uFEFF';
    const csvWithBom = bom + csvContent;

    // ファイル名を生成
    const now = new Date();
    const filename = `approval_log_${now.toISOString().slice(0, 10)}.csv`;

    return new NextResponse(csvWithBom, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('approval-log export GET error:', error);
    return NextResponse.json(
      { error: 'エクスポートに失敗しました' },
      { status: 500 }
    );
  }
}
