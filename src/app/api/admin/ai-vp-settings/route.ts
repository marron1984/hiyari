/**
 * /api/admin/ai-vp-settings - AI副社長スコアリング設定 API
 *
 * Implementation Ticket 062: AI副社長Top3の重み（スコアリング）を管理画面から調整
 *
 * GET:  グローバル設定を取得
 * POST: グローバル設定を更新
 * DELETE: デフォルトにリセット
 */

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import type { AppRole } from '@/config/appRoles';
import {
  getGlobalSettings,
  updateGlobalSettings,
  resetGlobalSettings,
  getAuditLog,
  DEFAULT_CONFIG,
  WEIGHT_LABELS,
  THRESHOLD_LABELS,
  type AiVpScoringConfig,
} from '@/lib/aiVp/scoringSettings';

// 有効なAppRoleかチェック
function isValidAppRole(role: string): role is AppRole {
  return ['admin', 'executive', 'manager', 'leader', 'staff', 'auditor'].includes(role);
}

/**
 * サーバー側でユーザー情報を取得
 */
async function getCurrentUser(): Promise<{ userId: string; role: AppRole }> {
  const headersList = await headers();

  const userIdHeader = headersList.get('x-user-id');
  const roleHeader = headersList.get('x-user-role');

  const userId = userIdHeader ?? 'user_001';
  const role: AppRole =
    roleHeader && isValidAppRole(roleHeader) ? (roleHeader as AppRole) : 'admin';

  return { userId, role };
}

/**
 * admin/manager のみアクセス可能
 */
function checkAdminOrManager(role: AppRole): boolean {
  return ['admin', 'manager'].includes(role);
}

/**
 * GET /api/admin/ai-vp-settings
 *
 * 現在のグローバル設定を取得
 * Query params:
 * - includeAudit: boolean - 監査ログを含めるか
 * - auditLimit: number - 監査ログの件数
 */
export async function GET(request: NextRequest) {
  try {
    const { role } = await getCurrentUser();

    if (!checkAdminOrManager(role)) {
      return NextResponse.json(
        { error: 'Admin or manager access required' },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const includeAudit = searchParams.get('includeAudit') === 'true';
    const auditLimit = parseInt(searchParams.get('auditLimit') || '20', 10);

    const settings = getGlobalSettings();

    const response: Record<string, unknown> = {
      settings: {
        id: settings.id,
        scope: settings.scope,
        config: settings.config,
        updatedAt: settings.updatedAt,
        updatedByUserId: settings.updatedByUserId,
      },
      defaults: DEFAULT_CONFIG,
      labels: {
        weights: WEIGHT_LABELS,
        thresholds: THRESHOLD_LABELS,
      },
    };

    if (includeAudit) {
      response.auditLog = getAuditLog({ limit: auditLimit });
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('[API /admin/ai-vp-settings] GET Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/ai-vp-settings
 *
 * グローバル設定を更新
 *
 * Body:
 * - weights: Partial<ScoringWeights>
 * - thresholds: Partial<ScoringThresholds>
 * - diversity: Partial<DiversitySettings>
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, role } = await getCurrentUser();

    if (!checkAdminOrManager(role)) {
      return NextResponse.json(
        { error: 'Admin or manager access required' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { weights, thresholds, diversity } = body as Partial<AiVpScoringConfig>;

    // バリデーション: 重みは正の数であること
    if (weights) {
      for (const [key, value] of Object.entries(weights)) {
        if (typeof value !== 'number' || value < 0) {
          return NextResponse.json(
            { error: `Invalid weight for "${key}": must be a non-negative number` },
            { status: 400 }
          );
        }
      }
    }

    // バリデーション: 閾値は正の数であること
    if (thresholds) {
      for (const [key, value] of Object.entries(thresholds)) {
        if (typeof value !== 'number' || value < 0) {
          return NextResponse.json(
            { error: `Invalid threshold for "${key}": must be a non-negative number` },
            { status: 400 }
          );
        }
      }
    }

    // バリデーション: 多様性設定は正の整数であること
    if (diversity) {
      for (const [key, value] of Object.entries(diversity)) {
        if (typeof value !== 'number' || value < 1 || !Number.isInteger(value)) {
          return NextResponse.json(
            { error: `Invalid diversity setting for "${key}": must be a positive integer` },
            { status: 400 }
          );
        }
      }
    }

    // 設定を更新
    const updated = updateGlobalSettings({ weights, thresholds, diversity }, userId);

    console.log(`[AiVpSettings] Settings updated by ${userId}`);

    return NextResponse.json({
      success: true,
      settings: {
        id: updated.id,
        scope: updated.scope,
        config: updated.config,
        updatedAt: updated.updatedAt,
        updatedByUserId: updated.updatedByUserId,
      },
    });
  } catch (error) {
    console.error('[API /admin/ai-vp-settings] POST Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/ai-vp-settings
 *
 * 設定をデフォルトにリセット
 */
export async function DELETE() {
  try {
    const { userId, role } = await getCurrentUser();

    if (!checkAdminOrManager(role)) {
      return NextResponse.json(
        { error: 'Admin or manager access required' },
        { status: 403 }
      );
    }

    const reset = resetGlobalSettings(userId);

    console.log(`[AiVpSettings] Settings reset to default by ${userId}`);

    return NextResponse.json({
      success: true,
      message: '設定をデフォルトにリセットしました',
      settings: {
        id: reset.id,
        scope: reset.scope,
        config: reset.config,
        updatedAt: reset.updatedAt,
        updatedByUserId: reset.updatedByUserId,
      },
    });
  } catch (error) {
    console.error('[API /admin/ai-vp-settings] DELETE Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
