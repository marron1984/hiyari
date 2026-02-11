/**
 * スパムブロックリストAPI
 *
 * Ticket 077: 迷惑フィルタ（NGワード/連投/ブラックリスト）
 *
 * GET /api/spam-blocklist - ブロックリスト一覧
 * POST /api/spam-blocklist - ブロックリスト追加
 * DELETE /api/spam-blocklist?id=xxx - ブロックリスト解除
 *
 * RBAC: admin/manager のみ
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  listBlocklist,
  addToBlocklist,
  removeFromBlocklist,
} from '@/lib/spam/repo';
import { canManageSpamRules } from '@/lib/spam/types';
import type { BlocklistKind } from '@/lib/spam/types';
import type { AppRole } from '@/config/appRoles';
import { requireApiUser, isApiUser } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const viewer = { userId: user.uid, role: user.role as AppRole };
    if (!canManageSpamRules(viewer)) {
      return NextResponse.json(
        { error: 'ブロックリストを管理する権限がありません' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const kind = searchParams.get('kind') as BlocklistKind | null;

    const entries = listBlocklist(kind ?? undefined);

    return NextResponse.json({ entries });
  } catch (error) {
    console.error('spam-blocklist GET error:', error);
    return NextResponse.json(
      { error: 'ブロックリストの取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const viewer = { userId: user.uid, role: user.role as AppRole };
    if (!canManageSpamRules(viewer)) {
      return NextResponse.json(
        { error: 'ブロックリストを管理する権限がありません' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { kind, value, reason, expiresAt } = body;

    if (!kind || !value || !reason) {
      return NextResponse.json(
        { error: 'kind, value, reason は必須です' },
        { status: 400 }
      );
    }

    if (!['ip', 'email', 'phone', 'ref', 'userAgentHash'].includes(kind)) {
      return NextResponse.json(
        { error: '無効な kind です' },
        { status: 400 }
      );
    }

    const entry = addToBlocklist(
      kind as BlocklistKind,
      value,
      reason,
      expiresAt || null,
      user.uid
    );

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    console.error('spam-blocklist POST error:', error);
    return NextResponse.json(
      { error: 'ブロックリストへの追加に失敗しました' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const viewer = { userId: user.uid, role: user.role as AppRole };
    if (!canManageSpamRules(viewer)) {
      return NextResponse.json(
        { error: 'ブロックリストを管理する権限がありません' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'id は必須です' },
        { status: 400 }
      );
    }

    const deleted = removeFromBlocklist(id);

    if (!deleted) {
      return NextResponse.json(
        { error: 'エントリが見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('spam-blocklist DELETE error:', error);
    return NextResponse.json(
      { error: 'ブロックリストからの削除に失敗しました' },
      { status: 500 }
    );
  }
}
