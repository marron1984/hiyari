// ======== AI副社長「人材リスク予測」ライブラリ ========
// 注意: 個人の離職断定・評価は禁止、主語は拠点・チーム

import { getAdminDb } from './firebase-admin';
import type {
  RiskLevel,
  ScoreCategory,
  ScoreDetail,
  RiskFactor,
  SuggestedAction,
  HumanRiskAssessment,
  HumanRiskInput,
  HumanRiskAlert,
  BranchRiskSummary,
  AttendanceMetrics,
  ApplicationMetrics,
  CommunicationMetrics,
  OperationalMetrics,
  RISK_LEVEL_THRESHOLDS,
} from '@/types/human-risk';

// コレクション名
const ASSESSMENTS_COLLECTION = 'human_risk_assessments';
const ALERTS_COLLECTION = 'human_risk_alerts';

// リスクレベル閾値
const THRESHOLDS = {
  stable: { max: 30 },
  caution: { min: 31, max: 50 },
  warning: { min: 51, max: 70 },
  critical: { min: 71 },
};

// ======== スコアリング ========

/**
 * 稼働負荷スコア（0-25）
 */
function calculateOperationalLoadScore(
  attendance?: AttendanceMetrics,
  applications?: ApplicationMetrics
): { score: number; factors: string[]; trend: 'improving' | 'stable' | 'worsening' } {
  const factors: string[] = [];
  let score = 0;

  if (attendance) {
    // 平均残業時間（0-8点）
    if (attendance.avgOvertimeHours > 40) {
      score += 8;
      factors.push(`拠点の平均残業が${Math.round(attendance.avgOvertimeHours)}時間/月`);
    } else if (attendance.avgOvertimeHours > 30) {
      score += 5;
      factors.push(`拠点の平均残業が${Math.round(attendance.avgOvertimeHours)}時間/月`);
    } else if (attendance.avgOvertimeHours > 20) {
      score += 2;
    }

    // 45時間超の人数（0-7点）
    const ratio = attendance.overtimeOver45Count / Math.max(attendance.totalEmployees, 1);
    if (ratio > 0.3) {
      score += 7;
      factors.push('残業45時間超が3割以上');
    } else if (ratio > 0.15) {
      score += 4;
      factors.push('残業45時間超が15%以上');
    } else if (ratio > 0.05) {
      score += 2;
    }

    // 深夜残業（0-5点）
    if (attendance.lateNightOvertimeCount > 10) {
      score += 5;
      factors.push('深夜残業が頻発');
    } else if (attendance.lateNightOvertimeCount > 5) {
      score += 3;
    }

    // 連続残業（0-5点）
    if (attendance.consecutiveOvertimeDays >= 7) {
      score += 5;
      factors.push('7日以上連続残業あり');
    } else if (attendance.consecutiveOvertimeDays >= 5) {
      score += 3;
    }
  }

  if (applications) {
    // 残業申請頻度（補正）
    if (applications.overtimeApplicationCount > 50) {
      score = Math.min(score + 2, 25);
    }
  }

  return {
    score: Math.min(score, 25),
    factors: factors.slice(0, 3),
    trend: score > 15 ? 'worsening' : score > 8 ? 'stable' : 'improving',
  };
}

/**
 * 行動変化スコア（0-25）
 */
function calculateBehavioralChangeScore(
  attendance?: AttendanceMetrics,
  communication?: CommunicationMetrics
): { score: number; factors: string[]; trend: 'improving' | 'stable' | 'worsening' } {
  const factors: string[] = [];
  let score = 0;

  if (attendance) {
    // 遅刻・早退（0-8点）
    const irregularRate =
      (attendance.lateArrivalCount + attendance.earlyLeaveCount) /
      Math.max(attendance.totalEmployees, 1);
    if (irregularRate > 0.2) {
      score += 8;
      factors.push('遅刻・早退が拠点全体で増加傾向');
    } else if (irregularRate > 0.1) {
      score += 4;
    }

    // 欠勤（0-7点）
    const absentRate = attendance.absentCount / Math.max(attendance.totalEmployees, 1);
    if (absentRate > 0.15) {
      score += 7;
      factors.push('欠勤率が高め');
    } else if (absentRate > 0.08) {
      score += 4;
    }

    // 有給消化率の偏り（低すぎor高すぎ）
    if (attendance.paidLeaveUsageRate < 20) {
      score += 3;
      factors.push('有給消化率が低い傾向');
    }
  }

  if (communication) {
    // メッセージ量変化（0-5点）
    if (Math.abs(communication.messageVolumeChange) > 30) {
      score += 5;
      factors.push('コミュニケーション量に大きな変化');
    } else if (Math.abs(communication.messageVolumeChange) > 15) {
      score += 2;
    }

    // 応答時間変化（0-5点）
    if (communication.responseTimeChange > 50) {
      score += 5;
      factors.push('応答時間が長くなる傾向');
    } else if (communication.responseTimeChange > 20) {
      score += 2;
    }
  }

  return {
    score: Math.min(score, 25),
    factors: factors.slice(0, 3),
    trend: score > 15 ? 'worsening' : score > 8 ? 'stable' : 'improving',
  };
}

/**
 * 感情温度スコア（0-25）
 */
function calculateEmotionalTemperatureScore(
  communication?: CommunicationMetrics,
  operational?: OperationalMetrics
): { score: number; factors: string[]; trend: 'improving' | 'stable' | 'worsening' } {
  const factors: string[] = [];
  let score = 0;

  if (communication) {
    // 時間外メッセージ率（0-8点）
    if (communication.afterHoursMessageRate > 30) {
      score += 8;
      factors.push('時間外のやり取りが多い傾向');
    } else if (communication.afterHoursMessageRate > 15) {
      score += 4;
    }

    // 応答時間（0-7点）
    if (communication.responseTimeAvg > 120) {
      score += 7;
      factors.push('拠点内の応答時間が長め');
    } else if (communication.responseTimeAvg > 60) {
      score += 3;
    }
  }

  if (operational) {
    // クレーム（0-5点）
    if (operational.complaintChangeRate > 50) {
      score += 5;
      factors.push('クレーム件数が増加傾向');
    } else if (operational.complaintChangeRate > 20) {
      score += 2;
    }

    // 離職率（0-5点）
    if (operational.turnoverRate > 20) {
      score += 5;
      factors.push('チームの入れ替わりが多い');
    } else if (operational.turnoverRate > 10) {
      score += 2;
    }
  }

  return {
    score: Math.min(score, 25),
    factors: factors.slice(0, 3),
    trend: score > 15 ? 'worsening' : score > 8 ? 'stable' : 'improving',
  };
}

/**
 * 運営歪みスコア（0-25）
 */
function calculateOperationalDistortionScore(
  applications?: ApplicationMetrics,
  operational?: OperationalMetrics
): { score: number; factors: string[]; trend: 'improving' | 'stable' | 'worsening' } {
  const factors: string[] = [];
  let score = 0;

  if (applications) {
    // 経費申請の偏り（0-8点）
    if (applications.avgExpensePerApplication > 50000) {
      score += 5;
      factors.push('経費申請の単価が高め');
    }

    // 異動希望（0-7点）
    if (applications.transferRequestCount > 3) {
      score += 7;
      factors.push('異動希望が複数発生');
    } else if (applications.transferRequestCount > 0) {
      score += 3;
    }
  }

  if (operational) {
    // 人件費率（0-5点）
    if (operational.laborCostChangeRate > 15) {
      score += 5;
      factors.push('人件費率が上昇傾向');
    } else if (operational.laborCostChangeRate > 8) {
      score += 2;
    }

    // 離職変化率（0-5点）
    if (operational.turnoverChangeRate > 30) {
      score += 5;
      factors.push('離職率が前期比で上昇');
    } else if (operational.turnoverChangeRate > 15) {
      score += 2;
    }
  }

  return {
    score: Math.min(score, 25),
    factors: factors.slice(0, 3),
    trend: score > 15 ? 'worsening' : score > 8 ? 'stable' : 'improving',
  };
}

/**
 * リスクレベルを判定
 */
function determineRiskLevel(totalScore: number): RiskLevel {
  if (totalScore >= THRESHOLDS.critical.min) return 'critical';
  if (totalScore >= THRESHOLDS.warning.min) return 'warning';
  if (totalScore >= THRESHOLDS.caution.min) return 'caution';
  return 'stable';
}

// ======== AI分析 ========

/**
 * AIでリスク分析を生成
 */
async function generateAIAnalysis(
  input: HumanRiskInput,
  scores: ScoreDetail[],
  totalScore: number,
  riskLevel: RiskLevel
): Promise<{
  mainFactors: RiskFactor[];
  suggestedActions: SuggestedAction[];
  aiComment: {
    summary: string;
    observation: string;
    consideration: string;
  };
}> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.warn('[HumanRisk] OpenAI APIキーなし、ダミー分析を返す');
    return generateDummyAnalysis(input, scores, riskLevel);
  }

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(input, scores, totalScore, riskLevel);

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
        max_tokens: 1200,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content || '{}');

    return formatAIResponse(parsed, scores);
  } catch (error) {
    console.error('[HumanRisk] OpenAI API呼び出しエラー', error);
    return generateDummyAnalysis(input, scores, riskLevel);
  }
}

/**
 * システムプロンプト
 */
function buildSystemPrompt(): string {
  return `あなたは組織の人材リスクを分析するAIです。
拠点・チーム単位でリスク傾向を分析し、参考情報を提供します。

## 重要な原則

1. **主語は必ず「拠点」「チーム」「組織」** - 個人を特定する表現は禁止
2. **個人の離職断定・評価は禁止** - 「〇〇さんが辞めそう」などは絶対NG
3. **断定表現禁止** - 「問題がある」「〜すべき」は使わない
4. **命令禁止** - 「〜してください」は使わない

## 推奨表現

- 「拠点全体として〜の傾向が見られます」
- 「チームとして〜の可能性が考えられます」
- 「組織として〜を検討する余地があるかもしれません」
- 「〜に注目すると良いかもしれません」

## 出力形式（JSON）

{
  "mainFactors": [
    {
      "category": "operational_load|behavioral_change|emotional_temperature|operational_distortion",
      "title": "主因タイトル（拠点・チーム主語）",
      "description": "説明（個人名なし、断定なし）",
      "impact": "high|medium|low",
      "dataPoints": ["根拠1", "根拠2"]
    }
  ],
  "suggestedActions": [
    {
      "title": "アクションタイトル",
      "description": "説明（命令形禁止）",
      "category": "communication|workload|environment|support",
      "priority": "high|medium|low",
      "note": "補足（断定禁止）"
    }
  ],
  "aiComment": {
    "summary": "概要（拠点・チーム主語）",
    "observation": "観察事項",
    "consideration": "検討事項（〜かもしれません形式）"
  }
}

注意:
- mainFactorsは最大3つ
- suggestedActionsは最大3つ
- 全て拠点・チームを主語に`;
}

/**
 * ユーザープロンプト
 */
function buildUserPrompt(
  input: HumanRiskInput,
  scores: ScoreDetail[],
  totalScore: number,
  riskLevel: RiskLevel
): string {
  const riskLevelLabels: Record<RiskLevel, string> = {
    stable: '安定',
    caution: '注意',
    warning: '警戒',
    critical: '要介入検討',
  };

  const scoreDetails = scores
    .map(
      (s) =>
        `- ${s.label}: ${s.score}/25点\n  要因: ${s.factors.join('、') || 'なし'}`
    )
    .join('\n');

  return `## 拠点情報
- 拠点名: ${input.branchName}
- 評価期間: ${input.period.from} 〜 ${input.period.to}

## 総合スコア
- ${totalScore}/100点
- リスクレベル: ${riskLevelLabels[riskLevel]}

## カテゴリ別スコア
${scoreDetails}

## 入力データサマリ
${input.attendance ? `- 平均残業: ${input.attendance.avgOvertimeHours}時間/月` : ''}
${input.attendance ? `- 45時間超: ${input.attendance.overtimeOver45Count}名` : ''}
${input.communication ? `- 時間外メッセージ率: ${input.communication.afterHoursMessageRate}%` : ''}
${input.operational ? `- 離職率: ${input.operational.turnoverRate}%` : ''}

上記のデータに基づき、拠点・チームの観点からリスク要因と参考アクションを分析してください。
個人名や個人の離職予測は絶対に含めないでください。`;
}

/**
 * AIレスポンスを整形
 */
function formatAIResponse(
  parsed: any,
  scores: ScoreDetail[]
): {
  mainFactors: RiskFactor[];
  suggestedActions: SuggestedAction[];
  aiComment: { summary: string; observation: string; consideration: string };
} {
  const mainFactors: RiskFactor[] = (parsed.mainFactors || [])
    .slice(0, 3)
    .map((f: any, i: number) => ({
      id: `factor-${i + 1}`,
      category: f.category || 'operational_load',
      title: f.title || '要因',
      description: f.description || '',
      impact: f.impact || 'medium',
      dataPoints: f.dataPoints || [],
    }));

  const suggestedActions: SuggestedAction[] = (parsed.suggestedActions || [])
    .slice(0, 3)
    .map((a: any, i: number) => ({
      id: `action-${i + 1}`,
      title: a.title || 'アクション',
      description: a.description || '',
      category: a.category || 'support',
      priority: a.priority || 'medium',
      note: a.note || '',
    }));

  return {
    mainFactors,
    suggestedActions,
    aiComment: {
      summary: parsed.aiComment?.summary || '拠点の状況を分析しました。',
      observation: parsed.aiComment?.observation || '',
      consideration: parsed.aiComment?.consideration || '',
    },
  };
}

/**
 * ダミー分析を生成
 */
function generateDummyAnalysis(
  input: HumanRiskInput,
  scores: ScoreDetail[],
  riskLevel: RiskLevel
): {
  mainFactors: RiskFactor[];
  suggestedActions: SuggestedAction[];
  aiComment: { summary: string; observation: string; consideration: string };
} {
  // スコアが高いカテゴリから主因を抽出
  const sortedScores = [...scores].sort((a, b) => b.score - a.score);

  const mainFactors: RiskFactor[] = sortedScores
    .filter((s) => s.score > 5)
    .slice(0, 3)
    .map((s, i) => ({
      id: `factor-${i + 1}`,
      category: s.category,
      title: `${s.label}に関する傾向`,
      description: s.factors[0] || `${s.label}の数値に注目する傾向が見られます`,
      impact: s.score > 15 ? 'high' : s.score > 8 ? 'medium' : 'low',
      dataPoints: s.factors,
    }));

  const suggestedActions: SuggestedAction[] = [];

  if (scores.find((s) => s.category === 'operational_load' && s.score > 10)) {
    suggestedActions.push({
      id: 'action-1',
      title: '業務量の可視化',
      description:
        '拠点全体の業務量と人員配置を可視化し、バランスを確認してみると良いかもしれません',
      category: 'workload',
      priority: 'high',
      note: '稼働負荷が高めの傾向が見られます',
    });
  }

  if (scores.find((s) => s.category === 'emotional_temperature' && s.score > 10)) {
    suggestedActions.push({
      id: 'action-2',
      title: 'チームミーティングの機会',
      description:
        '拠点内でのコミュニケーション機会を設けることを検討してみてはいかがでしょうか',
      category: 'communication',
      priority: 'medium',
      note: 'コミュニケーションパターンに変化が見られます',
    });
  }

  if (suggestedActions.length === 0) {
    suggestedActions.push({
      id: 'action-1',
      title: '定期的なモニタリング',
      description: '現状の傾向を継続的に観察していくと良いかもしれません',
      category: 'support',
      priority: 'low',
      note: '大きな変化は見られません',
    });
  }

  const riskLevelTexts: Record<RiskLevel, string> = {
    stable: '安定した状態',
    caution: '注意が必要な傾向',
    warning: '警戒すべき傾向',
    critical: '介入検討が望ましい状態',
  };

  return {
    mainFactors,
    suggestedActions,
    aiComment: {
      summary: `${input.branchName}は現在${riskLevelTexts[riskLevel]}と考えられます。`,
      observation:
        mainFactors.length > 0
          ? `主に${mainFactors.map((f) => f.title).join('、')}の傾向が見られます。`
          : '特筆すべき傾向は見られません。',
      consideration:
        riskLevel === 'stable'
          ? '現状を維持しつつ、定期的なモニタリングを続けると良いかもしれません。'
          : '状況の推移を注視し、必要に応じて対応を検討することをお勧めします。',
    },
  };
}

// ======== メイン関数 ========

/**
 * 人材リスク評価を実行
 */
export async function assessHumanRisk(
  input: HumanRiskInput
): Promise<HumanRiskAssessment> {
  console.log('[HumanRisk] リスク評価開始', {
    branchId: input.branchId,
    branchName: input.branchName,
  });

  // スコアリング
  const operationalLoad = calculateOperationalLoadScore(
    input.attendance,
    input.applications
  );
  const behavioralChange = calculateBehavioralChangeScore(
    input.attendance,
    input.communication
  );
  const emotionalTemp = calculateEmotionalTemperatureScore(
    input.communication,
    input.operational
  );
  const operationalDistortion = calculateOperationalDistortionScore(
    input.applications,
    input.operational
  );

  const scores: ScoreDetail[] = [
    {
      category: 'operational_load',
      score: operationalLoad.score,
      label: '稼働負荷',
      factors: operationalLoad.factors,
      trend: operationalLoad.trend,
    },
    {
      category: 'behavioral_change',
      score: behavioralChange.score,
      label: '行動変化',
      factors: behavioralChange.factors,
      trend: behavioralChange.trend,
    },
    {
      category: 'emotional_temperature',
      score: emotionalTemp.score,
      label: '感情温度',
      factors: emotionalTemp.factors,
      trend: emotionalTemp.trend,
    },
    {
      category: 'operational_distortion',
      score: operationalDistortion.score,
      label: '運営歪み',
      factors: operationalDistortion.factors,
      trend: operationalDistortion.trend,
    },
  ];

  const totalScore =
    operationalLoad.score +
    behavioralChange.score +
    emotionalTemp.score +
    operationalDistortion.score;

  const riskLevel = determineRiskLevel(totalScore);

  console.log('[HumanRisk] スコアリング完了', {
    totalScore,
    riskLevel,
    scores: scores.map((s) => ({ category: s.category, score: s.score })),
  });

  // AI分析
  const aiAnalysis = await generateAIAnalysis(input, scores, totalScore, riskLevel);

  const now = new Date();

  const assessment: HumanRiskAssessment = {
    id: '', // 保存時に設定
    tenantId: input.tenantId,
    branchId: input.branchId,
    branchName: input.branchName,
    period: input.period,
    totalScore,
    riskLevel,
    scores,
    mainFactors: aiAnalysis.mainFactors,
    suggestedActions: aiAnalysis.suggestedActions,
    aiComment: aiAnalysis.aiComment,
    disclaimer:
      'この分析は統計データに基づく参考情報です。個人の離職予測や評価は含まれていません。最終的な判断は人間が行ってください。',
    assessedAt: now,
    createdAt: now,
  };

  // 保存
  const docRef = getAdminDb().collection(ASSESSMENTS_COLLECTION).doc();
  assessment.id = docRef.id;
  await docRef.set(assessment);

  console.log('[HumanRisk] 評価保存完了', { assessmentId: assessment.id });

  // 警戒以上の場合はアラート作成
  if (riskLevel === 'warning' || riskLevel === 'critical') {
    await createRiskAlert(assessment);
  }

  return assessment;
}

/**
 * リスクアラートを作成
 */
async function createRiskAlert(assessment: HumanRiskAssessment): Promise<void> {
  console.log('[HumanRisk] アラート作成', {
    branchName: assessment.branchName,
    riskLevel: assessment.riskLevel,
  });

  const alert: Omit<HumanRiskAlert, 'id'> = {
    tenantId: assessment.tenantId,
    assessmentId: assessment.id,
    branchId: assessment.branchId,
    branchName: assessment.branchName,
    riskLevel: assessment.riskLevel as 'warning' | 'critical',
    totalScore: assessment.totalScore,
    mainFactors: assessment.mainFactors.map((f) => f.title),
    summary: assessment.aiComment.summary,
    status: 'unread',
    createdAt: new Date(),
  };

  const docRef = getAdminDb().collection(ALERTS_COLLECTION).doc();
  await docRef.set({ ...alert, id: docRef.id });
}

// ======== 取得関数 ========

/**
 * 拠点リスクサマリ一覧を取得
 */
export async function getRiskSummaries(
  tenantId: string,
  options: { limit?: number } = {}
): Promise<BranchRiskSummary[]> {
  const { limit = 50 } = options;

  const snapshot = await getAdminDb()
    .collection(ASSESSMENTS_COLLECTION)
    .where('tenantId', '==', tenantId)
    .orderBy('assessedAt', 'desc')
    .limit(limit)
    .get();

  // 拠点ごとに最新のみ取得
  const latestByBranch = new Map<string, HumanRiskAssessment>();

  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    const branchId = data.branchId;
    if (!latestByBranch.has(branchId)) {
      latestByBranch.set(branchId, {
        ...data,
        id: doc.id,
        assessedAt: data.assessedAt?.toDate() || new Date(),
        createdAt: data.createdAt?.toDate() || new Date(),
      } as HumanRiskAssessment);
    }
  });

  return Array.from(latestByBranch.values()).map((a) => ({
    branchId: a.branchId,
    branchName: a.branchName,
    totalScore: a.totalScore,
    riskLevel: a.riskLevel,
    mainFactorTitles: a.mainFactors.map((f) => f.title),
    trend: a.scores[0]?.trend || 'stable',
    assessedAt: a.assessedAt.toISOString(),
  }));
}

/**
 * 評価詳細を取得
 */
export async function getAssessment(
  assessmentId: string
): Promise<HumanRiskAssessment | null> {
  const doc = await getAdminDb()
    .collection(ASSESSMENTS_COLLECTION)
    .doc(assessmentId)
    .get();

  if (!doc.exists) return null;

  const data = doc.data()!;
  return {
    ...data,
    id: doc.id,
    assessedAt: data.assessedAt?.toDate() || new Date(),
    createdAt: data.createdAt?.toDate() || new Date(),
  } as HumanRiskAssessment;
}

/**
 * 拠点の最新評価を取得
 */
export async function getLatestAssessmentForBranch(
  tenantId: string,
  branchId: string
): Promise<HumanRiskAssessment | null> {
  const snapshot = await getAdminDb()
    .collection(ASSESSMENTS_COLLECTION)
    .where('tenantId', '==', tenantId)
    .where('branchId', '==', branchId)
    .orderBy('assessedAt', 'desc')
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  const data = doc.data();
  return {
    ...data,
    id: doc.id,
    assessedAt: data.assessedAt?.toDate() || new Date(),
    createdAt: data.createdAt?.toDate() || new Date(),
  } as HumanRiskAssessment;
}

/**
 * アラート一覧を取得
 */
export async function getRiskAlerts(
  tenantId: string,
  options: { status?: 'unread' | 'read' | 'acknowledged'; limit?: number } = {}
): Promise<{ alerts: HumanRiskAlert[]; unreadCount: number }> {
  const { status, limit = 20 } = options;

  let queryRef: FirebaseFirestore.Query = getAdminDb()
    .collection(ALERTS_COLLECTION)
    .where('tenantId', '==', tenantId);

  if (status) {
    queryRef = queryRef.where('status', '==', status);
  }

  queryRef = queryRef.orderBy('createdAt', 'desc').limit(limit);

  const snapshot = await queryRef.get();

  // 未読カウント
  const unreadSnapshot = await getAdminDb()
    .collection(ALERTS_COLLECTION)
    .where('tenantId', '==', tenantId)
    .where('status', '==', 'unread')
    .count()
    .get();

  const alerts: HumanRiskAlert[] = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      ...data,
      id: doc.id,
      createdAt: data.createdAt?.toDate() || new Date(),
      readAt: data.readAt?.toDate(),
      acknowledgedAt: data.acknowledgedAt?.toDate(),
    } as HumanRiskAlert;
  });

  return { alerts, unreadCount: unreadSnapshot.data().count };
}

/**
 * アラートを確認済みにする
 */
export async function acknowledgeAlert(
  alertId: string,
  acknowledgedBy: string
): Promise<void> {
  await getAdminDb()
    .collection(ALERTS_COLLECTION)
    .doc(alertId)
    .update({
      status: 'acknowledged',
      acknowledgedAt: new Date(),
      acknowledgedBy,
    });
}
