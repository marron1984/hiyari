// ======== ふくしゃに聞く（判断相談・AI一次整理）ライブラリ ========
//
// 【AA.OS.HUB ブランド思想】
// 判断は、ひとりで背負わない。責任は、最後まで引き受ける。
// AAは、判断と責任のOSである。
//
// この機能は「質問→整理→人の判断→組織に残る」流れを実現する。
// 判断を個人に背負わせないための"仕組み（OS）"の一部である。

import { getAdminDb } from './firebase-admin';
import type {
  FukushaQuestion,
  FukushaQuestionStatus,
  FukushaQuestionCategory,
  FukushaAIProcessResult,
  FukushaQuestionFilter,
  FukushaQuestionStats,
  CreateFukushaQuestionInput,
  SendFukushaReplyInput,
  DecisionLog,
  CreateDecisionLogInput,
  DecisionLogFilter,
} from '@/types/fukusha-ask';

const COLLECTION = 'fukusha_questions';
const DECISION_LOG_COLLECTION = 'decision_logs';

// ======== 質問投稿 ========

/**
 * 質問を投稿
 */
export async function createQuestion(
  tenantId: string,
  userId: string,
  userName: string,
  userBaseId: string | undefined,
  userBaseName: string | undefined,
  input: CreateFukushaQuestionInput
): Promise<FukushaQuestion> {
  const db = getAdminDb();
  const now = new Date();

  const question: Omit<FukushaQuestion, 'id'> = {
    tenantId,
    userId,
    userName,
    userBaseId,
    userBaseName,
    isAnonymous: input.isAnonymous,
    category: input.category,
    title: input.title || '',
    content: input.content,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  const docRef = db.collection(COLLECTION).doc();
  await docRef.set(question);

  console.log('[FukushaAsk] 質問投稿', {
    id: docRef.id,
    category: input.category,
    isAnonymous: input.isAnonymous,
  });

  return { ...question, id: docRef.id };
}

// ======== AI処理 ========

/**
 * AI処理（要約・論点整理・返信下書き生成）
 */
export async function processQuestionWithAI(
  questionId: string
): Promise<FukushaAIProcessResult> {
  const db = getAdminDb();
  const docRef = db.collection(COLLECTION).doc(questionId);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new Error('質問が見つかりません');
  }

  const question = doc.data() as Omit<FukushaQuestion, 'id'>;

  // AI処理
  const result = await generateAIResponse(question);

  // 更新
  await docRef.update({
    status: 'processed',
    aiProcessedAt: new Date(),
    aiSummary: result.summary,
    aiKeyPoints: result.keyPoints,
    aiDraftReply: result.draftReply,
    aiSuggestedTone: result.suggestedTone,
    updatedAt: new Date(),
  });

  console.log('[FukushaAsk] AI処理完了', { questionId });

  return result;
}

/**
 * AIレスポンス生成
 */
async function generateAIResponse(
  question: Omit<FukushaQuestion, 'id'>
): Promise<FukushaAIProcessResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.warn('[FukushaAsk] OpenAI APIキーなし、ダミー応答を返す');
    return generateDummyResponse(question);
  }

  const systemPrompt = `あなたは「ふくしゃ（副社長）」として、スタッフからの質問に回答する下書きを作成するAIアシスタントです。

## 重要な原則

1. **温かみのある対応**: 質問者の気持ちに寄り添い、共感を示す
2. **具体的で実用的**: 抽象論ではなく、具体的なアドバイスを心がける
3. **会社の価値観に沿う**: 組織の一員として、前向きで建設的な回答を
4. **適度な距離感**: 親しみやすさと適切な敬意のバランス

## 出力形式（JSON）

{
  "summary": "質問の要約（1-2文）",
  "keyPoints": ["論点1", "論点2", "論点3"],
  "draftReply": "返信下書き（200-400字程度）",
  "suggestedTone": "推奨トーン（励まし/説明/共感/提案など）"
}

## 注意事項

- 質問者が匿名の場合、「ご質問いただきありがとうございます」など一般的な呼びかけを使う
- 具体的な人名や部署名への言及は避ける
- 最終決定は人間が行うことを前提とした下書きを作成`;

  const userPrompt = `## 質問情報

カテゴリ: ${question.category}
件名: ${question.title || '（なし）'}
匿名: ${question.isAnonymous ? 'はい' : 'いいえ'}
投稿者名: ${question.isAnonymous ? '匿名' : question.userName}
所属: ${question.userBaseName || '不明'}

## 質問本文

${question.content}

---

上記の質問に対して、要約・論点整理・返信下書きをJSON形式で生成してください。`;

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
        temperature: 0.7,
        max_tokens: 1500,
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
      summary: parsed.summary || '質問内容を確認してください',
      keyPoints: parsed.keyPoints || [],
      draftReply: parsed.draftReply || '',
      suggestedTone: parsed.suggestedTone || '共感',
    };
  } catch (error) {
    console.error('[FukushaAsk] AI処理エラー', error);
    return generateDummyResponse(question);
  }
}

/**
 * ダミーレスポンス生成
 */
function generateDummyResponse(
  question: Omit<FukushaQuestion, 'id'>
): FukushaAIProcessResult {
  return {
    summary: `${question.category}に関するご質問をいただきました。`,
    keyPoints: [
      '質問の背景を確認',
      '具体的な状況を把握',
      '適切なアドバイスを検討',
    ],
    draftReply: `ご質問いただきありがとうございます。

${question.content.slice(0, 50)}...について、お気持ちはよく分かります。

詳しい状況をお聞かせいただければ、より具体的なアドバイスができるかと思います。
いつでもご相談ください。`,
    suggestedTone: '共感',
  };
}

// ======== 返信送信 ========

/**
 * 返信を送信
 */
export async function sendReply(
  input: SendFukushaReplyInput,
  repliedBy: string,
  repliedByName: string
): Promise<void> {
  const db = getAdminDb();
  const docRef = db.collection(COLLECTION).doc(input.questionId);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new Error('質問が見つかりません');
  }

  await docRef.update({
    status: 'replied',
    repliedAt: new Date(),
    repliedBy,
    repliedByName,
    replyContent: input.replyContent,
    replyNote: input.replyNote || '',
    updatedAt: new Date(),
  });

  console.log('[FukushaAsk] 返信送信', {
    questionId: input.questionId,
    repliedBy,
  });

  // TODO: Step2で通知機能を追加
}

// ======== 取得 ========

/**
 * 質問一覧を取得
 */
export async function getQuestions(
  tenantId: string,
  filter: FukushaQuestionFilter = {}
): Promise<FukushaQuestion[]> {
  const db = getAdminDb();
  let query: FirebaseFirestore.Query = db
    .collection(COLLECTION)
    .where('tenantId', '==', tenantId);

  if (filter.status) {
    query = query.where('status', '==', filter.status);
  }

  if (filter.category) {
    query = query.where('category', '==', filter.category);
  }

  if (filter.isAnonymous !== undefined) {
    query = query.where('isAnonymous', '==', filter.isAnonymous);
  }

  query = query.orderBy('createdAt', 'desc');

  if (filter.limit) {
    query = query.limit(filter.limit);
  }

  const snapshot = await query.get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      ...data,
      id: doc.id,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date(),
      aiProcessedAt: data.aiProcessedAt?.toDate(),
      repliedAt: data.repliedAt?.toDate(),
    } as FukushaQuestion;
  });
}

/**
 * 質問詳細を取得
 */
export async function getQuestion(
  questionId: string
): Promise<FukushaQuestion | null> {
  const db = getAdminDb();
  const doc = await db.collection(COLLECTION).doc(questionId).get();

  if (!doc.exists) return null;

  const data = doc.data()!;
  return {
    ...data,
    id: doc.id,
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
    aiProcessedAt: data.aiProcessedAt?.toDate(),
    repliedAt: data.repliedAt?.toDate(),
  } as FukushaQuestion;
}

/**
 * 自分の質問一覧を取得
 */
export async function getMyQuestions(
  tenantId: string,
  userId: string,
  limit = 20
): Promise<FukushaQuestion[]> {
  const db = getAdminDb();
  const snapshot = await db
    .collection(COLLECTION)
    .where('tenantId', '==', tenantId)
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      ...data,
      id: doc.id,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date(),
      aiProcessedAt: data.aiProcessedAt?.toDate(),
      repliedAt: data.repliedAt?.toDate(),
    } as FukushaQuestion;
  });
}

/**
 * 統計を取得
 */
export async function getQuestionStats(
  tenantId: string
): Promise<FukushaQuestionStats> {
  const db = getAdminDb();
  const snapshot = await db
    .collection(COLLECTION)
    .where('tenantId', '==', tenantId)
    .get();

  const questions = snapshot.docs.map((doc) => doc.data() as Omit<FukushaQuestion, 'id'>);

  const stats: FukushaQuestionStats = {
    total: questions.length,
    pending: questions.filter((q) => q.status === 'pending').length,
    processed: questions.filter((q) => q.status === 'processed').length,
    replied: questions.filter((q) => q.status === 'replied').length,
    avgResponseTimeHours: 0,
  };

  // 平均返信時間を計算
  const repliedQuestions = questions.filter(
    (q) => q.status === 'replied' && q.repliedAt && q.createdAt
  );

  if (repliedQuestions.length > 0) {
    const totalHours = repliedQuestions.reduce((sum, q) => {
      const created = q.createdAt instanceof Date ? q.createdAt : (q.createdAt as any)?.toDate();
      const replied = q.repliedAt instanceof Date ? q.repliedAt : (q.repliedAt as any)?.toDate();
      if (created && replied) {
        return sum + (replied.getTime() - created.getTime()) / (1000 * 60 * 60);
      }
      return sum;
    }, 0);
    stats.avgResponseTimeHours = Math.round(totalHours / repliedQuestions.length);
  }

  return stats;
}

/**
 * 質問をアーカイブ
 */
export async function archiveQuestion(questionId: string): Promise<void> {
  const db = getAdminDb();
  await db.collection(COLLECTION).doc(questionId).update({
    status: 'archived',
    updatedAt: new Date(),
  });
}

// ======== 判断ログ ========
//
// 判断ログは「正解の記録」ではない。
// 判断がどのように行われたかを残し、次の判断を楽にするためのOS資産である。
// 現場に判断を背負わせない。管理職に孤独を背負わせない。失敗を人のせいにしない。

/**
 * 判断ログを作成
 *
 * 質問→AI整理→人の判断という流れを組織の資産として記録する
 */
export async function createDecisionLog(
  tenantId: string,
  decisionMakerUserId: string,
  decisionMakerName: string,
  input: CreateDecisionLogInput
): Promise<DecisionLog> {
  const db = getAdminDb();
  const now = new Date();

  const log: Omit<DecisionLog, 'id'> = {
    tenantId,
    sourceQuestionId: input.sourceQuestionId,
    sourceType: 'fukusha_ask',
    questionContent: input.questionContent,
    questionCategory: input.questionCategory,
    questionCreatedAt: input.questionCreatedAt,
    aiSummary: input.aiSummary,
    aiKeyPoints: input.aiKeyPoints,
    decisionContent: input.decisionContent,
    decisionMakerUserId,
    decisionMakerName,
    decisionNote: input.decisionNote,
    createdAt: now,
    updatedAt: now,
  };

  const docRef = db.collection(DECISION_LOG_COLLECTION).doc();
  await docRef.set(log);

  console.log('[DecisionLog] 判断ログ作成', {
    id: docRef.id,
    sourceQuestionId: input.sourceQuestionId,
    category: input.questionCategory,
    decisionMaker: decisionMakerName,
  });

  return { ...log, id: docRef.id };
}

/**
 * 質問から判断ログを作成
 *
 * 返信時に呼び出され、質問とAI整理結果と最終判断をまとめて保存
 */
export async function createDecisionLogFromQuestion(
  question: FukushaQuestion,
  replyContent: string,
  replyNote: string | undefined,
  decisionMakerUserId: string,
  decisionMakerName: string
): Promise<DecisionLog> {
  return createDecisionLog(
    question.tenantId,
    decisionMakerUserId,
    decisionMakerName,
    {
      sourceQuestionId: question.id,
      questionContent: question.content,
      questionCategory: question.category,
      questionCreatedAt: question.createdAt,
      aiSummary: question.aiSummary || '',
      aiKeyPoints: question.aiKeyPoints || [],
      decisionContent: replyContent,
      decisionNote: replyNote,
    }
  );
}

/**
 * 判断ログ一覧を取得
 */
export async function getDecisionLogs(
  tenantId: string,
  filter: DecisionLogFilter = {}
): Promise<DecisionLog[]> {
  const db = getAdminDb();
  let query: FirebaseFirestore.Query = db
    .collection(DECISION_LOG_COLLECTION)
    .where('tenantId', '==', tenantId);

  if (filter.category) {
    query = query.where('questionCategory', '==', filter.category);
  }

  if (filter.decisionMakerUserId) {
    query = query.where('decisionMakerUserId', '==', filter.decisionMakerUserId);
  }

  query = query.orderBy('createdAt', 'desc');

  if (filter.limit) {
    query = query.limit(filter.limit);
  }

  const snapshot = await query.get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      ...data,
      id: doc.id,
      questionCreatedAt: data.questionCreatedAt?.toDate() || new Date(),
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date(),
    } as DecisionLog;
  });
}

/**
 * 判断ログ詳細を取得
 */
export async function getDecisionLog(
  logId: string
): Promise<DecisionLog | null> {
  const db = getAdminDb();
  const doc = await db.collection(DECISION_LOG_COLLECTION).doc(logId).get();

  if (!doc.exists) return null;

  const data = doc.data()!;
  return {
    ...data,
    id: doc.id,
    questionCreatedAt: data.questionCreatedAt?.toDate() || new Date(),
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
  } as DecisionLog;
}
