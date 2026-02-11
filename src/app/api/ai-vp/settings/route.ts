/**
 * /api/ai-vp/settings - AI副社長スコアリング設定 API
 *
 * Implementation Ticket 062: AI副社長Top3の重み（スコアリング）を管理画面から調整
 *
 * GET:  グローバル設定を取得
 * POST: グローバル設定を更新
 * DELETE: デフォルトにリセット
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';
import {
  getAiVpConfig,
  saveAiVpConfig,
  resetAiVpConfig,
  getAiVpSettingsEvents,
  getAiVpSettingsMeta,
  DEFAULT_CONFIG,
  WEIGHT_LABELS,
  THRESHOLD_LABELS,
  DIVERSITY_LABELS,
  type AiVpConfig,
} from '@/lib/aiVp/settings';

/**
 * admin/manager のみアクセス可能
 */
function checkAdminOrManager(role: AppRole): boolean {
  return ['admin', 'manager'].includes(role);
}

/**
 * GET /api/ai-vp/settings
 *
 * 現在のグローバル設定を取得
 * Query params:
 * - includeAudit: boolean - 監査ログを含めるか
 * - auditLimit: number - 監査ログの件数
 */
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

    const searchParams = request.nextUrl.searchParams;
    const includeAudit = searchParams.get('includeAudit') === 'true';
    const auditLimit = parseInt(searchParams.get('auditLimit') || '20', 10);

    const config = getAiVpConfig();
    const meta = getAiVpSettingsMeta();

    const response: Record<string, unknown> = {
      settings: {
        config,
        updatedAt: meta.updatedAt,
        updatedByUserId: meta.updatedByUserId,
      },
      defaults: DEFAULT_CONFIG,
      labels: {
        weights: WEIGHT_LABELS,
        thresholds: THRESHOLD_LABELS,
        diversity: DIVERSITY_LABELS,
      },
    };

    if (includeAudit) {
      response.auditLog = getAiVpSettingsEvents(auditLimit);
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('[API /ai-vp/settings] GET Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ai-vp/settings
 *
 * グローバル設定を更新
 *
 * Body:
 * - weights: Partial<AiVpWeights>
 * - thresholds: Partial<AiVpThresholds>
 * - diversity: Partial<AiVpDiversity>
 * - note?: string - 変更メモ
 */
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
    const { weights, thresholds, diversity, note } = body as Partial<AiVpConfig> & { note?: string };

    // 現在の設定を取得してマージ
    const currentConfig = getAiVpConfig();
    const newConfig: AiVpConfig = {
      weights: { ...currentConfig.weights, ...weights },
      thresholds: { ...currentConfig.thresholds, ...thresholds },
      diversity: { ...currentConfig.diversity, ...diversity },
    };

    // 設定を保存（バリデーション込み）
    const result = saveAiVpConfig(newConfig, user.uid, note);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Validation failed', errors: result.errors },
        { status: 400 }
      );
    }

    console.log(`[AiVpSettings] Settings updated by ${user.uid}`);

    return NextResponse.json({
      success: true,
      settings: {
        config: result.settings.configJson,
        updatedAt: result.settings.updatedAt,
        updatedByUserId: result.settings.updatedByUserId,
      },
    });
  } catch (error) {
    console.error('[API /ai-vp/settings] POST Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/ai-vp/settings
 *
 * 設定をデフォルトにリセット
 */
export async function DELETE(request: NextRequest) {
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

    const reset = resetAiVpConfig(user.uid);

    console.log(`[AiVpSettings] Settings reset to default by ${user.uid}`);

    return NextResponse.json({
      success: true,
      message: '設定をデフォルトにリセットしました',
      settings: {
        config: reset.configJson,
        updatedAt: reset.updatedAt,
        updatedByUserId: reset.updatedByUserId,
      },
    });
  } catch (error) {
    console.error('[API /ai-vp/settings] DELETE Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
