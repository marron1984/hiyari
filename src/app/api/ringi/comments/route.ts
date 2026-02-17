// /api/ringi/comments - 稟議コメントAPI
// GET: コメント一覧取得 POST: コメント投稿

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyIdToken } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

export const dynamic = 'force-dynamic';

const DEFAULT_TENANT_ID = 'defaultTenant';

/**
 * 認証ヘルパー
 */
async function getAuthenticatedUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const idToken = authHeader.substring(7);
  const decodedToken = await verifyIdToken(idToken);
  if (!decodedToken) return null;

  const db = getAdminDb();
  const userDoc = await db.collection('users').doc(decodedToken.uid).get();
  const userData = userDoc.data();

  return {
    uid: decodedToken.uid,
    tenantId: userData?.tenantId || DEFAULT_TENANT_ID,
    name: userData?.name || userData?.displayName || '名前未設定',
    role: userData?.role || 'user',
  };
}

/**
 * GET: 稟議のコメント一覧を取得
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const ringiId = searchParams.get('ringiId');

    if (!ringiId) {
      return NextResponse.json({ error: 'ringiIdは必須です' }, { status: 400 });
    }

    const db = getAdminDb();
    const snapshot = await db
      .collection('ringiComments')
      .where('ringiId', '==', ringiId)
      .where('tenantId', '==', user.tenantId)
      .orderBy('createdAt', 'asc')
      .limit(100)
      .get();

    const comments = snapshot.docs
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ringiId: data.ringiId,
          tenantId: data.tenantId,
          authorId: data.authorId,
          authorName: data.authorName,
          authorRole: data.authorRole,
          content: data.content,
          createdAt: data.createdAt?.toDate()?.toISOString() || new Date().toISOString(),
          isDeleted: data.isDeleted || false,
        };
      })
      .filter((c) => !c.isDeleted);

    return NextResponse.json({ success: true, comments });
  } catch (error) {
    console.error('Ringi comments GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'コメント取得に失敗しました' },
      { status: 500 }
    );
  }
}

/**
 * POST: コメントを投稿
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const body = await request.json();
    const { ringiId, content } = body;

    if (!ringiId) {
      return NextResponse.json({ error: 'ringiIdは必須です' }, { status: 400 });
    }

    if (!content?.trim() || content.trim().length < 1) {
      return NextResponse.json({ error: 'コメント内容を入力してください' }, { status: 400 });
    }

    const db = getAdminDb();

    // 稟議の存在確認
    const ringiDoc = await db.collection('ringis').doc(ringiId).get();
    if (!ringiDoc.exists) {
      return NextResponse.json({ error: '稟議が見つかりません' }, { status: 404 });
    }

    const ringiData = ringiDoc.data()!;

    // 権限チェック: 起案者、承認者（leader以上）、admin
    const isAuthor = ringiData.authorId === user.uid;
    const isApprover = ['leader', 'admin', 'system_admin'].includes(user.role);

    if (!isAuthor && !isApprover) {
      return NextResponse.json(
        { error: 'この稟議にコメントする権限がありません' },
        { status: 403 }
      );
    }

    const now = Timestamp.now();
    const commentData = {
      ringiId,
      tenantId: user.tenantId,
      authorId: user.uid,
      authorName: user.name,
      authorRole: user.role,
      content: content.trim(),
      createdAt: now,
    };

    const docRef = await db.collection('ringiComments').add(commentData);

    return NextResponse.json({
      success: true,
      comment: {
        id: docRef.id,
        ...commentData,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Ringi comments POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'コメント投稿に失敗しました' },
      { status: 500 }
    );
  }
}
