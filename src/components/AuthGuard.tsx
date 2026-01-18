'use client';

import { useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Loading } from './Loading';

interface AuthGuardProps {
  children: ReactNode;
  requireAdmin?: boolean;
}

export function AuthGuard({ children, requireAdmin = false }: AuthGuardProps) {
  const { firebaseUser, user, loading, isOnboarded, isAdmin } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;

    // 未ログインの場合はログインページへ
    if (!firebaseUser) {
      router.push('/login');
      return;
    }

    // ログイン済みだがオンボーディング未完了の場合
    if (!isOnboarded && pathname !== '/onboarding') {
      router.push('/onboarding');
      return;
    }

    // 管理者権限が必要な場合
    if (requireAdmin && !isAdmin) {
      router.push('/dashboard');
      return;
    }
  }, [firebaseUser, user, loading, isOnboarded, isAdmin, requireAdmin, router, pathname]);

  if (loading) {
    return <Loading fullScreen text="認証情報を確認中..." />;
  }

  if (!firebaseUser) {
    return null;
  }

  if (!isOnboarded && pathname !== '/onboarding') {
    return null;
  }

  if (requireAdmin && !isAdmin) {
    return null;
  }

  return <>{children}</>;
}
