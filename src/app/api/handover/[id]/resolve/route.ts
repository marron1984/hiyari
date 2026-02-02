/**
 * 申し送り解決API
 *
 * POST /api/handover/[id]/resolve
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveHandoverItem } from '@/lib/handover/repo';
import type { AppRole } from '@/config/appRoles';

// デモユーザー情報（本番ではセッションから取得）
const DEMO_USER = {
  id: 'user_003',
  name: '鈴木花子',
  role: 'manager' as AppRole,
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const result = resolveHandoverItem(id, DEMO_USER.id, DEMO_USER.role);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error === '申し送りが見つかりません' ? 404 : 403 }
      );
    }

    return NextResponse.json({ item: result.item });
  } catch (error) {
    console.error('handover resolve POST error:', error);
    return NextResponse.json(
      { error: '解決に失敗しました' },
      { status: 500 }
    );
  }
}
