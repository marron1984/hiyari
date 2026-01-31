// ======== 幹部AI（AI副社長 分身ノード）ライブラリ ========

import { getAdminDb } from './firebase-admin';
import type {
  ConsultationSession,
  ConsultationRequest,
  AIAnalysis,
  AnalysisIssue,
  AnalysisOption,
  YoshidaJudgmentLog,
  IfSimulation,
  YoshidaNotification,
  ConsultationCategory,
  UrgencyLevel,
} from '@/types/executive-ai';

// コレクション名
const SESSIONS_COLLECTION = 'consultation_sessions';
const JUDGMENT_LOGS_COLLECTION = 'yoshida_judgment_logs';
const NOTIFICATIONS_COLLECTION = 'yoshida_notifications';
const SIMULATIONS_COLLECTION = 'if_simulations';

// ======== 相談セッション開始 ========

export interface StartSessionOptions {
  tenantId: string;
  consultantId: string;
  consultantName: string;
  consultantRole: 'manager' | 'executive';
  branchId?: string;
  request: ConsultationRequest;
}

/**
 * 相談セッションを開始し、AI分析を実行
 */
export async function startConsultationSession(
  options: StartSessionOptions
): Promise<ConsultationSession> {
  const {
    tenantId,
    consultantId,
    consultantName,
    consultantRole,
    branchId,
    request,
  } = options;

  console.log('[ExecutiveAI] 相談セッション開始', {
    consultantName,
    consultantRole,
    category: request.category,
  });

  const now = new Date();

  // セッション作成（分析中状態）
  const sessionRef = getAdminDb().collection(SESSIONS_COLLECTION).doc();
  const session: ConsultationSession = {
    id: sessionRef.id,
    tenantId,
    consultantId,
    consultantName,
    consultantRole,
    branchId,
    request,
    escalation: {
      status: 'none',
    },
    status: 'analyzing',
    createdAt: now,
    updatedAt: now,
  };

  await sessionRef.set(session);

  // AI分析を実行
  try {
    const analysis = await analyzeConsultation(session, branchId);
    session.analysis = analysis;
    session.status = 'analyzed';
    session.updatedAt = new Date();

    await sessionRef.update({
      analysis,
      status: 'analyzed',
      updatedAt: session.updatedAt,
    });

    console.log('[ExecutiveAI] AI分析完了', {
      sessionId: session.id,
      issuesCount: analysis.issues.length,
      optionsCount: analysis.options.length,
      similarity: analysis.judgmentSimilarity.percentage,
    });
  } catch (error) {
    console.error('[ExecutiveAI] AI分析エラー', error);
    session.status = 'pending';
    await sessionRef.update({
      status: 'pending',
      updatedAt: new Date(),
    });
  }

  return session;
}

// ======== AI分析 ========

/**
 * 相談内容をAIで分析
 */
async function analyzeConsultation(
  session: ConsultationSession,
  branchId?: string
): Promise<AIAnalysis> {
  // 類似判断ログを検索
  const similarLogs = await searchSimilarJudgmentLogs(
    session.request.content,
    session.tenantId,
    branchId
  );

  // OpenAI APIで分析
  const analysisResult = await callOpenAIForAnalysis(session, similarLogs);

  return analysisResult;
}

/**
 * OpenAI APIを呼び出して分析
 */
async function callOpenAIForAnalysis(
  session: ConsultationSession,
  similarLogs: YoshidaJudgmentLog[]
): Promise<AIAnalysis> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.warn('[ExecutiveAI] OpenAI APIキーなし、ダミー分析を返す');
    return generateDummyAnalysis(session, similarLogs);
  }

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(session, similarLogs);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('OpenAI API returned empty content');
    }

    const parsed = JSON.parse(content);
    return formatAIResponse(parsed, similarLogs, data.usage?.total_tokens);
  } catch (error) {
    console.error('[ExecutiveAI] OpenAI API呼び出しエラー', error);
    return generateDummyAnalysis(session, similarLogs);
  }
}

/**
 * システムプロンプトを構築
 */
function buildSystemPrompt(): string {
  return `あなたは「AI副社長」として、幹部の相談を整理し、最終判断者（吉田）に届ける前に考えを整える支援を行います。

## 重要なルール

1. **断定禁止**: 「〜です」「〜でしょう」「〜すべきです」「〜しなければなりません」は使わない
2. **命令禁止**: 「〜してください」「〜しなさい」「〜すること」は使わない
3. **感情評価禁止**: 「良い」「悪い」「素晴らしい」「問題です」「心配です」は使わない

## 推奨表現

- 「〜と考えられます」
- 「〜の可能性があります」
- 「〜という選択肢があります」
- 「〜という視点もあります」
- 「検討の余地があるかもしれません」

## 出力形式（JSON）

必ず以下の形式で出力してください：

{
  "summary": {
    "facts": ["事実1", "事実2", ...],
    "context": "背景・状況の説明"
  },
  "issues": [
    {
      "title": "論点タイトル",
      "description": "詳細説明",
      "perspective": "視点（財務面、法的リスク、人員影響など）"
    }
  ],
  "options": [
    {
      "title": "選択肢タイトル",
      "description": "詳細説明",
      "pros": ["メリット1", "メリット2"],
      "cons": ["デメリット1", "デメリット2"],
      "riskLevel": "low|medium|high",
      "estimatedImpact": "想定される影響"
    }
  ],
  "escalationDraft": {
    "subject": "エスカレーション件名",
    "body": "エスカレーション本文",
    "keyPoints": ["要点1", "要点2", "要点3"],
    "suggestedAction": "提案アクション（断定しない形式で）"
  }
}

注意:
- issuesは最大3つ
- optionsは最大3つ
- 全ての文は推奨表現を使い、断定・命令・感情評価を避ける`;
}

/**
 * ユーザープロンプトを構築
 */
function buildUserPrompt(
  session: ConsultationSession,
  similarLogs: YoshidaJudgmentLog[]
): string {
  let prompt = `## 相談内容

${session.request.content}

## カテゴリ
${session.request.category || '未指定'}

## 緊急度
${session.request.urgency || '未指定'}
`;

  if (session.request.ifScenarios && session.request.ifScenarios.length > 0) {
    prompt += `
## 検討したいシナリオ
${session.request.ifScenarios.map((s, i) => `${i + 1}. ${s}`).join('\n')}
`;
  }

  if (similarLogs.length > 0) {
    prompt += `
## 過去の類似判断（参考）
${similarLogs
  .slice(0, 5)
  .map(
    (log, i) => `
### ${i + 1}. ${log.title}
- カテゴリ: ${log.category}
- 状況: ${log.situation}
- 判断: ${log.decision}
- 理由: ${log.reasoning}
`
  )
  .join('\n')}
`;
  }

  prompt += `
上記の相談内容を分析し、指定されたJSON形式で出力してください。`;

  return prompt;
}

/**
 * AIレスポンスを整形
 */
function formatAIResponse(
  parsed: any,
  similarLogs: YoshidaJudgmentLog[],
  tokensUsed?: number
): AIAnalysis {
  const now = new Date();

  // 論点を整形（最大3つ）
  const issues: AnalysisIssue[] = (parsed.issues || [])
    .slice(0, 3)
    .map((issue: any, index: number) => ({
      id: `issue-${index + 1}`,
      title: issue.title || `論点${index + 1}`,
      description: issue.description || '',
      perspective: issue.perspective || '',
    }));

  // 選択肢を整形（最大3つ）
  const options: AnalysisOption[] = (parsed.options || [])
    .slice(0, 3)
    .map((option: any, index: number) => ({
      id: `option-${index + 1}`,
      title: option.title || `選択肢${index + 1}`,
      description: option.description || '',
      pros: (option.pros || []).slice(0, 3),
      cons: (option.cons || []).slice(0, 3),
      riskLevel: option.riskLevel || 'medium',
      estimatedImpact: option.estimatedImpact,
    }));

  // 類似度を計算
  const similarity = calculateSimilarity(similarLogs);

  return {
    summary: {
      facts: parsed.summary?.facts || [],
      context: parsed.summary?.context || '',
    },
    issues,
    options,
    judgmentSimilarity: {
      percentage: similarity.percentage,
      similarCases: similarity.similarCases,
      note: similarity.note,
    },
    escalationDraft: {
      subject: parsed.escalationDraft?.subject || '相談事項',
      body: parsed.escalationDraft?.body || '',
      keyPoints: (parsed.escalationDraft?.keyPoints || []).slice(0, 3),
      suggestedAction: parsed.escalationDraft?.suggestedAction || '',
    },
    disclaimer:
      'この分析は参考情報であり、最終判断は吉田が行います。AIは決断・承認・指示を行いません。',
    analyzedAt: now,
    modelUsed: 'gpt-4o-mini',
    tokensUsed,
  };
}

/**
 * 類似度を計算
 */
function calculateSimilarity(
  similarLogs: YoshidaJudgmentLog[]
): {
  percentage: number;
  similarCases: Array<{
    id: string;
    title: string;
    decision: string;
    date: string;
    similarity: number;
  }>;
  note: string;
} {
  if (similarLogs.length === 0) {
    return {
      percentage: 0,
      similarCases: [],
      note: '過去の類似判断が見つかりませんでした。新規案件として検討が必要と考えられます。',
    };
  }

  // ダミー類似度計算（実際はベクトル検索などを使用）
  const similarCases = similarLogs.slice(0, 5).map((log, index) => ({
    id: log.id,
    title: log.title,
    decision: log.decision,
    date: log.decidedAt.toISOString().split('T')[0],
    similarity: Math.max(20, 85 - index * 15), // ダミー値
  }));

  const avgSimilarity =
    similarCases.reduce((sum, c) => sum + c.similarity, 0) / similarCases.length;

  let note = '';
  if (avgSimilarity >= 70) {
    note = `過去${similarCases.length}件の類似判断が見つかりました。参考になる可能性があります。`;
  } else if (avgSimilarity >= 40) {
    note = `過去の判断に部分的な類似性が見られます。状況の違いを考慮する必要があるかもしれません。`;
  } else {
    note = `類似度は低めですが、過去の判断を参考として確認できます。`;
  }

  return {
    percentage: Math.round(avgSimilarity),
    similarCases,
    note,
  };
}

/**
 * ダミー分析を生成
 */
function generateDummyAnalysis(
  session: ConsultationSession,
  similarLogs: YoshidaJudgmentLog[]
): AIAnalysis {
  const similarity = calculateSimilarity(similarLogs);

  return {
    summary: {
      facts: [
        '相談内容が入力されています',
        `カテゴリ: ${session.request.category || '未指定'}`,
        `緊急度: ${session.request.urgency || '未指定'}`,
      ],
      context: '詳細な分析にはOpenAI APIキーの設定が必要です。',
    },
    issues: [
      {
        id: 'issue-1',
        title: '詳細分析が必要',
        description: 'OpenAI APIキーが設定されていないため、詳細な論点分析ができません。',
        perspective: 'システム',
      },
    ],
    options: [
      {
        id: 'option-1',
        title: 'OpenAI APIキーを設定する',
        description: '環境変数 OPENAI_API_KEY を設定することで、AIによる詳細分析が可能になります。',
        pros: ['詳細な分析が可能になる', '論点・選択肢の自動抽出'],
        cons: ['API利用料金が発生する'],
        riskLevel: 'low',
      },
    ],
    judgmentSimilarity: similarity,
    escalationDraft: {
      subject: `相談事項: ${session.request.category || '一般'}`,
      body: session.request.content,
      keyPoints: ['詳細分析には設定が必要です'],
      suggestedAction: 'OpenAI APIキーの設定をご検討ください。',
    },
    disclaimer:
      'この分析は参考情報であり、最終判断は吉田が行います。AIは決断・承認・指示を行いません。',
    analyzedAt: new Date(),
    modelUsed: 'dummy',
  };
}

// ======== 吉田判断ログ検索 ========

/**
 * 類似の吉田判断ログを検索
 */
async function searchSimilarJudgmentLogs(
  query: string,
  tenantId: string,
  branchId?: string
): Promise<YoshidaJudgmentLog[]> {
  console.log('[ExecutiveAI] 判断ログ検索', { tenantId, branchId });

  try {
    let queryRef = getAdminDb()
      .collection(JUDGMENT_LOGS_COLLECTION)
      .where('tenantId', '==', tenantId)
      .orderBy('decidedAt', 'desc')
      .limit(20);

    // 拠点フィルタ（自分の拠点のみ）
    if (branchId) {
      queryRef = getAdminDb()
        .collection(JUDGMENT_LOGS_COLLECTION)
        .where('tenantId', '==', tenantId)
        .where('relatedBranchId', '==', branchId)
        .orderBy('decidedAt', 'desc')
        .limit(20);
    }

    const snapshot = await queryRef.get();

    if (snapshot.empty) {
      return [];
    }

    const logs: YoshidaJudgmentLog[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        tenantId: data.tenantId,
        title: data.title,
        category: data.category,
        situation: data.situation,
        decision: data.decision,
        reasoning: data.reasoning,
        outcome: data.outcome,
        relatedBranchId: data.relatedBranchId,
        relatedDocumentIds: data.relatedDocumentIds || [],
        keywords: data.keywords || [],
        decidedAt: data.decidedAt?.toDate() || new Date(),
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
      };
    });

    // 簡易的なキーワードマッチングでフィルタリング
    const queryWords = query.toLowerCase().split(/\s+/);
    const scored = logs.map((log) => {
      const text = `${log.title} ${log.situation} ${log.keywords.join(' ')}`.toLowerCase();
      const score = queryWords.filter((word) => text.includes(word)).length;
      return { log, score };
    });

    scored.sort((a, b) => b.score - a.score);

    return scored.filter((s) => s.score > 0).map((s) => s.log);
  } catch (error) {
    console.error('[ExecutiveAI] 判断ログ検索エラー', error);
    return [];
  }
}

/**
 * 判断ログを取得（読み取り専用）
 */
export async function getJudgmentLogs(
  tenantId: string,
  options: {
    branchId?: string;
    category?: ConsultationCategory;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ logs: YoshidaJudgmentLog[]; total: number }> {
  const { branchId, category, limit = 20, offset = 0 } = options;

  console.log('[ExecutiveAI] 判断ログ一覧取得', { tenantId, branchId, category });

  try {
    let queryRef: FirebaseFirestore.Query = getAdminDb()
      .collection(JUDGMENT_LOGS_COLLECTION)
      .where('tenantId', '==', tenantId);

    if (branchId) {
      queryRef = queryRef.where('relatedBranchId', '==', branchId);
    }

    if (category) {
      queryRef = queryRef.where('category', '==', category);
    }

    queryRef = queryRef.orderBy('decidedAt', 'desc');

    // 総数取得
    const countSnapshot = await queryRef.count().get();
    const total = countSnapshot.data().count;

    // ページング
    const snapshot = await queryRef.offset(offset).limit(limit).get();

    const logs: YoshidaJudgmentLog[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        tenantId: data.tenantId,
        title: data.title,
        category: data.category,
        situation: data.situation,
        decision: data.decision,
        reasoning: data.reasoning,
        outcome: data.outcome,
        relatedBranchId: data.relatedBranchId,
        relatedDocumentIds: data.relatedDocumentIds || [],
        keywords: data.keywords || [],
        decidedAt: data.decidedAt?.toDate() || new Date(),
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
      };
    });

    return { logs, total };
  } catch (error) {
    console.error('[ExecutiveAI] 判断ログ一覧取得エラー', error);
    return { logs: [], total: 0 };
  }
}

// ======== ifシミュレーション ========

/**
 * ifシミュレーションを実行
 */
export async function runIfSimulation(
  sessionId: string,
  scenario: string,
  assumptions: string[] = []
): Promise<IfSimulation> {
  console.log('[ExecutiveAI] ifシミュレーション実行', { sessionId, scenario });

  const now = new Date();

  // セッション取得
  const sessionDoc = await getAdminDb().collection(SESSIONS_COLLECTION).doc(sessionId).get();

  if (!sessionDoc.exists) {
    throw new Error('セッションが見つかりません');
  }

  const session = sessionDoc.data() as ConsultationSession;

  // シミュレーション実行（OpenAI API）
  const analysis = await callOpenAIForSimulation(session, scenario, assumptions);

  // 保存
  const simRef = getAdminDb().collection(SIMULATIONS_COLLECTION).doc();
  const simulation: IfSimulation = {
    id: simRef.id,
    sessionId,
    scenario,
    assumptions,
    analysis,
    createdAt: now,
  };

  await simRef.set(simulation);

  console.log('[ExecutiveAI] ifシミュレーション完了', { simulationId: simulation.id });

  return simulation;
}

/**
 * OpenAI APIでシミュレーション実行
 */
async function callOpenAIForSimulation(
  session: ConsultationSession,
  scenario: string,
  assumptions: string[]
): Promise<IfSimulation['analysis']> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return {
      possibleOutcomes: [
        {
          outcome: 'シミュレーション結果を取得するにはOpenAI APIキーが必要です',
          probability: 'medium',
          impact: '不明',
        },
      ],
      risks: ['API設定が必要'],
      considerations: ['OPENAI_API_KEYを設定してください'],
    };
  }

  const prompt = `以下のシナリオについて分析してください。

## 元の相談内容
${session.request.content}

## シミュレーションシナリオ
「もし ${scenario}」

## 前提条件
${assumptions.length > 0 ? assumptions.map((a) => `- ${a}`).join('\n') : '特になし'}

## 出力形式（JSON）
{
  "possibleOutcomes": [
    { "outcome": "結果の説明", "probability": "low|medium|high", "impact": "影響の説明" }
  ],
  "risks": ["リスク1", "リスク2"],
  "considerations": ["考慮事項1", "考慮事項2"]
}

注意: 断定表現は避け、「〜の可能性があります」「〜と考えられます」などを使用してください。`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content || '{}');

    return {
      possibleOutcomes: parsed.possibleOutcomes || [],
      risks: parsed.risks || [],
      considerations: parsed.considerations || [],
    };
  } catch (error) {
    console.error('[ExecutiveAI] シミュレーションAPIエラー', error);
    return {
      possibleOutcomes: [
        {
          outcome: 'API呼び出しエラーが発生しました',
          probability: 'medium',
          impact: '分析不可',
        },
      ],
      risks: ['API接続エラー'],
      considerations: ['再度お試しください'],
    };
  }
}

// ======== エスカレーション ========

/**
 * エスカレーションを送信
 */
export async function sendEscalation(
  sessionId: string,
  options: {
    subject?: string;
    body?: string;
    priority?: UrgencyLevel;
  } = {}
): Promise<YoshidaNotification> {
  console.log('[ExecutiveAI] エスカレーション送信', { sessionId });

  // セッション取得
  const sessionDoc = await getAdminDb().collection(SESSIONS_COLLECTION).doc(sessionId).get();

  if (!sessionDoc.exists) {
    throw new Error('セッションが見つかりません');
  }

  const session = sessionDoc.data() as ConsultationSession;

  if (!session.analysis) {
    throw new Error('AI分析が完了していません');
  }

  const now = new Date();

  // 通知作成
  const notifRef = getAdminDb().collection(NOTIFICATIONS_COLLECTION).doc();
  const notification: YoshidaNotification = {
    id: notifRef.id,
    tenantId: session.tenantId,
    sessionId,
    fromUserId: session.consultantId,
    fromUserName: session.consultantName,
    fromBranchId: session.branchId,
    type: 'escalation',
    priority: options.priority || session.request.urgency || 'medium',
    subject: options.subject || session.analysis.escalationDraft.subject,
    summary: options.body || session.analysis.escalationDraft.body,
    keyPoints: session.analysis.escalationDraft.keyPoints,
    status: 'unread',
    createdAt: now,
  };

  await notifRef.set(notification);

  // セッション更新
  await getAdminDb().collection(SESSIONS_COLLECTION).doc(sessionId).update({
    'escalation.status': 'sent',
    'escalation.sentAt': now,
    'escalation.sentTo': 'yoshida',
    status: 'escalated',
    updatedAt: now,
  });

  console.log('[ExecutiveAI] エスカレーション送信完了', {
    notificationId: notification.id,
    priority: notification.priority,
  });

  return notification;
}

// ======== 吉田通知一覧 ========

/**
 * 吉田向け通知一覧を取得
 */
export async function getYoshidaNotifications(
  tenantId: string,
  options: {
    status?: 'unread' | 'read' | 'acknowledged' | 'resolved';
    limit?: number;
  } = {}
): Promise<YoshidaNotification[]> {
  const { status, limit = 20 } = options;

  console.log('[ExecutiveAI] 吉田通知一覧取得', { tenantId, status });

  try {
    let queryRef: FirebaseFirestore.Query = getAdminDb()
      .collection(NOTIFICATIONS_COLLECTION)
      .where('tenantId', '==', tenantId);

    if (status) {
      queryRef = queryRef.where('status', '==', status);
    }

    queryRef = queryRef.orderBy('createdAt', 'desc').limit(limit);

    const snapshot = await queryRef.get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        tenantId: data.tenantId,
        sessionId: data.sessionId,
        fromUserId: data.fromUserId,
        fromUserName: data.fromUserName,
        fromBranchId: data.fromBranchId,
        type: data.type,
        priority: data.priority,
        subject: data.subject,
        summary: data.summary,
        keyPoints: data.keyPoints || [],
        status: data.status,
        readAt: data.readAt?.toDate(),
        acknowledgedAt: data.acknowledgedAt?.toDate(),
        resolvedAt: data.resolvedAt?.toDate(),
        response: data.response,
        createdAt: data.createdAt?.toDate() || new Date(),
      };
    });
  } catch (error) {
    console.error('[ExecutiveAI] 吉田通知一覧取得エラー', error);
    return [];
  }
}

/**
 * 吉田が通知を確認
 */
export async function acknowledgeNotification(
  notificationId: string,
  response?: string
): Promise<void> {
  const now = new Date();

  await getAdminDb().collection(NOTIFICATIONS_COLLECTION).doc(notificationId).update({
    status: 'acknowledged',
    acknowledgedAt: now,
    response,
  });

  // 関連セッションも更新
  const notifDoc = await getAdminDb()
    .collection(NOTIFICATIONS_COLLECTION)
    .doc(notificationId)
    .get();

  if (notifDoc.exists) {
    const { sessionId } = notifDoc.data() as YoshidaNotification;
    await getAdminDb().collection(SESSIONS_COLLECTION).doc(sessionId).update({
      'escalation.status': 'acknowledged',
      'escalation.acknowledgedAt': now,
      updatedAt: now,
    });
  }

  console.log('[ExecutiveAI] 通知確認完了', { notificationId });
}

// ======== 相談セッション取得 ========

/**
 * 相談セッション一覧を取得
 */
export async function getConsultationSessions(
  tenantId: string,
  options: {
    consultantId?: string;
    branchId?: string;
    status?: ConsultationSession['status'];
    limit?: number;
  } = {}
): Promise<ConsultationSession[]> {
  const { consultantId, branchId, status, limit = 20 } = options;

  console.log('[ExecutiveAI] 相談セッション一覧取得', {
    tenantId,
    consultantId,
    branchId,
  });

  try {
    let queryRef: FirebaseFirestore.Query = getAdminDb()
      .collection(SESSIONS_COLLECTION)
      .where('tenantId', '==', tenantId);

    if (consultantId) {
      queryRef = queryRef.where('consultantId', '==', consultantId);
    }

    if (branchId) {
      queryRef = queryRef.where('branchId', '==', branchId);
    }

    if (status) {
      queryRef = queryRef.where('status', '==', status);
    }

    queryRef = queryRef.orderBy('createdAt', 'desc').limit(limit);

    const snapshot = await queryRef.get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        tenantId: data.tenantId,
        consultantId: data.consultantId,
        consultantName: data.consultantName,
        consultantRole: data.consultantRole,
        branchId: data.branchId,
        request: data.request,
        analysis: data.analysis
          ? {
              ...data.analysis,
              analyzedAt: data.analysis.analyzedAt?.toDate() || new Date(),
            }
          : undefined,
        escalation: {
          status: data.escalation?.status || 'none',
          sentAt: data.escalation?.sentAt?.toDate(),
          sentTo: data.escalation?.sentTo,
          acknowledgedAt: data.escalation?.acknowledgedAt?.toDate(),
          resolvedAt: data.escalation?.resolvedAt?.toDate(),
          resolution: data.escalation?.resolution,
        },
        status: data.status,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
      };
    });
  } catch (error) {
    console.error('[ExecutiveAI] 相談セッション一覧取得エラー', error);
    return [];
  }
}

/**
 * 相談セッションを取得
 */
export async function getConsultationSession(
  sessionId: string
): Promise<ConsultationSession | null> {
  try {
    const doc = await getAdminDb().collection(SESSIONS_COLLECTION).doc(sessionId).get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data()!;
    return {
      id: doc.id,
      tenantId: data.tenantId,
      consultantId: data.consultantId,
      consultantName: data.consultantName,
      consultantRole: data.consultantRole,
      branchId: data.branchId,
      request: data.request,
      analysis: data.analysis
        ? {
            ...data.analysis,
            analyzedAt: data.analysis.analyzedAt?.toDate() || new Date(),
          }
        : undefined,
      escalation: {
        status: data.escalation?.status || 'none',
        sentAt: data.escalation?.sentAt?.toDate(),
        sentTo: data.escalation?.sentTo,
        acknowledgedAt: data.escalation?.acknowledgedAt?.toDate(),
        resolvedAt: data.escalation?.resolvedAt?.toDate(),
        resolution: data.escalation?.resolution,
      },
      status: data.status,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date(),
    };
  } catch (error) {
    console.error('[ExecutiveAI] 相談セッション取得エラー', error);
    return null;
  }
}

// ======== アクセス制御 ========

/**
 * 幹部AIへのアクセス権限をチェック
 */
export function canAccessExecutiveAI(role: string): boolean {
  return role === 'manager' || role === 'executive';
}

/**
 * 判断ログへのアクセス権限をチェック（自拠点のみ）
 */
export function canAccessJudgmentLog(
  log: YoshidaJudgmentLog,
  userBranchId?: string
): boolean {
  // 拠点が指定されていないログは全員がアクセス可能
  if (!log.relatedBranchId) {
    return true;
  }

  // 自拠点のログのみアクセス可能
  return log.relatedBranchId === userBranchId;
}
