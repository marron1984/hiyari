/**
 * オンボーディング状態取得API
 *
 * Ticket 093: 初回ログイン時の電子契約完了ゲート
 * Ticket 094: 文書改訂時の再オンボーディング
 *
 * GET /api/onboarding/status - 現在のユーザーのオンボーディング状態を取得
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import {
  syncOnboardingForUser,
  getCurrentRequirementsVersion,
} from '@/lib/onboarding/repo';
import { getUserById } from '@/lib/roles/user-store';

export async function GET(request: NextRequest) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // 実際の実装ではセッションからユーザーIDを取得
    const userId = currentUser.id;

    // ユーザー情報を取得
    const user = getUserById(userId);
    if (!user) {
      return NextResponse.json(
        { error: 'ユーザーが見つかりません' },
        { status: 404 }
      );
    }

    // Ticket 094: sync を呼んで最新状態を取得
    const onboarding = syncOnboardingForUser(userId, user.role, []);
    const currentVersion = getCurrentRequirementsVersion();

    return NextResponse.json({
      onboarding,
      currentVersion,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
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
