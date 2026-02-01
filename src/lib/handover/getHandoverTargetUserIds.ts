/**
 * 申し送り対象ユーザーID解決
 *
 * targetRolesJson / targetUserIdsJson から対象ユーザーを特定
 */

import type { AppRole } from '@/config/appRoles';
import type { HandoverItem } from './types';

/**
 * デモ用ユーザーデータ（本番ではDBから取得）
 */
const DEMO_USERS: { id: string; name: string; role: AppRole }[] = [
  { id: 'user_001', name: '佐藤太郎', role: 'admin' },
  { id: 'user_002', name: '田中太郎', role: 'executive' },
  { id: 'user_003', name: '鈴木花子', role: 'manager' },
  { id: 'user_004', name: '高橋一郎', role: 'leader' },
  { id: 'user_005', name: '伊藤次郎', role: 'staff' },
  { id: 'user_006', name: '山田マネージャー', role: 'manager' },
  { id: 'user_007', name: '中村三郎', role: 'staff' },
  { id: 'user_008', name: '小林四郎', role: 'staff' },
  { id: 'user_009', name: '加藤五郎', role: 'leader' },
  { id: 'user_010', name: '吉田六郎', role: 'staff' },
];

/**
 * 全ユーザーを取得（本番ではDBから）
 */
export function getAllUsers(): { id: string; name: string; role: AppRole }[] {
  return DEMO_USERS;
}

/**
 * ロールでユーザーをフィルタ
 */
export function getUsersByRoles(roles: AppRole[]): { id: string; name: string; role: AppRole }[] {
  return DEMO_USERS.filter((u) => roles.includes(u.role));
}

/**
 * ユーザーIDでユーザーを取得
 */
export function getUsersByIds(userIds: string[]): { id: string; name: string; role: AppRole }[] {
  return DEMO_USERS.filter((u) => userIds.includes(u.id));
}

/**
 * 申し送りの対象ユーザーIDを取得
 *
 * - targetRolesJson があればロールに該当するユーザー
 * - targetUserIdsJson があれば union
 * - どちらもnullなら現場系ロール（staff/leader/manager）全員
 */
export function getHandoverTargetUserIds(item: HandoverItem): string[] {
  const targetUserIdsSet = new Set<string>();

  // ターゲットロールがあればそのロールのユーザーを追加
  if (item.targetRolesJson && item.targetRolesJson.length > 0) {
    const roleUsers = getUsersByRoles(item.targetRolesJson);
    for (const user of roleUsers) {
      targetUserIdsSet.add(user.id);
    }
  }

  // ターゲットユーザーIDが指定されていれば追加
  if (item.targetUserIdsJson && item.targetUserIdsJson.length > 0) {
    for (const userId of item.targetUserIdsJson) {
      targetUserIdsSet.add(userId);
    }
  }

  // どちらもない場合は現場系ロール全員
  if (
    (!item.targetRolesJson || item.targetRolesJson.length === 0) &&
    (!item.targetUserIdsJson || item.targetUserIdsJson.length === 0)
  ) {
    const defaultRoles: AppRole[] = ['staff', 'leader', 'manager'];
    const defaultUsers = getUsersByRoles(defaultRoles);
    for (const user of defaultUsers) {
      targetUserIdsSet.add(user.id);
    }
  }

  return Array.from(targetUserIdsSet);
}

/**
 * ユーザーが対象に含まれるか判定
 */
export function isUserTargeted(
  item: HandoverItem,
  userId: string,
  userRole: AppRole
): boolean {
  // admin は常に閲覧可能
  if (userRole === 'admin') {
    return true;
  }

  // 作成者は閲覧可能
  if (item.createdByUserId === userId) {
    return true;
  }

  // manager/executive は全て閲覧可能
  if (['manager', 'executive'].includes(userRole)) {
    return true;
  }

  // ターゲットユーザーIDに含まれる
  if (item.targetUserIdsJson && item.targetUserIdsJson.includes(userId)) {
    return true;
  }

  // ターゲットロールに含まれる
  if (item.targetRolesJson && item.targetRolesJson.includes(userRole)) {
    return true;
  }

  // どちらもnullの場合は現場系ロール全員が対象
  if (
    (!item.targetRolesJson || item.targetRolesJson.length === 0) &&
    (!item.targetUserIdsJson || item.targetUserIdsJson.length === 0)
  ) {
    const defaultRoles: AppRole[] = ['staff', 'leader', 'manager'];
    return defaultRoles.includes(userRole);
  }

  return false;
}
