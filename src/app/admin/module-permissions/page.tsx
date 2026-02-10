'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardHeader, CardTitle, CardContent, Button, Input } from '@/components/ui';
import { hasMinRole } from '@/lib/auth';
import { Shield, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function ModulePermissionsPage() {
  return (
    <AuthGuard>
      <ModulePermissionsContent />
    </AuthGuard>
  );
}

function ModulePermissionsContent() {
  const { user, firebaseUser } = useAuth();
  const [email, setEmail] = useState('');
  const [prospectsCanEdit, setProspectsCanEdit] = useState(true);
  const [vacanciesCanEdit, setVacanciesCanEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const isAdmin = hasMinRole(user?.role, 'admin');

  const handleGrant = async () => {
    if (!email || !firebaseUser) return;

    setSaving(true);
    setResult(null);

    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/admin/module-permissions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          modulePermissions: {
            ...(prospectsCanEdit ? { prospects: { canEdit: true } } : {}),
            ...(vacanciesCanEdit ? { vacancies: { canEdit: true } } : {}),
          },
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setResult({ success: true, message: data.message });
        setEmail('');
      } else {
        setResult({ success: false, message: data.error || '更新に失敗しました' });
      }
    } catch (err) {
      setResult({
        success: false,
        message: err instanceof Error ? err.message : '通信エラーが発生しました',
      });
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <>
        <Header />
        <main className="max-w-2xl mx-auto py-8 px-4">
          <p className="text-red-600">管理者権限が必要です</p>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="max-w-2xl mx-auto py-8 px-4">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          管理画面に戻る
        </Link>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              モジュール権限設定
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-zinc-600 mb-6">
              ロール（リーダー以上）に関わらず、特定ユーザーにモジュールの編集権限を個別に付与できます。
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  対象ユーザーのメールアドレス
                </label>
                <Input
                  type="email"
                  placeholder="例: ikuta@aska-g.com"
                  value={email}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  付与する権限
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={prospectsCanEdit}
                      onChange={(e) => setProspectsCanEdit(e.target.checked)}
                      className="rounded border-zinc-300"
                    />
                    <span className="text-sm">入居希望者の編集権限</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={vacanciesCanEdit}
                      onChange={(e) => setVacanciesCanEdit(e.target.checked)}
                      className="rounded border-zinc-300"
                    />
                    <span className="text-sm">空室管理の編集権限</span>
                  </label>
                </div>
              </div>

              <Button
                onClick={handleGrant}
                disabled={!email || saving}
                className="w-full"
              >
                {saving ? '設定中...' : '権限を付与'}
              </Button>

              {result && (
                <div
                  className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
                    result.success
                      ? 'bg-green-50 text-green-700'
                      : 'bg-red-50 text-red-700'
                  }`}
                >
                  {result.success ? (
                    <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  )}
                  {result.message}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
