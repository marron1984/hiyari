/**
 * GET /api/ai-vp/settings/presets
 *
 * Implementation Ticket 063-fix: プリセット一覧を取得
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';
import { listPresets, getPresetById, mergePresetWithDefaults } from '@/lib/aiVp/presets';

function checkAdminOrManager(role: AppRole): boolean {
  return ['admin', 'manager'].includes(role);
}

export async function GET(request: NextRequest) {
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
