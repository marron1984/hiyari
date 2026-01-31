'use client';

import { ReactNode } from 'react';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { PreviewBadge } from '@/components/PreviewBadge';

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-50">
        <Header />
        <PreviewBadge />
        <main className="pb-20 md:pb-8">
          {children}
        </main>
      </div>
    </AuthGuard>
  );
}
