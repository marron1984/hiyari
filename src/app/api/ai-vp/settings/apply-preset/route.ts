/**
 * POST /api/ai-vp/settings/apply-preset
 *
 * Implementation Ticket 063-fix: プリセットを適用
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';
import { getPresetById, mergePresetWithDefaults } from '@/lib/aiVp/presets';
import { applyPresetAiVpConfig } from '@/lib/aiVp/settings';

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

    const body = await request.json().catch(() => ({}));
    const { presetId } = body as { presetId?: string };

    if (!presetId) {
      return NextResponse.json(
        { error: 'presetId is required' },
        { status: 400 }
      );
    }

    // プリセットを取得
    const preset = getPresetById(presetId);
    if (!preset) {
      return NextResponse.json(
        { error: `Preset not found: ${presetId}` },
        { status: 404 }
      );
    }

    // プリセットをデフォルトにマージして完全な設定を生成
    const fullConfig = mergePresetWithDefaults(preset);

    // プリセットを適用
    const result = applyPresetAiVpConfig(presetId, fullConfig, user.uid);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Validation failed', errors: result.errors },
        { status: 400 }
      );
    }

    console.log(`[AiVpSettings] Preset ${presetId} applied by ${user.uid}`);

    return NextResponse.json({
      success: true,
      message: `プリセット「${preset.name}」を適用しました`,
      preset: {
        id: preset.id,
        name: preset.name,
      },
      settings: {
        config: result.settings.configJson,
        updatedAt: result.settings.updatedAt,
        updatedByUserId: result.settings.updatedByUserId,
      },
    });
  } catch (error) {
    console.error('[API /ai-vp/settings/apply-preset] POST Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
