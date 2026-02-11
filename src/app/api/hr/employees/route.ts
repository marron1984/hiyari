/**
 * HR 従業員 API
 *
 * Ticket 110: HR 入退社基盤
 *
 * GET /api/hr/employees - 従業員一覧
 * POST /api/hr/employees - 従業員登録（入社手続き開始）
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import {
  listEmployees,
  createEmployee,
  getHrStats,
  canManageHr,
  canViewHr,
  type EmploymentStatus,
  type CreateEmployeeRequest,
} from '@/lib/hr';


/**
 * GET /api/hr/employees
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
  const status = searchParams.get('status') as EmploymentStatus | null;
  const onboardingStatus = searchParams.get('onboardingStatus') as 'pending' | 'completed' | null;
  const businessUnitId = searchParams.get('businessUnitId');
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);
  const includeStats = searchParams.get('includeStats') === 'true';

  const result = await listEmployees({
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
    response.stats = await getHrStats();
  }

  return NextResponse.json(response);
}

/**
 * POST /api/hr/employees
 */
export async function POST(request: NextRequest) {
  // 認証
  const authResult = await requireApiUser(request);
  if (!isApiUser(authResult)) return authResult;
  const user = authResult;

  // RBAC
  if (!canManageHr(user.role as any)) {
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
    const employee = await createEmployee(body, user.uid);

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
