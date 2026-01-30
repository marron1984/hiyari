// /api/applications/[id] - 申請詳細取得・更新・削除API

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyIdToken } from '@/lib/firebase-admin';
import { hasMinRole } from '@/lib/auth';
import { Timestamp } from 'firebase-admin/firestore';
import {
  ApplicationType,
  ExpensePayload,
  OvertimePayload,
  generateApplicationTitle,
  calculateOvertimeHours,
  ExpenseFormData,
  OvertimeFormData,
} from '@/types/application';
import { RingiStatus } from '@/types/ringi';
import { normalizeForFirestore } from '@/lib/firestore/normalize';

const COLLECTION_NAME = 'applications';
const AUDIT_LOG_COLLECTION = 'applicationAuditLogs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET: 申請詳細を取得
 */
export async function GET(
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
    const userRole = userData?.role || 'user';
    const userBranchId = userData?.branchId || '';

    // 申請を取得
    const applicationDoc = await db.collection(COLLECTION_NAME).doc(id).get();

    if (!applicationDoc.exists) {
      return NextResponse.json({ error: '申請が見つかりません' }, { status: 404 });
    }

    const data = applicationDoc.data()!;

    // 権限チェック：作成者、または leader/admin以上で同一事業所
    const isAuthor = data.authorId === decodedToken.uid;
    const isAdminOrHigher = hasMinRole(userRole, 'admin');
    const isLeaderSameBranch = hasMinRole(userRole, 'leader') && data.branchId === userBranchId;

    if (!isAuthor && !isAdminOrHigher && !isLeaderSameBranch) {
      return NextResponse.json(
        { error: 'この申請を閲覧する権限がありません' },
        { status: 403 }
      );
    }

    const application = {
      id: applicationDoc.id,
      ...data,
      createdAt: data.createdAt?.toDate()?.toISOString() || new Date().toISOString(),
      updatedAt: data.updatedAt?.toDate()?.toISOString(),
      submittedAt: data.submittedAt?.toDate()?.toISOString(),
      approvedAt: data.approvedAt?.toDate()?.toISOString(),
      rejectedAt: data.rejectedAt?.toDate()?.toISOString(),
      returnedAt: data.returnedAt?.toDate()?.toISOString(),
    };

    // 監査ログも取得
    const auditLogsSnapshot = await db
      .collection(AUDIT_LOG_COLLECTION)
      .where('applicationId', '==', id)
      .limit(50)
      .get();

    const auditLogs = auditLogsSnapshot.docs
      .map((doc) => {
        const logData = doc.data();
        return {
          id: doc.id,
          ...logData,
          createdAt: logData.createdAt?.toDate()?.toISOString() || new Date().toISOString(),
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({
      success: true,
      application,
      auditLogs,
    });
  } catch (error) {
    console.error('Application GET API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

/**
 * PUT: 申請を更新（draft状態のみ）
 */
export async function PUT(
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

    // 権限チェック：作成者のみ編集可能
    if (data.authorId !== decodedToken.uid) {
      return NextResponse.json(
        { error: 'この申請を編集する権限がありません' },
        { status: 403 }
      );
    }

    // ステータスチェック：draft または returned のみ編集可能
    if (data.status !== 'draft' && data.status !== 'returned') {
      return NextResponse.json(
        { error: '下書きまたは差戻し状態の申請のみ編集できます' },
        { status: 400 }
      );
    }

    // リクエストボディ
    const body = await request.json();
    const { data: formData } = body as {
      data: ExpenseFormData | OvertimeFormData;
    };

    const now = Timestamp.now();
    let newPayload: ExpensePayload | OvertimePayload;
    let newTitle: string;
    let newAmount: number | undefined;

    if (data.type === 'EXPENSE') {
      const expenseData = formData as ExpenseFormData;
      const currentPayload = data.payload as ExpensePayload;
      // normalizeForFirestoreでundefinedを完全除去
      newPayload = normalizeForFirestore({
        ...currentPayload,
        expenseDate: expenseData.expenseDate !== undefined ? expenseData.expenseDate : currentPayload.expenseDate,
        amount: expenseData.amount !== undefined && expenseData.amount !== '' ? expenseData.amount as number : currentPayload.amount,
        category: expenseData.category !== undefined && expenseData.category !== '' ? expenseData.category as ExpensePayload['category'] : currentPayload.category,
        paymentMethod: expenseData.paymentMethod !== undefined && expenseData.paymentMethod !== '' ? expenseData.paymentMethod as ExpensePayload['paymentMethod'] : currentPayload.paymentMethod,
        description: expenseData.description !== undefined ? expenseData.description : currentPayload.description,
        receiptUrls: expenseData.receiptUrls !== undefined ? expenseData.receiptUrls : (currentPayload.receiptUrls || []),
        vendor: expenseData.vendor !== undefined ? (expenseData.vendor || '') : (currentPayload.vendor || ''),
        purpose: expenseData.purpose !== undefined ? (expenseData.purpose || '') : (currentPayload.purpose || ''),
        projectCode: expenseData.projectCode !== undefined ? (expenseData.projectCode || '') : (currentPayload.projectCode || ''),
      }) as ExpensePayload;
      newTitle = generateApplicationTitle('EXPENSE', newPayload, data.authorName);
      newAmount = newPayload.amount;
    } else {
      const overtimeData = formData as OvertimeFormData;
      const currentPayload = data.payload as OvertimePayload;
      const startTime = overtimeData.startTime !== undefined ? overtimeData.startTime : currentPayload.startTime;
      const endTime = overtimeData.endTime !== undefined ? overtimeData.endTime : currentPayload.endTime;
      const hours = calculateOvertimeHours(startTime, endTime);

      // normalizeForFirestoreでundefinedを完全除去
      newPayload = normalizeForFirestore({
        ...currentPayload,
        date: overtimeData.date !== undefined ? overtimeData.date : currentPayload.date,
        startTime,
        endTime,
        hours,
        reason: overtimeData.reason !== undefined && overtimeData.reason !== '' ? overtimeData.reason as OvertimePayload['reason'] : currentPayload.reason,
        reasonDetail: overtimeData.reasonDetail !== undefined ? (overtimeData.reasonDetail || '') : (currentPayload.reasonDetail || ''),
        workContent: overtimeData.workContent !== undefined ? (overtimeData.workContent || '') : (currentPayload.workContent || ''),
        isHoliday: overtimeData.isHoliday !== undefined ? overtimeData.isHoliday : currentPayload.isHoliday,
        isNightShift: overtimeData.isNightShift !== undefined ? overtimeData.isNightShift : currentPayload.isNightShift,
      }) as OvertimePayload;
      newTitle = generateApplicationTitle('OVERTIME', newPayload, data.authorName);
    }

    // 更新データ（normalizeForFirestoreでundefined完全除去）
    const updateData = normalizeForFirestore({
      payload: newPayload,
      title: newTitle,
      updatedAt: now,
      amount: newAmount ?? 0,
    });

    await applicationRef.update(updateData);

    // 監査ログ（normalizeForFirestoreで安全に保存）
    await db.collection(AUDIT_LOG_COLLECTION).add(normalizeForFirestore({
      tenantId: data.tenantId,
      applicationId: id,
      applicationType: data.type,
      action: 'update',
      performedBy: decodedToken.uid,
      performedByName: userData.name,
      createdAt: now,
    }));

    return NextResponse.json({
      success: true,
      id,
      title: newTitle,
    });
  } catch (error) {
    console.error('Application PUT API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE: 申請を削除（draft状態のみ）
 */
export async function DELETE(
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

    // 申請を取得
    const applicationRef = db.collection(COLLECTION_NAME).doc(id);
    const applicationDoc = await applicationRef.get();

    if (!applicationDoc.exists) {
      return NextResponse.json({ error: '申請が見つかりません' }, { status: 404 });
    }

    const data = applicationDoc.data()!;

    // 権限チェック：作成者のみ削除可能
    if (data.authorId !== decodedToken.uid) {
      return NextResponse.json(
        { error: 'この申請を削除する権限がありません' },
        { status: 403 }
      );
    }

    // ステータスチェック：draft のみ削除可能
    if (data.status !== 'draft') {
      return NextResponse.json(
        { error: '下書き状態の申請のみ削除できます' },
        { status: 400 }
      );
    }

    await applicationRef.delete();

    return NextResponse.json({
      success: true,
      message: '申請を削除しました',
    });
  } catch (error) {
    console.error('Application DELETE API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
