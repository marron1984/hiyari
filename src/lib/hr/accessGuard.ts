/**
 * HR アクセス遮断ガード
 *
 * Ticket 110: HR 入退社基盤
 *
 * terminated のユーザーは /dashboard に入れない
 * /onboarding も不可（ログアウト or 403）
 *
 * Server Component から呼び出してアクセス権をチェックし、
 * 遮断対象の場合は /terminated にリダイレクト
 */

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/requireRole';
import { getEmployeeByUserId, isAccessBlocked } from './index';

/**
 * アクセス遮断ゲートチェック
 *
 * Server Component から呼び出す。
 *
 * terminated ユーザーの場合は /terminated にリダイレクト。
 */
export async function checkAccessBlockedGate(): Promise<void> {
  try {
    const user = await getCurrentUser();

    // 従業員レコードを検索
    const employee = getEmployeeByUserId(user.id);

    // 従業員レコードがない場合はスキップ（旧ユーザー等）
    if (!employee) {
      return;
    }

    // アクセス遮断チェック
    if (isAccessBlocked(employee.employmentStatus)) {
      // 退社済みユーザーは専用ページにリダイレクト
      redirect('/terminated');
    }
  } catch (error) {
    // エラー時は安全側に倒す（通過させる）
    // ただし redirect() による例外は再スローする
    if ((error as { digest?: string })?.digest?.startsWith('NEXT_REDIRECT')) {
      throw error;
    }
    console.error('[AccessBlockedGate] Error:', error);
  }
}

/**
 * アクセス遮断状態を取得（UI表示用）
 */
export async function getAccessBlockedState(): Promise<{
  isBlocked: boolean;
  terminationDate: string | null;
  message: string | null;
}> {
  try {
    const user = await getCurrentUser();

    const employee = getEmployeeByUserId(user.id);

    if (!employee) {
      return { isBlocked: false, terminationDate: null, message: null };
    }

    if (isAccessBlocked(employee.employmentStatus)) {
      return {
        isBlocked: true,
        terminationDate: employee.terminationDate,
        message: 'アクセスが制限されています。退社処理が完了しているため、システムにアクセスできません。',
      };
    }

    return { isBlocked: false, terminationDate: null, message: null };
  } catch (error) {
    console.error('[AccessBlockedGate] getAccessBlockedState error:', error);
    return { isBlocked: false, terminationDate: null, message: null };
  }
}
