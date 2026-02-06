/**
 * 空室コンバージョン計測 型定義
 *
 * Ticket 072: /vacancies CTA最適化（問い合わせ率UP）
 *
 * - view: /vacancies 表示
 * - click_inquiry: 問い合わせクリック
 * - submit: 送信成功
 */

/**
 * イベントタイプ
 */
export type VacancyInquiryEventType = 'view' | 'click_inquiry' | 'submit';

/**
 * 計測イベント
 */
export interface VacancyInquiryEvent {
  id: string;
  eventType: VacancyInquiryEventType;
  businessUnitId: string | null;
  vacancyUnitId: string | null;
  occurredAt: string;
  ipHint: string | null;      // マスク済みIP（最後のセグメントをxxx）
  userAgentHint: string | null; // 簡略化したUA
  sessionId: string | null;   // クライアント側セッションID（cookie/localStorage）
}

/**
 * イベント記録リクエスト
 */
export interface RecordEventRequest {
  eventType: VacancyInquiryEventType;
  businessUnitId?: string | null;
  vacancyUnitId?: string | null;
  sessionId?: string | null;
}

/**
 * 統計サマリー
 */
export interface VacancyAnalyticsSummary {
  period: {
    start: string;
    end: string;
  };
  totals: {
    views: number;
    clicks: number;
    submits: number;
    clickRate: number;  // clicks / views * 100
    submitRate: number; // submits / clicks * 100
    conversionRate: number; // submits / views * 100
  };
  byBusinessUnit: {
    businessUnitId: string;
    businessUnitName?: string;
    views: number;
    clicks: number;
    submits: number;
    clickRate: number;
    submitRate: number;
  }[];
  daily: {
    date: string;
    views: number;
    clicks: number;
    submits: number;
  }[];
}

/**
 * フィルタ
 */
export interface VacancyAnalyticsFilter {
  businessUnitId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}
