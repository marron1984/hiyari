/**
 * オンボーディング統計API
 *
 * Ticket 097: 署名完了率ダッシュボード
 * Ticket 099: 未署名者への強制連絡オペ（チケット情報追加）
 *
 * GET /api/onboarding/stats
 *   - admin: 全体統計を返す
 *   - manager: 自組織スコープで絞った統計を返す
 *   - その他: 403
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';
import { computeOnboardingStats, getManagerScopeOrgUnitIds } from '@/lib/onboarding/stats';
import { getUserFollowupTicket } from '@/lib/onboarding/escalation';
import { getUserById } from '@/lib/roles/user-store';

/**
 * admin/manager のみアクセス可能か判定
 */
function canAccessOnboardingStats(role: AppRole): boolean {
  return ['admin', 'executive', 'manager'].includes(role);
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const userId = user.uid;

    // ユーザー情報を取得
    const storeUser = getUserById(userId);
    const role: AppRole = storeUser?.role ?? (user.role as AppRole);

    // RBAC チェック
    if (!canAccessOnboardingStats(role)) {
      return NextResponse.json(
        { error: 'この操作を行う権限がありません' },
        { status: 403 }
      );
    }

    // スコープを決定
    let scopeOrgUnitIds: string[] | undefined;
    if (role === 'manager') {
      // manager は自分が管理する組織のみ
      scopeOrgUnitIds = getManagerScopeOrgUnitIds(userId);
      if (scopeOrgUnitIds.length === 0) {
        // 管理組織がない場合は空の結果を返す
        return NextResponse.json({
          generatedAt: new Date().toISOString(),
          overall: {
            totalUsers: 0,
            completedUsers: 0,
            pendingUsers: 0,
            completionRate: 100,
          },
          byDoc: [],
          byOrgUnit: [],
          agingBuckets: {
            oneDay: 0,
            threeDays: 0,
            sevenDays: 0,
          },
          topPendingUsers: [],
          scope: 'manager',
          scopeOrgUnitIds: [],
        });
      }
    }

    // 統計を計算
    const stats = computeOnboardingStats({
      scopeOrgUnitIds,
      maskPII: false, // admin/manager は名前を見られる
    });

    // Ticket 099: 未完了ユーザーにチケット情報を追加
    const topPendingUsersWithTickets = stats.topPendingUsers.map((user) => {
      const ticket = getUserFollowupTicket(user.userId);
      return {
        ...user,
        followupTicketId: ticket?.id ?? null,
        followupTicketStatus: ticket?.status ?? null,
      };
    });

    // 全体のチケット統計
    const ticketStats = {
      withTicket: topPendingUsersWithTickets.filter((u) => u.followupTicketId).length,
      withoutTicket: topPendingUsersWithTickets.filter((u) => !u.followupTicketId).length,
    };

    return NextResponse.json({
      ...stats,
      topPendingUsers: topPendingUsersWithTickets,
      ticketStats,
      scope: role === 'manager' ? 'manager' : 'all',
      scopeOrgUnitIds: scopeOrgUnitIds ?? null,
    });
  } catch (error) {
    console.error('onboarding/stats GET error:', error);
    return NextResponse.json(
      { error: 'オンボーディング統計の取得に失敗しました' },
      { status: 500 }
    );
  }
}
