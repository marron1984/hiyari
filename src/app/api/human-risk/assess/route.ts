// ======== 人材リスク評価実行 API ========

import { NextRequest, NextResponse } from 'next/server';
import { assessHumanRisk } from '@/lib/human-risk';
import type { HumanRiskInput } from '@/types/human-risk';

/**
 * POST /api/human-risk/assess
 * 人材リスク評価を実行
 *
 * Request Body:
 * - branchId: string (必須)
 * - branchName: string (必須)
 * - tenantId: string (default: 'default')
 * - period: { from: string, to: string } (任意)
 * - attendance: AttendanceMetrics (任意)
 * - applications: ApplicationMetrics (任意)
 * - communication: CommunicationMetrics (任意)
 * - operational: OperationalMetrics (任意)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      branchId,
      branchName,
      tenantId = 'default',
      period,
      attendance,
      applications,
      communication,
      operational,
    } = body;

    // バリデーション
    if (!branchId || typeof branchId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'branchId は必須です' },
        { status: 400 }
      );
    }

    if (!branchName || typeof branchName !== 'string') {
      return NextResponse.json(
        { success: false, error: 'branchName は必須です' },
        { status: 400 }
      );
    }

    // 期間設定（デフォルト: 直近30日）
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const evaluationPeriod = period || {
      from: defaultFrom.toISOString().split('T')[0],
      to: now.toISOString().split('T')[0],
    };

    // 入力データ構築
    const input: HumanRiskInput = {
      branchId,
      branchName,
      tenantId,
      period: evaluationPeriod,
      attendance,
      applications,
      communication,
      operational,
    };

    // 評価実行
    const assessment = await assessHumanRisk(input);

    return NextResponse.json({
      success: true,
      assessment: {
        ...assessment,
        assessedAt: assessment.assessedAt.toISOString(),
        createdAt: assessment.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('[HumanRisk] 評価エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '評価に失敗しました',
      },
      { status: 500 }
    );
  }
}
