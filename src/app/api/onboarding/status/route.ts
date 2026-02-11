/**
 * オンボーディング状態取得API
 *
 * Ticket 093: 初回ログイン時の電子契約完了ゲート
 * Ticket 094: 文書改訂時の再オンボーディング
 *
 * GET /api/onboarding/status - 現在のユーザーのオンボーディング状態を取得
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';
import {
  syncOnboardingForUser,
  getCurrentRequirementsVersion,
} from '@/lib/onboarding/repo';
import { getUserById } from '@/lib/roles/user-store';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const userId = user.uid;

    // ユーザー情報を取得
    const storeUser = getUserById(userId);
    if (!storeUser) {
      return NextResponse.json(
        { error: 'ユーザーが見つかりません' },
        { status: 404 }
      );
    }

    // Ticket 094: sync を呼んで最新状態を取得
    const onboarding = syncOnboardingForUser(userId, storeUser.role, []);
    const currentVersion = getCurrentRequirementsVersion();

    return NextResponse.json({
      onboarding,
      currentVersion,
      user: {
        id: storeUser.id,
        name: storeUser.name,
        role: storeUser.role,
      },
    });
  } catch (error) {
    console.error('onboarding/status GET error:', error);
    return NextResponse.json(
      { error: 'オンボーディング情報の取得に失敗しました' },
      { status: 500 }
    );
  }
}
