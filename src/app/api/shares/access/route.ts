/**
 * 外部共有アクセスAPI
 *
 * GET /api/shares/access?token=xxx
 * トークンで共有データにアクセス（監査ログ記録）
 */

import { NextRequest, NextResponse } from 'next/server';
import { accessShare, createDemoShares, findShareByToken } from '@/lib/shares/share-service';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    return NextResponse.json(
      { success: false, error: 'Token is required' },
      { status: 400 }
    );
  }

  // デモ用：サンプルデータを初期化
  createDemoShares();

  // アクセス（ログ記録付き）
  const ipAddress = request.headers.get('x-forwarded-for') || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';

  const result = accessShare(token, ipAddress, userAgent);

  if (!result.success || !result.share) {
    return NextResponse.json(
      { success: false, error: result.error || 'Invalid or expired share link' },
      { status: 404 }
    );
  }

  // 外部向けにサニタイズしたデータを返す
  return NextResponse.json({
    success: true,
    share: {
      name: result.share.name,
      description: result.share.description,
      createdAt: result.share.createdAt,
      expiresAt: result.share.expiresAt,
      snapshot: result.share.snapshot,
    },
  });
}
