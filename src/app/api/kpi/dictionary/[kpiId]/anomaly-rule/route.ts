/**
 * KPI異常検知ルールAPI
 *
 * GET /api/kpi/dictionary/[kpiId]/anomaly-rule - ルール取得
 * PATCH /api/kpi/dictionary/[kpiId]/anomaly-rule - ルール更新（admin or manager）
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';
import { getAnomalyRule, upsertAnomalyRule } from '@/lib/kpiDictionary/anomalyRuleRepo';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ kpiId: string }> }
) {
  // 認証
  const authResult = await requireApiUser(request);
  if (!isApiUser(authResult)) return authResult;

  const { kpiId } = await params;

  const rule = getAnomalyRule(kpiId);

  if (!rule) {
    // ルールがない場合はデフォルト値を返す
    return NextResponse.json({
      rule: {
        kpiId,
        enabled: true,
        missingDataAlert: true,
        thresholdHigh: null,
        thresholdLow: null,
        maxPercentChange: 30,
        compareTo: 'prevDay',
        zScoreWindowDays: null,
        zScoreThreshold: null,
        updatedAt: new Date().toISOString(),
      },
    });
  }

  return NextResponse.json({ rule });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ kpiId: string }> }
) {
  // 認証
  const authResult = await requireApiUser(request);
  if (!isApiUser(authResult)) return authResult;
  const user = authResult;

  const { kpiId } = await params;

  // 権限チェック（admin or manager）
  if (!(['admin', 'executive', 'manager'] as AppRole[]).includes(user.role as AppRole)) {
    return NextResponse.json(
      { error: 'アクセス権限がありません（管理職以上のみ）' },
      { status: 403 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'リクエストボディが不正です' },
      { status: 400 }
    );
  }

  const result = upsertAnomalyRule(kpiId, body, user.uid);

  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    rule: result.rule,
  });
}
