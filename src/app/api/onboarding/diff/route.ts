/**
 * オンボーディング文書差分API
 *
 * Ticket 096: 契約改訂時の差分表示
 *
 * GET /api/onboarding/diff?documentVersionId=...
 *   - 現在のバージョンと旧バージョンの差分を取得
 *   - 旧バージョン（署名済み or 1つ前）が存在する場合のみ差分を返す
 */

import { NextRequest, NextResponse } from 'next/server';
import type { AppRole } from '@/config/appRoles';
import {
  getDocumentVersion,
  findPreviousSignedVersion,
  generateDiff,
  type DiffResult,
} from '@/lib/documents';
import {
  syncOnboardingForUser,
  getSignedDocumentVersionIds,
  logOnboardingEvent,
} from '@/lib/onboarding/repo';
import { getUserById } from '@/lib/roles/user-store';

// デモユーザー情報
const DEMO_USER = {
  id: 'user_005',  // staff ユーザー
  name: '佐藤 健二',
  role: 'staff' as AppRole,
};

/**
 * 差分レスポンス
 */
interface DiffResponse {
  hasPreviousVersion: boolean;
  currentVersion: {
    id: string;
    title: string;
    content: string;
    version: number;
  } | null;
  previousVersion: {
    id: string;
    title: string;
    content: string;
    version: number;
  } | null;
  diff: DiffResult | null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const documentVersionId = searchParams.get('documentVersionId');
    const logView = searchParams.get('logView') === 'true';

    if (!documentVersionId) {
      return NextResponse.json(
        { error: 'documentVersionId は必須です' },
        { status: 400 }
      );
    }

    // ユーザー情報を取得
    const userId = DEMO_USER.id;
    const user = getUserById(userId);
    if (!user) {
      return NextResponse.json(
        { error: 'ユーザーが見つかりません' },
        { status: 404 }
      );
    }

    // オンボーディング情報を同期
    const onboarding = syncOnboardingForUser(userId, user.role, []);

    // 対象の文書がrequiredItemsに含まれているかチェック
    const targetItem = onboarding.requiredItems.find(
      (item) => item.documentVersionId === documentVersionId
    );
    if (!targetItem) {
      return NextResponse.json(
        { error: '対象の文書が見つかりません' },
        { status: 404 }
      );
    }

    // 現在のバージョンを取得
    const currentVersion = getDocumentVersion(documentVersionId);
    if (!currentVersion) {
      return NextResponse.json<DiffResponse>({
        hasPreviousVersion: false,
        currentVersion: null,
        previousVersion: null,
        diff: null,
      });
    }

    // 署名済みバージョンIDを取得
    const signedVersionIds = getSignedDocumentVersionIds(userId);

    // 旧バージョンを探す
    const previousVersion = findPreviousSignedVersion(
      currentVersion.documentId,
      documentVersionId,
      signedVersionIds
    );

    // 差分表示をログに記録（任意）
    if (logView && previousVersion) {
      logOnboardingEvent(userId, 'signed', {
        note: `差分表示: ${previousVersion.id} → ${documentVersionId}`,
      });
    }

    // 旧バージョンがない場合
    if (!previousVersion) {
      return NextResponse.json<DiffResponse>({
        hasPreviousVersion: false,
        currentVersion: {
          id: currentVersion.id,
          title: currentVersion.title,
          content: currentVersion.content,
          version: currentVersion.version,
        },
        previousVersion: null,
        diff: null,
      });
    }

    // 差分を生成
    const diff = generateDiff(previousVersion.content, currentVersion.content);

    return NextResponse.json<DiffResponse>({
      hasPreviousVersion: true,
      currentVersion: {
        id: currentVersion.id,
        title: currentVersion.title,
        content: currentVersion.content,
        version: currentVersion.version,
      },
      previousVersion: {
        id: previousVersion.id,
        title: previousVersion.title,
        content: previousVersion.content,
        version: previousVersion.version,
      },
      diff,
    });
  } catch (error) {
    console.error('onboarding/diff GET error:', error);
    return NextResponse.json(
      { error: '差分の取得に失敗しました' },
      { status: 500 }
    );
  }
}
