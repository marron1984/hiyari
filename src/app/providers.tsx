'use client';

import { ReactNode } from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import { MobileBottomNav } from '@/components/navigation';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      {children}
      <MobileBottomNav />
    </AuthProvider>
  );
}
