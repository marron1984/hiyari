/**
 * 共有失効API
 *
 * POST /api/shares/[id]/revoke
 * 共有リンクを失効させる
 */

import { NextRequest, NextResponse } from 'next/server';
import { revokeShare } from '@/lib/shares/share-service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json(
      { success: false, error: 'Share ID is required' },
      { status: 400 }
    );
  }

  const success = revokeShare(id);

  if (!success) {
    return NextResponse.json(
      { success: false, error: 'Share not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    message: '共有リンクを失効しました',
  });
}
