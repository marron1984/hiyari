// /api/applications/[id]/approve - 申請承認API
// submitted → approved への状態遷移
// PAYMENT_REQUEST の場合は自動支払い実行

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyIdToken } from '@/lib/firebase-admin';
import { hasMinRole } from '@/lib/auth';
import { Timestamp } from 'firebase-admin/firestore';
import { normalizeForFirestore } from '@/lib/firestore/normalize';
import { notifyApplicationApproved } from '@/lib/notifications-server';
import { ApplicationType, PaymentRequestPayload } from '@/types/application';
import { createPayment, executePayment } from '@/lib/payment';

const COLLECTION_NAME = 'applications';
const AUDIT_LOG_COLLECTION = 'applicationAuditLogs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * POST: 申請を承認（submitted → approved）
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

    const userRole = userData.role || 'user';
    const userBranchId = userData.branchId || '';

    // 申請を取得
    const applicationRef = db.collection(COLLECTION_NAME).doc(id);
    const applicationDoc = await applicationRef.get();

    if (!applicationDoc.exists) {
      return NextResponse.json({ error: '申請が見つかりません' }, { status: 404 });
    }

    const data = applicationDoc.data()!;

    // ステータスチェック：submitted のみ承認可能
    if (data.status !== 'submitted') {
      return NextResponse.json(
        { error: '承認待ち状態の申請のみ承認できます' },
        { status: 400 }
      );
    }

    // 権限チェック：admin以上は全件、leaderは自事業所のみ
    const isAdminOrHigher = hasMinRole(userRole, 'admin');
    const isLeaderSameBranch = hasMinRole(userRole, 'leader') && data.branchId === userBranchId;

    if (!isAdminOrHigher && !isLeaderSameBranch) {
      return NextResponse.json(
        { error: 'この申請を承認する権限がありません' },
        { status: 403 }
      );
    }

    // リクエストボディ（オプション）
    let comment: string | undefined;
    try {
      const body = await request.json();
      comment = body.comment;
    } catch {
      // ボディなしでもOK
    }

    const now = Timestamp.now();
    const fromStatus = data.status;

    // 更新データ（normalizeForFirestoreで安全に保存）
    const updateData = normalizeForFirestore({
      status: 'approved',
      approvedBy: decodedToken.uid,
      approvedByName: userData.name,
      approvedAt: now,
      updatedAt: now,
      approvalComment: comment || '',
    });

    await applicationRef.update(updateData);

    // 監査ログ（normalizeForFirestoreで安全に保存）
    await db.collection(AUDIT_LOG_COLLECTION).add(normalizeForFirestore({
      tenantId: data.tenantId,
      applicationId: id,
      applicationType: data.type,
      action: 'approve',
      fromStatus,
      toStatus: 'approved',
      performedBy: decodedToken.uid,
      performedByName: userData.name,
      comment: comment || '',
      createdAt: now,
    }));

    // 申請者へ承認完了通知を送信
    try {
      await notifyApplicationApproved({
        tenantId: data.tenantId,
        applicantId: data.authorId,
        applicationType: data.type as ApplicationType,
        applicationId: id,
        title: data.title,
        approverName: userData.name,
      });
    } catch (notifyError) {
      console.error('Failed to send approval notification:', notifyError);
      // 通知失敗は承認処理を失敗させない
    }

    // PAYMENT_REQUEST の場合は自動支払いを実行
    let paymentResult = null;
    if (data.type === 'PAYMENT_REQUEST') {
      try {
        const payload = data.payload as PaymentRequestPayload;

        // 支払いを作成
        const payment = await createPayment({
          applicationId: id,
          applicationTitle: data.title,
          amount: payload.amount,
          payeeName: payload.payeeName,
          payeeEmail: payload.payeeEmail,
          paymentMethod: payload.paymentMethod,
          bankAccount: payload.bankAccount,
          createdBy: data.authorId,
          createdByName: data.authorName,
        });

        console.log(`[Payment] 支払い作成完了: ${payment.id}`);

        // 支払いを実行
        const executionResult = await executePayment(payment.id);
        paymentResult = {
          paymentId: payment.id,
          success: executionResult.success,
          transactionId: executionResult.transactionId,
          errorMessage: executionResult.errorMessage,
        };

        console.log(`[Payment] 支払い実行結果:`, paymentResult);
      } catch (paymentError) {
        console.error('[Payment] 自動支払い処理エラー:', paymentError);
        paymentResult = {
          success: false,
          errorMessage: paymentError instanceof Error ? paymentError.message : '支払い処理中にエラーが発生しました',
        };
        // 支払いエラーは承認処理を失敗させない（後でリトライ）
      }
    }

    return NextResponse.json({
      success: true,
      id,
      status: 'approved',
      approvedBy: userData.name,
      payment: paymentResult,
    });
  } catch (error) {
    console.error('Application approve API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
