// ======== ふくしゃに聞く（判断相談・AI一次整理）ライブラリ ========
//
// 【AA.OS.HUB ブランド思想】
// 判断は、ひとりで背負わない。責任は、最後まで引き受ける。
// AAは、判断と責任のOSである。
//
// この機能は「質問→整理→人の判断→組織に残る」流れを実現する。
// 判断を個人に背負わせないための"仕組み（OS）"の一部である。

import { getAdminDb } from './firebase-admin';
import Anthropic from '@anthropic-ai/sdk';
import { AI_VP_SYSTEM_PROMPT } from './ai-vp-persona';
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
  DecisionCategory,
  CreateDecisionLogFromAskInput,
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
    ...(userBaseId != null && { userBaseId }),
    ...(userBaseName != null && { userBaseName }),
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
 * AIレスポンス生成（Claude + 吉田ペルソナ）
 */
async function generateAIResponse(
  question: Omit<FukushaQuestion, 'id'>
): Promise<FukushaAIProcessResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.warn('[FukushaAsk] ANTHROPIC_API_KEY なし、ダミー応答を返す');
    return generateDummyResponse(question);
  }

  const userPrompt = `スタッフからの質問を整理し、返信下書きを作成してください。

## 質問情報

カテゴリ: ${question.category}
件名: ${question.title || '（なし）'}
匿名: ${question.isAnonymous ? 'はい' : 'いいえ'}
投稿者名: ${question.isAnonymous ? '匿名' : question.userName}
所属: ${question.userBaseName || '不明'}

## 質問本文

${question.content}

## あなたの行動

1. 質問の要約（事実ベースで1-2文）
2. 論点の整理（確認すべき事実を3つ以内で列挙）
3. 返信下書きの作成（吉田のスタイルで200-400字程度）

## 下書きのルール
- 「まず事実を確認する」姿勢を反映
- 「〜すべき」「〜してください」は使わない
- 「〜の状況を教えてほしい」「〜を確認してみる」を使う
- 質問者を頭ごなしに否定しない
- 具体的な人名・部署名への言及は避ける
- 匿名の場合は一般的な呼びかけを使う
- 不可逆な判断（人事・懲戒等）は「確認して改めて連絡する」

以下のJSON形式で出力してください:
{
  "summary": "質問の要約（1-2文）",
  "keyPoints": ["論点1", "論点2", "論点3"],
  "draftReply": "返信下書き",
  "suggestedTone": "事実確認/選択肢提示/共感確認 のいずれか"
}`;

  try {
    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: AI_VP_SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userPrompt },
      ],
    });

    const rawContent = message.content[0].type === 'text' ? message.content[0].text : '';

    // コードブロック対応のJSONパース
    const codeBlockMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = codeBlockMatch ? codeBlockMatch[1] : rawContent;
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        summary: parsed.summary || '質問内容を確認してください',
        keyPoints: parsed.keyPoints || [],
        draftReply: parsed.draftReply || '',
        suggestedTone: parsed.suggestedTone || '事実確認',
      };
    }

    // JSONパース失敗時はそのまま返す
    return {
      summary: '質問内容を確認してください',
      keyPoints: [],
      draftReply: rawContent,
      suggestedTone: '事実確認',
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
// decision_logs は評価・査定のためのテーブルではない。
// 判断がどのように行われたかを記録し、
// 次の判断を楽にするためのAA.OS.HUBのOS資産である。
//
// 現場に判断を背負わせない。管理職に孤独を背負わせない。失敗を人のせいにしない。

/**
 * 質問カテゴリを判断カテゴリにマッピング
 */
function mapQuestionCategoryToDecisionCategory(
  questionCategory: FukushaQuestionCategory
): DecisionCategory {
  const mapping: Record<FukushaQuestionCategory, DecisionCategory> = {
    work: 'operation',
    career: 'human',
    workplace: 'operation',
    suggestion: 'other',
    other: 'other',
  };
  return mapping[questionCategory] || 'other';
}

/**
 * 質問から判断ログを作成
 *
 * 返信時に呼び出され、質問とAI整理結果と最終判断をまとめて保存
 * 評価・査定のためではなく、判断を属人化させないためのOS資産
 */
export async function createDecisionLogFromQuestion(
  question: FukushaQuestion,
  replyContent: string,
  replyNote: string | undefined,
  decidedByUserId: string,
  decidedByRole: string
): Promise<DecisionLog> {
  const db = getAdminDb();
  const now = new Date();

  // 質問内容とAI要約を「何が起きたか」としてまとめる
  const situation = [
    `【質問内容】`,
    question.content,
    '',
    question.aiSummary ? `【AI要約】${question.aiSummary}` : '',
    question.aiKeyPoints?.length
      ? `【論点】\n${question.aiKeyPoints.map((p) => `・${p}`).join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const log: Omit<DecisionLog, 'id'> = {
    tenantId: question.tenantId,

    // 判断主体（個人名を前に出さず「役割」を残す思想）
    decidedByUserId,
    decidedByRole,

    // 判断カテゴリ
    category: mapQuestionCategoryToDecisionCategory(question.category),

    // 判断の中身（OSの心臓）
    situation,                    // 何が起きたか（事実）
    decision: replyContent,       // 何を決めたか
    reason: replyNote || '',      // なぜそう判断したか

    // 参照情報
    referenceSource: question.aiSummary ? 'ai_summary' : 'none',

    // 元質問との紐付け
    sourceType: 'fukusha_ask',
    sourceId: question.id,

    // 承認・責任の扱い
    approvalStatus: 'none',

    // 共有範囲（デフォルトは管理者）
    visibility: 'managers',

    // タイムスタンプ
    createdAt: now,
    updatedAt: now,
  };

  const docRef = db.collection(DECISION_LOG_COLLECTION).doc();
  await docRef.set(log);

  console.log('[DecisionLog] 判断ログ作成', {
    id: docRef.id,
    sourceId: question.id,
    category: log.category,
    decidedByRole,
  });

  return { ...log, id: docRef.id };
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
    query = query.where('category', '==', filter.category);
  }

  if (filter.decidedByUserId) {
    query = query.where('decidedByUserId', '==', filter.decidedByUserId);
  }

  if (filter.sourceType) {
    query = query.where('sourceType', '==', filter.sourceType);
  }

  if (filter.visibility) {
    query = query.where('visibility', '==', filter.visibility);
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
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
  } as DecisionLog;
}
