// ======== AI副社長・組織温度レポート生成ロジック ========

import { getAdminDb } from './firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import Anthropic from '@anthropic-ai/sdk';
import {
  LwMessageMeta,
  UserWeeklyMetrics,
  BaseWeeklyMetrics,
  MetricStats,
  WeeklyStats,
  OrganizationHealthReport,
  OrganizationHealthInput,
} from '@/types/organization-health';
import { toDate } from './date';
import { BRANCHES_SEED } from '@/data/employees';

const LW_MESSAGE_META_COLLECTION = 'lwMessageMeta';
const ORG_HEALTH_REPORT_COLLECTION = 'organizationHealthReports';
const DEFAULT_TENANT_ID = 'defaultTenant';

// ======== ユーティリティ ========

/**
 * ISO週番号を取得（YYYY-WW形式）
 */
function getISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * 週の開始日（月曜日）を取得
 */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * 週の終了日（日曜日）を取得
 */
function getWeekEnd(date: Date): Date {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

/**
 * 標準偏差を計算
 */
function calculateStats(values: number[]): MetricStats {
  if (values.length === 0) {
    return { mean: 0, stdDev: 0, sigma1: 0, sigma2: 0 };
  }

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  return {
    mean: Math.round(mean * 100) / 100,
    stdDev: Math.round(stdDev * 100) / 100,
    sigma1: Math.round((mean + stdDev) * 100) / 100,
    sigma2: Math.round((mean + 2 * stdDev) * 100) / 100,
  };
}

// ======== データ取得 ========

/**
 * 指定期間のメッセージメタデータを取得
 */
async function getMessageMeta(
  tenantId: string,
  startDate: Date,
  endDate: Date
): Promise<LwMessageMeta[]> {
  const db = getAdminDb();

  const snapshot = await db
    .collection(LW_MESSAGE_META_COLLECTION)
    .where('tenantId', '==', tenantId)
    .where('timestamp', '>=', Timestamp.fromDate(startDate))
    .where('timestamp', '<=', Timestamp.fromDate(endDate))
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      tenantId: data.tenantId,
      userId: data.userId,
      userName: data.userName,
      baseId: data.baseId,
      timestamp: toDate(data.timestamp) || new Date(),
      messageLength: data.messageLength || 0,
      replyTimeSec: data.replyTimeSec || 0,
      isNight: data.isNight || false,
      negativeWordRate: data.negativeWordRate || 0,
      reactionCount: data.reactionCount || 0,
    };
  });
}

// ======== 集計 ========

/**
 * ユーザー別の週次メトリクスを計算
 */
function calculateUserMetrics(
  messages: LwMessageMeta[],
  stats: WeeklyStats,
  baseNames: Map<string, string>
): UserWeeklyMetrics[] {
  // ユーザーごとにグループ化
  const userGroups = new Map<string, LwMessageMeta[]>();
  messages.forEach((msg) => {
    const list = userGroups.get(msg.userId) || [];
    list.push(msg);
    userGroups.set(msg.userId, list);
  });

  const userMetrics: UserWeeklyMetrics[] = [];

  userGroups.forEach((msgs, userId) => {
    if (msgs.length === 0) return;

    const firstMsg = msgs[0];
    const messageCount = msgs.length;
    const avgMessageLength = msgs.reduce((sum, m) => sum + m.messageLength, 0) / messageCount;
    const avgReplyTimeSec = msgs.reduce((sum, m) => sum + m.replyTimeSec, 0) / messageCount;
    const nightMessages = msgs.filter((m) => m.isNight).length;
    const nightMessageRate = nightMessages / messageCount;
    const avgNegativeWordRate = msgs.reduce((sum, m) => sum + m.negativeWordRate, 0) / messageCount;
    const avgReactionCount = msgs.reduce((sum, m) => sum + m.reactionCount, 0) / messageCount;

    // アラート判定
    const alertReasons: string[] = [];
    let alertLevel: 'normal' | 'attention' | 'warning' = 'normal';

    // 返信時間が+2σ以上 → warning
    if (avgReplyTimeSec >= stats.replyTimeSec.sigma2) {
      alertReasons.push('返信時間が通常より長い可能性');
      alertLevel = 'warning';
    } else if (avgReplyTimeSec >= stats.replyTimeSec.sigma1) {
      alertReasons.push('返信時間がやや長め');
      if (alertLevel === 'normal') alertLevel = 'attention';
    }

    // 夜間メッセージ率が+2σ以上 → warning
    if (nightMessageRate >= stats.nightMessageRate.sigma2) {
      alertReasons.push('夜間活動が多い可能性');
      alertLevel = 'warning';
    } else if (nightMessageRate >= stats.nightMessageRate.sigma1) {
      alertReasons.push('夜間活動がやや多め');
      if (alertLevel === 'normal') alertLevel = 'attention';
    }

    // 複数指標で+1σ以上 → warning
    if (alertLevel === 'attention' && alertReasons.length >= 2) {
      alertLevel = 'warning';
    }

    userMetrics.push({
      userId,
      userName: firstMsg.userName,
      baseId: firstMsg.baseId,
      baseName: baseNames.get(firstMsg.baseId) || firstMsg.baseId,
      messageCount,
      avgMessageLength: Math.round(avgMessageLength),
      avgReplyTimeSec: Math.round(avgReplyTimeSec),
      nightMessageRate: Math.round(nightMessageRate * 100) / 100,
      avgNegativeWordRate: Math.round(avgNegativeWordRate * 100) / 100,
      avgReactionCount: Math.round(avgReactionCount * 10) / 10,
      diffVs4WeekAvg: {
        messageCount: 0, // 後で計算
        avgReplyTimeSec: 0,
        nightMessageRate: 0,
        avgNegativeWordRate: 0,
      },
      alertLevel,
      alertReasons,
    });
  });

  return userMetrics;
}

/**
 * 拠点別の週次メトリクスを計算
 */
function calculateBaseMetrics(
  messages: LwMessageMeta[],
  baseNames: Map<string, string>
): BaseWeeklyMetrics[] {
  // 拠点ごとにグループ化
  const baseGroups = new Map<string, LwMessageMeta[]>();
  messages.forEach((msg) => {
    const list = baseGroups.get(msg.baseId) || [];
    list.push(msg);
    baseGroups.set(msg.baseId, list);
  });

  const baseMetrics: BaseWeeklyMetrics[] = [];

  baseGroups.forEach((msgs, baseId) => {
    if (msgs.length === 0) return;

    const totalMessages = msgs.length;
    const avgMessageLength = msgs.reduce((sum, m) => sum + m.messageLength, 0) / totalMessages;
    const avgReplyTimeSec = msgs.reduce((sum, m) => sum + m.replyTimeSec, 0) / totalMessages;
    const nightMessages = msgs.filter((m) => m.isNight).length;
    const nightMessageRate = nightMessages / totalMessages;
    const avgNegativeWordRate = msgs.reduce((sum, m) => sum + m.negativeWordRate, 0) / totalMessages;
    const avgReactionCount = msgs.reduce((sum, m) => sum + m.reactionCount, 0) / totalMessages;

    // ユニークユーザー数
    const uniqueUsers = new Set(msgs.map((m) => m.userId));

    baseMetrics.push({
      baseId,
      baseName: baseNames.get(baseId) || baseId,
      totalMessages,
      avgMessageLength: Math.round(avgMessageLength),
      avgReplyTimeSec: Math.round(avgReplyTimeSec),
      nightMessageRate: Math.round(nightMessageRate * 100) / 100,
      avgNegativeWordRate: Math.round(avgNegativeWordRate * 100) / 100,
      avgReactionCount: Math.round(avgReactionCount * 10) / 10,
      activeUserCount: uniqueUsers.size,
      alertLevel: 'normal',
    });
  });

  return baseMetrics;
}

// ======== AI レポート生成 ========

/**
 * AI用のプロンプトを生成
 */
function buildAiPrompt(input: OrganizationHealthInput): string {
  const attentionUsers = input.users
    .filter((u) => u.alertLevel !== 'normal')
    .slice(0, 3);

  return `あなたはAI副社長として、組織の健康状態を分析し「温度レポート」を作成します。

【重要ルール】
- 断定禁止（「〜に違いない」「〜だ」は使わない）
- 感情評価禁止（「ストレスを感じている」「疲れている」は使わない）
- 「〜の可能性があります」「〜かもしれません」を使う
- 最大3件まで表示
- 実名は社内限定（このレポートは社内閲覧のみ）

【レポート期間】
${input.period}

【拠点別サマリー】
${input.bases.map((b) => `- ${b.baseName}: ${b.metrics.totalMessages}件, 夜間率${Math.round(b.metrics.nightMessageRate * 100)}%, アクティブ${b.metrics.activeUserCount}名`).join('\n')}

【注意が必要なユーザー】
${attentionUsers.length === 0 ? '特になし' : attentionUsers.map((u) => `- ${u.userName || u.userId}: ${u.alertReasons.join(', ')}`).join('\n')}

【統計情報】
- 返信時間: 平均${input.stats.replyTimeSec.mean}秒, +1σ=${input.stats.replyTimeSec.sigma1}秒
- 夜間率: 平均${Math.round(input.stats.nightMessageRate.mean * 100)}%, +1σ=${Math.round(input.stats.nightMessageRate.sigma1 * 100)}%

【出力フォーマット】
以下のJSON形式で出力してください:
{
  "summary": "全体サマリー（1-2文、断定禁止）",
  "observations": ["観察点1", "観察点2", "観察点3"],
  "recommendations": ["確認ポイント1", "確認ポイント2", "確認ポイント3"]
}

注意が必要なユーザーがいない場合:
{
  "summary": "今週は特に気になるパターンは検出されませんでした。",
  "observations": [],
  "recommendations": []
}`;
}

/**
 * AIでレポートを生成
 */
async function generateAiReport(input: OrganizationHealthInput): Promise<{
  summary: string;
  observations: string[];
  recommendations: string[];
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return {
      summary: 'AI APIキーが設定されていないためレポートを生成できませんでした。',
      observations: [],
      recommendations: [],
    };
  }

  const client = new Anthropic({ apiKey });
  const prompt = buildAiPrompt(input);

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const rawResponse = message.content[0].type === 'text' ? message.content[0].text : '';
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          summary: parsed.summary || '',
          observations: (parsed.observations || []).slice(0, 3),
          recommendations: (parsed.recommendations || []).slice(0, 3),
        };
      } catch {
        console.error('Failed to parse AI response JSON');
      }
    }

    return {
      summary: rawResponse,
      observations: [],
      recommendations: [],
    };
  } catch (error) {
    console.error('AI API error:', error);
    return {
      summary: 'AIレポート生成中にエラーが発生しました。',
      observations: [],
      recommendations: [],
    };
  }
}

// ======== メイン処理 ========

/**
 * 週次組織温度レポートを生成
 */
export async function generateOrganizationHealthReport(
  targetDate?: Date,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<OrganizationHealthReport> {
  const db = getAdminDb();

  // 対象週（デフォルトは先週）
  const now = targetDate || new Date();
  const lastWeek = new Date(now);
  lastWeek.setDate(lastWeek.getDate() - 7);

  const periodStart = getWeekStart(lastWeek);
  const periodEnd = getWeekEnd(lastWeek);
  const period = getISOWeek(periodStart);

  // 拠点名マップ
  const baseNames = new Map(BRANCHES_SEED.map((b) => [b.id, b.name]));

  // 今週のメッセージを取得
  const messages = await getMessageMeta(tenantId, periodStart, periodEnd);

  // 統計情報を計算
  const replyTimes = messages.map((m) => m.replyTimeSec);
  const nightRates = messages.map((m) => (m.isNight ? 1 : 0));
  const negativeRates = messages.map((m) => m.negativeWordRate);
  const messageCounts: number[] = [];

  const userCounts = new Map<string, number>();
  messages.forEach((m) => {
    userCounts.set(m.userId, (userCounts.get(m.userId) || 0) + 1);
  });
  userCounts.forEach((count) => messageCounts.push(count));

  const stats: WeeklyStats = {
    replyTimeSec: calculateStats(replyTimes),
    nightMessageRate: calculateStats(nightRates),
    negativeWordRate: calculateStats(negativeRates),
    messageCount: calculateStats(messageCounts),
  };

  // ユーザー・拠点メトリクスを計算
  const userMetrics = calculateUserMetrics(messages, stats, baseNames);
  const baseMetrics = calculateBaseMetrics(messages, baseNames);

  // 注意が必要なユーザー（最大3人）
  const attentionUsers = userMetrics
    .filter((u) => u.alertLevel !== 'normal')
    .sort((a, b) => {
      if (a.alertLevel === 'warning' && b.alertLevel !== 'warning') return -1;
      if (a.alertLevel !== 'warning' && b.alertLevel === 'warning') return 1;
      return b.alertReasons.length - a.alertReasons.length;
    })
    .slice(0, 3);

  // 全体アラートレベル
  const warningCount = userMetrics.filter((u) => u.alertLevel === 'warning').length;
  const attentionCount = userMetrics.filter((u) => u.alertLevel === 'attention').length;

  let overallLevel: 'normal' | 'attention' | 'warning' = 'normal';
  if (warningCount >= 2) {
    overallLevel = 'warning';
  } else if (warningCount >= 1 || attentionCount >= 3) {
    overallLevel = 'attention';
  }

  // AI入力を構築
  const aiInput: OrganizationHealthInput = {
    period,
    users: userMetrics.map((u) => ({
      userId: u.userId,
      userName: u.userName,
      baseId: u.baseId,
      baseName: u.baseName,
      metrics: {
        messageCount: u.messageCount,
        avgMessageLength: u.avgMessageLength,
        avgReplyTimeSec: u.avgReplyTimeSec,
        nightMessageRate: u.nightMessageRate,
        avgNegativeWordRate: u.avgNegativeWordRate,
        avgReactionCount: u.avgReactionCount,
      },
      diffVs4WeekAvg: u.diffVs4WeekAvg,
      alertLevel: u.alertLevel,
      alertReasons: u.alertReasons,
    })),
    bases: baseMetrics.map((b) => ({
      baseId: b.baseId,
      baseName: b.baseName,
      metrics: {
        totalMessages: b.totalMessages,
        avgReplyTimeSec: b.avgReplyTimeSec,
        nightMessageRate: b.nightMessageRate,
        activeUserCount: b.activeUserCount,
      },
      alertLevel: b.alertLevel,
    })),
    stats,
  };

  // AIレポート生成
  const aiReport = await generateAiReport(aiInput);

  // レポートを構築
  const report: OrganizationHealthReport = {
    tenantId,
    period,
    periodStart,
    periodEnd,
    generatedAt: new Date(),
    overallLevel,
    totalUsers: userMetrics.length,
    totalMessages: messages.length,
    attentionUsers,
    baseMetrics,
    stats,
    aiReport,
    createdAt: new Date(),
  };

  // Firestoreに保存
  const docRef = await db.collection(ORG_HEALTH_REPORT_COLLECTION).add({
    ...report,
    periodStart: Timestamp.fromDate(periodStart),
    periodEnd: Timestamp.fromDate(periodEnd),
    generatedAt: Timestamp.now(),
    createdAt: Timestamp.now(),
  });

  report.id = docRef.id;

  return report;
}

/**
 * 最新のレポートを取得
 */
export async function getLatestOrganizationHealthReport(
  tenantId: string = DEFAULT_TENANT_ID
): Promise<OrganizationHealthReport | null> {
  const db = getAdminDb();

  const snapshot = await db
    .collection(ORG_HEALTH_REPORT_COLLECTION)
    .where('tenantId', '==', tenantId)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  const data = doc.data();

  return {
    id: doc.id,
    tenantId: data.tenantId,
    period: data.period,
    periodStart: toDate(data.periodStart) || new Date(),
    periodEnd: toDate(data.periodEnd) || new Date(),
    generatedAt: toDate(data.generatedAt) || new Date(),
    overallLevel: data.overallLevel,
    totalUsers: data.totalUsers,
    totalMessages: data.totalMessages,
    attentionUsers: data.attentionUsers || [],
    baseMetrics: data.baseMetrics || [],
    stats: data.stats,
    aiReport: data.aiReport || { summary: '', observations: [], recommendations: [] },
    createdAt: toDate(data.createdAt) ?? undefined,
  };
}

/**
 * 指定期間のレポートを取得
 */
export async function getOrganizationHealthReportByPeriod(
  period: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<OrganizationHealthReport | null> {
  const db = getAdminDb();

  const snapshot = await db
    .collection(ORG_HEALTH_REPORT_COLLECTION)
    .where('tenantId', '==', tenantId)
    .where('period', '==', period)
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  const data = doc.data();

  return {
    id: doc.id,
    tenantId: data.tenantId,
    period: data.period,
    periodStart: toDate(data.periodStart) || new Date(),
    periodEnd: toDate(data.periodEnd) || new Date(),
    generatedAt: toDate(data.generatedAt) || new Date(),
    overallLevel: data.overallLevel,
    totalUsers: data.totalUsers,
    totalMessages: data.totalMessages,
    attentionUsers: data.attentionUsers || [],
    baseMetrics: data.baseMetrics || [],
    stats: data.stats,
    aiReport: data.aiReport || { summary: '', observations: [], recommendations: [] },
    createdAt: toDate(data.createdAt) ?? undefined,
  };
}

/**
 * レポート履歴を取得
 */
export async function getOrganizationHealthReportHistory(
  limitCount: number = 10,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<OrganizationHealthReport[]> {
  const db = getAdminDb();

  const snapshot = await db
    .collection(ORG_HEALTH_REPORT_COLLECTION)
    .where('tenantId', '==', tenantId)
    .orderBy('createdAt', 'desc')
    .limit(limitCount)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      tenantId: data.tenantId,
      period: data.period,
      periodStart: toDate(data.periodStart) || new Date(),
      periodEnd: toDate(data.periodEnd) || new Date(),
      generatedAt: toDate(data.generatedAt) || new Date(),
      overallLevel: data.overallLevel,
      totalUsers: data.totalUsers,
      totalMessages: data.totalMessages,
      attentionUsers: data.attentionUsers || [],
      baseMetrics: data.baseMetrics || [],
      stats: data.stats,
      aiReport: data.aiReport || { summary: '', observations: [], recommendations: [] },
      createdAt: toDate(data.createdAt) ?? undefined,
    };
  });
}
