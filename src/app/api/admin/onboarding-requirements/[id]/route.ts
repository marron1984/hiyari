/**
 * オンボーディング要件管理 API（個別操作）
 *
 * Ticket 094: 文書改訂時の再オンボーディング
 *
 * GET    - 要件を取得
 * PUT    - 要件を更新（requiredDocs変更時はバージョン+1）
 * DELETE - 要件を削除
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getRequirementById,
  updateRequirement,
  deleteRequirement,
} from '@/lib/onboarding/repo';
import type { UpdateOnboardingRequirementRequest } from '@/lib/onboarding/types';
import { canManageOnboardingRequirements } from '@/lib/onboarding/types';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET - 要件を取得
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    // RBAC チェック
    if (!canManageOnboardingRequirements(user.role as AppRole)) {
      return NextResponse.json(
        { error: '権限がありません' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const requirement = getRequirementById(id);

    if (!requirement) {
      return NextResponse.json(
        { error: '要件が見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json({ requirement });
  } catch (error) {
    console.error('GET /api/admin/onboarding-requirements/[id] error:', error);
    return NextResponse.json(
      { error: '要件の取得に失敗しました' },
      { status: 500 }
    );
  }
}

/**
 * PUT - 要件を更新
 *
 * Ticket 094: requiredDocs変更時はrequirementsVersion自動インクリメント
 */
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    // RBAC チェック
    if (!canManageOnboardingRequirements(user.role as AppRole)) {
      return NextResponse.json(
        { error: '権限がありません' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json() as UpdateOnboardingRequirementRequest;

    // 既存チェック
    const existing = getRequirementById(id);
    if (!existing) {
      return NextResponse.json(
        { error: '要件が見つかりません' },
        { status: 404 }
      );
    }

    // バリデーション
    if (body.requiredDocs !== undefined && body.requiredDocs.length === 0) {
      return NextResponse.json(
        { error: 'requiredDocs は1件以上必要です' },
        { status: 400 }
      );
    }

    const oldVersion = existing.requirementsVersion;

    const requirement = updateRequirement(id, {
      ...body,
      actorUserId: user.uid,
    });

    return NextResponse.json({
      success: true,
      requirement,
      versionBumped: requirement && requirement.requirementsVersion > oldVersion,
    });
  } catch (error) {
    console.error('PUT /api/admin/onboarding-requirements/[id] error:', error);
    return NextResponse.json(
      { error: '要件の更新に失敗しました' },
      { status: 500 }
    );
  }
}

/**
 * DELETE - 要件を削除
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    // RBAC チェック
    if (!canManageOnboardingRequirements(user.role as AppRole)) {
      return NextResponse.json(
        { error: '権限がありません' },
        { status: 403 }
      );
    }

    const { id } = await params;

    // 既存チェック
    const existing = getRequirementById(id);
    if (!existing) {
      return NextResponse.json(
        { error: '要件が見つかりません' },
        { status: 404 }
      );
    }

    const deleted = deleteRequirement(id);

    return NextResponse.json({
      success: deleted,
    });
  } catch (error) {
    console.error('DELETE /api/admin/onboarding-requirements/[id] error:', error);
    return NextResponse.json(
      { error: '要件の削除に失敗しました' },
      { status: 500 }
    );
  }
}
