'use client';

/**
 * ダッシュボードクライアントレイアウト
 *
 * Ticket 093: Server Componentから呼び出されるクライアントレイアウト
 *
 * Note: オンボーディングゲートはServer Component（layout.tsx）で処理済み
 */

import { ReactNode } from 'react';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { PreviewBadge } from '@/components/PreviewBadge';
import { RolePreviewBanner } from '@/components/navigation/RolePreviewBanner';
import { DesktopSidebar } from '@/components/navigation/DesktopSidebar';

interface DashboardClientLayoutProps {
  children: ReactNode;
}

export function DashboardClientLayout({ children }: DashboardClientLayoutProps) {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-50">
        <Header />
        <RolePreviewBanner />
        <PreviewBadge />
        <div className="flex">
          <DesktopSidebar />
          <main className="flex-1 min-w-0 pb-20 md:pb-8">
            {children}
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
