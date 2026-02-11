/**
 * POST /api/ai-vp/settings/reset
 *
 * Implementation Ticket 063-fix: 設定をデフォルトにリセット
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';
import { resetAiVpConfig } from '@/lib/aiVp/settings';

function checkAdminOrManager(role: AppRole): boolean {
  return ['admin', 'manager'].includes(role);
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    if (!checkAdminOrManager(user.role as AppRole)) {
      return NextResponse.json(
        { error: 'Admin or manager access required' },
        { status: 403 }
      );
    }

    const settings = resetAiVpConfig(user.uid);

    console.log(`[AiVpSettings] Reset to default by ${user.uid}`);

    return NextResponse.json({
      success: true,
      message: '設定をデフォルトにリセットしました',
      settings: {
        config: settings.configJson,
        updatedAt: settings.updatedAt,
        updatedByUserId: settings.updatedByUserId,
      },
    });
  } catch (error) {
    console.error('[API /ai-vp/settings/reset] POST Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
