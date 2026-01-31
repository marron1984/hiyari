// ======== AI副社長・外部説明文ジェネレーター ========

import { getAdminDb } from './firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import Anthropic from '@anthropic-ai/sdk';
import {
  ExplanationInput,
  GeneratedExplanation,
  AudienceType,
  AUDIENCE_LABELS,
  AUDIENCE_INTERESTS,
  EXPLANATION_PROMPT_VERSION,
  EXPLANATION_CHAR_LIMITS,
} from '@/types/explanation-generator';
import { toDate } from './date';

const EXPLANATION_COLLECTION = 'explanations';

// ======== プロンプト生成 ========

function buildExplanationPrompt(input: ExplanationInput): string {
  const audienceLabel = AUDIENCE_LABELS[input.audience];
  const interests = AUDIENCE_INTERESTS[input.audience];

  return `あなたはAI副社長として、経営判断を外部関係者に説明する文章を作成します。

【重要ルール】
- 主観的表現は禁止（「素晴らしい」「画期的な」等）
- 感情的表現は禁止（「ご安心ください」「心配です」等）
- 煽り文言は禁止（「今すぐ」「必見」「驚きの」等）
- 客観的・事実ベースで記述する
- 断定表現はOK（説明用途のため）
- 結論は「決定事項」の内容に限定する
- 文字数は${EXPLANATION_CHAR_LIMITS.min}〜${EXPLANATION_CHAR_LIMITS.max}文字で収める

【対象読者】
${audienceLabel}

【${audienceLabel}の関心軸】
${interests.map((i, idx) => `${idx + 1}. ${i}`).join('\n')}

【入力情報】
テーマ: ${input.theme}

背景:
${input.background}

決定事項:
${input.decision}

リスク・注意点:
${input.risk}

【出力指示】
上記の情報を、${audienceLabel}向けに翻訳した説明文を作成してください。
- 関心軸に沿った内容を優先的に含める
- 専門用語は${audienceLabel}に適切なレベルで使用する
- 構成：導入 → 背景説明 → 決定内容 → 影響・リスク → 今後の対応

以下のJSON形式で出力してください:
{
  "explanation": "説明文本文"
}`;
}

// ======== AI 生成 ========

async function callAiForExplanation(input: ExplanationInput): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return generateFallbackExplanation(input);
  }

  try {
    const client = new Anthropic({ apiKey });
    const prompt = buildExplanationPrompt(input);

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const rawResponse =
      message.content[0].type === 'text' ? message.content[0].text : '';

    // JSONをパース
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.explanation) {
          return parsed.explanation;
        }
      } catch {
        console.error('Failed to parse AI response JSON');
      }
    }

    // JSONパース失敗時はそのまま返す
    return rawResponse;
  } catch (error) {
    console.error('AI API error:', error);
    return generateFallbackExplanation(input);
  }
}

function generateFallbackExplanation(input: ExplanationInput): string {
  const audienceLabel = AUDIENCE_LABELS[input.audience];

  return `【${audienceLabel}向け説明】

テーマ: ${input.theme}

${input.background}

決定事項として、${input.decision}

なお、${input.risk}

※ AIによる自動生成に失敗したため、入力内容をそのまま表示しています。`;
}

// ======== メイン処理 ========

/**
 * 説明文を生成
 */
export async function generateExplanation(
  input: ExplanationInput,
  userId: string
): Promise<GeneratedExplanation> {
  const db = getAdminDb();

  // AI で説明文を生成
  const explanation = await callAiForExplanation(input);

  // 結果を構築
  const result: GeneratedExplanation = {
    id: '',
    createdAt: new Date(),
    createdBy: userId,
    input,
    explanation,
    charCount: explanation.length,
    aiModel: 'claude-sonnet-4-20250514',
    promptVersion: EXPLANATION_PROMPT_VERSION,
  };

  // Firestoreに保存
  const docRef = await db.collection(EXPLANATION_COLLECTION).add({
    ...result,
    createdAt: Timestamp.now(),
  });

  result.id = docRef.id;

  return result;
}

/**
 * 同一テーマで複数オーディエンス向けに一括生成
 */
export async function generateExplanationsForAllAudiences(
  baseInput: Omit<ExplanationInput, 'audience'>,
  audiences: AudienceType[],
  userId: string
): Promise<GeneratedExplanation[]> {
  const results: GeneratedExplanation[] = [];

  for (const audience of audiences) {
    const input: ExplanationInput = { ...baseInput, audience };
    const explanation = await generateExplanation(input, userId);
    results.push(explanation);
  }

  return results;
}

/**
 * 説明文履歴を取得
 */
export async function getExplanationHistory(
  userId: string,
  limit: number = 10
): Promise<GeneratedExplanation[]> {
  const db = getAdminDb();

  const snapshot = await db
    .collection(EXPLANATION_COLLECTION)
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
      explanation: data.explanation,
      charCount: data.charCount,
      aiModel: data.aiModel,
      promptVersion: data.promptVersion,
    };
  });
}

/**
 * 説明文をIDで取得
 */
export async function getExplanationById(
  id: string
): Promise<GeneratedExplanation | null> {
  const db = getAdminDb();

  const doc = await db.collection(EXPLANATION_COLLECTION).doc(id).get();

  if (!doc.exists) return null;

  const data = doc.data()!;
  return {
    id: doc.id,
    createdAt: toDate(data.createdAt) || new Date(),
    createdBy: data.createdBy,
    input: data.input,
    explanation: data.explanation,
    charCount: data.charCount,
    aiModel: data.aiModel,
    promptVersion: data.promptVersion,
  };
}

/**
 * テーマで履歴を検索
 */
export async function getExplanationsByTheme(
  theme: string,
  userId: string
): Promise<GeneratedExplanation[]> {
  const db = getAdminDb();

  const snapshot = await db
    .collection(EXPLANATION_COLLECTION)
    .where('createdBy', '==', userId)
    .where('input.theme', '==', theme)
    .orderBy('createdAt', 'desc')
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      createdAt: toDate(data.createdAt) || new Date(),
      createdBy: data.createdBy,
      input: data.input,
      explanation: data.explanation,
      charCount: data.charCount,
      aiModel: data.aiModel,
      promptVersion: data.promptVersion,
    };
  });
}
