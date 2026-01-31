// ======== 支払い申請AIチェック API ========

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { matchAccountingTemplate } from '@/lib/accounting-template';
import {
  performAICheck,
  getAIReviewByApplicationId,
} from '@/lib/accounting-ai-review';
import type { AICheckInput } from '@/types/accounting-ai-review';
import type { PaymentRequestPayload } from '@/types/application';

type Props = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/applications/[id]/ai-check
 * 申請に対するAIチェック結果を取得
 */
export async function GET(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params;

    // 既存のレビューを取得
    const review = await getAIReviewByApplicationId(id);

    if (!review) {
      return NextResponse.json({
        success: true,
        hasReview: false,
        message: 'AIチェックはまだ実行されていません',
      });
    }

    return NextResponse.json({
      success: true,
      hasReview: true,
      review: {
        id: review.id,
        templateName: review.templateName,
        matchedAccountItem: review.matchedAccountItem,
        anomalyFlags: review.anomalyFlags,
        hasAnomaly: review.hasAnomaly,
        aiAnalysis: review.aiAnalysis,
        aiCalled: review.aiCalled,
        reviewerDecision: review.reviewerDecision,
        createdAt: review.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('[AICheck] 取得エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '取得に失敗しました',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/applications/[id]/ai-check
 * 申請に対するAIチェックを実行
 */
export async function POST(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params;

    // 申請を取得
    const db = getAdminDb();
    const appDoc = await db.collection('applications').doc(id).get();

    if (!appDoc.exists) {
      return NextResponse.json(
        { success: false, error: '申請が見つかりません' },
        { status: 404 }
      );
    }

    const appData = appDoc.data()!;

    // 支払い依頼のみ対象
    if (appData.type !== 'PAYMENT_REQUEST') {
      return NextResponse.json({
        success: true,
        skipped: true,
        message: '支払い依頼以外はAIチェック対象外です',
      });
    }

    const payload = appData.payload as PaymentRequestPayload;

    // テンプレートマッチング
    const dummyPayment = {
      id: `temp-${id}`,
      tenantId: appData.tenantId,
      applicationId: id,
      applicationTitle: appData.title,
      amount: payload.amount,
      currency: 'JPY' as const,
      paymentMethod: payload.paymentMethod,
      payeeName: payload.payeeName,
      status: 'pending' as const,
      providerType: 'dummy' as const,
      retryCount: 0,
      createdBy: appData.applicantId,
      createdByName: appData.applicantName,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const templateMatch = await matchAccountingTemplate(
      dummyPayment,
      appData.branchId,
      payload.purpose
    );

    if (!templateMatch.matched || !templateMatch.template) {
      return NextResponse.json({
        success: true,
        skipped: true,
        message: '適用可能な仕訳テンプレートがありません',
      });
    }

    // 過去の取引履歴を取得（同一取引先）
    const historicalTransactions = await getHistoricalTransactions(
      appData.tenantId,
      payload.payeeName
    );

    // AIチェック入力を作成
    const input: AICheckInput = {
      paymentId: `pending-${id}`,
      applicationId: id,
      payeeName: payload.payeeName,
      amount: payload.amount,
      paymentMethod: payload.paymentMethod,
      purpose: payload.purpose,
      description: payload.description,
      invoiceNumber: payload.invoiceNumber,
      template: {
        id: templateMatch.template.id,
        name: templateMatch.template.name,
        accountItem: templateMatch.template.entries[0]?.accountItem || {
          accountItemId: 0,
          accountItemName: '不明',
        },
        taxCode: templateMatch.template.entries[0]?.accountItem.taxCode,
      },
      historicalTransactions,
    };

    // AIチェック実行
    const result = await performAICheck(input);

    return NextResponse.json({
      success: result.success,
      templateName: templateMatch.template.name,
      matchedAccountItem: input.template.accountItem,
      anomalyFlags: result.anomalyFlags,
      hasAnomaly: result.hasAnomaly,
      aiAnalysis: result.aiAnalysis,
      error: result.error,
    });
  } catch (error) {
    console.error('[AICheck] 実行エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'チェックに失敗しました',
      },
      { status: 500 }
    );
  }
}

/**
 * 過去の取引履歴を取得
 */
async function getHistoricalTransactions(
  tenantId: string,
  payeeName: string
): Promise<Array<{
  date: string;
  amount: number;
  accountItemId: number;
  accountItemName: string;
}>> {
  const db = getAdminDb();

  // payments コレクションから過去の完了した支払いを取得
  const snapshot = await db
    .collection('payments')
    .where('tenantId', '==', tenantId)
    .where('payeeName', '==', payeeName)
    .where('status', '==', 'completed')
    .orderBy('createdAt', 'desc')
    .limit(10)
    .get();

  // 実際にはaccounting_ai_reviewsから勘定科目情報を取得する必要があるが
  // 簡易実装のため、ダミーデータを返す
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      date: data.createdAt?.toDate?.()?.toISOString?.()?.split('T')[0] || '',
      amount: data.amount || 0,
      accountItemId: 314, // 雑費（デフォルト）
      accountItemName: '雑費',
    };
  });
}
