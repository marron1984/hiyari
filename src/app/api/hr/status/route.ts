/**
 * HR ステータス確認 API
 *
 * Ticket 110: HR 入退社基盤
 *
 * GET /api/hr/status - 現在ユーザーの雇用ステータス確認
 *   - アクセス遮断ガードで使用
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import { getEmployeeByUserId, isAccessBlocked } from '@/lib/hr';


/**
 * GET /api/hr/status
 */
export async function GET(request: NextRequest) {
  // 認証
  const authResult = await requireApiUser(request);
  if (!isApiUser(authResult)) return authResult;
  const user = authResult;

  // 従業員レコードを検索
  const employee = getEmployeeByUserId(user.uid);

  // 従業員レコードがない場合（旧ユーザー等）
  if (!employee) {
    return NextResponse.json({
      userId: user.uid,
      found: false,
      accessBlocked: false,
      message: 'Employee record not found',
    });
  }

  // アクセス遮断チェック
  const blocked = isAccessBlocked(employee.employmentStatus);

  return NextResponse.json({
    userId: user.uid,
    found: true,
    employmentStatus: employee.employmentStatus,
    accessBlocked: blocked,
    terminationDate: employee.terminationDate,
    message: blocked
      ? 'アクセスが制限されています。退社処理が完了しているため、システムにアクセスできません。'
      : null,
  });
}
