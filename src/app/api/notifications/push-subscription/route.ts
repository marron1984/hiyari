// ======== Push Subscription API ========
// POST: サブスクリプション登録
// DELETE: サブスクリプション削除

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyIdToken } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { createHash } from 'crypto';

const DEFAULT_TENANT_ID = 'defaultTenant';
const MAX_USER_AGENT_LENGTH = 500;
const MAX_ENDPOINT_LENGTH = 2048;

async function authenticate(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return verifyIdToken(authHeader.substring(7));
}

/** エンドポイントURLからSHA-256ハッシュでドキュメントIDを生成（衝突回避） */
function endpointToDocId(endpoint: string): string {
  return createHash('sha256').update(endpoint).digest('hex');
}

/** PushSubscription構造のバリデーション */
function validateSubscription(subscription: unknown): subscription is {
  endpoint: string;
  keys: { auth: string; p256dh: string };
} {
  if (!subscription || typeof subscription !== 'object') return false;
  const sub = subscription as Record<string, unknown>;
  if (typeof sub.endpoint !== 'string' || !sub.endpoint.startsWith('https://')) return false;
  if (sub.endpoint.length > MAX_ENDPOINT_LENGTH) return false;
  if (!sub.keys || typeof sub.keys !== 'object') return false;
  const keys = sub.keys as Record<string, unknown>;
  if (typeof keys.auth !== 'string' || !keys.auth) return false;
  if (typeof keys.p256dh !== 'string' || !keys.p256dh) return false;
  return true;
}

export async function POST(request: NextRequest) {
  try {
    const decodedToken = await authenticate(request);
    if (!decodedToken) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const body = await request.json();
    const { subscription } = body;

    if (!validateSubscription(subscription)) {
      return NextResponse.json(
        { error: 'Invalid subscription: endpoint (https), keys.auth, keys.p256dh が必要です' },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    const userId = decodedToken.uid;
    const docId = endpointToDocId(subscription.endpoint);
    const userAgent = (request.headers.get('user-agent') || '').slice(0, MAX_USER_AGENT_LENGTH);

    await db.collection('pushSubscriptions').doc(docId).set({
      tenantId: DEFAULT_TENANT_ID,
      userId,
      endpoint: subscription.endpoint,
      keys: {
        auth: subscription.keys.auth,
        p256dh: subscription.keys.p256dh,
      },
      userAgent,
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
    if (typeof endpoint !== 'string' || !endpoint) {
      return NextResponse.json({ error: 'Endpoint required' }, { status: 400 });
    }

    const db = getAdminDb();
    const docId = endpointToDocId(endpoint);

    // 自分のサブスクリプションのみ削除可能
    const doc = await db.collection('pushSubscriptions').doc(docId).get();
    if (doc.exists && doc.data()?.userId !== decodedToken.uid) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    await db.collection('pushSubscriptions').doc(docId).delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Push subscription DELETE error:', error);
    return NextResponse.json({ error: '削除に失敗しました' }, { status: 500 });
  }
}
