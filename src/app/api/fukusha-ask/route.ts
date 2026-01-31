import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyIdToken } from '@/lib/firebase-admin';
import { isAiVpOwner } from '@/lib/auth';
import {
  createQuestion,
  getQuestions,
  getMyQuestions,
  getQuestionStats,
  processQuestionWithAI,
} from '@/lib/fukusha-ask';
import type { CreateFukushaQuestionInput, FukushaQuestionFilter, FukushaQuestionStatus } from '@/types/fukusha-ask';

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
 * GET /api/fukusha-ask
 * 質問一覧を取得
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const myOnly = searchParams.get('my') === 'true';
    const isAdmin = searchParams.get('admin') === 'true';
    const statusParam = searchParams.get('status');
    const category = searchParams.get('category') as FukushaQuestionFilter['category'];
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    if (myOnly) {
      // 自分の質問のみ
      const questions = await getMyQuestions(user.tenantId, user.uid, limit);
      return NextResponse.json({ success: true, questions });
    }

    // 管理者モードの場合は権限チェック
    if (isAdmin) {
      if (!isAiVpOwner(user.email)) {
        return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 });
      }
    }

    // ステータスが複数指定された場合の処理（カンマ区切り）
    const statuses = statusParam ? statusParam.split(',').filter(Boolean) as FukushaQuestionStatus[] : [];

    if (statuses.length > 1) {
      // 複数ステータスの場合は個別に取得してマージ
      const allQuestions = await Promise.all(
        statuses.map((status) =>
          getQuestions(user.tenantId, { status, category, limit })
        )
      );
      const questions = allQuestions
        .flat()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, limit);

      const stats = await getQuestionStats(user.tenantId);
      return NextResponse.json({ success: true, questions, stats });
    }

    // 単一ステータスまたは全件取得
    const filter: FukushaQuestionFilter = { limit };
    if (statuses.length === 1) filter.status = statuses[0];
    if (category) filter.category = category;

    const [questions, stats] = await Promise.all([
      getQuestions(user.tenantId, filter),
      getQuestionStats(user.tenantId),
    ]);

    return NextResponse.json({ success: true, questions, stats });
  } catch (error) {
    console.error('[API] fukusha-ask GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '取得に失敗しました' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/fukusha-ask
 * 質問を投稿
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const body = await request.json();
    const input: CreateFukushaQuestionInput = {
      category: body.category || 'other',
      title: body.title,
      content: body.content,
      isAnonymous: body.isAnonymous ?? false,
    };

    if (!input.content || input.content.trim().length < 10) {
      return NextResponse.json(
        { error: '質問内容は10文字以上で入力してください' },
        { status: 400 }
      );
    }

    // 質問を投稿
    const question = await createQuestion(
      user.tenantId,
      user.uid,
      user.name,
      user.baseId,
      user.baseName,
      input
    );

    // AI処理を非同期で実行
    processQuestionWithAI(question.id).catch((err) => {
      console.error('[API] fukusha-ask AI処理エラー:', err);
    });

    return NextResponse.json({ success: true, question });
  } catch (error) {
    console.error('[API] fukusha-ask POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '投稿に失敗しました' },
      { status: 500 }
    );
  }
}
