'use client';

import { useEffect, useState, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Loading } from './Loading';
import { AlertTriangle, RefreshCw, LogIn, Activity } from 'lucide-react';
import { Button } from './ui';

interface AuthGuardProps {
  children: ReactNode;
  requireAdmin?: boolean;
}

// 認証タイムアウト（秒）
const AUTH_TIMEOUT_SECONDS = 8;

export function AuthGuard({ children, requireAdmin = false }: AuthGuardProps) {
  const { firebaseUser, user, loading, isOnboarded, isAdmin } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [authTimeout, setAuthTimeout] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);

  // 認証タイムアウト検知
  useEffect(() => {
    if (!loading) {
      setAuthTimeout(false);
      setElapsedTime(0);
      return;
    }

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setElapsedTime(elapsed);

      if (elapsed >= AUTH_TIMEOUT_SECONDS) {
        setAuthTimeout(true);
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [loading]);

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

  // 認証タイムアウト時の表示
  if (loading && authTimeout) {
    return (
      <div className="fixed inset-0 bg-white flex items-center justify-center z-50">
        <div className="flex flex-col items-center space-y-4 max-w-md mx-4 text-center">
          <AlertTriangle className="w-12 h-12 text-yellow-500" />
          <h2 className="text-lg font-semibold text-gray-800">
            認証確認が長引いています
          </h2>
          <p className="text-sm text-gray-600">
            ネットワーク接続またはサーバーの問題が発生している可能性があります。
          </p>
          <p className="text-xs text-gray-400">
            経過時間: {elapsedTime}秒
          </p>

          <div className="flex flex-col sm:flex-row gap-3 mt-4">
            <Button
              onClick={() => window.location.reload()}
              className="flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              再読み込み
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push('/login')}
              className="flex items-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              ログインへ戻る
            </Button>
          </div>

          <div className="mt-6 pt-4 border-t border-gray-200 w-full">
            <p className="text-xs text-gray-400 mb-2">管理者向け</p>
            <a
              href="/api/health"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline flex items-center justify-center gap-1"
            >
              <Activity className="w-3 h-3" />
              /api/health を確認
            </a>
          </div>
        </div>
      </div>
    );
  }

  // 通常のローディング表示（経過時間付き）
  if (loading) {
    return (
      <div className="fixed inset-0 bg-white flex items-center justify-center z-50">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-600">認証情報を確認中...</p>
          {elapsedTime > 3 && (
            <p className="text-xs text-gray-400">{elapsedTime}秒経過</p>
          )}
        </div>
      </div>
    );
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
