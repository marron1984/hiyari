/**
 * 空室更新提案 個別API
 *
 * Ticket 075: 空室情報の自動更新支援
 *
 * GET /api/vacancy-suggestions/[id] - 詳細
 * POST /api/vacancy-suggestions/[id] - 適用/却下
 *
 * RBAC: admin/manager のみ操作可能
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getSuggestionById,
  applySuggestion,
  dismissSuggestion,
} from '@/lib/vacancySuggestions/repo';
import { canManageSuggestions, canViewSuggestions } from '@/lib/vacancySuggestions/types';
import type { AppRole } from '@/config/appRoles';
import { requireApiUser, isApiUser } from '@/lib/api-auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const { id } = await params;

    const viewer = { userId: user.uid, role: user.role as AppRole };
    if (!canViewSuggestions(viewer)) {
      return NextResponse.json(
        { error: '提案を閲覧する権限がありません' },
        { status: 403 }
      );
    }

    const suggestion = getSuggestionById(id);
    if (!suggestion) {
      return NextResponse.json(
        { error: '提案が見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json({ suggestion });
  } catch (error) {
    console.error('vacancy-suggestions/[id] GET error:', error);
    return NextResponse.json(
      { error: '提案の取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const { id } = await params;

    const viewer = { userId: user.uid, role: user.role as AppRole };
    if (!canManageSuggestions(viewer)) {
      return NextResponse.json(
        { error: '提案を操作する権限がありません' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { action, reason } = body;

    if (!action || !['apply', 'dismiss'].includes(action)) {
      return NextResponse.json(
        { error: 'action は apply または dismiss を指定してください' },
        { status: 400 }
      );
    }

    let result;
    if (action === 'apply') {
      result = await applySuggestion(id, user.uid, user.name);
    } else {
      result = dismissSuggestion(id, user.uid, reason);
    }

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      suggestion: result.suggestion,
    });
  } catch (error) {
    console.error('vacancy-suggestions/[id] POST error:', error);
    return NextResponse.json(
      { error: '提案の処理に失敗しました' },
      { status: 500 }
    );
  }
}
