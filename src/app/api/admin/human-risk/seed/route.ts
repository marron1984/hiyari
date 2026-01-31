// ======== 人材リスク予測 ダミーデータ投入 API ========
// 管理者専用・一時利用

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import type {
  HumanRiskAssessment,
  HumanRiskAlert,
  RiskLevel,
  ScoreDetail,
  RiskFactor,
  SuggestedAction,
} from '@/types/human-risk';

// コレクション名
const ASSESSMENTS_COLLECTION = 'human_risk_assessments';
const ALERTS_COLLECTION = 'human_risk_alerts';

// ダミー拠点データ
const DUMMY_BRANCHES = [
  { id: 'branch-001', name: '新宿拠点' },
  { id: 'branch-002', name: '渋谷拠点' },
  { id: 'branch-003', name: '池袋拠点' },
  { id: 'branch-004', name: '品川拠点' },
  { id: 'branch-005', name: '横浜拠点' },
];

/**
 * POST /api/admin/human-risk/seed
 * ダミーデータを投入
 *
 * Query Parameters:
 * - count: number (投入件数、default: 5)
 * - tenantId: string (default: 'default')
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const count = Math.min(parseInt(searchParams.get('count') || '5', 10), 10);
    const tenantId = searchParams.get('tenantId') || 'default';

    console.log('[HumanRisk/Seed] ダミーデータ投入開始', { count, tenantId });

    const now = new Date();
    const periodFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const period = {
      from: periodFrom.toISOString().split('T')[0],
      to: now.toISOString().split('T')[0],
    };

    const createdAssessments: HumanRiskAssessment[] = [];
    const createdAlerts: HumanRiskAlert[] = [];

    for (let i = 0; i < count && i < DUMMY_BRANCHES.length; i++) {
      const branch = DUMMY_BRANCHES[i];

      // リスクレベルを分散させる
      const riskProfile = getRiskProfile(i);

      // スコア詳細
      const scores: ScoreDetail[] = [
        {
          category: 'operational_load',
          score: riskProfile.scores.operationalLoad,
          label: '稼働負荷',
          factors: getOperationalLoadFactors(riskProfile.scores.operationalLoad),
          trend: getTrend(riskProfile.scores.operationalLoad),
        },
        {
          category: 'behavioral_change',
          score: riskProfile.scores.behavioralChange,
          label: '行動変化',
          factors: getBehavioralChangeFactors(riskProfile.scores.behavioralChange),
          trend: getTrend(riskProfile.scores.behavioralChange),
        },
        {
          category: 'emotional_temperature',
          score: riskProfile.scores.emotionalTemperature,
          label: '感情温度',
          factors: getEmotionalTemperatureFactors(riskProfile.scores.emotionalTemperature),
          trend: getTrend(riskProfile.scores.emotionalTemperature),
        },
        {
          category: 'operational_distortion',
          score: riskProfile.scores.operationalDistortion,
          label: '運営歪み',
          factors: getOperationalDistortionFactors(riskProfile.scores.operationalDistortion),
          trend: getTrend(riskProfile.scores.operationalDistortion),
        },
      ];

      const totalScore =
        riskProfile.scores.operationalLoad +
        riskProfile.scores.behavioralChange +
        riskProfile.scores.emotionalTemperature +
        riskProfile.scores.operationalDistortion;

      // 主因を生成
      const mainFactors: RiskFactor[] = generateMainFactors(scores, riskProfile.level);

      // 参考アクションを生成
      const suggestedActions: SuggestedAction[] = generateSuggestedActions(riskProfile.level);

      // AIコメントを生成
      const aiComment = generateAIComment(branch.name, riskProfile.level, mainFactors);

      // 評価データ作成
      const assessmentRef = getAdminDb().collection(ASSESSMENTS_COLLECTION).doc();
      const assessment: HumanRiskAssessment = {
        id: assessmentRef.id,
        tenantId,
        branchId: branch.id,
        branchName: branch.name,
        period,
        totalScore,
        riskLevel: riskProfile.level,
        scores,
        mainFactors,
        suggestedActions,
        aiComment,
        disclaimer:
          'この分析は統計データに基づく参考情報です。個人の離職予測や評価は含まれていません。最終的な判断は人間が行ってください。',
        assessedAt: now,
        createdAt: now,
      };

      await assessmentRef.set(assessment);
      createdAssessments.push(assessment);

      // 警戒以上はアラートも作成
      if (riskProfile.level === 'warning' || riskProfile.level === 'critical') {
        const alertRef = getAdminDb().collection(ALERTS_COLLECTION).doc();
        const alert: HumanRiskAlert = {
          id: alertRef.id,
          tenantId,
          assessmentId: assessment.id,
          branchId: branch.id,
          branchName: branch.name,
          riskLevel: riskProfile.level as 'warning' | 'critical',
          totalScore,
          mainFactors: mainFactors.map((f) => f.title),
          summary: aiComment.summary,
          status: 'unread',
          createdAt: now,
        };

        await alertRef.set(alert);
        createdAlerts.push(alert);
      }

      console.log('[HumanRisk/Seed] 作成完了', {
        branch: branch.name,
        riskLevel: riskProfile.level,
        totalScore,
      });
    }

    return NextResponse.json({
      success: true,
      message: `${createdAssessments.length}件の評価データを作成しました`,
      createdAssessments: createdAssessments.map((a) => ({
        id: a.id,
        branchName: a.branchName,
        totalScore: a.totalScore,
        riskLevel: a.riskLevel,
      })),
      createdAlerts: createdAlerts.length,
    });
  } catch (error) {
    console.error('[HumanRisk/Seed] 投入エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '投入に失敗しました',
      },
      { status: 500 }
    );
  }
}

// ======== ヘルパー関数 ========

interface RiskProfile {
  level: RiskLevel;
  scores: {
    operationalLoad: number;
    behavioralChange: number;
    emotionalTemperature: number;
    operationalDistortion: number;
  };
}

/**
 * インデックスに基づいてリスクプロファイルを取得
 */
function getRiskProfile(index: number): RiskProfile {
  // 様々なリスクレベルを分散
  const profiles: RiskProfile[] = [
    // 要介入検討（高リスク）
    {
      level: 'critical',
      scores: {
        operationalLoad: 22,
        behavioralChange: 18,
        emotionalTemperature: 20,
        operationalDistortion: 15,
      },
    },
    // 警戒
    {
      level: 'warning',
      scores: {
        operationalLoad: 18,
        behavioralChange: 12,
        emotionalTemperature: 14,
        operationalDistortion: 10,
      },
    },
    // 注意
    {
      level: 'caution',
      scores: {
        operationalLoad: 12,
        behavioralChange: 10,
        emotionalTemperature: 8,
        operationalDistortion: 8,
      },
    },
    // 安定
    {
      level: 'stable',
      scores: {
        operationalLoad: 5,
        behavioralChange: 6,
        emotionalTemperature: 4,
        operationalDistortion: 5,
      },
    },
    // 安定（低スコア）
    {
      level: 'stable',
      scores: {
        operationalLoad: 3,
        behavioralChange: 4,
        emotionalTemperature: 2,
        operationalDistortion: 3,
      },
    },
  ];

  return profiles[index % profiles.length];
}

/**
 * トレンドを判定
 */
function getTrend(score: number): 'improving' | 'stable' | 'worsening' {
  if (score > 15) return 'worsening';
  if (score > 8) return 'stable';
  return 'improving';
}

/**
 * 稼働負荷の要因を生成
 */
function getOperationalLoadFactors(score: number): string[] {
  if (score > 15) {
    return ['拠点の平均残業が40時間超/月', '残業45時間超が3割以上', '深夜残業が頻発'];
  }
  if (score > 8) {
    return ['拠点の平均残業が30時間/月', '残業45時間超が15%以上'];
  }
  return ['残業時間は適正範囲内'];
}

/**
 * 行動変化の要因を生成
 */
function getBehavioralChangeFactors(score: number): string[] {
  if (score > 15) {
    return ['遅刻・早退が拠点全体で増加傾向', '欠勤率が高め', 'コミュニケーション量に大きな変化'];
  }
  if (score > 8) {
    return ['遅刻・早退がやや増加', '有給消化率が低い傾向'];
  }
  return ['行動パターンは安定'];
}

/**
 * 感情温度の要因を生成
 */
function getEmotionalTemperatureFactors(score: number): string[] {
  if (score > 15) {
    return ['時間外のやり取りが多い傾向', '拠点内の応答時間が長め', 'クレーム件数が増加傾向'];
  }
  if (score > 8) {
    return ['時間外メッセージがやや多い', '応答時間に変化'];
  }
  return ['チームの雰囲気は良好'];
}

/**
 * 運営歪みの要因を生成
 */
function getOperationalDistortionFactors(score: number): string[] {
  if (score > 15) {
    return ['異動希望が複数発生', '人件費率が上昇傾向', '離職率が前期比で上昇'];
  }
  if (score > 8) {
    return ['経費申請の単価が高め', '人件費率に注意'];
  }
  return ['運営は安定'];
}

/**
 * 主因を生成
 */
function generateMainFactors(scores: ScoreDetail[], level: RiskLevel): RiskFactor[] {
  const sortedScores = [...scores].sort((a, b) => b.score - a.score);
  const factors: RiskFactor[] = [];

  for (const score of sortedScores.slice(0, 3)) {
    if (score.score > 5) {
      factors.push({
        id: `factor-${factors.length + 1}`,
        category: score.category,
        title: `${score.label}に関する傾向`,
        description: score.factors[0] || `${score.label}の数値に注目する傾向が見られます`,
        impact: score.score > 15 ? 'high' : score.score > 8 ? 'medium' : 'low',
        dataPoints: score.factors,
      });
    }
  }

  return factors;
}

/**
 * 参考アクションを生成
 */
function generateSuggestedActions(level: RiskLevel): SuggestedAction[] {
  const actions: SuggestedAction[] = [];

  if (level === 'critical' || level === 'warning') {
    actions.push({
      id: 'action-1',
      title: '業務量の可視化と再配分',
      description:
        '拠点全体の業務量と人員配置を可視化し、バランスを確認してみると良いかもしれません',
      category: 'workload',
      priority: 'high',
      note: '稼働負荷が高めの傾向が見られます',
    });

    actions.push({
      id: 'action-2',
      title: 'チームミーティングの実施',
      description:
        '拠点内でのコミュニケーション機会を設けることを検討してみてはいかがでしょうか',
      category: 'communication',
      priority: 'high',
      note: 'チームの状況を把握する機会として',
    });
  }

  if (level === 'caution') {
    actions.push({
      id: 'action-1',
      title: '定期的な状況確認',
      description:
        '現状の傾向を継続的に観察し、変化があれば対応を検討すると良いかもしれません',
      category: 'support',
      priority: 'medium',
      note: '早期発見のための継続モニタリング',
    });
  }

  if (level === 'stable') {
    actions.push({
      id: 'action-1',
      title: '現状維持',
      description: '現在のチーム運営を維持しつつ、定期的なモニタリングを続けると良いかもしれません',
      category: 'support',
      priority: 'low',
      note: '良好な状態を維持',
    });
  }

  return actions;
}

/**
 * AIコメントを生成
 */
function generateAIComment(
  branchName: string,
  level: RiskLevel,
  mainFactors: RiskFactor[]
): { summary: string; observation: string; consideration: string } {
  const levelTexts: Record<RiskLevel, string> = {
    stable: '安定した状態',
    caution: '注意が必要な傾向',
    warning: '警戒すべき傾向',
    critical: '介入検討が望ましい状態',
  };

  return {
    summary: `${branchName}は現在${levelTexts[level]}と考えられます。`,
    observation:
      mainFactors.length > 0
        ? `主に${mainFactors.map((f) => f.title).join('、')}の傾向が見られます。`
        : '特筆すべき傾向は見られません。',
    consideration:
      level === 'stable'
        ? '現状を維持しつつ、定期的なモニタリングを続けると良いかもしれません。'
        : '状況の推移を注視し、必要に応じて対応を検討することをお勧めします。',
  };
}
