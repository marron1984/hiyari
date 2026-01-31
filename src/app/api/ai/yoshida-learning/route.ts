// AI副社長・吉田判断ログ学習 API

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import {
  createDecisionLog,
  getDecisionLogs,
  getDecisionLogById,
  analyzeSimilarity,
  getSimilarityAnalysisHistory,
  getDecisionLogStats,
} from '@/lib/ai-yoshida-learning';
import {
  DecisionLogType,
  DecisionLogRequest,
  SimilarityAnalysisRequest,
} from '@/types/yoshida-learning';

const VALID_LOG_TYPES: DecisionLogType[] = ['approval', 'hr_decision', 'management_decision'];

// 幹部ロールのチェック
async function isExecutive(uid: string): Promise<boolean> {
  const db = getAdminDb();
  const userDoc = await db.collection('users').doc(uid).get();
  if (!userDoc.exists) return false;

  const userData = userDoc.data();
  const role = userData?.role;

  // 幹部ロール: admin, manager, leader
  return ['admin', 'manager', 'leader'].includes(role);
}

// GET: 判断ログ一覧、統計、または類似度分析履歴を取得
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

    // 幹部権限チェック
    if (!(await isExecutive(userId))) {
      return NextResponse.json(
        { error: 'このページは幹部のみアクセスできます' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    // 統計取得
    if (action === 'stats') {
      const stats = await getDecisionLogStats();
      return NextResponse.json({ success: true, stats });
    }

    // 類似度分析履歴
    if (action === 'analysis-history') {
      const limit = parseInt(searchParams.get('limit') || '10', 10);
      const analyses = await getSimilarityAnalysisHistory(userId, limit);

      return NextResponse.json({
        success: true,
        analyses: analyses.map((a) => ({
          ...a,
          createdAt: a.createdAt.toISOString(),
          mostSimilarDecision: a.mostSimilarDecision
            ? {
                ...a.mostSimilarDecision,
                decidedAt: a.mostSimilarDecision.decidedAt.toISOString(),
              }
            : null,
        })),
      });
    }

    // 特定の判断ログ取得
    const id = searchParams.get('id');
    if (id) {
      const log = await getDecisionLogById(id);
      if (!log) {
        return NextResponse.json(
          { error: '判断ログが見つかりません' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        decisionLog: {
          ...log,
          createdAt: log.createdAt.toISOString(),
          updatedAt: log.updatedAt?.toISOString() ?? null,
          decidedAt: log.decidedAt.toISOString(),
        },
      });
    }

    // 判断ログ一覧
    const logType = searchParams.get('logType') as DecisionLogType | null;
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const { logs, total } = await getDecisionLogs({
      logType: logType && VALID_LOG_TYPES.includes(logType) ? logType : undefined,
      limit,
    });

    return NextResponse.json({
      success: true,
      decisionLogs: logs.map((log) => ({
        ...log,
        createdAt: log.createdAt.toISOString(),
        updatedAt: log.updatedAt?.toISOString() ?? null,
        decidedAt: log.decidedAt.toISOString(),
      })),
      total,
    });
  } catch (error) {
    console.error('Failed to get yoshida learning data:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'データの取得に失敗しました' },
      { status: 500 }
    );
  }
}

// POST: 判断ログ登録または類似度分析
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

    // 幹部権限チェック
    if (!(await isExecutive(userId))) {
      return NextResponse.json(
        { error: 'このページは幹部のみアクセスできます' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const body = await request.json();

    // 類似度分析
    if (action === 'analyze') {
      const analysisRequest = body as SimilarityAnalysisRequest;

      if (!analysisRequest.title || !analysisRequest.description) {
        return NextResponse.json(
          { error: 'title と description は必須です' },
          { status: 400 }
        );
      }

      const analysis = await analyzeSimilarity(
        {
          currentCase: {
            title: analysisRequest.title,
            description: analysisRequest.description,
            context: analysisRequest.context,
            logType: analysisRequest.logType,
          },
        },
        userId
      );

      return NextResponse.json({
        success: true,
        analysis: {
          ...analysis,
          createdAt: analysis.createdAt.toISOString(),
          mostSimilarDecision: analysis.mostSimilarDecision
            ? {
                ...analysis.mostSimilarDecision,
                decidedAt: analysis.mostSimilarDecision.decidedAt.toISOString(),
              }
            : null,
        },
      });
    }

    // 判断ログ登録
    const logRequest = body as DecisionLogRequest;

    // バリデーション
    if (!logRequest.logType || !VALID_LOG_TYPES.includes(logRequest.logType)) {
      return NextResponse.json(
        { error: `logType は ${VALID_LOG_TYPES.join(', ')} のいずれかを指定してください` },
        { status: 400 }
      );
    }

    if (!logRequest.targetTitle) {
      return NextResponse.json(
        { error: 'targetTitle は必須です' },
        { status: 400 }
      );
    }

    if (!logRequest.targetDescription) {
      return NextResponse.json(
        { error: 'targetDescription は必須です' },
        { status: 400 }
      );
    }

    if (!logRequest.decisionContext) {
      return NextResponse.json(
        { error: 'decisionContext は必須です' },
        { status: 400 }
      );
    }

    if (!logRequest.finalDecision) {
      return NextResponse.json(
        { error: 'finalDecision は必須です' },
        { status: 400 }
      );
    }

    const decisionLog = await createDecisionLog(logRequest);

    return NextResponse.json({
      success: true,
      decisionLog: {
        ...decisionLog,
        createdAt: decisionLog.createdAt.toISOString(),
        updatedAt: decisionLog.updatedAt?.toISOString() ?? null,
        decidedAt: decisionLog.decidedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Failed to process yoshida learning request:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '処理に失敗しました' },
      { status: 500 }
    );
  }
}
