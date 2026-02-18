// /api/ringi/return - 稟議差戻しAPI
// 差戻し + 通知送信

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyIdToken } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { notifyApplicationReturned } from '@/lib/notifications-server';

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
      return NextResponse.json({ error: '差戻し理由は必須です' }, { status: 400 });
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
      return NextResponse.json({ error: '承認待ち状態の稟議のみ差戻しできます' }, { status: 400 });
    }

    if (userRole === 'user') {
      return NextResponse.json({ error: '差戻し権限がありません' }, { status: 403 });
    }
    if (userRole === 'leader' && userBranchId !== ringi.branchId) {
      return NextResponse.json({ error: '他事業所の稟議は差戻しできません' }, { status: 403 });
    }

    const now = Timestamp.now();

    // 承認フローをリセット（差戻し時は全ステップをpendingに戻す）
    const approvalFlow = ringi.approvalFlow;
    if (approvalFlow && approvalFlow.steps) {
      for (const step of approvalFlow.steps) {
        step.status = 'pending';
        delete step.approvedBy;
        delete step.approvedByName;
        delete step.approvedAt;
        delete step.comment;
      }
      approvalFlow.currentStepOrder = 1;
    }

    const updateData: Record<string, unknown> = {
      status: 'returned',
      returnedBy: decodedToken.uid,
      returnedByName: userData.name,
      returnedAt: now,
      returnReason: reason,
      updatedAt: now,
    };

    if (approvalFlow) {
      updateData.approvalFlow = approvalFlow;
    }

    await ringiRef.update(updateData);

    // 監査ログ
    await db.collection('ringiAuditLogs').add({
      tenantId: ringi.tenantId,
      ringiId,
      action: 'return',
      fromStatus: 'submitted',
      toStatus: 'returned',
      performedBy: decodedToken.uid,
      performedByName: userData.name,
      comment: reason,
      createdAt: now,
    });

    // 通知: 申請者に差戻しを通知
    try {
      await notifyApplicationReturned({
        tenantId: ringi.tenantId,
        applicantId: ringi.authorId,
        applicationType: 'RINGI',
        applicationId: ringiId,
        title: ringi.title,
        returnerName: userData.name,
        reason,
      });
    } catch (notifyError) {
      console.error('通知送信に失敗:', notifyError);
    }

    return NextResponse.json({
      success: true,
      ringiId,
      status: 'returned',
    });
  } catch (error) {
    console.error('Ringi return API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
