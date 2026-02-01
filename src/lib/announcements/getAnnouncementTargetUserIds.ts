/**
 * 周知事項の対象ユーザーID取得
 *
 * 周知の targetRoles と targetUserIds から
 * 対象となる全ユーザーIDを返す
 */

import type { Announcement } from './types';
import { listUsers } from '@/lib/roles/user-store';

/**
 * 周知事項の対象ユーザーIDを取得
 */
export function getAnnouncementTargetUserIds(announcement: Announcement): string[] {
  const targetUserIdSet = new Set<string>();

  // 1. ロールベースの対象取得
  if (announcement.targetRoles.length > 0) {
    for (const role of announcement.targetRoles) {
      const { users } = listUsers({ role });
      for (const user of users) {
        // 事業所フィルタがある場合は適用
        if (
          !announcement.targetBranchIds ||
          announcement.targetBranchIds.length === 0 ||
          (user.branchId && announcement.targetBranchIds.includes(user.branchId))
        ) {
          targetUserIdSet.add(user.id);
        }
      }
    }
  }

  // 2. 個別指定のユーザーを追加
  if (announcement.targetUserIds) {
    for (const userId of announcement.targetUserIds) {
      targetUserIdSet.add(userId);
    }
  }

  return Array.from(targetUserIdSet);
}

/**
 * 周知事項の対象ユーザー数を取得
 */
export function getAnnouncementTargetCount(announcement: Announcement): number {
  return getAnnouncementTargetUserIds(announcement).length;
}
