/**
 * AI副社長「外部説明文ジェネレーター」関連の型定義
 * 同一テーマを相手別に翻訳した説明文を生成
 */

/** 対象オーディエンス */
export type AudienceType =
  | 'finance'    // 金融機関（銀行・リース等）
  | 'doctor'     // 医師・医療機関
  | 'government' // 行政（自治体・監督官庁）
  | 'staff'      // 社内スタッフ
  | 'investor';  // 投資家・株主

/** オーディエンスの表示名 */
export const AUDIENCE_LABELS: Record<AudienceType, string> = {
  finance: '金融機関',
  doctor: '医師・医療機関',
  government: '行政機関',
  staff: '社内スタッフ',
  investor: '投資家・株主',
};

/** オーディエンスの関心軸 */
export const AUDIENCE_INTERESTS: Record<AudienceType, string[]> = {
  finance: [
    '財務健全性・返済能力',
    'キャッシュフローへの影響',
    '担保価値・資産評価',
    '事業継続性・収益見通し',
  ],
  doctor: [
    '医療の質・安全性',
    '患者へのケア体制',
    '医療連携への影響',
    'スタッフの専門性・体制',
  ],
  government: [
    '法令遵守・コンプライアンス',
    '利用者保護・安全確保',
    '地域への影響・公益性',
    '報告義務・届出事項',
  ],
  staff: [
    '業務への具体的影響',
    '役割・責任の変化',
    'スケジュール・移行計画',
    'サポート体制・相談窓口',
  ],
  investor: [
    '企業価値・成長戦略',
    '収益・利益への影響',
    'リスク管理・ガバナンス',
    '中長期的な展望',
  ],
};

/** オーディエンスのアイコン色 */
export const AUDIENCE_COLORS: Record<AudienceType, { bg: string; text: string; border: string }> = {
  finance: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  doctor: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  government: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  staff: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  investor: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
};

/** 説明文生成入力 */
export interface ExplanationInput {
  /** テーマ（何についての説明か） */
  theme: string;
  /** 背景（なぜこの決定に至ったか） */
  background: string;
  /** 決定事項（結論） */
  decision: string;
  /** リスク（懸念点・注意点） */
  risk: string;
  /** 対象オーディエンス */
  audience: AudienceType;
}

/** 生成された説明文 */
export interface GeneratedExplanation {
  id: string;
  createdAt: Date;
  createdBy: string;

  /** 入力 */
  input: ExplanationInput;

  /** 生成された説明文 */
  explanation: string;

  /** 文字数 */
  charCount: number;

  /** AIモデル情報 */
  aiModel: string;
  promptVersion: string;
}

/** Firestore保存用 */
export interface ExplanationDocument extends Omit<GeneratedExplanation, 'createdAt'> {
  createdAt: FirebaseFirestore.Timestamp;
}

/** API リクエスト */
export interface ExplanationRequest {
  theme: string;
  background: string;
  decision: string;
  risk: string;
  audience: AudienceType;
}

/** API レスポンス */
export interface ExplanationResponse {
  success: boolean;
  explanation?: GeneratedExplanation;
  error?: string;
}

/** 履歴取得レスポンス */
export interface ExplanationHistoryResponse {
  success: boolean;
  explanations?: GeneratedExplanation[];
  error?: string;
}

/** プロンプトバージョン */
export const EXPLANATION_PROMPT_VERSION = 'v1.0.0';

/** 文字数制限 */
export const EXPLANATION_CHAR_LIMITS = {
  min: 500,
  max: 800,
};
