// ======== Push Subscription API ========
// POST: サブスクリプション登録
// DELETE: サブスクリプション削除

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyIdToken } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

const DEFAULT_TENANT_ID = 'defaultTenant';

async function authenticate(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return verifyIdToken(authHeader.substring(7));
}

export async function POST(request: NextRequest) {
  try {
    const decodedToken = await authenticate(request);
    if (!decodedToken) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const { subscription } = await request.json();
    if (!subscription?.endpoint) {
      return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
    }

    const db = getAdminDb();
    const userId = decodedToken.uid;

    // エンドポイントをキーにしてドキュメント保存
    const docId = Buffer.from(subscription.endpoint).toString('base64url').slice(0, 128);

    await db.collection('pushSubscriptions').doc(docId).set({
      tenantId: DEFAULT_TENANT_ID,
      userId,
      endpoint: subscription.endpoint,
      keys: subscription.keys || {},
      userAgent: request.headers.get('user-agent') || '',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Push subscription POST error:', error);
    return NextResponse.json({ error: '登録に失敗しました' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const decodedToken = await authenticate(request);
    if (!decodedToken) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const { endpoint } = await request.json();
    if (!endpoint) {
      return NextResponse.json({ error: 'Endpoint required' }, { status: 400 });
    }

    const db = getAdminDb();
    const docId = Buffer.from(endpoint).toString('base64url').slice(0, 128);

    await db.collection('pushSubscriptions').doc(docId).delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Push subscription DELETE error:', error);
    return NextResponse.json({ error: '削除に失敗しました' }, { status: 500 });
  }
}
