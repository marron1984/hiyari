// ======== AI副社長・吉田判断ログ学習 ========

import { getAdminDb } from './firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import Anthropic from '@anthropic-ai/sdk';
import {
  DecisionLog,
  DecisionLogType,
  DecisionContext,
  SimilarityAnalysisInput,
  SimilarityAnalysisResult,
  DECISION_LOG_TYPE_LABELS,
  YOSHIDA_LEARNING_PROMPT_VERSION,
} from '@/types/yoshida-learning';
import { buildFeaturePrompt } from './ai-vp-persona';
import { toDate } from './date';

const DECISION_LOG_COLLECTION = 'yoshidaDecisionLogs';
const SIMILARITY_ANALYSIS_COLLECTION = 'yoshidaSimilarityAnalyses';
const DEFAULT_TENANT_ID = 'defaultTenant';
const MAX_PAST_DECISIONS = 50;

// ======== 判断ログ管理 ========

/**
 * 判断ログを登録
 */
export async function createDecisionLog(
  input: {
    logType: DecisionLogType;
    targetId?: string;
    targetTitle: string;
    targetDescription: string;
    decisionContext: DecisionContext;
    finalDecision: string;
    decisionReason?: string;
    metadata?: Record<string, unknown>;
  },
  tenantId: string = DEFAULT_TENANT_ID
): Promise<DecisionLog> {
  const db = getAdminDb();

  const now = Timestamp.now();
  const decisionLog: Omit<DecisionLog, 'id'> = {
    tenantId,
    createdAt: new Date(),
    logType: input.logType,
    targetId: input.targetId,
    targetTitle: input.targetTitle,
    targetDescription: input.targetDescription,
    decisionContext: input.decisionContext,
    finalDecision: input.finalDecision,
    decisionReason: input.decisionReason,
    decidedBy: 'yoshida',
    decidedAt: new Date(),
    metadata: input.metadata,
  };

  const docRef = await db.collection(DECISION_LOG_COLLECTION).add({
    ...decisionLog,
    createdAt: now,
    decidedAt: now,
  });

  return {
    id: docRef.id,
    ...decisionLog,
  };
}

/**
 * 判断ログを取得
 */
export async function getDecisionLogs(
  options: {
    logType?: DecisionLogType;
    limit?: number;
    offset?: number;
  } = {},
  tenantId: string = DEFAULT_TENANT_ID
): Promise<{ logs: DecisionLog[]; total: number }> {
  const db = getAdminDb();

  let query = db
    .collection(DECISION_LOG_COLLECTION)
    .where('tenantId', '==', tenantId)
    .where('decidedBy', '==', 'yoshida');

  if (options.logType) {
    query = query.where('logType', '==', options.logType);
  }

  // 総数を取得
  const countSnapshot = await query.count().get();
  const total = countSnapshot.data().count;

  // ページネーション
  query = query.orderBy('decidedAt', 'desc');
  if (options.limit) {
    query = query.limit(options.limit);
  }

  const snapshot = await query.get();

  const logs = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      tenantId: data.tenantId,
      createdAt: toDate(data.createdAt) || new Date(),
      updatedAt: toDate(data.updatedAt) ?? undefined,
      logType: data.logType,
      targetId: data.targetId,
      targetTitle: data.targetTitle,
      targetDescription: data.targetDescription,
      decisionContext: data.decisionContext,
      finalDecision: data.finalDecision,
      decisionReason: data.decisionReason,
      decidedBy: data.decidedBy,
      decidedAt: toDate(data.decidedAt) || new Date(),
      metadata: data.metadata,
    } as DecisionLog;
  });

  return { logs, total };
}

/**
 * 判断ログをIDで取得
 */
export async function getDecisionLogById(id: string): Promise<DecisionLog | null> {
  const db = getAdminDb();

  const doc = await db.collection(DECISION_LOG_COLLECTION).doc(id).get();

  if (!doc.exists) return null;

  const data = doc.data()!;
  return {
    id: doc.id,
    tenantId: data.tenantId,
    createdAt: toDate(data.createdAt) || new Date(),
    updatedAt: toDate(data.updatedAt) ?? undefined,
    logType: data.logType,
    targetId: data.targetId,
    targetTitle: data.targetTitle,
    targetDescription: data.targetDescription,
    decisionContext: data.decisionContext,
    finalDecision: data.finalDecision,
    decisionReason: data.decisionReason,
    decidedBy: data.decidedBy,
    decidedAt: toDate(data.decidedAt) || new Date(),
    metadata: data.metadata,
  };
}

// ======== 類似度分析 ========

function buildSimilarityPrompt(
  currentCase: SimilarityAnalysisInput['currentCase'],
  pastDecisions: DecisionLog[]
): string {
  const pastDecisionsText = pastDecisions
    .slice(0, 10) // 最大10件
    .map((d, idx) => {
      return `【過去判断${idx + 1}】
タイトル: ${d.targetTitle}
内容: ${d.targetDescription}
守りたい軸: ${d.decisionContext.protectedValue}
嫌ったリスク: ${d.decisionContext.avoidedRisk}
代替案: ${d.decisionContext.hasAlternative ? d.decisionContext.alternativeDescription || 'あり' : 'なし'}
最終判断: ${d.finalDecision}
${d.decisionReason ? `理由: ${d.decisionReason}` : ''}`;
    })
    .join('\n\n');

  const currentContextText = currentCase.context
    ? `
守りたい軸: ${currentCase.context.protectedValue || '未指定'}
嫌ったリスク: ${currentCase.context.avoidedRisk || '未指定'}
代替案: ${currentCase.context.hasAlternative !== undefined ? (currentCase.context.hasAlternative ? 'あり' : 'なし') : '未指定'}`
    : '';

  return `吉田社長の過去の判断パターンと現在のケースとの類似度を分析してください。

【類似度スコアリング基準（100点満点）】

■ カテゴリ一致 (30点満点)
- 完全一致: 30点
- 関連カテゴリ（例: 承認と経費）: 15点
- 無関係: 0点

■ コンテキスト一致 (40点満点)
- 守りたい軸が同じ: 20点
- 嫌ったリスクが同じ: 15点
- 代替案の有無が同じ: 5点

■ 状況類似度 (30点満点)
- 規模・金額帯が近い: 10点
- 緊急度が近い: 10点
- 影響範囲が近い: 10点

合計スコアを%に変換して similarityScore に設定してください。

【現在のケース】
タイトル: ${currentCase.title}
内容: ${currentCase.description}${currentContextText}

【吉田社長の過去の判断（${pastDecisions.length}件）】
${pastDecisionsText}

【分析指示】
1. 現在のケースと過去の判断の類似度を0-100%で算出
2. 一致点を最大3つ抽出
3. 相違点を最大2つ抽出
4. 注意点を記載（断定禁止）

【出力フォーマット】
以下のJSON形式で出力してください:
{
  "similarityScore": 75,
  "mostSimilarDecisionIndex": 0,
  "matchingPoints": ["一致点1", "一致点2", "一致点3"],
  "differences": ["相違点1", "相違点2"],
  "cautions": ["注意点1", "注意点2"]
}

注意:
- mostSimilarDecisionIndex は最も類似した過去判断のインデックス（0始まり）
- matchingPoints は最大3つ
- differences は最大2つ
- cautions は断定表現を避けること`;
}

interface AiSimilarityResponse {
  similarityScore: number;
  mostSimilarDecisionIndex?: number;
  matchingPoints: string[];
  differences: string[];
  cautions: string[];
}

function parseAiResponse(rawResponse: string): AiSimilarityResponse | null {
  // コードブロック対応
  const codeBlockMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = codeBlockMatch ? codeBlockMatch[1] : rawResponse;
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      similarityScore: Math.min(100, Math.max(0, parsed.similarityScore || 0)),
      mostSimilarDecisionIndex: parsed.mostSimilarDecisionIndex,
      matchingPoints: (parsed.matchingPoints || []).slice(0, 3),
      differences: (parsed.differences || []).slice(0, 2),
      cautions: parsed.cautions || [],
    };
  } catch (error) {
    console.error('Failed to parse AI response:', error);
    return null;
  }
}

/**
 * 類似度分析を実行
 */
export async function analyzeSimilarity(
  input: SimilarityAnalysisInput,
  userId: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<SimilarityAnalysisResult> {
  const db = getAdminDb();

  // 過去の判断ログを取得
  let pastDecisions = input.pastDecisions;
  if (!pastDecisions || pastDecisions.length === 0) {
    const { logs } = await getDecisionLogs(
      {
        logType: input.currentCase.logType,
        limit: MAX_PAST_DECISIONS,
      },
      tenantId
    );
    pastDecisions = logs;
  }

  // 過去の判断がない場合
  if (pastDecisions.length === 0) {
    const result: SimilarityAnalysisResult = {
      id: '',
      createdAt: new Date(),
      createdBy: userId,
      input,
      similarityScore: 0,
      matchingPoints: [],
      differences: [],
      cautions: ['過去の判断ログがないため、類似度分析ができませんでした。'],
      referencedDecisionCount: 0,
      aiModel: 'claude-sonnet-4-20250514',
      promptVersion: YOSHIDA_LEARNING_PROMPT_VERSION,
    };

    const docRef = await db.collection(SIMILARITY_ANALYSIS_COLLECTION).add({
      ...result,
      createdAt: Timestamp.now(),
    });

    result.id = docRef.id;
    return result;
  }

  // AI で類似度分析
  let analysisResult: AiSimilarityResponse;

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.warn('ANTHROPIC_API_KEY not set, using fallback analysis');
    analysisResult = {
      similarityScore: 0,
      matchingPoints: [],
      differences: [],
      cautions: ['AI APIキーが設定されていないため、詳細な分析ができませんでした。'],
    };
  } else {
    try {
      const client = new Anthropic({ apiKey });
      const prompt = buildSimilarityPrompt(input.currentCase, pastDecisions);

      const message = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        temperature: 0.3,
        system: buildFeaturePrompt('yoshida_learning'),
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const rawResponse =
        message.content[0].type === 'text' ? message.content[0].text : '';

      const parsed = parseAiResponse(rawResponse);

      if (parsed) {
        analysisResult = parsed;
      } else {
        analysisResult = {
          similarityScore: 0,
          matchingPoints: [],
          differences: [],
          cautions: ['AI応答の解析に失敗しました。'],
        };
      }
    } catch (error) {
      console.error('AI API error:', error);
      analysisResult = {
        similarityScore: 0,
        matchingPoints: [],
        differences: [],
        cautions: ['AI分析中にエラーが発生しました。'],
      };
    }
  }

  // 最も類似した判断を特定
  let mostSimilarDecision: SimilarityAnalysisResult['mostSimilarDecision'];
  if (
    analysisResult.mostSimilarDecisionIndex !== undefined &&
    analysisResult.mostSimilarDecisionIndex >= 0 &&
    analysisResult.mostSimilarDecisionIndex < pastDecisions.length
  ) {
    const similar = pastDecisions[analysisResult.mostSimilarDecisionIndex];
    mostSimilarDecision = {
      id: similar.id,
      title: similar.targetTitle,
      finalDecision: similar.finalDecision,
      decidedAt: similar.decidedAt,
    };
  }

  // 結果を構築
  const result: SimilarityAnalysisResult = {
    id: '',
    createdAt: new Date(),
    createdBy: userId,
    input,
    similarityScore: analysisResult.similarityScore,
    mostSimilarDecision,
    matchingPoints: analysisResult.matchingPoints,
    differences: analysisResult.differences,
    cautions: analysisResult.cautions,
    referencedDecisionCount: pastDecisions.length,
    aiModel: 'claude-sonnet-4-20250514',
    promptVersion: YOSHIDA_LEARNING_PROMPT_VERSION,
  };

  // Firestoreに保存
  const docRef = await db.collection(SIMILARITY_ANALYSIS_COLLECTION).add({
    ...result,
    createdAt: Timestamp.now(),
    mostSimilarDecision: mostSimilarDecision
      ? {
          ...mostSimilarDecision,
          decidedAt: Timestamp.fromDate(mostSimilarDecision.decidedAt),
        }
      : null,
  });

  result.id = docRef.id;

  return result;
}

/**
 * 類似度分析履歴を取得
 */
export async function getSimilarityAnalysisHistory(
  userId: string,
  limit: number = 10
): Promise<SimilarityAnalysisResult[]> {
  const db = getAdminDb();

  const snapshot = await db
    .collection(SIMILARITY_ANALYSIS_COLLECTION)
    .where('createdBy', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      createdAt: toDate(data.createdAt) || new Date(),
      createdBy: data.createdBy,
      input: data.input,
      similarityScore: data.similarityScore,
      mostSimilarDecision: data.mostSimilarDecision
        ? {
            ...data.mostSimilarDecision,
            decidedAt: toDate(data.mostSimilarDecision.decidedAt) || new Date(),
          }
        : undefined,
      matchingPoints: data.matchingPoints || [],
      differences: data.differences || [],
      cautions: data.cautions || [],
      referencedDecisionCount: data.referencedDecisionCount || 0,
      aiModel: data.aiModel,
      promptVersion: data.promptVersion,
    };
  });
}

/**
 * 判断ログの統計を取得
 */
export async function getDecisionLogStats(
  tenantId: string = DEFAULT_TENANT_ID
): Promise<{
  total: number;
  byType: Record<DecisionLogType, number>;
  recentCount: number;
}> {
  const db = getAdminDb();

  const snapshot = await db
    .collection(DECISION_LOG_COLLECTION)
    .where('tenantId', '==', tenantId)
    .where('decidedBy', '==', 'yoshida')
    .get();

  const byType: Record<DecisionLogType, number> = {
    approval: 0,
    hr_decision: 0,
    management_decision: 0,
  };

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  let recentCount = 0;

  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    const logType = data.logType as DecisionLogType;
    if (byType[logType] !== undefined) {
      byType[logType]++;
    }

    const decidedAt = toDate(data.decidedAt);
    if (decidedAt && decidedAt > thirtyDaysAgo) {
      recentCount++;
    }
  });

  return {
    total: snapshot.size,
    byType,
    recentCount,
  };
}
