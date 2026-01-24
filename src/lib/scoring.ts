import { ScoreBreakdownItem, ScoringRule, DEFAULT_SCORING_RULES } from '@/types';

export interface ScoringInput {
  bodyLength: number;
  severity: number;
  hasAction: boolean;
  hasPrevention: boolean;
  hasImage: boolean;
}

export interface ScoringResult {
  scoreTotal: number;
  scoreBreakdown: ScoreBreakdownItem[];
  bodyLength: number;
  totalLength: number;
}

/**
 * スコアリングを計算する
 */
export function calculateScore(
  input: ScoringInput,
  totalLength: number,
  rules: ScoringRule[] = DEFAULT_SCORING_RULES
): ScoringResult {
  const breakdown: ScoreBreakdownItem[] = [];

  // 投稿基本点
  const baseRule = rules.find((r) => r.key === 'base');
  if (baseRule?.enabled) {
    breakdown.push({
      key: 'base',
      label: baseRule.label,
      points: baseRule.points,
    });
  }

  // 本文300文字以上
  const len300Rule = rules.find((r) => r.key === 'len300');
  if (len300Rule?.enabled && input.bodyLength >= 300) {
    breakdown.push({
      key: 'len300',
      label: len300Rule.label,
      points: len300Rule.points,
    });
  }

  // 本文600文字以上（300の加点に追加）
  const len600Rule = rules.find((r) => r.key === 'len600');
  if (len600Rule?.enabled && input.bodyLength >= 600) {
    breakdown.push({
      key: 'len600',
      label: len600Rule.label,
      points: len600Rule.points,
    });
  }

  // 重大度4以上
  const severity4Rule = rules.find((r) => r.key === 'severity4');
  if (severity4Rule?.enabled && input.severity >= 4) {
    breakdown.push({
      key: 'severity4',
      label: severity4Rule.label,
      points: severity4Rule.points,
    });
  }

  // 回避行動あり
  const actionRule = rules.find((r) => r.key === 'action');
  if (actionRule?.enabled && input.hasAction) {
    breakdown.push({
      key: 'action',
      label: actionRule.label,
      points: actionRule.points,
    });
  }

  // 再発防止提案あり
  const preventionRule = rules.find((r) => r.key === 'prevention');
  if (preventionRule?.enabled && input.hasPrevention) {
    breakdown.push({
      key: 'prevention',
      label: preventionRule.label,
      points: preventionRule.points,
    });
  }

  // 画像添付あり
  const imageRule = rules.find((r) => r.key === 'image');
  if (imageRule?.enabled && input.hasImage) {
    breakdown.push({
      key: 'image',
      label: imageRule.label,
      points: imageRule.points,
    });
  }

  const scoreTotal = breakdown.reduce((sum, item) => sum + item.points, 0);

  return {
    scoreTotal,
    scoreBreakdown: breakdown,
    bodyLength: input.bodyLength,
    totalLength,
  };
}

/**
 * スコア内訳の表示順を取得
 */
export function getSortedScoreBreakdown(breakdown: ScoreBreakdownItem[]): ScoreBreakdownItem[] {
  const order = ['base', 'len300', 'len600', 'severity4', 'action', 'prevention', 'image', 'fraud'];
  return [...breakdown].sort((a, b) => {
    const aIndex = order.indexOf(a.key);
    const bIndex = order.indexOf(b.key);
    return aIndex - bIndex;
  });
}

// ======== 入居確率スコアリング ========

import { Prospect, ProspectStatus, CareLevel } from '@/types/prospect';
import { ScoringReason, ProbabilityRank, ScoringRuleConfig } from '@/types/chaos';

/**
 * デフォルトの入居確率スコアリング設定
 */
export const DEFAULT_MOVEIN_SCORING_CONFIG: ScoringRuleConfig = {
  // 年齢スコア（高齢者施設なので高齢ほど入居可能性高い）
  ageScore: [
    { min: 0, max: 59, weight: 5 },
    { min: 60, max: 69, weight: 10 },
    { min: 70, max: 79, weight: 15 },
    { min: 80, max: 89, weight: 20 },
    { min: 90, max: 999, weight: 25 },
  ],

  // 介護度スコア（高いほど入居緊急度高い）
  careLevelScore: {
    '自立': 5,
    '要支援1': 10,
    '要支援2': 12,
    '要介護1': 15,
    '要介護2': 18,
    '要介護3': 22,
    '要介護4': 25,
    '要介護5': 28,
    '申請中': 10,
    '不明': 8,
  },

  // 連絡方法スコア（source）
  contactMethodScore: {
    'notta-email': 10,
    'notta-form': 12,
    'manual': 8,
    'phone': 15,
    'referral': 18,
    'other': 5,
  },

  // 行動スコア
  visitScheduledScore: 15,
  visitCompletedScore: 20,
  documentsSubmittedScore: 10,

  // 経過日数による減点
  daysSinceContactPenalty: [
    { days: 3, penalty: 0 },
    { days: 7, penalty: 5 },
    { days: 14, penalty: 10 },
    { days: 30, penalty: 20 },
    { days: 60, penalty: 30 },
  ],

  // ランク閾値
  rankThresholds: {
    A: 75,
    B: 55,
    C: 35,
  },
};

/**
 * ステータスによるスコア（パイプライン進捗）
 */
export const MOVEIN_STATUS_SCORES: Record<ProspectStatus, number> = {
  '新規受付': 5,
  '折返し待ち': 8,
  '面談設定済': 12,
  '見学設定済': 18,
  '申込中': 25,
  '審査中': 28,
  '入居待ち': 32,
  '入居決定': 35,
  '見送り': 0,
  'クローズ': 0,
};

/**
 * 推奨アクション
 */
export const MOVEIN_RECOMMENDED_ACTIONS: Record<ProbabilityRank, string> = {
  A: '最優先で対応。24時間以内にフォローアップを実施してください。',
  B: '積極的に対応。48時間以内にフォローアップを検討してください。',
  C: '通常対応。週内にフォローアップを検討してください。',
  D: '優先度低。他の案件を優先し、定期的に状況を確認してください。',
};

/**
 * 年齢スコアを計算
 */
export function calculateAgeScore(
  age: number | undefined,
  config: ScoringRuleConfig = DEFAULT_MOVEIN_SCORING_CONFIG
): { score: number; reason: ScoringReason } {
  if (age === undefined || age === null) {
    return {
      score: 0,
      reason: { factor: 'age', score: 0, description: '年齢不明' },
    };
  }

  const ageRule = config.ageScore.find(r => age >= r.min && age <= r.max);
  const score = ageRule?.weight || 0;

  return {
    score,
    reason: { factor: 'age', score, description: `年齢: ${age}歳` },
  };
}

/**
 * 介護度スコアを計算
 */
export function calculateCareLevelScore(
  careLevel: CareLevel | undefined,
  config: ScoringRuleConfig = DEFAULT_MOVEIN_SCORING_CONFIG
): { score: number; reason: ScoringReason } {
  if (!careLevel) {
    return {
      score: 0,
      reason: { factor: 'careLevel', score: 0, description: '介護度不明' },
    };
  }

  const score = config.careLevelScore[careLevel] || 0;

  return {
    score,
    reason: { factor: 'careLevel', score, description: `介護度: ${careLevel}` },
  };
}

/**
 * ステータススコアを計算
 */
export function calculateStatusScore(
  status: ProspectStatus
): { score: number; reason: ScoringReason } {
  const score = MOVEIN_STATUS_SCORES[status] || 0;

  return {
    score,
    reason: { factor: 'status', score, description: `ステータス: ${status}` },
  };
}

/**
 * 連絡方法スコアを計算
 */
export function calculateContactMethodScore(
  source: string | undefined,
  config: ScoringRuleConfig = DEFAULT_MOVEIN_SCORING_CONFIG
): { score: number; reason: ScoringReason } {
  if (!source) {
    return {
      score: 5,
      reason: { factor: 'contactMethod', score: 5, description: '連絡元不明' },
    };
  }

  const score = config.contactMethodScore[source] || 5;

  return {
    score,
    reason: { factor: 'contactMethod', score, description: `連絡元: ${source}` },
  };
}

/**
 * 見学設定スコアを計算
 */
export function calculateVisitScore(
  tourRequestDate: string | undefined,
  status: ProspectStatus,
  config: ScoringRuleConfig = DEFAULT_MOVEIN_SCORING_CONFIG
): { score: number; reason: ScoringReason } {
  // 見学設定済み or それ以降のステータス
  const visitStatuses: ProspectStatus[] = ['見学設定済', '申込中', '審査中', '入居待ち', '入居決定'];
  const isVisitScheduledOrCompleted = visitStatuses.includes(status) || !!tourRequestDate;

  // 見学完了（申込中以降）
  const completedStatuses: ProspectStatus[] = ['申込中', '審査中', '入居待ち', '入居決定'];
  const isVisitCompleted = completedStatuses.includes(status);

  if (isVisitCompleted) {
    return {
      score: config.visitCompletedScore,
      reason: { factor: 'visit', score: config.visitCompletedScore, description: '見学完了' },
    };
  }

  if (isVisitScheduledOrCompleted) {
    return {
      score: config.visitScheduledScore,
      reason: { factor: 'visit', score: config.visitScheduledScore, description: '見学設定済み' },
    };
  }

  return {
    score: 0,
    reason: { factor: 'visit', score: 0, description: '見学未設定' },
  };
}

/**
 * 書類提出スコアを計算
 */
export function calculateDocumentsScore(
  documents: unknown[] | undefined,
  config: ScoringRuleConfig = DEFAULT_MOVEIN_SCORING_CONFIG
): { score: number; reason: ScoringReason } {
  const hasDocuments = documents && documents.length > 0;

  if (hasDocuments) {
    return {
      score: config.documentsSubmittedScore,
      reason: { factor: 'documents', score: config.documentsSubmittedScore, description: `書類提出あり (${documents.length}件)` },
    };
  }

  return {
    score: 0,
    reason: { factor: 'documents', score: 0, description: '書類未提出' },
  };
}

/**
 * 経過日数によるペナルティを計算
 */
export function calculateDaysElapsedPenalty(
  receivedAt: Date | undefined,
  config: ScoringRuleConfig = DEFAULT_MOVEIN_SCORING_CONFIG
): { penalty: number; reason: ScoringReason } {
  if (!receivedAt) {
    return {
      penalty: 0,
      reason: { factor: 'daysElapsed', score: 0, description: '受信日不明' },
    };
  }

  const now = new Date();
  const diffMs = now.getTime() - receivedAt.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // ペナルティを決定（降順でマッチ）
  const sortedPenalties = [...config.daysSinceContactPenalty].sort((a, b) => b.days - a.days);
  const rule = sortedPenalties.find(r => diffDays >= r.days);
  const penalty = rule?.penalty || 0;

  return {
    penalty,
    reason: {
      factor: 'daysElapsed',
      score: -penalty,
      description: `経過日数: ${diffDays}日${penalty > 0 ? ` (-${penalty}pt)` : ''}`,
    },
  };
}

/**
 * スコアからランクを決定
 */
export function determineRank(
  probability: number,
  config: ScoringRuleConfig = DEFAULT_MOVEIN_SCORING_CONFIG
): ProbabilityRank {
  if (probability >= config.rankThresholds.A) return 'A';
  if (probability >= config.rankThresholds.B) return 'B';
  if (probability >= config.rankThresholds.C) return 'C';
  return 'D';
}

/**
 * 入居確率計算結果
 */
export interface MoveInProbabilityResult {
  rawScore: number;
  probability: number;
  rank: ProbabilityRank;
  recommendedAction: string;
  reasons: ScoringReason[];
  configVersion: number;
}

/**
 * 入居確率を計算（メイン関数）
 */
export function calculateMoveInProbability(
  prospect: Partial<Prospect>,
  config: ScoringRuleConfig = DEFAULT_MOVEIN_SCORING_CONFIG,
  configVersion: number = 1
): MoveInProbabilityResult {
  const reasons: ScoringReason[] = [];
  let rawScore = 0;

  // 各スコアを計算
  const ageResult = calculateAgeScore(prospect.age, config);
  rawScore += ageResult.score;
  reasons.push(ageResult.reason);

  const careLevelResult = calculateCareLevelScore(prospect.careLevel, config);
  rawScore += careLevelResult.score;
  reasons.push(careLevelResult.reason);

  const statusResult = calculateStatusScore(prospect.status || '新規受付');
  rawScore += statusResult.score;
  reasons.push(statusResult.reason);

  const contactResult = calculateContactMethodScore(prospect.source, config);
  rawScore += contactResult.score;
  reasons.push(contactResult.reason);

  const visitResult = calculateVisitScore(
    prospect.tourRequestDate,
    prospect.status || '新規受付',
    config
  );
  rawScore += visitResult.score;
  reasons.push(visitResult.reason);

  const docsResult = calculateDocumentsScore(prospect.documents, config);
  rawScore += docsResult.score;
  reasons.push(docsResult.reason);

  const daysResult = calculateDaysElapsedPenalty(prospect.receivedAt, config);
  rawScore -= daysResult.penalty;
  reasons.push(daysResult.reason);

  // 確率を計算（rawScoreを0-100に正規化）
  // 最大スコア: 25(age) + 28(care) + 35(status) + 18(contact) + 20(visit) + 10(docs) = 136
  // ペナルティ最大: -30
  const maxPossibleScore = 136;
  const probability = Math.min(100, Math.max(0, Math.round((rawScore / maxPossibleScore) * 100)));

  const rank = determineRank(probability, config);
  const recommendedAction = MOVEIN_RECOMMENDED_ACTIONS[rank];

  return {
    rawScore,
    probability,
    rank,
    recommendedAction,
    reasons,
    configVersion,
  };
}

/**
 * バッチスコアリング（複数案件を一括処理）
 */
export function calculateBatchMoveInProbability(
  prospects: Partial<Prospect>[],
  config: ScoringRuleConfig = DEFAULT_MOVEIN_SCORING_CONFIG,
  configVersion: number = 1
): Map<string, MoveInProbabilityResult> {
  const results = new Map<string, MoveInProbabilityResult>();

  for (const prospect of prospects) {
    if (prospect.id) {
      const result = calculateMoveInProbability(prospect, config, configVersion);
      results.set(prospect.id, result);
    }
  }

  return results;
}

/**
 * ランク別集計
 */
export function aggregateByRank(
  results: Map<string, MoveInProbabilityResult>
): Record<ProbabilityRank, number> {
  const counts: Record<ProbabilityRank, number> = { A: 0, B: 0, C: 0, D: 0 };

  for (const result of results.values()) {
    counts[result.rank]++;
  }

  return counts;
}

/**
 * 期待入居数を計算（確率の合計）
 */
export function calculateExpectedMoveIns(
  results: Map<string, MoveInProbabilityResult>
): number {
  let expectedCount = 0;

  for (const result of results.values()) {
    expectedCount += result.probability / 100;
  }

  return Math.round(expectedCount * 10) / 10; // 小数点1桁
}
