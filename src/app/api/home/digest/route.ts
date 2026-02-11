/**
 * /api/home/digest - 朝イチダイジェスト API
 *
 * Implementation Ticket 060: 朝イチダイジェスト通知（055）と Role Home（059）を連動
 *
 * 朝イチダイジェスト通知の送信・プレビュー
 * - GET: プレビュー（送信せずに内容を確認）
 * - POST: 送信（cron から呼び出される想定）
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';
import {
  sendMorningDigest,
  sendMorningDigestForRole,
  previewMorningDigest,
  buildDailyDigest,
  formatDigestAsMessage,
} from '@/lib/home/sendMorningDigest';

// 有効なAppRoleかチェック
function isValidAppRole(role: string): role is AppRole {
  return ['admin', 'executive', 'manager', 'leader', 'staff', 'auditor'].includes(role);
}


/**
 * GET /api/home/digest
 *
 * プレビュー用（送信せずに内容を確認）
 *
 * Query params:
 * - role: AppRole (optional) - 特定ロールのみ
 * - format: 'preview' | 'message' (default: 'preview')
 */
export async function GET(request: NextRequest) {
  try {
    // 認証
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    // admin のみ実行可能
    if ((user.role as AppRole) !== 'admin') {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const roleParam = searchParams.get('role');
    const format = searchParams.get('format') || 'preview';

    // 特定ロールのみ
    if (roleParam && isValidAppRole(roleParam)) {
      const digest = buildDailyDigest(roleParam, user.uid);
      const message = formatDigestAsMessage(digest);

      if (format === 'message') {
        return NextResponse.json({
          role: roleParam,
          message,
          digest: {
            title: digest.title,
            date: digest.date,
            fingerprint: digest.fingerprint,
            top3Count: digest.top3.items.length,
            risksCount: digest.risks.criticalCount + digest.risks.warningCount,
          },
        });
      }

      return NextResponse.json({
        role: roleParam,
        digest,
        message,
      });
    }

    // 全ロールのプレビュー
    const preview = previewMorningDigest();
    const result: Record<string, {
      title: string;
      wouldSend: boolean;
      top3Count: number;
      risksCount: number;
      message?: string;
    }> = {};

    for (const [role, data] of preview) {
      result[role] = {
        title: data.digest.title,
        wouldSend: data.wouldSend,
        top3Count: data.digest.top3.items.length,
        risksCount: data.digest.risks.criticalCount + data.digest.risks.warningCount,
        message: format === 'message' ? data.message : undefined,
      };
    }

    return NextResponse.json({
      date: new Date().toISOString().slice(0, 10),
      preview: result,
    });
  } catch (error) {
    console.error('[API /home/digest] GET Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/home/digest
 *
 * ダイジェスト通知を送信
 *
 * Body:
 * - targetRoles: AppRole[] (optional)
 * - sendEmpty: boolean (optional, default: false)
 * - role: AppRole (optional) - 特定ロールのみ送信
 *
 * Security:
 * - admin のみ実行可能
 * - cron からの呼び出しを想定
 */
export async function POST(request: NextRequest) {
  try {
    // 認証
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    // admin のみ実行可能
    if ((user.role as AppRole) !== 'admin') {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { targetRoles, sendEmpty, role } = body as {
      targetRoles?: string[];
      sendEmpty?: boolean;
      role?: string;
    };

    // 特定ロールのみ
    if (role && isValidAppRole(role)) {
      const result = sendMorningDigestForRole(role, user.uid, {
        sendEmpty: sendEmpty ?? false,
      });

      return NextResponse.json({
        role,
        sent: result.sent,
        reason: result.reason,
        notificationId: result.notificationId,
        digest: {
          title: result.digest.title,
          date: result.digest.date,
          fingerprint: result.digest.fingerprint,
        },
      });
    }

    // 対象ロールをバリデート
    const validRoles: AppRole[] = [];
    if (targetRoles && Array.isArray(targetRoles)) {
      for (const r of targetRoles) {
        if (isValidAppRole(r)) {
          validRoles.push(r);
        }
      }
    }

    // 全ロールに送信
    const result = sendMorningDigest({
      targetRoles: validRoles.length > 0 ? validRoles : undefined,
      sendEmpty: sendEmpty ?? false,
    });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error('[API /home/digest] POST Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
