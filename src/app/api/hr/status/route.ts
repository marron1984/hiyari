/**
 * HR ステータス確認 API
 *
 * Ticket 110: HR 入退社基盤
 *
 * GET /api/hr/status - 現在ユーザーの雇用ステータス確認
 *   - アクセス遮断ガードで使用
 */

import { NextRequest, NextResponse } from 'next/server';
import { getEmployeeByUserId, isAccessBlocked } from '@/lib/hr';

// TODO: 実際の認証から取得
function getViewerContext(request: NextRequest): { userId: string; role: string } {
  if (process.env.NODE_ENV !== 'production') {
    return { userId: 'dev-admin', role: 'admin' };
  }
  const role = request.headers.get('x-user-role') || 'viewer';
  const userId = request.headers.get('x-user-id') || 'unknown';
  return { userId, role };
}

/**
 * GET /api/hr/status
 */
export async function GET(request: NextRequest) {
  const viewer = getViewerContext(request);

  // 従業員レコードを検索
  const employee = getEmployeeByUserId(viewer.userId);

  // 従業員レコードがない場合（旧ユーザー等）
  if (!employee) {
    return NextResponse.json({
      userId: viewer.userId,
      found: false,
      accessBlocked: false,
      message: 'Employee record not found',
    });
  }

  // アクセス遮断チェック
  const blocked = isAccessBlocked(employee.employmentStatus);

  return NextResponse.json({
    userId: viewer.userId,
    found: true,
    employmentStatus: employee.employmentStatus,
    accessBlocked: blocked,
    terminationDate: employee.terminationDate,
    message: blocked
      ? 'アクセスが制限されています。退社処理が完了しているため、システムにアクセスできません。'
      : null,
  });
}
