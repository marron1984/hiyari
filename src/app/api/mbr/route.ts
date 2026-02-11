/**
 * MBR API
 *
 * Ticket 126: 月次改善レビュー
 *
 * GET  /api/mbr         - MBR一覧 or 月指定取得
 * POST /api/mbr         - MBR生成
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { listMbrs, getMbrByMonth, saveMbr } from '@/lib/mbr/mbrRepo';
import { generateMbr } from '@/lib/mbr/generateMbr';

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
 * GET: MBR一覧 or 月指定取得
 *   ?month=2025-01  → 特定月のMBR
 *   ?limit=12       → 一覧取得
 */
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month');

  if (month) {
    // 月指定取得
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'Invalid month format. Use YYYY-MM' }, { status: 400 });
    }
    const mbr = getMbrByMonth(month);
    if (!mbr) {
      return NextResponse.json({ error: 'MBR not found for this month' }, { status: 404 });
    }
    return NextResponse.json({ mbr });
  }

  // 一覧取得
  const limit = Math.min(24, parseInt(searchParams.get('limit') || '12', 10));
  const mbrs = listMbrs(limit);
  return NextResponse.json({ mbrs });
}

/**
 * POST: MBR生成
 *   Body: { month?: string }  省略時は前月
 */
export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const month = body.month as string | undefined;

    if (month && !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'Invalid month format. Use YYYY-MM' }, { status: 400 });
    }

    const mbr = await generateMbr(month);
    saveMbr(mbr);

    return NextResponse.json({ mbr }, { status: 201 });
  } catch (error) {
    console.error('[MBR API] Generation failed:', error);
    return NextResponse.json({ error: 'MBR generation failed' }, { status: 500 });
  }
}
