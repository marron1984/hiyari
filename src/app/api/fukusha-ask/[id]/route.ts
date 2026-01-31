import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyIdToken } from '@/lib/firebase-admin';
import { isAiVpOwner } from '@/lib/auth';
import { getQuestion, archiveQuestion } from '@/lib/fukusha-ask';

const DEFAULT_TENANT_ID = 'defaultTenant';

/**
 * 認証ヘルパー
 */
async function getAuthenticatedUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const idToken = authHeader.substring(7);
  const decodedToken = await verifyIdToken(idToken);

  if (!decodedToken) {
    return null;
  }

  // ユーザー情報を取得
  const userDoc = await getAdminDb().collection('users').doc(decodedToken.uid).get();
  const userData = userDoc.data();

  return {
    uid: decodedToken.uid,
    email: decodedToken.email || '',
    tenantId: userData?.tenantId || DEFAULT_TENANT_ID,
    name: userData?.name || userData?.displayName || '名前未設定',
    role: userData?.role || 'user',
    baseId: userData?.baseId,
    baseName: userData?.baseName,
  };
}

/**
 * GET /api/fukusha-ask/[id]
 * 質問詳細を取得
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const { id } = await params;
    const question = await getQuestion(id);

    if (!question) {
      return NextResponse.json({ error: '質問が見つかりません' }, { status: 404 });
    }

    // 自分の質問、管理者、またはAI副社長オーナーのみ閲覧可能
    const isOwnerOrAdmin = user.role === 'admin' || user.role === 'owner' || isAiVpOwner(user.email);
    if (question.userId !== user.uid && !isOwnerOrAdmin) {
      return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 });
    }

    return NextResponse.json({ success: true, question });
  } catch (error) {
    console.error('[API] fukusha-ask/[id] GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '取得に失敗しました' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/fukusha-ask/[id]
 * 質問をアーカイブ
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // 管理者またはAI副社長オーナーのみ
    const hasPermission = user.role === 'admin' || user.role === 'owner' || isAiVpOwner(user.email);
    if (!hasPermission) {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    const { id } = await params;
    await archiveQuestion(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[API] fukusha-ask/[id] DELETE error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'アーカイブに失敗しました' },
      { status: 500 }
    );
  }
}
