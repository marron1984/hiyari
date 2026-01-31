// ======== コンディション解析ライブラリ（サーバーサイド専用） ========
// LINE WORKS行動メトリクスからスタッフコンディションを分析

import { getAdminDb } from './firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { ConditionScore, BehaviorMetrics } from '@/types/request-engine';
import { toDate } from './date';

const DEFAULT_TENANT_ID = 'defaultTenant';

// LINE WORKS Bot API設定
const LINEWORKS_BOT_ID = process.env.LINEWORKS_BOT_ID;
const LINEWORKS_ACCESS_TOKEN = process.env.LINEWORKS_ACCESS_TOKEN;

// アラートしきい値
const ALERT_THRESHOLDS = {
  watch: 70,      // 注意
  warning: 50,    // 警告
  critical: 30,   // 危険
};

// スコア重み付け
const SCORE_WEIGHTS = {
  responseTime: 0.25,      // 返信速度
  readTime: 0.15,          // 既読速度
  postingFrequency: 0.20,  // 投稿頻度
  nightActivity: 0.15,     // 夜間活動（多いと減点）
  reactionDecline: 0.25,   // リアクション減少
};

/**
 * 行動メトリクスからコンディションスコアを計算
 */
export function calculateConditionScore(metrics: BehaviorMetrics): number {
  // 各指標を0-100にスケーリング

  // 返信速度スコア（30分以内が100点、3時間以上が0点）
  const responseTimeScore = Math.max(0, Math.min(100,
    100 - (metrics.avgResponseTimeMinutes - 30) / 1.5
  ));

  // 既読速度スコア（15分以内が100点、2時間以上が0点）
  const readTimeScore = Math.max(0, Math.min(100,
    100 - (metrics.avgReadTimeMinutes - 15)
  ));

  // 投稿頻度スコア（1日5回が100点、0回が0点）
  const postingScore = Math.min(100, metrics.postingFrequencyPerDay * 20);

  // 夜間活動スコア（0%が100点、30%以上が0点）
  const nightScore = Math.max(0, 100 - metrics.nightActivityRatio * 333);

  // リアクション減少スコア（0%が100点、50%以上が0点）
  const reactionScore = Math.max(0, 100 - metrics.reactionDeclineRatio * 200);

  // 重み付け平均
  const totalScore =
    responseTimeScore * SCORE_WEIGHTS.responseTime +
    readTimeScore * SCORE_WEIGHTS.readTime +
    postingScore * SCORE_WEIGHTS.postingFrequency +
    nightScore * SCORE_WEIGHTS.nightActivity +
    reactionScore * SCORE_WEIGHTS.reactionDecline;

  return Math.round(totalScore);
}

/**
 * アラートレベルを判定
 */
export function determineAlertLevel(score: number): 'none' | 'watch' | 'warning' | 'critical' {
  if (score <= ALERT_THRESHOLDS.critical) return 'critical';
  if (score <= ALERT_THRESHOLDS.warning) return 'warning';
  if (score <= ALERT_THRESHOLDS.watch) return 'watch';
  return 'none';
}

/**
 * トレンドを判定
 */
export function determineTrend(current: number, previous: number): 'up' | 'down' | 'stable' {
  const diff = current - previous;
  if (diff >= 5) return 'up';
  if (diff <= -5) return 'down';
  return 'stable';
}

/**
 * コンディションスコアを保存
 */
export async function saveConditionScore(
  userId: string,
  userName: string,
  metrics: BehaviorMetrics,
  periodStart: Date,
  periodEnd: Date
): Promise<ConditionScore> {
  const score = calculateConditionScore(metrics);

  // 前回のスコアを取得（インデックス不要のクエリに変更）
  const previousSnapshot = await getAdminDb()
    .collection('conditionScores')
    .where('userId', '==', userId)
    .limit(10)
    .get();

  // クライアントサイドでソート
  const previousDocs = previousSnapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .sort((a: any, b: any) => {
      const aTime = a.calculatedAt?.toDate?.()?.getTime() || 0;
      const bTime = b.calculatedAt?.toDate?.()?.getTime() || 0;
      return bTime - aTime;
    });

  const previousScore = previousDocs.length > 0
    ? (previousDocs[0] as { score?: number }).score || score
    : score;

  const alertLevel = determineAlertLevel(score);
  const trend = determineTrend(score, previousScore);

  const conditionData = {
    tenantId: DEFAULT_TENANT_ID,
    userId,
    userName,
    score,
    previousScore,
    trend,
    metrics,
    alertLevel,
    alertTriggeredAt: alertLevel !== 'none' ? FieldValue.serverTimestamp() : null,
    taskDistributed: false,
    loadReduced: false,
    yoshidaNotified: false,
    calculatedAt: FieldValue.serverTimestamp(),
    periodStart,
    periodEnd,
  };

  const docRef = await getAdminDb().collection('conditionScores').add(conditionData);

  return {
    id: docRef.id,
    tenantId: DEFAULT_TENANT_ID,
    userId,
    userName,
    score,
    previousScore,
    trend,
    metrics,
    alertLevel,
    alertTriggeredAt: alertLevel !== 'none' ? new Date() : undefined,
    taskDistributed: false,
    loadReduced: false,
    yoshidaNotified: false,
    calculatedAt: new Date(),
    periodStart,
    periodEnd,
  };
}

/**
 * アラートが必要なスタッフ一覧を取得
 */
export async function getAlertedStaff(limitCount: number = 20): Promise<ConditionScore[]> {
  // インデックス不要のクエリに変更
  const snapshot = await getAdminDb()
    .collection('conditionScores')
    .where('tenantId', '==', DEFAULT_TENANT_ID)
    .limit(200)
    .get();

  // クライアントサイドでソートとフィルタリング
  return snapshot.docs
    .map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        tenantId: data.tenantId,
        userId: data.userId,
        userName: data.userName,
        score: data.score,
        previousScore: data.previousScore,
        trend: data.trend,
        metrics: data.metrics,
        alertLevel: data.alertLevel,
        alertTriggeredAt: toDate(data.alertTriggeredAt) ?? undefined,
        taskDistributed: data.taskDistributed,
        loadReduced: data.loadReduced,
        yoshidaNotified: data.yoshidaNotified,
        calculatedAt: toDate(data.calculatedAt) || new Date(),
        periodStart: toDate(data.periodStart) || new Date(),
        periodEnd: toDate(data.periodEnd) || new Date(),
      } as ConditionScore;
    })
    .sort((a, b) => b.calculatedAt.getTime() - a.calculatedAt.getTime())
    .filter(s => ['watch', 'warning', 'critical'].includes(s.alertLevel))
    .slice(0, limitCount);
}

/**
 * 最新のコンディションスコア一覧を取得
 */
export async function getLatestConditionScores(limitCount: number = 50): Promise<ConditionScore[]> {
  // 各ユーザーの最新スコアを取得するため、まず全員分を取得してユーザーごとに最新を選択
  // インデックス不要のクエリに変更
  const snapshot = await getAdminDb()
    .collection('conditionScores')
    .where('tenantId', '==', DEFAULT_TENANT_ID)
    .limit(500)
    .get();

  const userScores = new Map<string, ConditionScore>();

  // まずcalculatedAt順にソート
  const sortedDocs = snapshot.docs
    .map(doc => ({ doc, data: doc.data() }))
    .sort((a, b) => {
      const aTime = toDate(a.data.calculatedAt)?.getTime() || 0;
      const bTime = toDate(b.data.calculatedAt)?.getTime() || 0;
      return bTime - aTime; // 降順
    });

  sortedDocs.forEach(({ doc, data }) => {
    if (!userScores.has(data.userId)) {
      userScores.set(data.userId, {
        id: doc.id,
        tenantId: data.tenantId,
        userId: data.userId,
        userName: data.userName,
        score: data.score,
        previousScore: data.previousScore,
        trend: data.trend,
        metrics: data.metrics,
        alertLevel: data.alertLevel,
        alertTriggeredAt: toDate(data.alertTriggeredAt) ?? undefined,
        taskDistributed: data.taskDistributed,
        loadReduced: data.loadReduced,
        yoshidaNotified: data.yoshidaNotified,
        calculatedAt: toDate(data.calculatedAt) || new Date(),
        periodStart: toDate(data.periodStart) || new Date(),
        periodEnd: toDate(data.periodEnd) || new Date(),
      } as ConditionScore);
    }
  });

  return Array.from(userScores.values())
    .sort((a, b) => a.score - b.score) // スコアが低い順
    .slice(0, limitCount);
}

/**
 * LINE WORKSでユーザーにメッセージを送信
 */
export async function sendLineWorksDirectMessage(
  userId: string,
  message: string
): Promise<boolean> {
  if (!LINEWORKS_ACCESS_TOKEN || !LINEWORKS_BOT_ID) {
    console.warn('LINE WORKS credentials not configured');
    return false;
  }

  try {
    const response = await fetch(
      `https://www.worksapis.com/v1.0/bots/${LINEWORKS_BOT_ID}/users/${userId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LINEWORKS_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: {
            type: 'text',
            text: message,
          },
        }),
      }
    );

    return response.ok;
  } catch (error) {
    console.error('LINE WORKS direct message error:', error);
    return false;
  }
}

/**
 * 吉田に通知を送信
 */
export async function notifyYoshidaAboutCondition(
  conditionScore: ConditionScore
): Promise<boolean> {
  // 環境変数から吉田のLINE WORKS IDを取得
  const yoshidaLineWorksId = process.env.YOSHIDA_LINEWORKS_USER_ID;
  if (!yoshidaLineWorksId) {
    console.warn('Yoshida LINE WORKS ID not configured');
    return false;
  }

  const alertLabels = {
    watch: '注意',
    warning: '警告',
    critical: '危険',
    none: '正常',
  };

  const trendLabels = {
    up: '↗上昇',
    down: '↘下降',
    stable: '→横ばい',
  };

  const message = `【スタッフコンディションアラート】

${conditionScore.userName}さんのコンディションスコアが低下しています。

■ 現在のスコア: ${conditionScore.score}点（${alertLabels[conditionScore.alertLevel]}）
■ 前回比: ${trendLabels[conditionScore.trend]}
■ 前回スコア: ${conditionScore.previousScore}点

▼ 詳細メトリクス
・平均返信時間: ${conditionScore.metrics.avgResponseTimeMinutes.toFixed(0)}分
・平均既読時間: ${conditionScore.metrics.avgReadTimeMinutes.toFixed(0)}分
・投稿頻度: ${conditionScore.metrics.postingFrequencyPerDay.toFixed(1)}回/日
・夜間活動率: ${(conditionScore.metrics.nightActivityRatio * 100).toFixed(0)}%
・リアクション減少率: ${(conditionScore.metrics.reactionDeclineRatio * 100).toFixed(0)}%

※ 必要に応じて面談やタスク調整をご検討ください。
AA-HUBで詳細を確認: ${process.env.NEXT_PUBLIC_APP_URL || 'https://aahub.aska-g.com'}/admin/ai-vp/condition`;

  const success = await sendLineWorksDirectMessage(yoshidaLineWorksId, message);

  if (success) {
    // 通知済みフラグを更新
    await getAdminDb()
      .collection('conditionScores')
      .doc(conditionScore.id)
      .update({
        yoshidaNotified: true,
        yoshidaNotifiedAt: FieldValue.serverTimestamp(),
      });
  }

  return success;
}

/**
 * コンディションスコアのサマリー統計を取得
 */
export async function getConditionSummary(): Promise<{
  totalStaff: number;
  healthyCount: number;
  watchCount: number;
  warningCount: number;
  criticalCount: number;
  averageScore: number;
}> {
  const scores = await getLatestConditionScores(200);

  const summary = {
    totalStaff: scores.length,
    healthyCount: 0,
    watchCount: 0,
    warningCount: 0,
    criticalCount: 0,
    averageScore: 0,
  };

  let totalScore = 0;
  scores.forEach(s => {
    totalScore += s.score;
    switch (s.alertLevel) {
      case 'none':
        summary.healthyCount++;
        break;
      case 'watch':
        summary.watchCount++;
        break;
      case 'warning':
        summary.warningCount++;
        break;
      case 'critical':
        summary.criticalCount++;
        break;
    }
  });

  summary.averageScore = scores.length > 0 ? Math.round(totalScore / scores.length) : 0;

  return summary;
}

/**
 * モック行動データを生成（開発用）
 */
export function generateMockBehaviorMetrics(): BehaviorMetrics {
  return {
    avgResponseTimeMinutes: 30 + Math.random() * 120,
    avgReadTimeMinutes: 10 + Math.random() * 60,
    postingFrequencyPerDay: Math.random() * 8,
    nightActivityRatio: Math.random() * 0.3,
    reactionDeclineRatio: Math.random() * 0.4,
    lastActiveAt: new Date(),
  };
}
