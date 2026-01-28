'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// 旧URL /ringi/new から新URL /dashboard/approvals/new へリダイレクト
export default function NewRingiPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard/approvals/new');
  }, [router]);

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900" />
    </div>
  );
}
