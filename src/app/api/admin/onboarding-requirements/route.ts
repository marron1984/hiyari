/**
 * オンボーディング要件管理 API
 *
 * Ticket 094: 文書改訂時の再オンボーディング
 *
 * GET  - 要件一覧を取得
 * POST - 新規要件を作成
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import {
  listRequirements,
  createRequirement,
  getCurrentRequirementsVersion,
} from '@/lib/onboarding/repo';
import type { CreateOnboardingRequirementRequest } from '@/lib/onboarding/types';
import { canManageOnboardingRequirements } from '@/lib/onboarding/types';

/**
 * GET - 要件一覧を取得
 */
export async function GET(request: NextRequest) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // RBAC チェック
    if (!canManageOnboardingRequirements(currentUser.role)) {
      return NextResponse.json(
        { error: '権限がありません' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const isActive = searchParams.get('isActive');
    const scopeType = searchParams.get('scopeType');

    const filter: { isActive?: boolean; scopeType?: string } = {};
    if (isActive !== null) {
      filter.isActive = isActive === 'true';
    }
    if (scopeType) {
      filter.scopeType = scopeType;
    }

    const requirements = listRequirements(filter);
    const currentVersion = getCurrentRequirementsVersion();

    return NextResponse.json({
      requirements,
      currentVersion,
    });
  } catch (error) {
    console.error('GET /api/admin/onboarding-requirements error:', error);
    return NextResponse.json(
      { error: '要件の取得に失敗しました' },
      { status: 500 }
    );
  }
}

/**
 * POST - 新規要件を作成
 */
export async function POST(request: NextRequest) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // RBAC チェック
    if (!canManageOnboardingRequirements(currentUser.role)) {
      return NextResponse.json(
        { error: '権限がありません' },
        { status: 403 }
      );
    }

    const body = await request.json() as CreateOnboardingRequirementRequest;

    // バリデーション
    if (!body.scopeType) {
      return NextResponse.json(
        { error: 'scopeType は必須です' },
        { status: 400 }
      );
    }
    if (!body.requiredDocs || body.requiredDocs.length === 0) {
      return NextResponse.json(
        { error: 'requiredDocs は1件以上必要です' },
        { status: 400 }
      );
    }

    const requirement = createRequirement({
      ...body,
      actorUserId: currentUser.id,
    });

    return NextResponse.json({
      success: true,
      requirement,
    });
  } catch (error) {
    console.error('POST /api/admin/onboarding-requirements error:', error);
    return NextResponse.json(
      { error: '要件の作成に失敗しました' },
      { status: 500 }
    );
  }
}
