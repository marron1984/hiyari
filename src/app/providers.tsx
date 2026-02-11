'use client';

import { ReactNode } from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import { RoleProvider } from '@/contexts/RoleContext';
import { MobileBottomNav } from '@/components/navigation';
import { ToastProvider } from '@/components/ui/Toast';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <RoleProvider>
        <ToastProvider>
          {children}
          <MobileBottomNav />
        </ToastProvider>
      </RoleProvider>
    </AuthProvider>
  );
}
