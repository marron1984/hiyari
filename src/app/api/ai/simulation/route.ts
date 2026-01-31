// AI副社長・ifシミュレーション API

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';
import {
  generateIfSimulation,
  getSimulationHistory,
  getSimulationById,
} from '@/lib/ai-if-simulation';
import {
  IfSimulationRequest,
  ScenarioType,
} from '@/types/if-simulation';

// GET: シミュレーション履歴または特定のシミュレーションを取得
export async function GET(request: NextRequest) {
  try {
    // 認証チェック
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const auth = getAdminAuth();

    let userId: string;
    try {
      const decoded = await auth.verifyIdToken(token);
      userId = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // クエリパラメータを取得
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    if (id) {
      // 特定のシミュレーションを取得
      const simulation = await getSimulationById(id);

      if (!simulation) {
        return NextResponse.json(
          { error: 'シミュレーションが見つかりません' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        simulation: {
          ...simulation,
          createdAt: simulation.createdAt.toISOString(),
        },
      });
    } else {
      // 履歴を取得
      const simulations = await getSimulationHistory(userId, 'defaultTenant', limit);

      return NextResponse.json({
        success: true,
        simulations: simulations.map((s) => ({
          ...s,
          createdAt: s.createdAt.toISOString(),
        })),
      });
    }
  } catch (error) {
    console.error('Failed to get simulation:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'シミュレーションの取得に失敗しました' },
      { status: 500 }
    );
  }
}

// POST: 新しいシミュレーションを生成
export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const auth = getAdminAuth();

    let userId: string;
    try {
      const decoded = await auth.verifyIdToken(token);
      userId = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // リクエストボディを取得
    const body = (await request.json()) as IfSimulationRequest;

    // バリデーション
    if (!body.scenarioType) {
      return NextResponse.json(
        { error: 'scenarioType は必須です' },
        { status: 400 }
      );
    }

    if (!body.baseId) {
      return NextResponse.json(
        { error: 'baseId は必須です' },
        { status: 400 }
      );
    }

    if (!body.period?.startMonth || !body.period?.months) {
      return NextResponse.json(
        { error: 'period.startMonth と period.months は必須です' },
        { status: 400 }
      );
    }

    if (body.period.months < 1 || body.period.months > 24) {
      return NextResponse.json(
        { error: 'period.months は1〜24の範囲で指定してください' },
        { status: 400 }
      );
    }

    // シミュレーションを生成
    const simulation = await generateIfSimulation(
      {
        scenarioType: body.scenarioType as ScenarioType,
        baseId: body.baseId,
        period: body.period,
        optionalParams: body.optionalParams,
      },
      userId
    );

    return NextResponse.json({
      success: true,
      simulation: {
        ...simulation,
        createdAt: simulation.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Failed to generate simulation:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'シミュレーション生成に失敗しました' },
      { status: 500 }
    );
  }
}
