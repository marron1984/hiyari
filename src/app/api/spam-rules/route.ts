/**
 * スパムルールAPI
 *
 * Ticket 077: 迷惑フィルタ（NGワード/連投/ブラックリスト）
 *
 * GET /api/spam-rules - ルール一覧
 * POST /api/spam-rules - ルール作成
 *
 * RBAC: admin/manager のみ
 */

import { NextRequest, NextResponse } from 'next/server';
import { listRules, createRule, seedSpamRulesIfEmpty } from '@/lib/spam/repo';
import { canManageSpamRules } from '@/lib/spam/types';
import type { SpamRuleType, SpamSeverity } from '@/lib/spam/types';
import type { AppRole } from '@/config/appRoles';

// デモユーザー
const DEMO_USER = {
  id: 'user_003',
  name: '鈴木花子',
  role: 'manager' as AppRole,
};

export async function GET(request: NextRequest) {
  try {
    const viewer = { userId: DEMO_USER.id, role: DEMO_USER.role };
    if (!canManageSpamRules(viewer)) {
      return NextResponse.json(
        { error: 'スパムルールを管理する権限がありません' },
        { status: 403 }
      );
    }

    seedSpamRulesIfEmpty();

    const rules = listRules();

    return NextResponse.json({ rules });
  } catch (error) {
    console.error('spam-rules GET error:', error);
    return NextResponse.json(
      { error: 'ルールの取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const viewer = { userId: DEMO_USER.id, role: DEMO_USER.role };
    if (!canManageSpamRules(viewer)) {
      return NextResponse.json(
        { error: 'スパムルールを管理する権限がありません' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { type, pattern, severity, description, enabled } = body;

    if (!type || !pattern) {
      return NextResponse.json(
        { error: 'type と pattern は必須です' },
        { status: 400 }
      );
    }

    if (!['ng_word', 'regex'].includes(type)) {
      return NextResponse.json(
        { error: 'type は ng_word または regex を指定してください' },
        { status: 400 }
      );
    }

    const rule = createRule({
      type: type as SpamRuleType,
      pattern,
      enabled: enabled !== false,
      severity: (severity || 'warn') as SpamSeverity,
      description,
    });

    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    console.error('spam-rules POST error:', error);
    return NextResponse.json(
      { error: 'ルールの作成に失敗しました' },
      { status: 500 }
    );
  }
}
