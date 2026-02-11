/**
 * POST /api/ai-vp/settings/rollback
 *
 * Implementation Ticket 063-fix: 直前の設定にロールバック
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';
import { rollbackAiVpConfig } from '@/lib/aiVp/settings';

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

    const result = rollbackAiVpConfig(user.uid);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    console.log(`[AiVpSettings] Rolled back by ${user.uid}`);

    return NextResponse.json({
      success: true,
      message: '直前の設定にロールバックしました',
      settings: {
        config: result.settings.configJson,
        updatedAt: result.settings.updatedAt,
        updatedByUserId: result.settings.updatedByUserId,
      },
    });
  } catch (error) {
    console.error('[API /ai-vp/settings/rollback] POST Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
