'use server';

import { getAdminDb } from '@/lib/firebase-admin';
import { DEFAULT_TENANT_ID } from '@/lib/firebase';
import type {
  HumanRiskAssessment,
  RiskLevel,
  ScoreDetail,
  RiskFactor,
  SuggestedAction,
} from '@/types/human-risk';

const ASSESSMENTS_COLLECTION = 'human_risk_assessments';

// リスクレベルラベル → RiskLevel 変換
const LEVEL_MAP: Record<string, RiskLevel> = {
  '安定': 'stable',
  '注意': 'caution',
  '警戒': 'warning',
  '要介入検討': 'critical',
};

interface SeedInput {
  period: string;       // "2026-01"
  baseId: string;       // "nishiyodogawa"
  baseName: string;     // "西淀川"
  score: number;        // 72
  level: string;        // "警戒"
  factors: string[];    // ["欠勤率上昇","夜間稼働増加","残業集中"]
}

/**
 * 人材リスクスコアのシードデータを作成
 */
export async function seedHumanRisk(input?: SeedInput) {
  const data = input || {
    period: '2026-01',
    baseId: 'nishiyodogawa',
    baseName: '西淀川',
    score: 72,
    level: '警戒',
    factors: ['欠勤率上昇', '夜間稼働増加', '残業集中'],
  };

  const riskLevel = LEVEL_MAP[data.level] || 'warning';

  // カテゴリ別スコアを生成（合計が総合スコアになるよう配分）
  const scorePerCategory = Math.floor(data.score / 4);
  const remainder = data.score - scorePerCategory * 4;

  const scores: ScoreDetail[] = [
    {
      category: 'operational_load',
      score: scorePerCategory + remainder,
      label: '稼働負荷',
      factors: data.factors.slice(0, 1),
      trend: 'worsening',
    },
    {
      category: 'behavioral_change',
      score: scorePerCategory,
      label: '行動変化',
      factors: data.factors.slice(1, 2),
      trend: 'worsening',
    },
    {
      category: 'emotional_temperature',
      score: scorePerCategory,
      label: '感情温度',
      factors: data.factors.slice(2, 3),
      trend: 'stable',
    },
    {
      category: 'operational_distortion',
      score: scorePerCategory,
      label: '運営歪み',
      factors: [],
      trend: 'stable',
    },
  ];

  // 主要因を生成
  const mainFactors: RiskFactor[] = data.factors.map((factor, i) => ({
    id: `factor-${i + 1}`,
    category: (['operational_load', 'behavioral_change', 'emotional_temperature'] as const)[i % 3],
    title: factor,
    description: `${data.baseName}において${factor}の傾向が見られます`,
    impact: i === 0 ? 'high' : 'medium',
    dataPoints: [`${factor}が検出されました`],
  }));

  // 推奨アクションを生成
  const suggestedActions: SuggestedAction[] = [
    {
      id: 'action-1',
      title: '業務量の可視化',
      description: '拠点全体の業務量と人員配置を可視化し、バランスを確認してみると良いかもしれません',
      category: 'workload',
      priority: 'high',
      note: '稼働負荷が高めの傾向が見られます',
    },
    {
      id: 'action-2',
      title: '1on1ミーティングの機会',
      description: 'スタッフとの対話機会を設けることを検討してみてはいかがでしょうか',
      category: 'communication',
      priority: 'medium',
      note: '状況の把握に有効かもしれません',
    },
  ];

  const now = new Date();
  const [year, month] = data.period.split('-').map(Number);
  const periodFrom = `${year}-${month.toString().padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const periodTo = `${year}-${month.toString().padStart(2, '0')}-${lastDay}`;

  const assessment: HumanRiskAssessment = {
    id: '',
    tenantId: DEFAULT_TENANT_ID,
    branchId: data.baseId,
    branchName: data.baseName,
    period: {
      from: periodFrom,
      to: periodTo,
    },
    totalScore: data.score,
    riskLevel,
    scores,
    mainFactors,
    suggestedActions,
    aiComment: {
      summary: `${data.baseName}は現在${data.level}レベルと考えられます。${data.factors.join('、')}の傾向が見られます。`,
      observation: `主に${data.factors[0]}の傾向が顕著です。`,
      consideration: '状況の推移を注視し、必要に応じて対応を検討することをお勧めします。',
    },
    disclaimer: 'この分析は統計データに基づく参考情報です。個人の離職予測や評価は含まれていません。最終的な判断は人間が行ってください。',
    assessedAt: now,
    createdAt: now,
  };

  // Firestoreに保存
  const db = getAdminDb();
  const docRef = db.collection(ASSESSMENTS_COLLECTION).doc();
  assessment.id = docRef.id;
  await docRef.set({
    ...assessment,
    assessedAt: now,
    createdAt: now,
  });

  console.log('[seedHumanRisk] シードデータ作成完了', {
    id: assessment.id,
    branchName: data.baseName,
    score: data.score,
    level: data.level,
  });

  return { success: true, id: assessment.id };
}

/**
 * 複数拠点のシードデータを一括作成
 */
export async function seedMultipleHumanRisks() {
  const testData: SeedInput[] = [
    {
      period: '2026-01',
      baseId: 'nishiyodogawa',
      baseName: '西淀川',
      score: 72,
      level: '警戒',
      factors: ['欠勤率上昇', '夜間稼働増加', '残業集中'],
    },
    {
      period: '2026-01',
      baseId: 'higashiyodogawa',
      baseName: '東淀川',
      score: 45,
      level: '注意',
      factors: ['有給消化率低下', 'メッセージ量変化'],
    },
    {
      period: '2026-01',
      baseId: 'yodogawa',
      baseName: '淀川',
      score: 28,
      level: '安定',
      factors: [],
    },
    {
      period: '2026-01',
      baseId: 'fukushima',
      baseName: '福島',
      score: 85,
      level: '要介入検討',
      factors: ['残業45時間超が多数', '離職率上昇', 'クレーム増加', '応答時間悪化'],
    },
  ];

  const results = await Promise.all(testData.map(seedHumanRisk));

  console.log('[seedMultipleHumanRisks] 一括シード完了', {
    count: results.length,
    ids: results.map((r) => r.id),
  });

  return { success: true, count: results.length, results };
}
