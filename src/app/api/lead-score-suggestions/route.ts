/**
 * leadScore 提案 API
 *
 * Ticket 124: leadScore 重み自動提案
 *
 * GET /api/lead-score-suggestions - 提案一覧取得
 * PATCH /api/lead-score-suggestions - 提案ステータス更新（accepted / dismissed）
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { getSuggestions, getSuggestionById, updateSuggestionStatus } from '@/lib/sales/suggestionsRepo';
import { applyPatchPreview } from '@/lib/sales/buildLeadScoreSuggestions';
import type { SuggestionStatus } from '@/lib/sales/types';

async function getAuthUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    return await verifyIdToken(authHeader.replace('Bearer ', ''));
  } catch {
    return null;
  }
}

/**
 * GET: 提案一覧
 */
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(100, parseInt(searchParams.get('limit') || '50', 10));

  const suggestions = getSuggestions(limit);

  return NextResponse.json({ suggestions });
}

/**
 * PATCH: 提案ステータス更新
 */
export async function PATCH(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, status } = body as { id: string; status: SuggestionStatus };

    if (!id || !status) {
      return NextResponse.json({ error: 'id and status are required' }, { status: 400 });
    }

    if (!['accepted', 'dismissed'].includes(status)) {
      return NextResponse.json({ error: 'status must be accepted or dismissed' }, { status: 400 });
    }

    const updated = updateSuggestionStatus(id, status, user.uid);
    if (!updated) {
      return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 });
    }

    return NextResponse.json({ suggestion: updated });
  } catch {
    return NextResponse.json({ error: 'Bad Request' }, { status: 400 });
  }
}
