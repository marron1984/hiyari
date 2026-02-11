/**
 * HR オフボーディングタスク API
 *
 * Ticket 110: HR 入退社基盤
 *
 * GET /api/hr/offboarding-tasks - タスク一覧
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import {
  listOffboardingTasks,
  getOverdueOffboardingTasks,
  canViewHr,
  type OffboardingTaskStatus,
} from '@/lib/hr';


/**
 * GET /api/hr/offboarding-tasks
 */
export async function GET(request: NextRequest) {
  // 認証
  const authResult = await requireApiUser(request);
  if (!isApiUser(authResult)) return authResult;
  const user = authResult;

  // RBAC
  if (!canViewHr(user.role as any)) {
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
