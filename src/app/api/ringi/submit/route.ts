// /api/ringi/submit - 稟議申請API
// 承認経路の自動適用、ステータス更新

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyIdToken } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { findMatchingApprovalRoute } from '@/lib/approval-routes';
import {
  RingiCategory,
  RingiApprovalFlow,
  RingiApprovalFlowStep,
  APPROVER_ROLE_LABELS,
  ApproverRole,
} from '@/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * POST: 稟議を申請（draft → submitted）
 * - 承認経路を自動マッチング
 * - approvalFlowを生成して保存
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

    // リクエストボディ
    const body = await request.json();
    const { ringiId } = body;

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

    // 稟議取得
    const ringiRef = db.collection('ringis').doc(ringiId);
    const ringiDoc = await ringiRef.get();

    if (!ringiDoc.exists) {
      return NextResponse.json({ error: '稟議が見つかりません' }, { status: 404 });
    }

    const ringi = ringiDoc.data()!;

    // 権限チェック：作成者のみ申請可能
    if (ringi.authorId !== decodedToken.uid) {
      return NextResponse.json(
        { error: 'この稟議を申請する権限がありません' },
        { status: 403 }
      );
    }

    // ステータスチェック：draft のみ申請可能
    if (ringi.status !== 'draft') {
      return NextResponse.json(
        { error: '下書き状態の稟議のみ申請できます' },
        { status: 400 }
      );
    }

    // 承認経路をマッチング
    const matchedRoute = await findMatchingApprovalRoute(
      ringi.category as RingiCategory,
      ringi.amount || null,
      ringi.branchId,
      ringi.tenantId
    );

    // approvalFlow を生成
    let approvalFlow: RingiApprovalFlow | null = null;

    if (matchedRoute) {
      const flowSteps: RingiApprovalFlowStep[] = matchedRoute.steps.map((step) => ({
        stepOrder: step.stepOrder,
        approverType: step.approverType,
        approverValue: step.approverValue,
        approverName:
          step.approverType === 'ROLE'
            ? APPROVER_ROLE_LABELS[step.approverValue as ApproverRole] || step.approverValue
            : step.approverName,
        required: step.required,
        status: 'pending' as const,
      }));

      approvalFlow = {
        ringiId,
        routeId: matchedRoute.id,
        routeName: matchedRoute.name,
        currentStepOrder: 1,
        steps: flowSteps,
      };
    }

    // 付番: 稟議番号を自動採番（年度-連番）
    let ringiNumber = ringi.ringiNumber;
    if (!ringiNumber) {
      const year = new Date().getFullYear();
      const prefix = `稟議-${year}-`;

      // 同年の最大番号を取得
      const existingSnapshot = await db
        .collection('ringis')
        .where('tenantId', '==', ringi.tenantId)
        .where('ringiNumber', '>=', prefix)
        .where('ringiNumber', '<=', prefix + '\uf8ff')
        .orderBy('ringiNumber', 'desc')
        .limit(1)
        .get();

      let nextNum = 1;
      if (!existingSnapshot.empty) {
        const lastNumber = existingSnapshot.docs[0].data().ringiNumber as string;
        const lastNum = parseInt(lastNumber.replace(prefix, ''), 10);
        if (!isNaN(lastNum)) {
          nextNum = lastNum + 1;
        }
      }

      ringiNumber = `${prefix}${String(nextNum).padStart(3, '0')}`;
    }

    // 稟議を更新
    const now = Timestamp.now();
    const updateData: Record<string, unknown> = {
      status: 'submitted',
      submittedAt: now,
      updatedAt: now,
      ringiNumber,
    };

    if (approvalFlow) {
      updateData.approvalFlow = approvalFlow;
    }

    await ringiRef.update(updateData);

    // 監査ログを記録
    await db.collection('ringiAuditLogs').add({
      tenantId: ringi.tenantId,
      ringiId,
      action: 'submit',
      fromStatus: 'draft',
      toStatus: 'submitted',
      performedBy: decodedToken.uid,
      performedByName: userData.name,
      appliedRouteId: matchedRoute?.id || null,
      appliedRouteName: matchedRoute?.name || null,
      createdAt: now,
    });

    return NextResponse.json({
      success: true,
      ringiId,
      ringiNumber,
      status: 'submitted',
      approvalFlow,
      appliedRoute: matchedRoute
        ? {
            id: matchedRoute.id,
            name: matchedRoute.name,
            stepsCount: matchedRoute.steps.length,
          }
        : null,
    });
  } catch (error) {
    console.error('Ringi submit API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
