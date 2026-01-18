'use client';

import { useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Loading } from './Loading';

interface AuthGuardProps {
  children: ReactNode;
  requireAdmin?: boolean;
  requireManager?: boolean;
}

export function AuthGuard({ children, requireAdmin = false, requireManager = false }: AuthGuardProps) {
  const { supabaseUser, profile, loading, isOnboarded, isAdmin, isManagerOrAbove } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;

    // 未ログインの場合はログインページへ
    if (!supabaseUser) {
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

    // マネージャー以上の権限が必要な場合
    if (requireManager && !isManagerOrAbove) {
      router.push('/dashboard');
      return;
    }
  }, [supabaseUser, profile, loading, isOnboarded, isAdmin, isManagerOrAbove, requireAdmin, requireManager, router, pathname]);

  if (loading) {
    return <Loading fullScreen text="認証情報を確認中..." />;
  }

  if (!supabaseUser) {
    return null;
  }

  if (!isOnboarded && pathname !== '/onboarding') {
    return null;
  }

  if (requireAdmin && !isAdmin) {
    return null;
  }

  if (requireManager && !isManagerOrAbove) {
    return null;
  }

  return <>{children}</>;
}
