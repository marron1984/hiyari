/**
 * HR 退社処理 API
 *
 * Ticket 110: HR 入退社基盤
 *
 * POST /api/hr/employees/[id]/terminate - 退社処理開始
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getEmployeeById,
  terminateEmployee,
  canManageHr,
  type TerminateEmployeeRequest,
} from '@/lib/hr';

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
 * POST /api/hr/employees/[id]/terminate
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const viewer = getViewerContext(request);
  const { id } = await params;

  // RBAC
  if (!canManageHr(viewer.role as any)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 従業員存在確認
  const existing = getEmployeeById(id);
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // 既に退社済みの場合
  if (existing.employmentStatus === 'terminated') {
    return NextResponse.json(
      { error: 'Already terminated' },
      { status: 400 }
    );
  }

  let body: TerminateEmployeeRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // バリデーション
  if (!body.terminationDate) {
    return NextResponse.json(
      { error: 'terminationDate is required' },
      { status: 400 }
    );
  }

  try {
    const result = terminateEmployee(id, body, viewer.userId);
    if (!result) {
      return NextResponse.json({ error: 'Failed to terminate' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      employee: result.employee,
      offboardingTasks: result.tasks,
      message: `退社処理を開始しました。${result.tasks.length}件のオフボーディングタスクが作成されました。`,
    });
  } catch (error) {
    console.error('[HR:Terminate] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
