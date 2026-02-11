/**
 * HR オフボーディングタスク完了 API
 *
 * Ticket 110: HR 入退社基盤
 *
 * POST /api/hr/offboarding-tasks/[id]/complete - タスク完了
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import {
  getOffboardingTask,
  completeOffboardingTask,
  canManageHr,
  type CompleteOffboardingTaskRequest,
} from '@/lib/hr';


/**
 * POST /api/hr/offboarding-tasks/[id]/complete
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 認証
  const authResult = await requireApiUser(request);
  if (!isApiUser(authResult)) return authResult;
  const user = authResult;

  const { id } = await params;

  // RBAC
  if (!canManageHr(user.role as any)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // タスク存在確認
  const existing = await getOffboardingTask(id);
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // 既に完了済みの場合
  if (existing.status === 'done') {
    return NextResponse.json(
      { error: 'Already completed' },
      { status: 400 }
    );
  }

  let body: CompleteOffboardingTaskRequest = {};
  try {
    body = await request.json();
  } catch {
    // bodyが空でもOK
  }

  try {
    const task = await completeOffboardingTask(id, body, user.uid);
    if (!task) {
      return NextResponse.json({ error: 'Failed to complete' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      task,
    });
  } catch (error) {
    console.error('[HR:OffboardingTask] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
