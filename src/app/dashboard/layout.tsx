'use client';

/**
 * ダッシュボードレイアウト
 *
 * Ticket 093: オンボーディングゲート追加
 * - staff/leader は必須文書署名が完了するまで /onboarding/contracts にリダイレクト
 */

import { ReactNode } from 'react';
import { AuthGuard } from '@/components/AuthGuard';
import { OnboardingGuard } from '@/components/OnboardingGuard';
import { Header } from '@/components/Header';
import { PreviewBadge } from '@/components/PreviewBadge';
import { RolePreviewBanner } from '@/components/navigation/RolePreviewBanner';

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <AuthGuard>
      <OnboardingGuard>
        <div className="min-h-screen bg-zinc-50">
          <Header />
          <RolePreviewBanner />
          <PreviewBadge />
          <main className="pb-20 md:pb-8">
            {children}
          </main>
        </div>
      </OnboardingGuard>
    </AuthGuard>
  );
}
