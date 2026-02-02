/**
 * /api/home/summary - 役職別ホームサマリー
 *
 * Implementation Ticket 046: 役職別ホーム最適化
 */

import { NextRequest, NextResponse } from 'next/server';
import type { AppRole } from '@/config/appRoles';
import { ROLE_DISPLAY_INFO } from '@/config/appRoles';
import {
  type RoleHomeData,
  type WidgetType,
  ROLE_WIDGET_CONFIG,
} from '@/lib/roleHome/types';
import { buildWidgetsForRole } from '@/lib/roleHome/widgetBuilder';

/**
 * GET /api/home/summary
 *
 * Query params:
 * - role: AppRole (required) - 役職
 * - userId: string (required) - ユーザーID
 * - widgets: string (optional) - カンマ区切りのウィジェットタイプ（省略時はrole別デフォルト）
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const role = searchParams.get('role') as AppRole | null;
    const userId = searchParams.get('userId');
    const widgetsParam = searchParams.get('widgets');

    // バリデーション
    if (!role) {
      return NextResponse.json(
        { error: 'role parameter is required' },
        { status: 400 }
      );
    }

    if (!ROLE_DISPLAY_INFO[role]) {
      return NextResponse.json(
        { error: `Invalid role: ${role}` },
        { status: 400 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'userId parameter is required' },
        { status: 400 }
      );
    }

    // ウィジェットタイプを決定
    let widgetTypes: WidgetType[];
    if (widgetsParam) {
      widgetTypes = widgetsParam.split(',') as WidgetType[];
    } else {
      widgetTypes = ROLE_WIDGET_CONFIG[role] ?? [];
    }

    // ウィジェットを構築
    const widgets = buildWidgetsForRole(role, userId, widgetTypes);

    const result: RoleHomeData = {
      role,
      roleName: ROLE_DISPLAY_INFO[role].name,
      widgets,
      fetchedAt: new Date().toISOString(),
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('[API /home/summary] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/home/summary
 *
 * Body:
 * - role: AppRole (required)
 * - userId: string (required)
 * - widgets: WidgetType[] (optional)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { role: roleParam, userId, widgets: widgetsParam } = body;

    // バリデーション
    if (!roleParam) {
      return NextResponse.json(
        { error: 'role is required' },
        { status: 400 }
      );
    }

    const role = roleParam as AppRole;
    if (!ROLE_DISPLAY_INFO[role]) {
      return NextResponse.json(
        { error: `Invalid role: ${role}` },
        { status: 400 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    // ウィジェットタイプを決定
    const widgetTypes: WidgetType[] = widgetsParam ?? ROLE_WIDGET_CONFIG[role] ?? [];

    // ウィジェットを構築
    const widgets = buildWidgetsForRole(role, userId, widgetTypes);

    const result: RoleHomeData = {
      role,
      roleName: ROLE_DISPLAY_INFO[role].name,
      widgets,
      fetchedAt: new Date().toISOString(),
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('[API /home/summary] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
