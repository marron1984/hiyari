/**
 * HR 従業員個別 API
 *
 * Ticket 110: HR 入退社基盤
 *
 * GET /api/hr/employees/[id] - 従業員詳細
 * PATCH /api/hr/employees/[id] - 従業員更新
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import {
  getEmployeeById,
  updateEmployee,
  getHrEvents,
  listOffboardingTasks,
  canManageHr,
  canViewHr,
  type UpdateEmployeeRequest,
} from '@/lib/hr';


/**
 * GET /api/hr/employees/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 認証
  const authResult = await requireApiUser(request);
  if (!isApiUser(authResult)) return authResult;
  const user = authResult;

  const { id } = await params;

  // RBAC
  if (!canViewHr(user.role as any)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const employee = getEmployeeById(id);
  if (!employee) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const includeEvents = searchParams.get('includeEvents') === 'true';
  const includeTasks = searchParams.get('includeTasks') === 'true';

  const response: Record<string, unknown> = { employee };

  if (includeEvents) {
    response.events = getHrEvents(employee.userId, 50);
  }

  if (includeTasks) {
    response.offboardingTasks = listOffboardingTasks({ userId: employee.userId });
  }

  return NextResponse.json(response);
}

/**
 * PATCH /api/hr/employees/[id]
 */
export async function PATCH(
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

  let body: UpdateEmployeeRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const employee = updateEmployee(id, body, user.uid);
  if (!employee) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    employee,
  });
}
