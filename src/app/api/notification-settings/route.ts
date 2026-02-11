/**
 * /api/notification-settings - 通知設定 API
 *
 * Implementation Ticket 061: 通知設定UI（ユーザーごとのON/OFF + 重要通知は強制）
 *
 * GET:  自分の設定を取得
 * POST: 自分の設定を更新
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';
import {
  getSettings,
  upsertSettings,
  isOffAllowed,
  NOTIFICATION_CATEGORY_LABELS,
  DISPLAY_CATEGORIES,
  ENFORCED_NOTIFICATION_KEYS,
  type NotifyMode,
} from '@/lib/notifications/settings';

// 有効なAppRoleかチェック
function isValidAppRole(role: string): role is AppRole {
  return ['admin', 'executive', 'manager', 'leader', 'staff', 'auditor'].includes(role);
}

// 有効なNotifyModeかチェック
function isValidNotifyMode(mode: string): mode is NotifyMode {
  return ['immediate', 'digest', 'off'].includes(mode);
}


/**
 * GET /api/notification-settings
 *
 * 自分の通知設定を取得
 */
export async function GET(request: NextRequest) {
  try {
    // 認証
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const userId = user.uid;
    const role = user.role as AppRole;

    const settings = getSettings(userId, role);

    // カテゴリ情報を付与
    const categories = DISPLAY_CATEGORIES.map((key) => ({
      key,
      label: NOTIFICATION_CATEGORY_LABELS[key] ?? key,
      currentMode: settings.overrides[key] ?? settings.modeDefault,
      isEnforced: !isOffAllowed(key),
    }));

    return NextResponse.json({
      settings: {
        userId: settings.userId,
        modeDefault: settings.modeDefault,
        overrides: settings.overrides,
        updatedAt: settings.updatedAt,
      },
      categories,
      enforcedKeys: ENFORCED_NOTIFICATION_KEYS,
    });
  } catch (error) {
    console.error('[API /notification-settings] GET Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/notification-settings
 *
 * 自分の通知設定を更新
 *
 * Body:
 * - modeDefault?: 'immediate' | 'digest' | 'off'
 * - overrides?: Record<string, 'immediate' | 'digest' | 'off'>
 */
export async function POST(request: NextRequest) {
  try {
    // 認証
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const userId = user.uid;
    const role = user.role as AppRole;

    const body = await request.json().catch(() => ({}));
    const { modeDefault, overrides } = body as {
      modeDefault?: string;
      overrides?: Record<string, string>;
    };

    // バリデーション
    if (modeDefault && !isValidNotifyMode(modeDefault)) {
      return NextResponse.json(
        { error: 'Invalid modeDefault. Must be: immediate, digest, or off' },
        { status: 400 }
      );
    }

    // 上書き設定のバリデーション
    const validatedOverrides: Record<string, NotifyMode> = {};
    if (overrides && typeof overrides === 'object') {
      for (const [key, mode] of Object.entries(overrides)) {
        if (!isValidNotifyMode(mode)) {
          return NextResponse.json(
            { error: `Invalid mode for key "${key}". Must be: immediate, digest, or off` },
            { status: 400 }
          );
        }

        // 強制キーに off が指定されている場合は警告（保存時に digest に補正される）
        if (!isOffAllowed(key) && mode === 'off') {
          console.warn(
            `[NotificationSettings] User ${userId} tried to set enforced key "${key}" to off. Will be corrected to digest.`
          );
        }

        validatedOverrides[key] = mode as NotifyMode;
      }
    }

    // 設定を更新
    const updated = upsertSettings(userId, {
      modeDefault: modeDefault as NotifyMode | undefined,
      overrides: Object.keys(validatedOverrides).length > 0 ? validatedOverrides : undefined,
    });

    // カテゴリ情報を付与
    const categories = DISPLAY_CATEGORIES.map((key) => ({
      key,
      label: NOTIFICATION_CATEGORY_LABELS[key] ?? key,
      currentMode: updated.overrides[key] ?? updated.modeDefault,
      isEnforced: !isOffAllowed(key),
    }));

    return NextResponse.json({
      success: true,
      settings: {
        userId: updated.userId,
        modeDefault: updated.modeDefault,
        overrides: updated.overrides,
        updatedAt: updated.updatedAt,
      },
      categories,
    });
  } catch (error) {
    console.error('[API /notification-settings] POST Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
