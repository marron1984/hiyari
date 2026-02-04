/**
 * POST /api/ai-vp/settings/rollback
 *
 * Implementation Ticket 063-fix: 直前の設定にロールバック
 */

import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import type { AppRole } from '@/config/appRoles';
import { rollbackAiVpConfig } from '@/lib/aiVp/settings';

function isValidAppRole(role: string): role is AppRole {
  return ['admin', 'executive', 'manager', 'leader', 'staff', 'auditor'].includes(role);
}

async function getCurrentUser(): Promise<{ userId: string; role: AppRole }> {
  const headersList = await headers();
  const userIdHeader = headersList.get('x-user-id');
  const roleHeader = headersList.get('x-user-role');
  const userId = userIdHeader ?? 'user_001';
  const role: AppRole = roleHeader && isValidAppRole(roleHeader) ? roleHeader : 'admin';
  return { userId, role };
}

function checkAdminOrManager(role: AppRole): boolean {
  return ['admin', 'manager'].includes(role);
}

export async function POST() {
  try {
    const { userId, role } = await getCurrentUser();

    if (!checkAdminOrManager(role)) {
      return NextResponse.json(
        { error: 'Admin or manager access required' },
        { status: 403 }
      );
    }

    const result = rollbackAiVpConfig(userId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    console.log(`[AiVpSettings] Rolled back by ${userId}`);

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
