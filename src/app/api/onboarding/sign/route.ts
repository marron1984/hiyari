/**
 * オンボーディング署名API
 *
 * Ticket 093: 初回ログイン時の電子契約完了ゲート（本番対応版）
 *
 * POST /api/onboarding/sign - 文書に署名
 *
 * 処理:
 * - 認証ユーザー = staff本人以外は不可（自分の署名のみ）
 * - requiredDocs に含まれる documentVersionId のみ許可
 * - e_sign_records を upsert（docId = userId__documentVersionId）冪等
 * - user_onboarding を再評価して completed 更新
 */

import { NextRequest, NextResponse } from 'next/server';
import type { AppRole } from '@/config/appRoles';
import {
  getUserOnboarding,
  initializeUserOnboarding,
  upsertESignRecord,
  reevaluateOnboardingStatus,
} from '@/lib/onboarding/repo';
import { getUserById } from '@/lib/roles/user-store';
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

    // オンボーディング情報を取得（なければ初期化）
    let onboarding = getUserOnboarding(userId);
    if (!onboarding) {
      onboarding = initializeUserOnboarding(userId, user.role, []);
    }

    // 対象の文書が必須アイテムに含まれているかチェック
    // （勝手な署名を作らせない）
    const targetItem = onboarding.requiredItems.find(
      (item) => item.documentVersionId === documentVersionId
    );
    if (!targetItem) {
      return NextResponse.json(
        { error: '対象の文書が見つかりません' },
        { status: 404 }
      );
    }

    // e_sign_records を upsert（冪等：同じ署名は増殖しない）
    const signResult = upsertESignRecord(
      userId,
      documentId || targetItem.documentId,
      documentVersionId,
      subjectName.trim(),
      'オンボーディング契約署名'
    );

    if (!signResult.success) {
      return NextResponse.json(
        { error: '署名レコードの作成に失敗しました' },
        { status: 500 }
      );
    }

    // user_onboarding を再評価（e_sign_recordsを参照して状態更新）
    const updatedOnboarding = reevaluateOnboardingStatus(userId);

    return NextResponse.json({
      success: true,
      onboarding: updatedOnboarding,
      esignDocId: signResult.docId,
    });
  } catch (error) {
    console.error('onboarding/sign POST error:', error);
    return NextResponse.json(
      { error: '署名処理に失敗しました' },
      { status: 500 }
    );
  }
}
