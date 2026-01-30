// /api/applications/[id]/submit - 申請提出API
// draft → submitted への状態遷移

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyIdToken } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import {
  validateExpense,
  validateOvertime,
  ExpensePayload,
  OvertimePayload,
  ApplicationType,
} from '@/types/application';
import { normalizeForFirestore } from '@/lib/firestore/normalize';
import { notifyApprovalPending } from '@/lib/notifications-server';

const COLLECTION_NAME = 'applications';
const AUDIT_LOG_COLLECTION = 'applicationAuditLogs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * POST: 申請を提出（draft → submitted）
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

    // 権限チェック：作成者のみ提出可能
    if (data.authorId !== decodedToken.uid) {
      return NextResponse.json(
        { error: 'この申請を提出する権限がありません' },
        { status: 403 }
      );
    }

    // ステータスチェック：draft または returned のみ提出可能
    if (data.status !== 'draft' && data.status !== 'returned') {
      return NextResponse.json(
        { error: '下書きまたは差戻し状態の申請のみ提出できます' },
        { status: 400 }
      );
    }

    // バリデーション（提出時は厳密）
    let validation;
    if (data.type === 'EXPENSE') {
      const payload = data.payload as ExpensePayload;
      validation = validateExpense({
        expenseDate: payload.expenseDate,
        amount: payload.amount,
        category: payload.category,
        paymentMethod: payload.paymentMethod,
        description: payload.description,
        receiptUrls: payload.receiptUrls,
        vendor: payload.vendor,
        purpose: payload.purpose,
      });
    } else if (data.type === 'OVERTIME') {
      const payload = data.payload as OvertimePayload;
      validation = validateOvertime({
        date: payload.date,
        startTime: payload.startTime,
        endTime: payload.endTime,
        reason: payload.reason,
        reasonDetail: payload.reasonDetail,
        workContent: payload.workContent,
        isHoliday: payload.isHoliday,
        isNightShift: payload.isNightShift,
      });
    } else {
      return NextResponse.json(
        { error: '不明な申請種別です' },
        { status: 400 }
      );
    }

    if (!validation.isValid) {
      return NextResponse.json(
        {
          error: '入力内容に不備があります',
          validationErrors: validation.errors,
        },
        { status: 400 }
      );
    }

    const now = Timestamp.now();
    const fromStatus = data.status;

    // 申請を更新（normalizeForFirestoreで安全に保存）
    await applicationRef.update(normalizeForFirestore({
      status: 'submitted',
      submittedAt: now,
      updatedAt: now,
    }));

    // 監査ログ（normalizeForFirestoreで安全に保存）
    await db.collection(AUDIT_LOG_COLLECTION).add(normalizeForFirestore({
      tenantId: data.tenantId,
      applicationId: id,
      applicationType: data.type,
      action: 'submit',
      fromStatus,
      toStatus: 'submitted',
      performedBy: decodedToken.uid,
      performedByName: userData.name,
      createdAt: now,
    }));

    // 承認者へ通知を送信
    try {
      await notifyApprovalPending({
        tenantId: data.tenantId,
        branchId: data.branchId,
        applicationType: data.type as ApplicationType,
        applicationId: id,
        applicantName: data.authorName,
        title: data.title,
        amount: data.amount,
      });
    } catch (notifyError) {
      console.error('Failed to send approval notification:', notifyError);
      // 通知失敗は申請提出を失敗させない
    }

    return NextResponse.json({
      success: true,
      id,
      status: 'submitted',
      warnings: validation.warnings,
    });
  } catch (error) {
    console.error('Application submit API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
