// ======== 幹部AI 相談セッション詳細API ========

import { NextRequest, NextResponse } from 'next/server';
import { getConsultationSession } from '@/lib/executive-ai';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/executive-ai/consultation/[id]
 * 相談セッション詳細を取得
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const session = await getConsultationSession(id);

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'セッションが見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      session: {
        ...session,
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
        analysis: session.analysis
          ? {
              ...session.analysis,
              analyzedAt: session.analysis.analyzedAt.toISOString(),
            }
          : undefined,
        escalation: {
          ...session.escalation,
          sentAt: session.escalation.sentAt?.toISOString(),
          acknowledgedAt: session.escalation.acknowledgedAt?.toISOString(),
          resolvedAt: session.escalation.resolvedAt?.toISOString(),
        },
      },
    });
  } catch (error) {
    console.error('[ExecutiveAI/Consultation] 詳細取得エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '取得に失敗しました',
      },
      { status: 500 }
    );
  }
}
