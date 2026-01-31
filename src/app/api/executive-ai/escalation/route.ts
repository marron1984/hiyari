// ======== 幹部AI エスカレーションAPI ========

import { NextRequest, NextResponse } from 'next/server';
import { sendEscalation } from '@/lib/executive-ai';
import type { UrgencyLevel } from '@/types/executive-ai';

/**
 * POST /api/executive-ai/escalation
 * エスカレーションを送信（吉田への通知）
 *
 * Request Body:
 * - sessionId: string (必須)
 * - subject: string (オプション、AI生成を上書き)
 * - body: string (オプション、AI生成を上書き)
 * - priority: UrgencyLevel (オプション)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, subject, body: escalationBody, priority } = body;

    // バリデーション
    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'sessionId は必須です' },
        { status: 400 }
      );
    }

    // エスカレーション送信
    const notification = await sendEscalation(sessionId, {
      subject,
      body: escalationBody,
      priority: priority as UrgencyLevel | undefined,
    });

    return NextResponse.json({
      success: true,
      notification: {
        ...notification,
        createdAt: notification.createdAt.toISOString(),
        readAt: notification.readAt?.toISOString(),
        acknowledgedAt: notification.acknowledgedAt?.toISOString(),
        resolvedAt: notification.resolvedAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('[ExecutiveAI/Escalation] 送信エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'エスカレーションに失敗しました',
      },
      { status: 500 }
    );
  }
}
