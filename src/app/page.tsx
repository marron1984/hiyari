'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Loading } from '@/components/Loading';

export default function HomePage() {
  const { supabaseUser, loading, isOnboarded } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (!supabaseUser) {
      router.push('/login');
    } else if (!isOnboarded) {
      router.push('/onboarding');
    } else {
      router.push('/dashboard');
    }
  }, [supabaseUser, loading, isOnboarded, router]);

  return <Loading fullScreen text="リダイレクト中..." />;
}
