'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Loading } from '@/components/Loading';

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // URLからcodeを取得
        const url = new URL(window.location.href);
        const code = url.searchParams.get('code');

        if (code) {
          // コードをセッションに交換
          const { error } = await supabase.auth.exchangeCodeForSession(code);

          if (error) {
            console.error('Auth callback error:', error);
            router.push('/login?error=auth_error');
            return;
          }
        }

        // セッションを確認
        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
          router.push('/dashboard');
        } else {
          router.push('/login');
        }
      } catch (error) {
        console.error('Callback error:', error);
        router.push('/login?error=callback_error');
      }
    };

    handleCallback();
  }, [router]);

  return <Loading fullScreen text="認証処理中..." />;
}
