// ======== 幹部AI 相談セッションAPI ========

import { NextRequest, NextResponse } from 'next/server';
import {
  startConsultationSession,
  getConsultationSessions,
  canAccessExecutiveAI,
} from '@/lib/executive-ai';
import type { ConsultationCategory, UrgencyLevel } from '@/types/executive-ai';

/**
 * GET /api/executive-ai/consultation
 * 相談セッション一覧を取得
 *
 * Query Parameters:
 * - tenantId: string (default: 'default')
 * - consultantId: string (オプション)
 * - branchId: string (オプション)
 * - status: 'pending' | 'analyzing' | 'analyzed' | 'escalated' | 'resolved'
 * - limit: number (default: 20)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId') || 'default';
    const consultantId = searchParams.get('consultantId') || undefined;
    const branchId = searchParams.get('branchId') || undefined;
    const status = searchParams.get('status') as
      | 'pending'
      | 'analyzing'
      | 'analyzed'
      | 'escalated'
      | 'resolved'
      | null;
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const sessions = await getConsultationSessions(tenantId, {
      consultantId,
      branchId,
      status: status || undefined,
      limit,
    });

    return NextResponse.json({
      success: true,
      sessions: sessions.map((session) => ({
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
      })),
    });
  } catch (error) {
    console.error('[ExecutiveAI/Consultation] 取得エラー:', error);
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
 * POST /api/executive-ai/consultation
 * 相談セッションを開始
 *
 * Request Body:
 * - content: string (相談内容、必須)
 * - category: ConsultationCategory (オプション)
 * - urgency: UrgencyLevel (オプション)
 * - branchId: string (オプション)
 * - relatedDocumentIds: string[] (オプション)
 * - ifScenarios: string[] (オプション)
 * - consultantId: string (必須)
 * - consultantName: string (必須)
 * - consultantRole: 'manager' | 'executive' (必須)
 * - tenantId: string (default: 'default')
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      content,
      category,
      urgency,
      branchId,
      relatedDocumentIds,
      ifScenarios,
      consultantId,
      consultantName,
      consultantRole,
      tenantId = 'default',
    } = body;

    // バリデーション
    if (!content || typeof content !== 'string') {
      return NextResponse.json(
        { success: false, error: '相談内容は必須です' },
        { status: 400 }
      );
    }

    if (!consultantId || !consultantName) {
      return NextResponse.json(
        { success: false, error: '相談者情報は必須です' },
        { status: 400 }
      );
    }

    if (!consultantRole || !['manager', 'executive'].includes(consultantRole)) {
      return NextResponse.json(
        { success: false, error: 'role は manager または executive である必要があります' },
        { status: 400 }
      );
    }

    // アクセス権限チェック
    if (!canAccessExecutiveAI(consultantRole)) {
      return NextResponse.json(
        { success: false, error: '幹部AIへのアクセス権限がありません' },
        { status: 403 }
      );
    }

    // セッション開始
    const session = await startConsultationSession({
      tenantId,
      consultantId,
      consultantName,
      consultantRole,
      branchId,
      request: {
        content,
        category: category as ConsultationCategory | undefined,
        urgency: urgency as UrgencyLevel | undefined,
        branchId,
        relatedDocumentIds,
        ifScenarios,
      },
    });

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
    console.error('[ExecutiveAI/Consultation] 開始エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '相談の開始に失敗しました',
      },
      { status: 500 }
    );
  }
}
