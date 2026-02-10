// ======== LINE WORKS Admin API クライアント ========
// Service Account認証でユーザー行動データを取得

import { SignJWT, importPKCS8 } from 'jose';
import { getAdminDb } from './firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { toDate } from './date';
import type { BehaviorMetrics } from '@/types/request-engine';

const DEFAULT_TENANT_ID = 'defaultTenant';

// LINE WORKS API v2 Base URL
const LW_API_BASE = 'https://www.worksapis.com/v1.0';
const LW_AUTH_URL = 'https://auth.worksmobile.com/oauth2/v2.0/token';

// 環境変数
const LW_CLIENT_ID = process.env.LINEWORKS_CLIENT_ID || '';
const LW_CLIENT_SECRET = process.env.LINEWORKS_CLIENT_SECRET || '';
const LW_SERVICE_ACCOUNT = process.env.LINEWORKS_SERVICE_ACCOUNT || '';
const LW_PRIVATE_KEY = process.env.LINEWORKS_PRIVATE_KEY || '';
const LW_DOMAIN_ID = process.env.LINEWORKS_DOMAIN_ID || '';

// ======== 認証 ========

let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * LINE WORKS Admin API設定が有効か
 */
export function isLineWorksAdminConfigured(): boolean {
  return !!(LW_CLIENT_ID && LW_CLIENT_SECRET && LW_SERVICE_ACCOUNT && LW_PRIVATE_KEY);
}

/**
 * Service Account JWTを生成
 */
async function generateJWT(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const privateKey = await importPKCS8(
    LW_PRIVATE_KEY.replace(/\\n/g, '\n'),
    'RS256'
  );

  return new SignJWT({
    iss: LW_CLIENT_ID,
    sub: LW_SERVICE_ACCOUNT,
    iat: now,
    exp: now + 3600, // 1時間
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .sign(privateKey);
}

/**
 * アクセストークンを取得（キャッシュ対応）
 */
async function getAccessToken(): Promise<string> {
  // キャッシュが有効ならそのまま返す
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
    return cachedToken.token;
  }

  const jwt = await generateJWT();

  const response = await fetch(LW_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      assertion: jwt,
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      client_id: LW_CLIENT_ID,
      client_secret: LW_CLIENT_SECRET,
      scope: 'bot audit.read user.read',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LINE WORKS token error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000),
  };

  return cachedToken.token;
}

/**
 * LINE WORKS APIにリクエスト
 */
async function lwApiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const token = await getAccessToken();

  const response = await fetch(`${LW_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LINE WORKS API error: ${response.status} ${errorText}`);
  }

  return response.json();
}

// ======== ユーザー一覧 ========

interface LwUser {
  userId: string;
  userName: { lastName: string; firstName: string };
  email?: string;
  orgUnits?: { orgUnitId: string; orgUnitName: string }[];
}

/**
 * LINE WORKSユーザー一覧を取得
 */
export async function getLineWorksUsers(): Promise<LwUser[]> {
  const users: LwUser[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({ count: '100' });
    if (cursor) params.set('cursor', cursor);

    const data = await lwApiFetch<{
      users: LwUser[];
      responseMetaData?: { nextCursor?: string };
    }>(`/users?${params}`);

    users.push(...(data.users || []));
    cursor = data.responseMetaData?.nextCursor;
  } while (cursor);

  return users;
}

// ======== 監査ログ（メッセージ活動データ） ========

interface AuditLogEntry {
  eventId: string;
  eventTime: string; // ISO8601
  userId: string;
  userName?: string;
  eventCategory: string; // message, read, reaction
  eventType: string;
  details?: Record<string, unknown>;
}

interface AuditLogResponse {
  auditLogs: AuditLogEntry[];
  responseMetaData?: { nextCursor?: string };
}

/**
 * 監査ログを取得（ページネーション対応）
 */
export async function getAuditLogs(
  startTime: Date,
  endTime: Date,
  eventCategory?: string
): Promise<AuditLogEntry[]> {
  const logs: AuditLogEntry[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      count: '1000',
    });
    if (eventCategory) params.set('eventCategory', eventCategory);
    if (cursor) params.set('cursor', cursor);

    const data = await lwApiFetch<AuditLogResponse>(
      `/audit/logs?${params}`
    );

    logs.push(...(data.auditLogs || []));
    cursor = data.responseMetaData?.nextCursor;
  } while (cursor);

  return logs;
}

// ======== メッセージメタデータ収集・集計 ========

interface MessageActivity {
  userId: string;
  timestamp: Date;
  type: 'send' | 'read' | 'reaction';
  channelId?: string;
  replyToMessageId?: string;
  replyTimeSec?: number;
}

/**
 * 監査ログからメッセージアクティビティを抽出
 */
function extractMessageActivities(logs: AuditLogEntry[]): MessageActivity[] {
  return logs
    .map((log): MessageActivity | null => {
      const timestamp = new Date(log.eventTime);

      if (log.eventCategory === 'message' && log.eventType === 'send') {
        return {
          userId: log.userId,
          timestamp,
          type: 'send',
          channelId: log.details?.channelId as string,
          replyToMessageId: log.details?.replyToMessageId as string,
        };
      }

      if (log.eventCategory === 'message' && log.eventType === 'read') {
        return {
          userId: log.userId,
          timestamp,
          type: 'read',
          channelId: log.details?.channelId as string,
        };
      }

      if (log.eventCategory === 'reaction') {
        return {
          userId: log.userId,
          timestamp,
          type: 'reaction',
        };
      }

      return null;
    })
    .filter((a): a is MessageActivity => a !== null);
}

/**
 * ユーザーごとの行動メトリクスを計算
 */
export function calculateUserMetrics(
  userId: string,
  activities: MessageActivity[],
  periodDays: number
): BehaviorMetrics {
  const userActivities = activities.filter((a) => a.userId === userId);
  const sends = userActivities.filter((a) => a.type === 'send');
  const reads = userActivities.filter((a) => a.type === 'read');
  const reactions = userActivities.filter((a) => a.type === 'reaction');

  // 投稿頻度（1日あたり）
  const postingFrequencyPerDay = periodDays > 0
    ? sends.length / periodDays
    : 0;

  // 夜間活動率（22:00-06:00 JST）
  const nightActivities = userActivities.filter((a) => {
    const hour = new Date(a.timestamp.getTime() + 9 * 3600000).getHours(); // JST
    return hour >= 22 || hour < 6;
  });
  const nightActivityRatio = userActivities.length > 0
    ? nightActivities.length / userActivities.length
    : 0;

  // 平均返信時間（返信先があるメッセージのみ）
  // 返信のreplyTimeSec が設定されていれば使う、なければ推定
  const replyTimes = sends
    .filter((s) => s.replyToMessageId)
    .map((s) => s.replyTimeSec || 0)
    .filter((t) => t > 0);
  const avgResponseTimeMinutes = replyTimes.length > 0
    ? (replyTimes.reduce((sum, t) => sum + t, 0) / replyTimes.length) / 60
    : 60; // デフォルト60分

  // 平均既読時間（秒→分に変換）
  // 現状は読みメッセージ数から推定
  const avgReadTimeMinutes = reads.length > 0 ? 15 : 30; // 既読が多いなら早い

  // リアクション減少率
  // 前半と後半で比較
  const halfPoint = new Date(
    activities[0]?.timestamp.getTime() +
    (activities[activities.length - 1]?.timestamp.getTime() - activities[0]?.timestamp.getTime()) / 2
  );
  const firstHalfReactions = reactions.filter((r) => r.timestamp < halfPoint).length;
  const secondHalfReactions = reactions.filter((r) => r.timestamp >= halfPoint).length;
  const reactionDeclineRatio = firstHalfReactions > 0
    ? Math.max(0, (firstHalfReactions - secondHalfReactions) / firstHalfReactions)
    : 0;

  // 最終アクティブ日時
  const lastActiveAt = userActivities.length > 0
    ? new Date(Math.max(...userActivities.map((a) => a.timestamp.getTime())))
    : new Date();

  return {
    avgResponseTimeMinutes,
    avgReadTimeMinutes,
    postingFrequencyPerDay,
    nightActivityRatio,
    reactionDeclineRatio,
    lastActiveAt,
  };
}

// ======== Firestoreベースの収集（Webhook受信データから集計） ========

/**
 * lwMessagesコレクションからユーザーアクティビティを集計
 * (Admin APIが利用できない場合のフォールバック)
 */
export async function collectMetricsFromFirestore(
  periodStart: Date,
  periodEnd: Date
): Promise<Map<string, BehaviorMetrics>> {
  const db = getAdminDb();
  const metricsMap = new Map<string, BehaviorMetrics>();

  // lwMessagesからメッセージデータを取得
  const messagesSnapshot = await db
    .collection('lwMessages')
    .where('receivedAt', '>=', periodStart)
    .where('receivedAt', '<=', periodEnd)
    .limit(5000)
    .get();

  if (messagesSnapshot.empty) {
    return metricsMap;
  }

  // ユーザーごとにメッセージを分類
  const userMessages = new Map<string, {
    sends: Date[];
    isNight: boolean[];
    replyTimeSecs: number[];
  }>();

  messagesSnapshot.docs.forEach((doc) => {
    const data = doc.data();
    const senderId = data.senderId;
    const receivedAt = toDate(data.receivedAt) || new Date();

    if (!userMessages.has(senderId)) {
      userMessages.set(senderId, { sends: [], isNight: [], replyTimeSecs: [] });
    }

    const userEntry = userMessages.get(senderId)!;
    userEntry.sends.push(receivedAt);

    // 夜間かどうか（JST 22:00-06:00）
    const jstHour = new Date(receivedAt.getTime() + 9 * 3600000).getHours();
    userEntry.isNight.push(jstHour >= 22 || jstHour < 6);
  });

  // lwMessageMetaからリプライ時間なども取得
  const metaSnapshot = await db
    .collection('lwMessageMeta')
    .where('timestamp', '>=', periodStart)
    .where('timestamp', '<=', periodEnd)
    .limit(5000)
    .get();

  metaSnapshot.docs.forEach((doc) => {
    const data = doc.data();
    const userId = data.userId;

    if (!userMessages.has(userId)) {
      userMessages.set(userId, { sends: [], isNight: [], replyTimeSecs: [] });
    }

    const userEntry = userMessages.get(userId)!;
    if (data.replyTimeSec && data.replyTimeSec > 0) {
      userEntry.replyTimeSecs.push(data.replyTimeSec);
    }
  });

  const periodDays = Math.max(1, (periodEnd.getTime() - periodStart.getTime()) / (24 * 3600 * 1000));

  // 各ユーザーのメトリクスを計算
  for (const [userId, data] of userMessages) {
    const avgResponseTimeMinutes = data.replyTimeSecs.length > 0
      ? (data.replyTimeSecs.reduce((sum, t) => sum + t, 0) / data.replyTimeSecs.length) / 60
      : 60;

    const nightCount = data.isNight.filter(Boolean).length;
    const nightActivityRatio = data.sends.length > 0
      ? nightCount / data.sends.length
      : 0;

    const postingFrequencyPerDay = data.sends.length / periodDays;

    // リアクション減少率: 前半vs後半の投稿数で近似
    const midpoint = new Date(
      periodStart.getTime() + (periodEnd.getTime() - periodStart.getTime()) / 2
    );
    const firstHalf = data.sends.filter((d) => d < midpoint).length;
    const secondHalf = data.sends.filter((d) => d >= midpoint).length;
    const reactionDeclineRatio = firstHalf > 0
      ? Math.max(0, (firstHalf - secondHalf) / firstHalf)
      : 0;

    const lastActiveAt = data.sends.length > 0
      ? new Date(Math.max(...data.sends.map((d) => d.getTime())))
      : new Date();

    metricsMap.set(userId, {
      avgResponseTimeMinutes,
      avgReadTimeMinutes: avgResponseTimeMinutes * 0.3, // 推定: 返信の30%程度
      postingFrequencyPerDay,
      nightActivityRatio,
      reactionDeclineRatio,
      lastActiveAt,
    });
  }

  return metricsMap;
}

// ======== Admin APIベースの収集 ========

/**
 * LINE WORKS Admin APIからメトリクスを収集
 */
export async function collectMetricsFromAdminApi(
  periodStart: Date,
  periodEnd: Date
): Promise<Map<string, BehaviorMetrics>> {
  const metricsMap = new Map<string, BehaviorMetrics>();

  // 監査ログを取得
  const logs = await getAuditLogs(periodStart, periodEnd);
  const activities = extractMessageActivities(logs);

  if (activities.length === 0) {
    return metricsMap;
  }

  // ユニークユーザーIDを抽出
  const userIds = [...new Set(activities.map((a) => a.userId))];
  const periodDays = Math.max(1, (periodEnd.getTime() - periodStart.getTime()) / (24 * 3600 * 1000));

  // 各ユーザーのメトリクスを計算
  for (const userId of userIds) {
    const metrics = calculateUserMetrics(userId, activities, periodDays);
    metricsMap.set(userId, metrics);
  }

  return metricsMap;
}

// ======== 統合メトリクス収集 ========

/**
 * 行動メトリクスを収集（Admin API → Firestore フォールバック）
 */
export async function collectBehaviorMetrics(
  periodStart: Date,
  periodEnd: Date
): Promise<Map<string, BehaviorMetrics>> {
  // Admin APIが設定されていればそちらを使う
  if (isLineWorksAdminConfigured()) {
    try {
      console.log('[LW Metrics] Using Admin API for metrics collection');
      return await collectMetricsFromAdminApi(periodStart, periodEnd);
    } catch (error) {
      console.error('[LW Metrics] Admin API failed, falling back to Firestore:', error);
    }
  }

  // Firestoreのwebhookデータからフォールバック
  console.log('[LW Metrics] Using Firestore webhook data for metrics collection');
  return await collectMetricsFromFirestore(periodStart, periodEnd);
}

/**
 * 収集結果をFirestoreに保存（履歴用）
 */
export async function saveMetricsSnapshot(
  metricsMap: Map<string, BehaviorMetrics>,
  periodStart: Date,
  periodEnd: Date,
  source: 'admin_api' | 'firestore_webhook' | 'mock'
): Promise<string> {
  const db = getAdminDb();

  const entries = Array.from(metricsMap.entries()).map(([userId, metrics]) => ({
    userId,
    ...metrics,
    lastActiveAt: metrics.lastActiveAt || new Date(),
  }));

  const docRef = await db.collection('behaviorMetricsSnapshots').add({
    tenantId: DEFAULT_TENANT_ID,
    source,
    periodStart,
    periodEnd,
    userCount: entries.length,
    entries,
    createdAt: FieldValue.serverTimestamp(),
  });

  return docRef.id;
}

/**
 * 直近のメトリクススナップショットを取得
 */
export async function getLatestMetricsSnapshot(): Promise<{
  id: string;
  source: string;
  periodStart: Date;
  periodEnd: Date;
  userCount: number;
  entries: (BehaviorMetrics & { userId: string })[];
  createdAt: Date;
} | null> {
  const db = getAdminDb();
  const snapshot = await db
    .collection('behaviorMetricsSnapshots')
    .where('tenantId', '==', DEFAULT_TENANT_ID)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  const data = doc.data();

  return {
    id: doc.id,
    source: data.source,
    periodStart: toDate(data.periodStart) || new Date(),
    periodEnd: toDate(data.periodEnd) || new Date(),
    userCount: data.userCount,
    entries: data.entries || [],
    createdAt: toDate(data.createdAt) || new Date(),
  };
}
