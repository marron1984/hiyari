/**
 * 空室コンバージョン計測イベントAPI
 *
 * Ticket 072: /vacancies CTA最適化
 *
 * POST - イベント記録（view/click_inquiry/submit）
 */

import { NextRequest, NextResponse } from 'next/server';
import { recordEventAsync } from '@/lib/vacancyAnalytics/repo';
import type { RecordEventRequest, VacancyInquiryEventType } from '@/lib/vacancyAnalytics/types';

const VALID_EVENT_TYPES: VacancyInquiryEventType[] = ['view', 'click_inquiry', 'submit'];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as RecordEventRequest;

    // バリデーション
    if (!body.eventType || !VALID_EVENT_TYPES.includes(body.eventType)) {
      return NextResponse.json(
        { error: 'Invalid eventType' },
        { status: 400 }
      );
    }

    // IPとUser-Agentを取得
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || null;
    const userAgent = request.headers.get('user-agent') || null;

    // 非同期で記録（失敗してもエラーを返さない）
    await recordEventAsync(body, ip, userAgent);

    return NextResponse.json({ success: true });
  } catch (error) {
    // エラーでも200を返す（ユーザー体験優先）
    console.error('Vacancy analytics event error:', error);
    return NextResponse.json({ success: true });
  }
}
