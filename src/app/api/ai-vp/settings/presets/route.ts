/**
 * GET /api/ai-vp/settings/presets
 *
 * Implementation Ticket 063-fix: プリセット一覧を取得
 */

import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import type { AppRole } from '@/config/appRoles';
import { listPresets, getPresetById, mergePresetWithDefaults } from '@/lib/aiVp/presets';

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

export async function GET(request: Request) {
  try {
    const { role } = await getCurrentUser();

    if (!checkAdminOrManager(role)) {
      return NextResponse.json(
        { error: 'Admin or manager access required' },
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    const presetId = url.searchParams.get('id');

    // 特定のプリセット詳細を取得
    if (presetId) {
      const preset = getPresetById(presetId);
      if (!preset) {
        return NextResponse.json(
          { error: `Preset not found: ${presetId}` },
          { status: 404 }
        );
      }

      const fullConfig = mergePresetWithDefaults(preset);
      return NextResponse.json({
        preset: {
          id: preset.id,
          name: preset.name,
          description: preset.description,
          scenario: preset.scenario,
          config: fullConfig,
        },
      });
    }

    // プリセット一覧を取得
    const presets = listPresets();

    return NextResponse.json({
      presets,
    });
  } catch (error) {
    console.error('[API /ai-vp/settings/presets] GET Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
