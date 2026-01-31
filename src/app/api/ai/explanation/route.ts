// AI副社長・外部説明文ジェネレーター API

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';
import {
  generateExplanation,
  generateExplanationsForAllAudiences,
  getExplanationHistory,
  getExplanationById,
} from '@/lib/ai-explanation-generator';
import {
  ExplanationRequest,
  AudienceType,
  AUDIENCE_LABELS,
} from '@/types/explanation-generator';

const VALID_AUDIENCES: AudienceType[] = ['finance', 'doctor', 'government', 'staff', 'investor'];

// GET: 説明文履歴または特定の説明文を取得
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
      // 特定の説明文を取得
      const explanation = await getExplanationById(id);

      if (!explanation) {
        return NextResponse.json(
          { error: '説明文が見つかりません' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        explanation: {
          ...explanation,
          createdAt: explanation.createdAt.toISOString(),
        },
      });
    } else {
      // 履歴を取得
      const explanations = await getExplanationHistory(userId, limit);

      return NextResponse.json({
        success: true,
        explanations: explanations.map((e) => ({
          ...e,
          createdAt: e.createdAt.toISOString(),
        })),
      });
    }
  } catch (error) {
    console.error('Failed to get explanation:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '説明文の取得に失敗しました' },
      { status: 500 }
    );
  }
}

// POST: 新しい説明文を生成
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
    const body = await request.json();

    // バリデーション
    if (!body.theme || typeof body.theme !== 'string' || body.theme.trim() === '') {
      return NextResponse.json(
        { error: 'theme は必須です' },
        { status: 400 }
      );
    }

    if (!body.background || typeof body.background !== 'string' || body.background.trim() === '') {
      return NextResponse.json(
        { error: 'background は必須です' },
        { status: 400 }
      );
    }

    if (!body.decision || typeof body.decision !== 'string' || body.decision.trim() === '') {
      return NextResponse.json(
        { error: 'decision は必須です' },
        { status: 400 }
      );
    }

    if (!body.risk || typeof body.risk !== 'string' || body.risk.trim() === '') {
      return NextResponse.json(
        { error: 'risk は必須です' },
        { status: 400 }
      );
    }

    // 一括生成モード
    if (body.audiences && Array.isArray(body.audiences)) {
      const audiences = body.audiences.filter((a: string) =>
        VALID_AUDIENCES.includes(a as AudienceType)
      ) as AudienceType[];

      if (audiences.length === 0) {
        return NextResponse.json(
          { error: '有効な audience が指定されていません' },
          { status: 400 }
        );
      }

      const explanations = await generateExplanationsForAllAudiences(
        {
          theme: body.theme.trim(),
          background: body.background.trim(),
          decision: body.decision.trim(),
          risk: body.risk.trim(),
        },
        audiences,
        userId
      );

      return NextResponse.json({
        success: true,
        explanations: explanations.map((e) => ({
          ...e,
          createdAt: e.createdAt.toISOString(),
        })),
      });
    }

    // 単一生成モード
    if (!body.audience || !VALID_AUDIENCES.includes(body.audience)) {
      return NextResponse.json(
        { error: `audience は ${VALID_AUDIENCES.join(', ')} のいずれかを指定してください` },
        { status: 400 }
      );
    }

    const explanation = await generateExplanation(
      {
        theme: body.theme.trim(),
        background: body.background.trim(),
        decision: body.decision.trim(),
        risk: body.risk.trim(),
        audience: body.audience as AudienceType,
      },
      userId
    );

    return NextResponse.json({
      success: true,
      explanation: {
        ...explanation,
        createdAt: explanation.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Failed to generate explanation:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '説明文生成に失敗しました' },
      { status: 500 }
    );
  }
}
