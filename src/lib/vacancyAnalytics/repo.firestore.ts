/**
 * 空室コンバージョン計測 Firestoreリポジトリ
 *
 * PROD: Cloud Firestore永続化
 *
 * コレクション:
 * - vacancy_inquiry_events: 計測イベント
 */

import { getAdminDb } from '../firebase-admin';
import type {
  VacancyInquiryEvent,
  VacancyInquiryEventType,
  RecordEventRequest,
  VacancyAnalyticsSummary,
  VacancyAnalyticsFilter,
} from './types';
import { listBusinessUnits } from '@/lib/business/repo';

// ========== 定数 ==========

const COLLECTION = 'vacancy_inquiry_events';

// ========== ユーティリティ ==========

function generateId(): string {
  return `vie_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ========== ドキュメント変換 ==========

function docToEvent(doc: FirebaseFirestore.DocumentSnapshot): VacancyInquiryEvent {
  const d = doc.data()!;
  return {
    id: d.id ?? doc.id,
    eventType: d.eventType ?? 'view',
    businessUnitId: d.businessUnitId ?? null,
    vacancyUnitId: d.vacancyUnitId ?? null,
    occurredAt: d.occurredAt ?? '',
    ipHint: d.ipHint ?? null,
    userAgentHint: d.userAgentHint ?? null,
    sessionId: d.sessionId ?? null,
  };
}

// ========== API ==========

/**
 * IPアドレスをマスク（最後のセグメントをxxx）
 */
export function maskIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  // IPv4
  const ipv4Match = ip.match(/^(\d+\.\d+\.\d+\.)\d+$/);
  if (ipv4Match) {
    return `${ipv4Match[1]}xxx`;
  }
  // IPv6（簡略化）
  if (ip.includes(':')) {
    const parts = ip.split(':');
    if (parts.length > 2) {
      return `${parts.slice(0, 3).join(':')}:xxx`;
    }
  }
  return null;
}

/**
 * User-Agentを簡略化
 */
export function simplifyUserAgent(ua: string | null | undefined): string | null {
  if (!ua) return null;
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Edge')) return 'Edge';
  if (ua.includes('MSIE') || ua.includes('Trident')) return 'IE';
  return 'Other';
}

/**
 * イベントを記録
 */
export async function recordEvent(
  req: RecordEventRequest,
  ipHint?: string | null,
  userAgentHint?: string | null
): Promise<VacancyInquiryEvent> {
  const db = getAdminDb();
  const id = generateId();

  const event: VacancyInquiryEvent = {
    id,
    eventType: req.eventType,
    businessUnitId: req.businessUnitId ?? null,
    vacancyUnitId: req.vacancyUnitId ?? null,
    occurredAt: new Date().toISOString(),
    ipHint: maskIp(ipHint),
    userAgentHint: simplifyUserAgent(userAgentHint),
    sessionId: req.sessionId ?? null,
  };

  await db.collection(COLLECTION).doc(id).set(event);

  return event;
}

/**
 * イベントを非同期で記録（エラーを無視）
 * ユーザー体験を落とさないためのラッパー
 */
export async function recordEventAsync(
  req: RecordEventRequest,
  ipHint?: string | null,
  userAgentHint?: string | null
): Promise<void> {
  try {
    await recordEvent(req, ipHint, userAgentHint);
  } catch (error) {
    console.error('[VacancyAnalytics] Failed to record event:', error);
  }
}

/**
 * イベント一覧を取得
 */
export async function listEvents(filter?: VacancyAnalyticsFilter): Promise<VacancyInquiryEvent[]> {
  const db = getAdminDb();
  let query: FirebaseFirestore.Query = db.collection(COLLECTION);

  if (filter?.businessUnitId) {
    query = query.where('businessUnitId', '==', filter.businessUnitId);
  }

  // Order by occurredAt descending
  query = query.orderBy('occurredAt', 'desc');

  if (filter?.limit) {
    query = query.limit(filter.limit);
  }

  const snapshot = await query.get();
  let events = snapshot.docs.map(docToEvent);

  // Client-side date filters (Firestore string comparison)
  if (filter?.startDate) {
    events = events.filter(e => e.occurredAt >= filter.startDate!);
  }

  if (filter?.endDate) {
    const endDateTime = filter.endDate + 'T23:59:59.999Z';
    events = events.filter(e => e.occurredAt <= endDateTime);
  }

  return events;
}

/**
 * 統計サマリーを取得
 */
export async function getAnalyticsSummary(filter?: VacancyAnalyticsFilter): Promise<VacancyAnalyticsSummary> {
  const db = getAdminDb();

  // デフォルトは過去30日
  const endDate = filter?.endDate || new Date().toISOString().split('T')[0];
  const startDateObj = new Date(endDate);
  startDateObj.setDate(startDateObj.getDate() - 30);
  const startDate = filter?.startDate || startDateObj.toISOString().split('T')[0];

  let query: FirebaseFirestore.Query = db.collection(COLLECTION);

  if (filter?.businessUnitId) {
    query = query.where('businessUnitId', '==', filter.businessUnitId);
  }

  const snapshot = await query.get();

  // Filter by date range client-side
  let events = snapshot.docs.map(docToEvent).filter(e => {
    const date = e.occurredAt.split('T')[0];
    return date >= startDate && date <= endDate;
  });

  // 全体集計
  const views = events.filter(e => e.eventType === 'view').length;
  const clicks = events.filter(e => e.eventType === 'click_inquiry').length;
  const submits = events.filter(e => e.eventType === 'submit').length;

  const clickRate = views > 0 ? Math.round((clicks / views) * 1000) / 10 : 0;
  const submitRate = clicks > 0 ? Math.round((submits / clicks) * 1000) / 10 : 0;
  const conversionRate = views > 0 ? Math.round((submits / views) * 1000) / 10 : 0;

  // 事業単位別集計
  const buMap = new Map<string, { views: number; clicks: number; submits: number }>();
  for (const e of events) {
    const buId = e.businessUnitId || 'unknown';
    if (!buMap.has(buId)) {
      buMap.set(buId, { views: 0, clicks: 0, submits: 0 });
    }
    const stats = buMap.get(buId)!;
    if (e.eventType === 'view') stats.views++;
    if (e.eventType === 'click_inquiry') stats.clicks++;
    if (e.eventType === 'submit') stats.submits++;
  }

  // 事業単位名を取得
  const buList = listBusinessUnits();
  const buNameMap = new Map<string, string>();
  for (const bu of buList) {
    buNameMap.set(bu.id, bu.name);
  }

  const byBusinessUnit = Array.from(buMap.entries())
    .map(([buId, stats]) => ({
      businessUnitId: buId,
      businessUnitName: buNameMap.get(buId) || buId,
      views: stats.views,
      clicks: stats.clicks,
      submits: stats.submits,
      clickRate: stats.views > 0 ? Math.round((stats.clicks / stats.views) * 1000) / 10 : 0,
      submitRate: stats.clicks > 0 ? Math.round((stats.submits / stats.clicks) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.submits - a.submits);

  // 日別集計
  const dailyMap = new Map<string, { views: number; clicks: number; submits: number }>();

  const currentDate = new Date(startDate);
  const endDateObj = new Date(endDate);
  while (currentDate <= endDateObj) {
    const dateStr = currentDate.toISOString().split('T')[0];
    dailyMap.set(dateStr, { views: 0, clicks: 0, submits: 0 });
    currentDate.setDate(currentDate.getDate() + 1);
  }

  for (const e of events) {
    const date = e.occurredAt.split('T')[0];
    if (!dailyMap.has(date)) {
      dailyMap.set(date, { views: 0, clicks: 0, submits: 0 });
    }
    const stats = dailyMap.get(date)!;
    if (e.eventType === 'view') stats.views++;
    if (e.eventType === 'click_inquiry') stats.clicks++;
    if (e.eventType === 'submit') stats.submits++;
  }

  const daily = Array.from(dailyMap.entries())
    .map(([date, stats]) => ({
      date,
      views: stats.views,
      clicks: stats.clicks,
      submits: stats.submits,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    period: { start: startDate, end: endDate },
    totals: {
      views,
      clicks,
      submits,
      clickRate,
      submitRate,
      conversionRate,
    },
    byBusinessUnit,
    daily,
  };
}
