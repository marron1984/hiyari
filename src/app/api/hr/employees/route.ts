/**
 * HR 従業員 API
 *
 * Ticket 110: HR 入退社基盤
 *
 * GET /api/hr/employees - 従業員一覧
 * POST /api/hr/employees - 従業員登録（入社手続き開始）
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  listEmployees,
  createEmployee,
  getHrStats,
  canManageHr,
  canViewHr,
  type EmploymentStatus,
  type CreateEmployeeRequest,
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
 * GET /api/hr/employees
 */
export async function GET(request: NextRequest) {
  const viewer = getViewerContext(request);

  // RBAC
  if (!canViewHr(viewer.role as any)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') as EmploymentStatus | null;
  const onboardingStatus = searchParams.get('onboardingStatus') as 'pending' | 'completed' | null;
  const businessUnitId = searchParams.get('businessUnitId');
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);
  const includeStats = searchParams.get('includeStats') === 'true';

  const result = listEmployees({
    status: status ?? undefined,
    onboardingStatus: onboardingStatus ?? undefined,
    businessUnitId: businessUnitId ?? undefined,
    limit,
    offset,
  });

  const response: Record<string, unknown> = {
    employees: result.employees,
    total: result.total,
  };

  if (includeStats) {
    response.stats = getHrStats();
  }

  return NextResponse.json(response);
}

/**
 * POST /api/hr/employees
 */
export async function POST(request: NextRequest) {
  const viewer = getViewerContext(request);

  // RBAC
  if (!canManageHr(viewer.role as any)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: CreateEmployeeRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // バリデーション
  if (!body.displayName || !body.email || !body.role || !body.hireDate) {
    return NextResponse.json(
      { error: 'displayName, email, role, hireDate are required' },
      { status: 400 }
    );
  }

  try {
    const employee = createEmployee(body, viewer.userId);

    return NextResponse.json({
      success: true,
      employee,
    });
  } catch (error) {
    console.error('[HR:Employees] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
