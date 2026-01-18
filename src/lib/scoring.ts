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
