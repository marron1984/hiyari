// /api/applications - 申請一覧取得・新規作成API
// 経費申請（EXPENSE）・残業申請（OVERTIME）共通

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyIdToken } from '@/lib/firebase-admin';
import { hasMinRole } from '@/lib/auth';
import { Timestamp } from 'firebase-admin/firestore';
import {
  ApplicationType,
  ExpensePayload,
  OvertimePayload,
  validateExpense,
  validateOvertime,
  generateApplicationTitle,
  calculateOvertimeHours,
  ExpenseFormData,
  OvertimeFormData,
} from '@/types/application';
import { RingiStatus } from '@/types/ringi';

const DEFAULT_TENANT_ID = 'defaultTenant';
const COLLECTION_NAME = 'applications';
const AUDIT_LOG_COLLECTION = 'applicationAuditLogs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET: 申請一覧を取得
 * クエリパラメータ:
 * - type: EXPENSE | OVERTIME（フィルタ）
 * - status: RingiStatus（フィルタ）
 * - mine: 1（自分の申請のみ）
 * - pending: 1（承認待ちのみ）
 */
export async function GET(request: NextRequest) {
  try {
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

    // クエリパラメータ取得
    const applicationType = request.nextUrl.searchParams.get('type') as ApplicationType | null;
    const status = request.nextUrl.searchParams.get('status') as RingiStatus | null;
    const mineOnly = request.nextUrl.searchParams.get('mine') === '1';
    const pendingOnly = request.nextUrl.searchParams.get('pending') === '1';
    const limitParam = parseInt(request.nextUrl.searchParams.get('limit') || '50', 10);

    // 申請を取得
    const snapshot = await db.collection(COLLECTION_NAME).limit(500).get();

    interface ApplicationRecord {
      id: string;
      type: ApplicationType;
      authorId: string;
      authorName: string;
      branchId: string;
      status: RingiStatus;
      title: string;
      payload: unknown;
      amount?: number;
      createdAt: string;
      updatedAt?: string;
      submittedAt?: string;
      approvedAt?: string;
      rejectedAt?: string;
      returnedAt?: string;
    }

    let applications: ApplicationRecord[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        type: data.type as ApplicationType,
        authorId: data.authorId as string,
        authorName: data.authorName as string,
        branchId: data.branchId as string,
        status: data.status as RingiStatus,
        title: data.title as string,
        payload: data.payload,
        amount: data.amount,
        createdAt: data.createdAt?.toDate()?.toISOString() || new Date().toISOString(),
        updatedAt: data.updatedAt?.toDate()?.toISOString(),
        submittedAt: data.submittedAt?.toDate()?.toISOString(),
        approvedAt: data.approvedAt?.toDate()?.toISOString(),
        rejectedAt: data.rejectedAt?.toDate()?.toISOString(),
        returnedAt: data.returnedAt?.toDate()?.toISOString(),
      };
    });

    // フィルタリング
    if (mineOnly) {
      applications = applications.filter((a) => a.authorId === decodedToken.uid);
    } else {
      // 自分の申請 + leader/admin以上は自事業所の申請を閲覧可能
      if (!hasMinRole(userRole, 'admin')) {
        if (hasMinRole(userRole, 'leader')) {
          applications = applications.filter(
            (a) => a.authorId === decodedToken.uid || a.branchId === userBranchId
          );
        } else {
          applications = applications.filter((a) => a.authorId === decodedToken.uid);
        }
      }
    }

    if (applicationType) {
      applications = applications.filter((a) => a.type === applicationType);
    }

    if (status) {
      applications = applications.filter((a) => a.status === status);
    }

    if (pendingOnly) {
      applications = applications.filter((a) => a.status === 'submitted');
    }

    // ソート（新しい順）
    applications.sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      return bTime - aTime;
    });

    // 件数制限
    applications = applications.slice(0, limitParam);

    return NextResponse.json({
      success: true,
      applications,
      total: applications.length,
    });
  } catch (error) {
    console.error('Applications GET API error:', error);
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
 * POST: 新規申請を作成（下書き状態）
 */
export async function POST(request: NextRequest) {
  try {
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

    // リクエストボディ
    const body = await request.json();
    const { type, data: formData } = body as {
      type: ApplicationType;
      data: ExpenseFormData | OvertimeFormData;
    };

    if (!type || !['EXPENSE', 'OVERTIME'].includes(type)) {
      return NextResponse.json(
        { error: '申請種別（type）が不正です' },
        { status: 400 }
      );
    }

    // バリデーション（下書きは緩め）
    let payload: ExpensePayload | OvertimePayload;
    let title: string;
    let amount: number | undefined;

    if (type === 'EXPENSE') {
      const expenseData = formData as ExpenseFormData;
      payload = {
        expenseDate: expenseData.expenseDate || '',
        amount: typeof expenseData.amount === 'number' ? expenseData.amount : 0,
        category: (expenseData.category || '交通費') as ExpensePayload['category'],
        paymentMethod: (expenseData.paymentMethod || '立替') as ExpensePayload['paymentMethod'],
        description: expenseData.description || '',
        receiptUrls: expenseData.receiptUrls || [],
        vendor: expenseData.vendor || undefined,
        taxAmount: typeof expenseData.taxAmount === 'number' ? expenseData.taxAmount : undefined,
        purpose: expenseData.purpose || undefined,
        participants: expenseData.participants?.split(',').map((s: string) => s.trim()).filter(Boolean) || undefined,
        projectCode: expenseData.projectCode || undefined,
      };
      title = generateApplicationTitle('EXPENSE', payload, userData.name);
      amount = payload.amount;
    } else {
      const overtimeData = formData as OvertimeFormData;
      const hours = calculateOvertimeHours(overtimeData.startTime || '', overtimeData.endTime || '');
      payload = {
        date: overtimeData.date || '',
        startTime: overtimeData.startTime || '',
        endTime: overtimeData.endTime || '',
        hours,
        reason: (overtimeData.reason || '業務繁忙') as OvertimePayload['reason'],
        reasonDetail: overtimeData.reasonDetail || undefined,
        workContent: overtimeData.workContent || undefined,
        isHoliday: overtimeData.isHoliday || false,
        isNightShift: overtimeData.isNightShift || false,
      };
      title = generateApplicationTitle('OVERTIME', payload, userData.name);
    }

    const now = Timestamp.now();
    const tenantId = userData.tenantId || DEFAULT_TENANT_ID;
    const branchId = userData.branchId || '';

    // 申請を作成
    const applicationData: Record<string, unknown> = {
      tenantId,
      branchId,
      type,
      authorId: decodedToken.uid,
      authorName: userData.name,
      title,
      payload,
      status: 'draft' as RingiStatus,
      createdAt: now,
    };

    if (amount !== undefined) {
      applicationData.amount = amount;
    }

    const docRef = await db.collection(COLLECTION_NAME).add(applicationData);

    // 監査ログ
    await db.collection(AUDIT_LOG_COLLECTION).add({
      tenantId,
      applicationId: docRef.id,
      applicationType: type,
      action: 'create',
      toStatus: 'draft',
      performedBy: decodedToken.uid,
      performedByName: userData.name,
      createdAt: now,
    });

    return NextResponse.json({
      success: true,
      id: docRef.id,
      type,
      status: 'draft',
      title,
    });
  } catch (error) {
    console.error('Applications POST API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
