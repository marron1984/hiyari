'use client';

import { ReactNode } from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import { RoleProvider } from '@/contexts/RoleContext';
import { MobileBottomNav } from '@/components/navigation';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <RoleProvider>
        {children}
        <MobileBottomNav />
      </RoleProvider>
    </AuthProvider>
  );
}
