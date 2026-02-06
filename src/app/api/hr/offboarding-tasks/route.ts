/**
 * HR オフボーディングタスク API
 *
 * Ticket 110: HR 入退社基盤
 *
 * GET /api/hr/offboarding-tasks - タスク一覧
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  listOffboardingTasks,
  getOverdueOffboardingTasks,
  canViewHr,
  type OffboardingTaskStatus,
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
 * GET /api/hr/offboarding-tasks
 */
export async function GET(request: NextRequest) {
  const viewer = getViewerContext(request);

  // RBAC
  if (!canViewHr(viewer.role as any)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const status = searchParams.get('status') as OffboardingTaskStatus | null;
  const overdueOnly = searchParams.get('overdueOnly') === 'true';

  if (overdueOnly) {
    const tasks = getOverdueOffboardingTasks();
    return NextResponse.json({
      tasks,
      total: tasks.length,
    });
  }

  const tasks = listOffboardingTasks({
    userId: userId ?? undefined,
    status: status ?? undefined,
  });

  return NextResponse.json({
    tasks,
    total: tasks.length,
  });
}
