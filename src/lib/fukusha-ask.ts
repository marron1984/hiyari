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
import { buildFeaturePrompt } from './ai-vp-persona';
import { createNotificationServer } from './notifications-server';
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
 * 過去の返信済み質問を取得（AI回答生成の参考コンテキスト用）
 * 同カテゴリ優先で、最大5件の過去やりとりを返す
 */
async function fetchPastRepliedQuestions(
  tenantId: string,
  category: FukushaQuestionCategory,
  limit = 5
): Promise<Array<{ category: string; content: string; reply: string }>> {
  try {
    const db = getAdminDb();

    // 同カテゴリの返信済み質問を優先取得
    const sameCategory = await db
      .collection(COLLECTION)
      .where('tenantId', '==', tenantId)
      .where('status', '==', 'replied')
      .where('category', '==', category)
      .orderBy('repliedAt', 'desc')
      .limit(limit)
      .get();

    const results = sameCategory.docs.map((doc) => {
      const d = doc.data();
      return {
        category: d.category,
        content: (d.content || '').slice(0, 500),
        reply: (d.replyContent || '').slice(0, 800),
      };
    });

    // 足りない場合は他カテゴリからも取得
    if (results.length < limit) {
      const remaining = limit - results.length;
      const otherCategory = await db
        .collection(COLLECTION)
        .where('tenantId', '==', tenantId)
        .where('status', '==', 'replied')
        .orderBy('repliedAt', 'desc')
        .limit(remaining + results.length)
        .get();

      const existingIds = new Set(sameCategory.docs.map((d) => d.id));
      otherCategory.docs.forEach((doc) => {
        if (!existingIds.has(doc.id) && results.length < limit) {
          const d = doc.data();
          results.push({
            category: d.category,
            content: (d.content || '').slice(0, 500),
            reply: (d.replyContent || '').slice(0, 800),
          });
        }
      });
    }

    return results;
  } catch (error) {
    console.warn('[FukushaAsk] 過去質問の取得失敗（無視して続行）:', error);
    return [];
  }
}

/**
 * 過去の判断ログを取得（AI回答生成の参考コンテキスト用）
 */
async function fetchPastDecisionLogs(
  tenantId: string,
  category: DecisionCategory,
  limit = 10
): Promise<Array<{ situation: string; decision: string; reason: string }>> {
  try {
    const db = getAdminDb();

    const snapshot = await db
      .collection(DECISION_LOG_COLLECTION)
      .where('tenantId', '==', tenantId)
      .where('category', '==', category)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => {
      const d = doc.data();
      return {
        situation: (d.situation || '').slice(0, 500),
        decision: (d.decision || '').slice(0, 500),
        reason: d.reason || '',
      };
    });
  } catch (error) {
    console.warn('[FukushaAsk] 判断ログの取得失敗（無視して続行）:', error);
    return [];
  }
}

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

  // 過去の返信済み質問と判断ログを並行取得（回答品質向上のためのコンテキスト）
  const decisionCategory = mapQuestionCategoryToDecisionCategory(question.category);
  const [pastQuestions, pastDecisions] = await Promise.all([
    fetchPastRepliedQuestions(question.tenantId, question.category),
    fetchPastDecisionLogs(question.tenantId, decisionCategory),
  ]);

  // AI処理
  const result = await generateAIResponse(question, pastQuestions, pastDecisions);

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

  console.log('[FukushaAsk] AI処理完了', { questionId, pastQuestionsCount: pastQuestions.length, pastDecisionsCount: pastDecisions.length });

  return result;
}

/**
 * AIレスポンス生成（Claude + 吉田ペルソナ + 過去コンテキスト）
 */
async function generateAIResponse(
  question: Omit<FukushaQuestion, 'id'>,
  pastQuestions: Array<{ category: string; content: string; reply: string }> = [],
  pastDecisions: Array<{ situation: string; decision: string; reason: string }> = []
): Promise<FukushaAIProcessResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.warn('[FukushaAsk] ANTHROPIC_API_KEY なし、ダミー応答を返す');
    return generateDummyResponse(question);
  }

  // 過去の返信例をコンテキストとして組み立て
  let pastContext = '';

  if (pastQuestions.length > 0) {
    const pastQA = pastQuestions
      .map((pq, idx) => `【過去の質問${idx + 1}】\n質問: ${pq.content}\n吉田の返信: ${pq.reply}`)
      .join('\n\n');
    pastContext += `\n\n## 吉田の過去の返信例（同じスタイル・トーンを参考にすること）\n\n${pastQA}`;
  }

  if (pastDecisions.length > 0) {
    const pastDec = pastDecisions
      .map((pd, idx) => `【判断ログ${idx + 1}】\n状況: ${pd.situation}\n判断: ${pd.decision}${pd.reason ? `\n理由: ${pd.reason}` : ''}`)
      .join('\n\n');
    pastContext += `\n\n## 吉田の過去の判断記録（判断の方向性の参考にすること）\n\n${pastDec}`;
  }

  // 会社ナレッジベースを注入
  const companyKnowledge = getCompanyKnowledge();

  const userPrompt = `スタッフからの質問を整理し、返信下書きを作成してください。

## 質問情報

カテゴリ: ${question.category}
件名: ${question.title || '（なし）'}
匿名: ${question.isAnonymous ? 'はい' : 'いいえ'}
投稿者名: ${question.isAnonymous ? '匿名' : question.userName}
所属: ${question.userBaseName || '不明'}

## 質問本文

${question.content}
${pastContext}
${companyKnowledge}

## あなたの思考プロセス（Step by Step）

### Step 1: 質問の本質を理解する
- スタッフは実際に何を知りたい/解決したいのか？
- 表面的な質問の裏にある本当の懸念は何か？

### Step 2: 過去のコンテキストを確認する
- 過去に同様の質問はあったか？その時はどう返信したか？
- 過去の判断ログに類似する判断はあるか？
- 会社のルール・方針に該当するものはあるか？

### Step 3: 回答を構成する
- 事実確認の姿勢で冒頭を書く
- 確認すべき論点を整理する
- 過去の一貫性を保った下書きを作成する

## 出力内容

1. 質問の要約（事実ベースで1-2文）
2. 論点の整理（確認すべき事実を3つ以内で列挙）
3. 返信下書きの作成（吉田のスタイルで200-400字程度）
   - 過去の返信例がある場合は、そのトーンや判断の方向性を必ず参考にする
   - 会社のルール・方針に該当する場合は、それに基づいて回答する
   - 過去に類似の判断があれば、一貫性のある回答を心がける

## 下書きのルール
- 「まず事実を確認する」姿勢を反映
- 「〜すべき」「〜してください」は使わない
- 「〜の状況を教えてほしい」「〜を確認してみる」を使う
- 質問者を頭ごなしに否定しない
- 具体的な人名・部署名への言及は避ける
- 匿名の場合は一般的な呼びかけを使う
- 不可逆な判断（人事・懲戒等）は「確認して改めて連絡する」
- 具体的な数字（日数、金額、時間）がある場合は必ず言及する

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
      max_tokens: 2000,
      temperature: 0.3,
      system: buildFeaturePrompt('fukusha_ask'),
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
 * 会社のナレッジベース（ルール・方針）をプロンプトに注入
 *
 * 管理画面から登録された会社ルール・方針を取得して返す。
 * Firestoreの company_knowledge コレクションにデータがあれば使用し、
 * なければ基本ルールのみ返す。
 */
function getCompanyKnowledge(): string {
  // 飛鳥グループの事業情報と基本方針
  // TODO: 将来的にはFirestore company_knowledge コレクションから動的取得
  const companyProfile = [
    '飛鳥グループ（AA）は介護施設運営を主軸とする大阪の事業グループ',
    '訪問介護・看護事業: 西淀川20室、東淀川14室予定、老人ホーム71床予定',
    '1戸マスターリース70,000円、平均介護報酬月20万円',
    '高級ホスピタリティ事業（大嵓埜・禅園・鹿のや）も展開',
    'AA-HUB（本システム）で業務DX・AI統合経営を推進中',
  ];

  const operationalRules = [
    '入居者の安全と尊厳が最優先。これは全ての判断に優先する',
    '給与支払いは最優先で守るライン。遅延は絶対に許容しない',
    '現場の判断を尊重し、管理職は現場を支援する立場である',
    '重大な事案（事故・虐待疑い・感染症等）は即座にエスカレーションする',
    '人事に関する最終判断は吉田本人が行う。AIは判断を代行しない',
    '経費は事前申請が原則。緊急時は事後報告可だが理由が必要',
    '残業は月45時間以内を目標とし、超過する場合は業務改善を検討する',
    'スタッフの相談には必ず24時間以内に一次回答する',
    '不透明な資金管理は許容しない。キャッシュフローは常に可視化する',
    '80%で走り出し、運用しながら改善する。完璧を待たない',
  ];

  const keyPeople = [
    '石田: 信頼度高。相談相手の一人',
    '力久: 信頼度高。相談相手の一人',
    '紹介会社: 入居者獲得の重要チャネル。関係維持が重要',
  ];

  return `\n\n## 飛鳥グループの事業概要\n${companyProfile.map((r) => `- ${r}`).join('\n')}\n\n## 基本方針・ルール\n${operationalRules.map((r) => `- ${r}`).join('\n')}\n\n## 主要関係者\n${keyPeople.map((r) => `- ${r}`).join('\n')}`;
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
 *
 * AI下書きと最終返信の差分を記録し、将来のAI品質改善に活用する
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

  const questionData = doc.data()!;

  // AI下書きと最終返信の差分を記録（品質改善フィードバック）
  const aiDraftReply = questionData.aiDraftReply || '';
  const wasEdited = aiDraftReply !== '' && aiDraftReply !== input.replyContent;
  const editRatio = aiDraftReply
    ? Math.round((1 - similarity(aiDraftReply, input.replyContent)) * 100)
    : 100;

  await docRef.update({
    status: 'replied',
    repliedAt: new Date(),
    repliedBy,
    repliedByName,
    replyContent: input.replyContent,
    replyNote: input.replyNote || '',
    // AI品質フィードバック
    aiDraftWasEdited: wasEdited,
    aiDraftEditRatio: editRatio,
    updatedAt: new Date(),
  });

  console.log('[FukushaAsk] 返信送信', {
    questionId: input.questionId,
    repliedBy,
    aiDraftWasEdited: wasEdited,
    aiDraftEditRatio: editRatio,
  });

  // 質問者への通知を送信
  try {
    const questionUserId = questionData.userId as string;
    const questionTenantId = questionData.tenantId as string;
    const questionTitle = (questionData.title as string) || (questionData.content as string || '').slice(0, 30);

    await createNotificationServer({
      tenantId: questionTenantId,
      userId: questionUserId,
      type: 'fukusha_ask_replied',
      title: 'ふくしゃに聞く：返信が届きました',
      message: `「${questionTitle}」への返信があります`,
      actionUrl: `/dashboard/ai-vp/ask/${input.questionId}`,
    });

    console.log('[FukushaAsk] 返信通知送信完了', { questionId: input.questionId, userId: questionUserId });
  } catch (notifyError) {
    // 通知送信失敗は返信自体のエラーにしない
    console.warn('[FukushaAsk] 返信通知送信失敗（無視して続行）:', notifyError);
  }
}

/**
 * 文字列の簡易類似度計算（0-1, 1=完全一致）
 * Jaccard係数ベースのbigram類似度
 */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const bigramsA = new Set<string>();
  for (let i = 0; i < a.length - 1; i++) bigramsA.add(a.slice(i, i + 2));

  const bigramsB = new Set<string>();
  for (let i = 0; i < b.length - 1; i++) bigramsB.add(b.slice(i, i + 2));

  let intersection = 0;
  bigramsA.forEach((bg) => { if (bigramsB.has(bg)) intersection++; });

  const union = bigramsA.size + bigramsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
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
