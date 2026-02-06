/**
 * HR オフボーディングタスク完了 API
 *
 * Ticket 110: HR 入退社基盤
 *
 * POST /api/hr/offboarding-tasks/[id]/complete - タスク完了
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getOffboardingTask,
  completeOffboardingTask,
  canManageHr,
  type CompleteOffboardingTaskRequest,
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
 * POST /api/hr/offboarding-tasks/[id]/complete
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

  // タスク存在確認
  const existing = getOffboardingTask(id);
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
    const task = completeOffboardingTask(id, body, viewer.userId);
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
