/**
 * オンボーディング署名API
 *
 * Ticket 093: 初回ログイン時の電子契約完了ゲート（本番対応版）
 * Ticket 100: オンボーディング完了後の初期設定自動化
 *
 * POST /api/onboarding/sign - 文書に署名
 *
 * 処理:
 * - 認証ユーザー = staff本人以外は不可（自分の署名のみ）
 * - requiredDocs に含まれる documentVersionId のみ許可
 * - e_sign_records を upsert（docId = userId__documentVersionId）冪等
 * - user_onboarding を再評価して completed 更新
 * - Ticket 100: 完了時に自動で研修割当・通知作成
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import {
  getUserOnboarding,
  initializeUserOnboarding,
  upsertESignRecord,
  reevaluateOnboardingStatus,
} from '@/lib/onboarding/repo';
import { triggerPostCompleteIfNeeded } from '@/lib/onboarding/postComplete';
import { getUserById } from '@/lib/roles/user-store';
import type { SignDocumentRequest } from '@/lib/onboarding/types';

export async function POST(request: NextRequest) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

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
    const userId = currentUser.id;

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

    // Ticket 100: 署名前のステータスを記録
    const previousStatus = onboarding.status;

    // user_onboarding を再評価（e_sign_recordsを参照して状態更新）
    const updatedOnboarding = reevaluateOnboardingStatus(userId);
    const currentStatus = updatedOnboarding?.status ?? 'pending';

    // Ticket 100: 完了時に研修割当・通知作成を実行
    const postCompleteResult = triggerPostCompleteIfNeeded(
      userId,
      previousStatus,
      currentStatus
    );

    return NextResponse.json({
      success: true,
      onboarding: updatedOnboarding,
      esignDocId: signResult.docId,
      // Ticket 100: 完了後処理の結果
      postComplete: postCompleteResult,
    });
  } catch (error) {
    console.error('onboarding/sign POST error:', error);
    return NextResponse.json(
      { error: '署名処理に失敗しました' },
      { status: 500 }
    );
  }
}
