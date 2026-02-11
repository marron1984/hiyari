'use client';

/**
 * オンボーディングガード
 *
 * Ticket 093: 初回ログイン時の電子契約完了ゲート（本番対応版）
 *
 * staff/leader ユーザーはオンボーディング未完了の場合、
 * /onboarding/contracts にリダイレクトされる
 */

import { useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useApiFetch } from '@/hooks/useApiFetch';

interface OnboardingGuardProps {
  children: ReactNode;
}

export function OnboardingGuard({ children }: OnboardingGuardProps) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const apiFetch = useApiFetch();
  const [checking, setChecking] = useState(true);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    // 認証ロード中は待機
    if (authLoading) return;

    // 未ログインはAuthGuardに任せる
    if (!user) {
      setChecking(false);
      setIsComplete(true);
      return;
    }

    // admin/executive/manager/auditor はゲート対象外
    const exemptRoles = ['admin', 'executive', 'manager', 'auditor'];
    if (exemptRoles.includes(user.role || '')) {
      setChecking(false);
      setIsComplete(true);
      return;
    }

    // オンボーディング状態をチェック
    checkOnboardingStatus();
  }, [user, authLoading]);

  const checkOnboardingStatus = async () => {
    try {
      const res = await apiFetch('/api/onboarding/status');
      if (!res.ok) {
        // エラー時は通す（安全側ではないが、ブロックしすぎを避ける）
        console.error('[OnboardingGuard] Failed to fetch status');
        setIsComplete(true);
        return;
      }

      const data = await res.json();
      const onboarding = data.onboarding;

      if (!onboarding || onboarding.status === 'completed') {
        setIsComplete(true);
      } else {
        // 未完了 → リダイレクト
        router.push('/onboarding/contracts');
        return;
      }
    } catch (error) {
      console.error('[OnboardingGuard] Error:', error);
      // エラー時は通す
      setIsComplete(true);
    } finally {
      setChecking(false);
    }
  };

  // チェック中はローディング表示
  if (checking || authLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="text-zinc-500">読み込み中...</div>
      </div>
    );
  }

  // 完了していれば子要素を表示
  if (isComplete) {
    return <>{children}</>;
  }

  // リダイレクト中
  return null;
}
