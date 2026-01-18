'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Loading } from '@/components/Loading';

export default function HomePage() {
  const { firebaseUser, loading, isOnboarded } = useAuth();
  const router = useRouter();

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

  return <Loading fullScreen text="リダイレクト中..." />;
}
