'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, Button } from '@/components/ui';
import { Select } from '@/components/ui/Select';
import { Loading } from '@/components/Loading';
import { db, DEFAULT_TENANT_ID } from '@/lib/firebase';
import { BRANCHES_SEED } from '@/data/employees';
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  query,
  where,
} from 'firebase/firestore';
import { UserRole } from '@/types';
import { Shield, Users, Building2, CheckCircle } from 'lucide-react';
import { toDate } from '@/lib/date';

interface UserData {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  branchId?: string;
  branchName?: string;
  createdAt?: Date;
}

const ROLE_OPTIONS = [
  { value: 'user', label: '一般職員' },
  { value: 'leader', label: 'リーダー（自事業所承認可）' },
  { value: 'admin', label: '管理者（全事業所承認可）' },
  { value: 'system_admin', label: 'システム管理者' },
];

const ROLE_COLORS: Record<UserRole, string> = {
  user: 'bg-zinc-100 text-zinc-700',
  leader: 'bg-blue-100 text-blue-700',
  admin: 'bg-purple-100 text-purple-700',
  system_admin: 'bg-red-100 text-red-700',
};

const ROLE_LABELS: Record<UserRole, string> = {
  user: '一般職員',
  leader: 'リーダー',
  admin: '管理者',
  system_admin: 'システム管理者',
};

export default function UsersPage() {
  const { user: currentUser, isAdmin } = useAuth();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const branchMap = new Map<string, string>(
    BRANCHES_SEED.map((b) => [b.id, b.name])
  );

  const fetchUsers = useCallback(async () => {
    if (!db) return;

    try {
      setLoading(true);
      const q = query(
        collection(db, 'users'),
        where('tenantId', '==', DEFAULT_TENANT_ID)
      );
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          name: d.name || '',
          email: d.email || '',
          role: d.role || 'user',
          branchId: d.branchId,
          branchName: d.branchId ? branchMap.get(d.branchId) || d.branchId : undefined,
          createdAt: toDate(d.createdAt) ?? undefined,
        } as UserData;
      });
      // ロール順でソート（system_admin > admin > leader > user）
      const roleOrder: Record<UserRole, number> = { system_admin: 0, admin: 1, leader: 2, user: 3 };
      data.sort((a, b) => roleOrder[a.role] - roleOrder[b.role]);
      setUsers(data);
    } catch (err) {
      console.error('Failed to fetch users:', err);
      setMessage({ type: 'error', text: 'ユーザー一覧の取得に失敗しました' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleRoleChange = async (userId: string, newRole: UserRole) => {
    if (!db) return;

    // 自分自身のロールは変更不可
    if (userId === currentUser?.id) {
      setMessage({ type: 'error', text: '自分自身のロールは変更できません' });
      return;
    }

    setSaving(userId);
    setMessage(null);

    try {
      await updateDoc(doc(db, 'users', userId), {
        role: newRole,
      });

      // ローカル状態を更新
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );

      setMessage({ type: 'success', text: 'ロールを更新しました' });
    } catch (err) {
      console.error('Failed to update role:', err);
      setMessage({ type: 'error', text: 'ロールの更新に失敗しました' });
    } finally {
      setSaving(null);
    }
  };

  const handleBranchChange = async (userId: string, newBranchId: string) => {
    if (!db) return;

    setSaving(userId);
    setMessage(null);

    try {
      await updateDoc(doc(db, 'users', userId), {
        branchId: newBranchId,
      });

      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? { ...u, branchId: newBranchId, branchName: branchMap.get(newBranchId) || newBranchId }
            : u
        )
      );

      setMessage({ type: 'success', text: '所属事業所を更新しました' });
    } catch (err) {
      console.error('Failed to update branch:', err);
      setMessage({ type: 'error', text: '所属事業所の更新に失敗しました' });
    } finally {
      setSaving(null);
    }
  };

  if (!isAdmin) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-zinc-50">
          <Header />
          <main className="max-w-4xl mx-auto px-4 py-6">
            <div className="text-center py-12">
              <p className="text-zinc-600">このページは管理者のみアクセスできます</p>
            </div>
          </main>
        </div>
      </AuthGuard>
    );
  }

  if (loading) {
    return <Loading />;
  }

  // 統計
  const stats = {
    total: users.length,
    leaders: users.filter((u) => u.role === 'leader').length,
    admins: users.filter((u) => u.role === 'admin' || u.role === 'system_admin').length,
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-50">
        <Header />

        <main className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-6">
            <Shield className="w-6 h-6 text-zinc-700" />
            <h1 className="text-xl font-bold">ユーザー権限管理</h1>
          </div>

          {message && (
            <div
              className={`mb-6 px-4 py-3 rounded-lg flex items-center gap-2 ${
                message.type === 'success'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}
            >
              {message.type === 'success' && <CheckCircle className="w-4 h-4" />}
              {message.text}
            </div>
          )}

          {/* 権限説明 */}
          <Card className="mb-6">
            <div className="p-4">
              <h2 className="font-semibold mb-3">権限レベル</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                <div className="p-3 bg-zinc-50 rounded-lg">
                  <span className={`px-2 py-1 rounded text-xs ${ROLE_COLORS.user}`}>一般職員</span>
                  <p className="mt-2 text-zinc-600">報告・申請のみ</p>
                </div>
                <div className="p-3 bg-blue-50 rounded-lg">
                  <span className={`px-2 py-1 rounded text-xs ${ROLE_COLORS.leader}`}>リーダー</span>
                  <p className="mt-2 text-zinc-600">自事業所の承認可</p>
                </div>
                <div className="p-3 bg-purple-50 rounded-lg">
                  <span className={`px-2 py-1 rounded text-xs ${ROLE_COLORS.admin}`}>管理者</span>
                  <p className="mt-2 text-zinc-600">全事業所の承認可</p>
                </div>
                <div className="p-3 bg-red-50 rounded-lg">
                  <span className={`px-2 py-1 rounded text-xs ${ROLE_COLORS.system_admin}`}>システム管理者</span>
                  <p className="mt-2 text-zinc-600">全権限</p>
                </div>
              </div>
            </div>
          </Card>

          {/* 統計 */}
          <Card className="mb-6">
            <div className="p-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="flex items-center gap-3">
                  <Users className="w-8 h-8 text-zinc-400" />
                  <div>
                    <div className="text-2xl font-bold">{stats.total}</div>
                    <div className="text-sm text-zinc-500">総ユーザー数</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Building2 className="w-8 h-8 text-blue-400" />
                  <div>
                    <div className="text-2xl font-bold text-blue-600">{stats.leaders}</div>
                    <div className="text-sm text-zinc-500">リーダー</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Shield className="w-8 h-8 text-purple-400" />
                  <div>
                    <div className="text-2xl font-bold text-purple-600">{stats.admins}</div>
                    <div className="text-sm text-zinc-500">管理者以上</div>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* ユーザー一覧 */}
          <Card>
            <div className="p-4">
              <h2 className="font-semibold mb-4">ユーザー一覧</h2>
              {users.length === 0 ? (
                <p className="text-zinc-500 text-center py-8">ユーザーがいません</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-50">
                      <tr>
                        <th className="px-4 py-3 text-left">ユーザー</th>
                        <th className="px-4 py-3 text-left">メール</th>
                        <th className="px-4 py-3 text-left">所属事業所</th>
                        <th className="px-4 py-3 text-left">現在のロール</th>
                        <th className="px-4 py-3 text-left">ロール変更</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {users.map((u) => (
                        <tr key={u.id} className="hover:bg-zinc-50">
                          <td className="px-4 py-3">
                            <div className="font-medium">{u.name}</div>
                            {u.id === currentUser?.id && (
                              <span className="text-xs text-zinc-400">（自分）</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-zinc-600">{u.email}</td>
                          <td className="px-4 py-3">
                            <Select
                              value={u.branchId || ''}
                              onChange={(e) => handleBranchChange(u.id, e.target.value)}
                              options={[
                                { value: '', label: '未設定' },
                                ...BRANCHES_SEED.map((b) => ({ value: b.id, label: b.name })),
                              ]}
                              disabled={saving === u.id}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded text-xs ${ROLE_COLORS[u.role]}`}>
                              {ROLE_LABELS[u.role]}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {u.id === currentUser?.id ? (
                              <span className="text-xs text-zinc-400">変更不可</span>
                            ) : (
                              <Select
                                value={u.role}
                                onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}
                                options={ROLE_OPTIONS}
                                disabled={saving === u.id}
                              />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
        </main>
      </div>
    </AuthGuard>
  );
}
