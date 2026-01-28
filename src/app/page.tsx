'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { AlertTriangle, RefreshCw, LogIn, Activity } from 'lucide-react';

// リダイレクトタイムアウト（秒）
const REDIRECT_TIMEOUT_SECONDS = 5;

export default function HomePage() {
  const { firebaseUser, loading, isOnboarded } = useAuth();
  const router = useRouter();
  const [timeout, setTimeout_] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);

  // タイムアウト検知
  useEffect(() => {
    if (!loading) {
      setTimeout_(false);
      setElapsedTime(0);
      return;
    }

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setElapsedTime(elapsed);

      if (elapsed >= REDIRECT_TIMEOUT_SECONDS) {
        setTimeout_(true);
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [loading]);

  useEffect(() => {
    if (loading) return;

    if (!firebaseUser) {
      router.push('/login');
    } else if (!isOnboarded) {
      router.push('/onboarding');
    } else {
      router.push('/dashboard');
    }
  }, [firebaseUser, loading, isOnboarded, router]);

  // タイムアウト時の表示
  if (timeout) {
    return (
      <div className="fixed inset-0 bg-white flex items-center justify-center z-50">
        <div className="flex flex-col items-center space-y-4 max-w-md mx-4 text-center">
          <AlertTriangle className="w-12 h-12 text-yellow-500" />
          <h2 className="text-lg font-semibold text-gray-800">
            ログイン状態を確認できませんでした
          </h2>
          <p className="text-sm text-gray-600">
            ネットワーク接続またはサーバーの問題が発生している可能性があります。
          </p>
          <p className="text-xs text-gray-400">
            経過時間: {elapsedTime}秒
          </p>

          <div className="flex flex-col sm:flex-row gap-3 mt-4">
            <button
              onClick={() => window.location.reload()}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              再読み込み
            </button>
            <button
              onClick={() => router.push('/login')}
              className="flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <LogIn className="w-4 h-4" />
              ログインページへ
            </button>
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

  // 通常のローディング表示
  return (
    <div className="fixed inset-0 bg-white flex items-center justify-center z-50">
      <div className="flex flex-col items-center space-y-3">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-600">リダイレクト中...</p>
        {elapsedTime > 2 && (
          <p className="text-xs text-gray-400">{elapsedTime}秒経過</p>
        )}
      </div>
    </div>
  );
}
