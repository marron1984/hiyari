/**
 * オンボーディング署名API
 *
 * Ticket 093: 初回ログイン時の電子契約完了ゲート
 *
 * POST /api/onboarding/sign - 文書に署名
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import type { AppRole } from '@/config/appRoles';
import {
  getUserOnboarding,
  initializeUserOnboarding,
  markItemAsSigned,
} from '@/lib/onboarding/repo';
import { getUserById } from '@/lib/roles/user-store';
import { createESignRecord } from '@/lib/esign/repo';
import type { SignDocumentRequest } from '@/lib/onboarding/types';

// デモユーザー情報
const DEMO_USER = {
  id: 'user_005',  // staff ユーザー
  name: '佐藤 健二',
  role: 'staff' as AppRole,
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as SignDocumentRequest;
    const { documentId, documentVersionId, subjectName } = body;

    // バリデーション
    if (!documentVersionId) {
      return NextResponse.json(
        { error: 'documentVersionId は必須です' },
        { status: 400 }
      );
    }

    if (!subjectName?.trim()) {
      return NextResponse.json(
        { error: '署名者名は必須です' },
        { status: 400 }
      );
    }

    // 実際の実装ではセッションからユーザーIDを取得
    const userId = DEMO_USER.id;

    // ユーザー情報を取得
    const user = getUserById(userId);
    if (!user) {
      return NextResponse.json(
        { error: 'ユーザーが見つかりません' },
        { status: 404 }
      );
    }

    // オンボーディング情報を取得
    let onboarding = getUserOnboarding(userId);
    if (!onboarding) {
      onboarding = initializeUserOnboarding(userId, user.role, []);
    }

    // 対象の文書が必須アイテムに含まれているかチェック
    const targetItem = onboarding.requiredItems.find(
      (item) => item.documentVersionId === documentVersionId
    );
    if (!targetItem) {
      return NextResponse.json(
        { error: '対象の文書が見つかりません' },
        { status: 404 }
      );
    }

    if (targetItem.status === 'signed') {
      return NextResponse.json(
        { error: 'この文書は既に署名済みです' },
        { status: 400 }
      );
    }

    // e_sign_records に署名レコードを作成
    const signResult = createESignRecord(
      {
        subjectType: 'staff',
        subjectId: userId,
        subjectName: subjectName.trim(),
        documentId: documentId || null,
        documentVersionId,
        method: 'online',
        status: 'signed',
        signedAt: new Date().toISOString(),
        note: 'オンボーディング契約署名',
      },
      userId,
      'manager'  // システムとして記録
    );

    if (!signResult.success) {
      return NextResponse.json(
        { error: signResult.error || '署名レコードの作成に失敗しました' },
        { status: 500 }
      );
    }

    // user_onboarding を更新
    const markResult = markItemAsSigned(userId, documentVersionId);
    if (!markResult.success) {
      return NextResponse.json(
        { error: markResult.error || 'オンボーディング状態の更新に失敗しました' },
        { status: 500 }
      );
    }

    // オンボーディング完了の場合はクッキーを設定
    if (markResult.onboarding?.status === 'completed') {
      const cookieStore = await cookies();
      cookieStore.set('onboarding_complete', 'true', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365, // 1年
      });
    }

    return NextResponse.json({
      success: true,
      onboarding: markResult.onboarding,
      signRecord: signResult.record,
    });
  } catch (error) {
    console.error('onboarding/sign POST error:', error);
    return NextResponse.json(
      { error: '署名処理に失敗しました' },
      { status: 500 }
    );
  }
}
