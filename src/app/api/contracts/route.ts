/**
 * 契約管理API
 *
 * GET  /api/contracts - 契約一覧取得
 * POST /api/contracts - 契約作成
 */

import { NextRequest, NextResponse } from 'next/server';
import { listContracts, createContract } from '@/lib/contracts/repo';
import { canEditContracts } from '@/lib/contracts/types';
import type { ContractStatus, ContractType, ContractRiskLevel } from '@/lib/contracts/types';
import type { UserRole } from '@/lib/contracts/types';

const DEMO_USER = {
  userId: 'user_manager',
  role: 'manager' as UserRole,
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const status = searchParams.get('status') as ContractStatus | undefined;
    const type = searchParams.get('type') as ContractType | undefined;
    const riskLevel = searchParams.get('riskLevel') as ContractRiskLevel | undefined;
    const q = searchParams.get('q');
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');

    const filters = {
      status: status || undefined,
      type: type || undefined,
      riskLevel: riskLevel || undefined,
      q: q || undefined,
    };

    const pagination = {
      limit: limitParam ? parseInt(limitParam, 10) : 50,
      offset: offsetParam ? parseInt(offsetParam, 10) : 0,
    };

    const viewer = { userId: DEMO_USER.userId, role: DEMO_USER.role };
    const { items, total } = listContracts(viewer, filters, pagination);

    return NextResponse.json({ contracts: items, total });
  } catch (error) {
    console.error('contracts GET error:', error);
    return NextResponse.json(
      { error: '契約一覧の取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!canEditContracts(DEMO_USER.role)) {
      return NextResponse.json(
        { error: '権限がありません' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, type, counterpartyName, startAt, endAt } = body;

    if (!name || !type || !counterpartyName || !startAt || !endAt) {
      return NextResponse.json(
        { error: '必須項目が不足しています' },
        { status: 400 }
      );
    }

    const contract = createContract(body, DEMO_USER.userId);

    return NextResponse.json({ contract }, { status: 201 });
  } catch (error) {
    console.error('contracts POST error:', error);
    return NextResponse.json(
      { error: '契約の作成に失敗しました' },
      { status: 500 }
    );
  }
}
