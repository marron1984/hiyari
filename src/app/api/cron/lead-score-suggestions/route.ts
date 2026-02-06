/**
 * leadScore提案 自動生成 Cron API
 *
 * Ticket 124: leadScore 重み自動提案（ルールベース）
 *
 * GET /api/cron/lead-score-suggestions?secret=...
 *   - 直近14日のsales_next_actionチケットを集計し、改善提案を生成
 *
 * GET /api/cron/lead-score-suggestions?secret=...&days=30
 *   - 集計期間を30日に変更
 *
 * 実行頻度: 週1（weekly-opsに組み込み or 単独実行）
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildLeadScoreSuggestions } from '@/lib/sales/buildLeadScoreSuggestions';
import { seedTicketData } from '@/lib/tickets/repo';

// Cron認証用シークレット
const CRON_SECRET = process.env.WEEKLY_OPS_SECRET || process.env.ALERT_CRON_SECRET;

function checkAuth(request: NextRequest): boolean {
  const { searchParams } = new URL(request.url);
  const secretParam = searchParams.get('secret');
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!CRON_SECRET) return true; // 開発環境
  return secretParam === CRON_SECRET || token === CRON_SECRET;
}

export async function GET(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // データ初期化（デモデータ）
    seedTicketData();

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '14', 10);
    const rangeDays = Math.min(90, Math.max(7, days));

    const result = buildLeadScoreSuggestions(rangeDays);

    return NextResponse.json({
      success: true,
      suggestion: {
        id: result.id,
        generatedAt: result.generatedAt,
        rangeDays: result.rangeDays,
        totalTickets: result.metrics.totalTickets,
        suggestionCount: result.suggestions.length,
        suggestions: result.suggestions.map((s) => ({
          key: s.key,
          title: s.title,
          confidence: s.confidence,
        })),
      },
    });
  } catch (error) {
    console.error('lead-score-suggestions cron error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
