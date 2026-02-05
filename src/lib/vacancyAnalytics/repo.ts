/**
 * 空室コンバージョン計測リポジトリ
 *
 * Ticket 072: /vacancies CTA最適化（問い合わせ率UP）
 *
 * - view/click/submit イベントを記録
 * - 集計・分析用クエリ
 *
 * 永続化: JSONファイルベース（本番はFirestore）
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  VacancyInquiryEvent,
  VacancyInquiryEventType,
  RecordEventRequest,
  VacancyAnalyticsSummary,
  VacancyAnalyticsFilter,
} from './types';
import { listBusinessUnits } from '@/lib/business/repo';

// ========== 永続化ストレージ ==========

const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'vacancy_inquiry_events.json');

let eventStore = new Map<string, VacancyInquiryEvent>();
let idCounter = 1;
let isInitialized = false;

/**
 * ストレージを初期化（ファイルから読み込み）
 */
function initializeStorage(): void {
  if (isInitialized) return;

  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));

      if (data.events && Array.isArray(data.events)) {
        for (const e of data.events) {
          eventStore.set(e.id, e);
        }
      }

      if (data.idCounter) {
        idCounter = data.idCounter;
      } else {
        const maxId = Math.max(0, ...Array.from(eventStore.values())
          .map(e => parseInt(e.id.replace(/\D/g, '')) || 0));
        idCounter = maxId + 1;
      }
    }

    isInitialized = true;
    console.log(`[VacancyAnalytics] Loaded ${eventStore.size} events from storage`);
  } catch (error) {
    console.error('[VacancyAnalytics] Failed to load from storage:', error);
    isInitialized = true;
  }
}

/**
 * ストレージに保存
 */
function saveStorage(): void {
  try {
    const data = {
      events: Array.from(eventStore.values()),
      idCounter,
      savedAt: new Date().toISOString(),
    };

    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('[VacancyAnalytics] Failed to save to storage:', error);
  }
}

// 初期化
initializeStorage();

function generateId(): string {
  return `vie_${Date.now()}_${idCounter++}`;
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
  // ブラウザ名だけ抽出
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
export function recordEvent(
  req: RecordEventRequest,
  ipHint?: string | null,
  userAgentHint?: string | null
): VacancyInquiryEvent {
  initializeStorage();

  const event: VacancyInquiryEvent = {
    id: generateId(),
    eventType: req.eventType,
    businessUnitId: req.businessUnitId ?? null,
    vacancyUnitId: req.vacancyUnitId ?? null,
    occurredAt: new Date().toISOString(),
    ipHint: maskIp(ipHint),
    userAgentHint: simplifyUserAgent(userAgentHint),
    sessionId: req.sessionId ?? null,
  };

  eventStore.set(event.id, event);
  saveStorage();

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
    recordEvent(req, ipHint, userAgentHint);
  } catch (error) {
    console.error('[VacancyAnalytics] Failed to record event:', error);
  }
}

/**
 * イベント一覧を取得
 */
export function listEvents(filter?: VacancyAnalyticsFilter): VacancyInquiryEvent[] {
  initializeStorage();

  let events = Array.from(eventStore.values());

  if (filter?.businessUnitId) {
    events = events.filter(e => e.businessUnitId === filter.businessUnitId);
  }

  if (filter?.startDate) {
    events = events.filter(e => e.occurredAt >= filter.startDate!);
  }

  if (filter?.endDate) {
    const endDateTime = filter.endDate + 'T23:59:59.999Z';
    events = events.filter(e => e.occurredAt <= endDateTime);
  }

  // 日時降順
  events.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  if (filter?.limit) {
    events = events.slice(0, filter.limit);
  }

  return events;
}

/**
 * 統計サマリーを取得
 */
export function getAnalyticsSummary(filter?: VacancyAnalyticsFilter): VacancyAnalyticsSummary {
  initializeStorage();

  // デフォルトは過去30日
  const endDate = filter?.endDate || new Date().toISOString().split('T')[0];
  const startDateObj = new Date(endDate);
  startDateObj.setDate(startDateObj.getDate() - 30);
  const startDate = filter?.startDate || startDateObj.toISOString().split('T')[0];

  let events = Array.from(eventStore.values()).filter(e => {
    const date = e.occurredAt.split('T')[0];
    return date >= startDate && date <= endDate;
  });

  if (filter?.businessUnitId) {
    events = events.filter(e => e.businessUnitId === filter.businessUnitId);
  }

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

  // 日付リストを生成
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
