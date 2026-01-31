// ======== 幹部AI ifシミュレーションAPI ========

import { NextRequest, NextResponse } from 'next/server';
import { runIfSimulation } from '@/lib/executive-ai';

/**
 * POST /api/executive-ai/simulation
 * ifシミュレーションを実行
 *
 * Request Body:
 * - sessionId: string (必須)
 * - scenario: string (必須、「もし〜だったら」)
 * - assumptions: string[] (オプション、前提条件)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, scenario, assumptions = [] } = body;

    // バリデーション
    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'sessionId は必須です' },
        { status: 400 }
      );
    }

    if (!scenario || typeof scenario !== 'string') {
      return NextResponse.json(
        { success: false, error: 'scenario は必須です' },
        { status: 400 }
      );
    }

    // シミュレーション実行
    const simulation = await runIfSimulation(sessionId, scenario, assumptions);

    return NextResponse.json({
      success: true,
      simulation: {
        ...simulation,
        createdAt: simulation.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('[ExecutiveAI/Simulation] 実行エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'シミュレーションに失敗しました',
      },
      { status: 500 }
    );
  }
}
