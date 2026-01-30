// /api/applications/[id]/withdraw - 申請取り下げAPI
// submitted → draft への状態遷移（作成者のみ）

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyIdToken } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { normalizeForFirestore } from '@/lib/firestore/normalize';

const COLLECTION_NAME = 'applications';
const AUDIT_LOG_COLLECTION = 'applicationAuditLogs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * POST: 申請を取り下げ（submitted → draft）
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    // 認証チェック
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const idToken = authHeader.substring(7);
    const decodedToken = await verifyIdToken(idToken);
    if (!decodedToken) {
      return NextResponse.json({ error: '無効なトークンです' }, { status: 401 });
    }

    const db = getAdminDb();

    // ユーザー情報取得
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();
    if (!userData) {
      return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });
    }

    // 申請を取得
    const applicationRef = db.collection(COLLECTION_NAME).doc(id);
    const applicationDoc = await applicationRef.get();

    if (!applicationDoc.exists) {
      return NextResponse.json({ error: '申請が見つかりません' }, { status: 404 });
    }

    const data = applicationDoc.data()!;

    // 権限チェック：作成者のみ取り下げ可能
    if (data.authorId !== decodedToken.uid) {
      return NextResponse.json(
        { error: 'この申請を取り下げる権限がありません' },
        { status: 403 }
      );
    }

    // ステータスチェック：submitted のみ取り下げ可能
    if (data.status !== 'submitted') {
      return NextResponse.json(
        { error: '承認待ち状態の申請のみ取り下げできます' },
        { status: 400 }
      );
    }

    const now = Timestamp.now();
    const fromStatus = data.status;

    // 更新データ（normalizeForFirestoreで安全に保存）
    await applicationRef.update(normalizeForFirestore({
      status: 'draft',
      submittedAt: null,
      updatedAt: now,
    }));

    // 監査ログ（normalizeForFirestoreで安全に保存）
    await db.collection(AUDIT_LOG_COLLECTION).add(normalizeForFirestore({
      tenantId: data.tenantId,
      applicationId: id,
      applicationType: data.type,
      action: 'withdraw',
      fromStatus,
      toStatus: 'draft',
      performedBy: decodedToken.uid,
      performedByName: userData.name,
      createdAt: now,
    }));

    return NextResponse.json({
      success: true,
      id,
      status: 'draft',
      message: '申請を取り下げました',
    });
  } catch (error) {
    console.error('Application withdraw API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
