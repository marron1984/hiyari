// /api/ringi/approve - 稟議承認API
// 承認フローのステップ進行 + 通知送信

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyIdToken } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { notifyApprovalPending, notifyApplicationApproved } from '@/lib/notifications-server';
import { RingiApprovalFlow } from '@/types';

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
    const { ringiId, comment } = body;

    if (!ringiId) {
      return NextResponse.json({ error: '稟議IDは必須です' }, { status: 400 });
    }

    const db = getAdminDb();

    // ユーザー情報取得
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();
    if (!userData) {
      return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });
    }

    const userRole = userData.role || 'user';
    const userBranchId = userData.branchId || '';

    // 稟議取得
    const ringiRef = db.collection('ringis').doc(ringiId);
    const ringiDoc = await ringiRef.get();
    if (!ringiDoc.exists) {
      return NextResponse.json({ error: '稟議が見つかりません' }, { status: 404 });
    }

    const ringi = ringiDoc.data()!;

    if (ringi.status !== 'submitted') {
      return NextResponse.json({ error: '承認待ち状態の稟議のみ承認できます' }, { status: 400 });
    }

    // 権限チェック
    if (userRole === 'user') {
      return NextResponse.json({ error: '承認権限がありません' }, { status: 403 });
    }
    if (userRole === 'leader' && userBranchId !== ringi.branchId) {
      return NextResponse.json({ error: '他事業所の稟議は承認できません' }, { status: 403 });
    }

    const now = Timestamp.now();

    // 承認フロー: ステップ進行ロジック
    const approvalFlow: RingiApprovalFlow | undefined = ringi.approvalFlow;
    let allStepsDone = true;
    let advancedToNextStep = false;

    if (approvalFlow && approvalFlow.steps.length > 0) {
      const currentStep = approvalFlow.steps.find(
        (s: any) => s.stepOrder === approvalFlow.currentStepOrder
      );

      if (currentStep && currentStep.status === 'pending') {
        // 現在のステップを承認済みに
        currentStep.status = 'approved';
        currentStep.approvedBy = decodedToken.uid;
        currentStep.approvedByName = userData.name;
        currentStep.approvedAt = now.toDate();
        if (comment) currentStep.comment = comment;
      }

      // 次の未完了ステップを探す
      const nextPendingStep = approvalFlow.steps.find(
        (s: any) => s.status === 'pending' && s.stepOrder > approvalFlow.currentStepOrder
      );

      if (nextPendingStep) {
        // 次ステップへ進行
        approvalFlow.currentStepOrder = nextPendingStep.stepOrder;
        allStepsDone = false;
        advancedToNextStep = true;
      } else {
        // 全ステップ完了
        allStepsDone = true;
      }
    }

    const updateData: Record<string, unknown> = {
      updatedAt: now,
    };

    if (allStepsDone) {
      // 全ステップ完了 → 承認確定
      updateData.status = 'approved';
      updateData.approvedBy = decodedToken.uid;
      updateData.approvedByName = userData.name;
      updateData.approvedAt = now;
      if (comment) updateData.approvalComment = comment;
    }

    if (approvalFlow) {
      updateData.approvalFlow = approvalFlow;
    }

    await ringiRef.update(updateData);

    // 監査ログ
    await db.collection('ringiAuditLogs').add({
      tenantId: ringi.tenantId,
      ringiId,
      action: 'approve',
      fromStatus: 'submitted',
      toStatus: allStepsDone ? 'approved' : 'submitted',
      performedBy: decodedToken.uid,
      performedByName: userData.name,
      comment: comment || null,
      stepOrder: approvalFlow?.currentStepOrder || null,
      createdAt: now,
    });

    // 通知送信
    try {
      if (allStepsDone) {
        // 承認完了 → 申請者に通知
        await notifyApplicationApproved({
          tenantId: ringi.tenantId,
          applicantId: ringi.authorId,
          applicationType: 'RINGI',
          applicationId: ringiId,
          title: ringi.title,
          approverName: userData.name,
        });
      } else if (advancedToNextStep) {
        // 次の承認者に通知
        await notifyApprovalPending({
          tenantId: ringi.tenantId,
          branchId: ringi.branchId,
          applicationType: 'RINGI',
          applicationId: ringiId,
          applicantName: ringi.authorName,
          title: ringi.title,
          amount: ringi.amount,
        });
      }
    } catch (notifyError) {
      console.error('通知送信に失敗:', notifyError);
    }

    return NextResponse.json({
      success: true,
      ringiId,
      status: allStepsDone ? 'approved' : 'submitted',
      allStepsDone,
      advancedToNextStep,
    });
  } catch (error) {
    console.error('Ringi approve API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
