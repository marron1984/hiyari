/**
 * オンボーディングゲート（サーバーサイド）
 *
 * Ticket 093: 初回ログイン時の電子契約完了ゲート
 *
 * Server Component から呼び出してオンボーディング状態をチェックし、
 * 未完了の場合は redirect() でオンボーディングページにリダイレクト
 *
 * Note: Edge Runtime 制約を回避するため、middleware ではなく
 *       Server Component（layout.tsx）で使用する
 */

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/requireRole';
import { isOnboardingTargetRole } from './types';
import {
  getUserOnboarding,
  initializeUserOnboarding,
  getRequiredDocsForUser,
} from './repo';

/**
 * オンボーディング対象外のロール
 */
const EXEMPT_ROLES = ['admin', 'executive', 'manager', 'auditor'] as const;

/**
 * オンボーディングゲートチェック
 *
 * Server Component から呼び出す。
 * 未完了の場合は /onboarding/contracts にリダイレクト。
 */
export async function checkOnboardingGate(): Promise<void> {
  try {
    const user = await getCurrentUser();

    // 対象外ロールはスキップ
    if (EXEMPT_ROLES.includes(user.role as typeof EXEMPT_ROLES[number])) {
      return;
    }

    // オンボーディング対象でなければスキップ
    if (!isOnboardingTargetRole(user.role)) {
      return;
    }

    // オンボーディング情報を取得（なければ初期化）
    let onboarding = getUserOnboarding(user.id);
    if (!onboarding) {
      onboarding = initializeUserOnboarding(user.id, user.role, []);
    }

    // 完了済みならスキップ
    if (onboarding.status === 'completed') {
      return;
    }

    // 必須文書がない場合もスキップ
    const requiredDocs = getRequiredDocsForUser(user.id, user.role, []);
    if (requiredDocs.length === 0) {
      return;
    }

    // 未完了 → リダイレクト
    redirect('/onboarding/contracts');
  } catch (error) {
    // エラー時は安全側に倒す（通過させる）
    // ただし redirect() による例外は再スローする
    if ((error as { digest?: string })?.digest?.startsWith('NEXT_REDIRECT')) {
      throw error;
    }
    console.error('[OnboardingGate] Error:', error);
  }
}

/**
 * オンボーディング状態を取得（UI表示用）
 */
export async function getOnboardingState(): Promise<{
  isRequired: boolean;
  isComplete: boolean;
  pendingCount: number;
  totalCount: number;
}> {
  try {
    const user = await getCurrentUser();

    // 対象外ロールは完了扱い
    if (EXEMPT_ROLES.includes(user.role as typeof EXEMPT_ROLES[number])) {
      return { isRequired: false, isComplete: true, pendingCount: 0, totalCount: 0 };
    }

    // オンボーディング対象でなければ完了扱い
    if (!isOnboardingTargetRole(user.role)) {
      return { isRequired: false, isComplete: true, pendingCount: 0, totalCount: 0 };
    }

    const onboarding = getUserOnboarding(user.id);
    if (!onboarding) {
      const requiredDocs = getRequiredDocsForUser(user.id, user.role, []);
      return {
        isRequired: requiredDocs.length > 0,
        isComplete: requiredDocs.length === 0,
        pendingCount: requiredDocs.length,
        totalCount: requiredDocs.length,
      };
    }

    const pendingCount = onboarding.requiredItems.filter((i) => i.status === 'pending').length;

    return {
      isRequired: true,
      isComplete: onboarding.status === 'completed',
      pendingCount,
      totalCount: onboarding.requiredItems.length,
    };
  } catch (error) {
    console.error('[OnboardingGate] getOnboardingState error:', error);
    return { isRequired: false, isComplete: true, pendingCount: 0, totalCount: 0 };
  }
}
