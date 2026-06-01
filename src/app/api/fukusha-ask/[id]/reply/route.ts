import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyIdToken } from '@/lib/firebase-admin';
import { isAiVpOwner } from '@/lib/auth';
import { sendReply, getQuestion, createDecisionLogFromQuestion } from '@/lib/fukusha-ask';
import type { SendFukushaReplyInput } from '@/types/fukusha-ask';

// 【DHP.OS.HUB ブランド思想】
// 判断は、ひとりで背負わない。責任は、最後まで引き受ける。
// DHPは、判断と責任のOSである。

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
 * POST /api/fukusha-ask/[id]/reply
 * 返信を送信
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // AI副社長オーナーまたは管理者のみ返信可能
    const hasPermission = isAiVpOwner(user.email) || user.role === 'admin' || user.role === 'owner';
    if (!hasPermission) {
      return NextResponse.json({ error: '返信権限がありません' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    if (!body.replyContent || body.replyContent.trim().length < 10) {
      return NextResponse.json(
        { error: '返信内容は10文字以上で入力してください' },
        { status: 400 }
      );
    }

    // 質問の存在確認
    const question = await getQuestion(id);
    if (!question) {
      return NextResponse.json({ error: '質問が見つかりません' }, { status: 404 });
    }

    if (question.status === 'replied') {
      return NextResponse.json({ error: 'すでに返信済みです' }, { status: 400 });
    }

    const input: SendFukushaReplyInput = {
      questionId: id,
      replyContent: body.replyContent,
      replyNote: body.replyNote,
    };

    await sendReply(input, user.uid, user.name);

    // 判断ログに保存（チェックボックスがONの場合）
    // decision_logs は評価・査定のためのテーブルではない。
    // 判断がどのように行われたかを記録し、
    // 次の判断を楽にするためのDHP.OS.HUBのOS資産である。
    let decisionLogId: string | undefined;
    if (body.saveToDecisionLog) {
      const decisionLog = await createDecisionLogFromQuestion(
        question,
        body.replyContent,
        body.replyNote,
        user.uid,
        user.role  // 個人名を前に出さず「役割」を残す思想
      );
      decisionLogId = decisionLog.id;
      console.log('[API] 判断ログ保存完了', { questionId: id, decisionLogId });
    }

    return NextResponse.json({ success: true, decisionLogId });
  } catch (error) {
    console.error('[API] fukusha-ask/[id]/reply POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '返信に失敗しました' },
      { status: 500 }
    );
  }
}
