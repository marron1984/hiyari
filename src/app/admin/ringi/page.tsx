import { redirect } from 'next/navigation';

// /admin/ringi は /dashboard/admin/ringi へリダイレクト（正規URLを統一）
export default function AdminRingiRedirectPage() {
  redirect('/dashboard/admin/ringi');
}
