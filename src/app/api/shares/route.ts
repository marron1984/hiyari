/**
 * 外部共有管理API
 *
 * GET  /api/shares - 一覧取得
 * POST /api/shares - 新規作成
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createSharePackage,
  listShares,
  getShareStats,
  createDemoShares,
} from '@/lib/shares/share-service';
import type { CreateShareRequest } from '@/lib/shares/types';

/**
 * GET /api/shares
 * 共有一覧を取得
 */
export async function GET() {
  // デモ用：サンプルデータを初期化
  createDemoShares();

  const shares = listShares();
  const stats = getShareStats();

  return NextResponse.json({
    success: true,
    shares: shares.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      status: s.status,
      templateId: s.templateId,
      createdAt: s.createdAt,
      createdByUserName: s.createdByUserName,
      expiresAt: s.expiresAt,
      accessCount: s.accessCount,
      lastAccessedAt: s.lastAccessedAt,
    })),
    stats,
  });
}

/**
 * POST /api/shares
 * 新規共有を作成
 */
export async function POST(request: NextRequest) {
  try {
    const body: CreateShareRequest = await request.json();

    // バリデーション
    if (!body.name || body.name.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: '共有名は必須です' },
        { status: 400 }
      );
    }

    if (!body.expiresInDays || body.expiresInDays < 1 || body.expiresInDays > 90) {
      return NextResponse.json(
        { success: false, error: '有効期限は1〜90日の範囲で指定してください' },
        { status: 400 }
      );
    }

    // 共有作成
    const result = createSharePackage(
      {
        name: body.name.trim(),
        description: body.description?.trim(),
        expiresInDays: body.expiresInDays,
        templateId: body.templateId,
        notes: body.notes?.trim(),
      },
      'admin', // TODO: 実際のユーザーIDを取得
      '管理者' // TODO: 実際のユーザー名を取得
    );

    return NextResponse.json({
      success: true,
      shareId: result.shareId,
      shareUrl: result.shareUrl,
      token: result.token, // 一度だけ表示
      expiresAt: result.expiresAt,
      message: 'このトークンは一度だけ表示されます。安全に保管してください。',
    });
  } catch (error) {
    console.error('Failed to create share:', error);
    return NextResponse.json(
      { success: false, error: '共有の作成に失敗しました' },
      { status: 500 }
    );
  }
}
