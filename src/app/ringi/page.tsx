'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// 旧URL /ringi から新URL /dashboard/approvals へリダイレクト
export default function RingiListPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard/approvals');
  }, [router]);

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900" />
    </div>
  );
}
