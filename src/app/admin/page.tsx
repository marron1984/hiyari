import { redirect } from 'next/navigation';

// /admin は /dashboard/admin へリダイレクト（正規URLを統一）
export default function AdminRedirectPage() {
  redirect('/dashboard/admin');
}
