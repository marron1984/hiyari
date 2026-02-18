// /api/ringi/reject - 稟議却下API
// 却下 + 通知送信

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyIdToken } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { notifyApplicationRejected } from '@/lib/notifications-server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const idToken = authHeader.substring(7);
    const decodedToken = await verifyIdToken(idToken);
    if (!decodedToken) {
      return NextResponse.json({ error: '無効なトークンです' }, { status: 401 });
    }

    const body = await request.json();
    const { ringiId, reason } = body;

    if (!ringiId) {
      return NextResponse.json({ error: '稟議IDは必須です' }, { status: 400 });
    }
    if (!reason?.trim()) {
      return NextResponse.json({ error: '却下理由は必須です' }, { status: 400 });
    }

    const db = getAdminDb();

    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();
    if (!userData) {
      return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });
    }

    const userRole = userData.role || 'user';
    const userBranchId = userData.branchId || '';

    const ringiRef = db.collection('ringis').doc(ringiId);
    const ringiDoc = await ringiRef.get();
    if (!ringiDoc.exists) {
      return NextResponse.json({ error: '稟議が見つかりません' }, { status: 404 });
    }

    const ringi = ringiDoc.data()!;

    if (ringi.status !== 'submitted') {
      return NextResponse.json({ error: '承認待ち状態の稟議のみ却下できます' }, { status: 400 });
    }

    if (userRole === 'user') {
      return NextResponse.json({ error: '却下権限がありません' }, { status: 403 });
    }
    if (userRole === 'leader' && userBranchId !== ringi.branchId) {
      return NextResponse.json({ error: '他事業所の稟議は却下できません' }, { status: 403 });
    }

    const now = Timestamp.now();

    await ringiRef.update({
      status: 'rejected',
      rejectedBy: decodedToken.uid,
      rejectedByName: userData.name,
      rejectedAt: now,
      rejectionReason: reason,
      updatedAt: now,
    });

    // 監査ログ
    await db.collection('ringiAuditLogs').add({
      tenantId: ringi.tenantId,
      ringiId,
      action: 'reject',
      fromStatus: 'submitted',
      toStatus: 'rejected',
      performedBy: decodedToken.uid,
      performedByName: userData.name,
      comment: reason,
      createdAt: now,
    });

    // 通知: 申請者に却下を通知
    try {
      await notifyApplicationRejected({
        tenantId: ringi.tenantId,
        applicantId: ringi.authorId,
        applicationType: 'RINGI',
        applicationId: ringiId,
        title: ringi.title,
        rejecterName: userData.name,
        reason,
      });
    } catch (notifyError) {
      console.error('通知送信に失敗:', notifyError);
    }

    return NextResponse.json({
      success: true,
      ringiId,
      status: 'rejected',
    });
  } catch (error) {
    console.error('Ringi reject API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
