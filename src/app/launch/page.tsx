'use client';

import { redirect } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { LAUNCH_MODE } from '@/config/launchMode';
import { LaunchModeDashboard } from '@/components/launchMode/LaunchModeDashboard';

/**
 * /launch - Launch Mode 専用トップページ
 *
 * LaunchModeDashboard コンポーネントを描画する。
 * Header / MobileBottomNav は Providers 経由で自動表示。
 *
 * LAUNCH_MODE=false の場合は /dashboard へリダイレクト。
 */
export default function LaunchPage() {
  if (!LAUNCH_MODE) {
    redirect('/dashboard');
  }

  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900" />
          <p className="text-sm text-zinc-500">読み込み中...</p>
        </div>
      </div>
    );
  }

  return <LaunchModeDashboard />;
}
