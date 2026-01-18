'use client';

import { ReactNode } from 'react';
import { SupabaseAuthProvider } from '@/contexts/SupabaseAuthContext';

export function Providers({ children }: { children: ReactNode }) {
  return <SupabaseAuthProvider>{children}</SupabaseAuthProvider>;
}
