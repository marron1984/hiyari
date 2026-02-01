'use client';

import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/Header';
import { Card, Button } from '@/components/ui';
import { Select } from '@/components/ui/Select';
import { Loading } from '@/components/Loading';
import { Shield, Users, History, CheckCircle, XCircle, Search, RefreshCw } from 'lucide-react';
import type { AppRole } from '@/config/appRoles';
import type { ManagedUser, RoleChangeEvent } from '@/lib/roles/types';

// ロールオプション
const ROLE_OPTIONS: { value: AppRole; label: string }[] = [
  { value: 'admin', label: '管理者' },
  { value: 'executive', label: '経営層' },
  { value: 'manager', label: 'マネージャー' },
  { value: 'leader', label: 'リーダー' },
  { value: 'staff', label: 'スタッフ' },
  { value: 'auditor', label: '監査' },
];

// ロール表示色
const ROLE_COLORS: Record<AppRole, string> = {
  admin: 'bg-red-100 text-red-700',
  executive: 'bg-purple-100 text-purple-700',
  manager: 'bg-indigo-100 text-indigo-700',
  leader: 'bg-blue-100 text-blue-700',
  staff: 'bg-zinc-100 text-zinc-700',
  auditor: 'bg-amber-100 text-amber-700',
};

// ロールラベル
const ROLE_LABELS: Record<AppRole, string> = {
  admin: '管理者',
  executive: '経営層',
  manager: 'マネージャー',
  leader: 'リーダー',
  staff: 'スタッフ',
  auditor: '監査',
};

interface RoleStats {
  total: number;
  byRole: Record<AppRole, number>;
}

export default function RolesPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [events, setEvents] = useState<RoleChangeEvent[]>([]);
  const [stats, setStats] = useState<RoleStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<AppRole | ''>('');
  const [activeTab, setActiveTab] = useState<'users' | 'history'>('users');
  const [changeNote, setChangeNote] = useState('');
  const [pendingChange, setPendingChange] = useState<{ userId: string; newRole: AppRole } | null>(null);

  // データ取得
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterRole) params.set('role', filterRole);
      if (searchTerm) params.set('search', searchTerm);

      const [usersRes, eventsRes, statsRes] = await Promise.all([
        fetch(`/api/admin/roles/users?${params}`),
        fetch('/api/admin/roles/events?limit=50'),
        fetch('/api/admin/roles/stats'),
      ]);

      if (usersRes.ok) {
        const data = await usersRes.json();
        setUsers(data.users);
      }
      if (eventsRes.ok) {
        const data = await eventsRes.json();
        setEvents(data.events);
      }
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
      setMessage({ type: 'error', text: 'データの取得に失敗しました' });
    } finally {
      setLoading(false);
    }
  }, [filterRole, searchTerm]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ロール変更確認ダイアログを表示
  const handleRoleChangeRequest = (userId: string, newRole: AppRole) => {
    const user = users.find((u) => u.id === userId);
    if (!user || user.role === newRole) return;
    setPendingChange({ userId, newRole });
    setChangeNote('');
  };

  // ロール変更を実行
  const executeRoleChange = async () => {
    if (!pendingChange) return;

    setSaving(pendingChange.userId);
    setMessage(null);

    try {
      const res = await fetch(`/api/admin/roles/users/${pendingChange.userId}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newRole: pendingChange.newRole,
          note: changeNote || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessage({ type: 'success', text: data.message });
        // リロード
        fetchData();
      } else {
        const err = await res.json();
        setMessage({ type: 'error', text: err.error || 'ロール変更に失敗しました' });
      }
    } catch (err) {
      console.error('Failed to change role:', err);
      setMessage({ type: 'error', text: 'ロール変更に失敗しました' });
    } finally {
      setSaving(null);
      setPendingChange(null);
      setChangeNote('');
    }
  };

  // 日時フォーマット
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return <Loading />;
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <Header />

      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-zinc-700" />
            <h1 className="text-xl font-bold">権限ロール管理（RBAC）</h1>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="w-4 h-4 mr-1" />
            更新
          </Button>
        </div>

        {message && (
          <div
            className={`mb-6 px-4 py-3 rounded-lg flex items-center gap-2 ${
              message.type === 'success'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <XCircle className="w-4 h-4" />
            )}
            {message.text}
          </div>
        )}

        {/* 統計カード */}
        {stats && (
          <Card className="mb-6">
            <div className="p-4">
              <h2 className="font-semibold mb-4">ロール統計</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                <div className="p-3 bg-zinc-50 rounded-lg text-center">
                  <div className="text-2xl font-bold">{stats.total}</div>
                  <div className="text-xs text-zinc-500">総ユーザー</div>
                </div>
                {(Object.keys(stats.byRole) as AppRole[]).map((role) => (
                  <div
                    key={role}
                    className={`p-3 rounded-lg text-center ${ROLE_COLORS[role].replace('text-', 'bg-').split(' ')[0]} bg-opacity-30`}
                  >
                    <div className="text-2xl font-bold">{stats.byRole[role]}</div>
                    <div className="text-xs text-zinc-600">{ROLE_LABELS[role]}</div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* タブ */}
        <div className="flex gap-2 mb-4">
          <Button
            variant={activeTab === 'users' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('users')}
          >
            <Users className="w-4 h-4 mr-1" />
            ユーザー一覧
          </Button>
          <Button
            variant={activeTab === 'history' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('history')}
          >
            <History className="w-4 h-4 mr-1" />
            変更履歴
          </Button>
        </div>

        {/* ユーザー一覧タブ */}
        {activeTab === 'users' && (
          <Card>
            <div className="p-4">
              {/* フィルタ */}
              <div className="flex flex-wrap gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="名前・メールで検索"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="px-3 py-2 border border-zinc-300 rounded-lg text-sm w-64"
                  />
                </div>
                <Select
                  value={filterRole}
                  onChange={(e) => setFilterRole(e.target.value as AppRole | '')}
                  options={[
                    { value: '', label: 'すべてのロール' },
                    ...ROLE_OPTIONS,
                  ]}
                />
              </div>

              {/* テーブル */}
              {users.length === 0 ? (
                <p className="text-zinc-500 text-center py-8">ユーザーが見つかりません</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-50">
                      <tr>
                        <th className="px-4 py-3 text-left">ユーザー</th>
                        <th className="px-4 py-3 text-left">メール</th>
                        <th className="px-4 py-3 text-left">事業所</th>
                        <th className="px-4 py-3 text-left">職種</th>
                        <th className="px-4 py-3 text-left">現在のロール</th>
                        <th className="px-4 py-3 text-left">ロール変更</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {users.map((u) => (
                        <tr key={u.id} className="hover:bg-zinc-50">
                          <td className="px-4 py-3 font-medium">{u.name}</td>
                          <td className="px-4 py-3 text-zinc-600">{u.email}</td>
                          <td className="px-4 py-3 text-zinc-600">{u.branchId || '-'}</td>
                          <td className="px-4 py-3 text-zinc-600">{u.jobType || '-'}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded text-xs ${ROLE_COLORS[u.role]}`}>
                              {ROLE_LABELS[u.role]}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <Select
                              value={u.role}
                              onChange={(e) =>
                                handleRoleChangeRequest(u.id, e.target.value as AppRole)
                              }
                              options={ROLE_OPTIONS}
                              disabled={saving === u.id}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* 変更履歴タブ */}
        {activeTab === 'history' && (
          <Card>
            <div className="p-4">
              <h2 className="font-semibold mb-4">ロール変更履歴（監査ログ）</h2>
              {events.length === 0 ? (
                <p className="text-zinc-500 text-center py-8">変更履歴がありません</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-50">
                      <tr>
                        <th className="px-4 py-3 text-left">日時</th>
                        <th className="px-4 py-3 text-left">対象ユーザー</th>
                        <th className="px-4 py-3 text-left">変更前</th>
                        <th className="px-4 py-3 text-left">変更後</th>
                        <th className="px-4 py-3 text-left">実行者</th>
                        <th className="px-4 py-3 text-left">備考</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {events.map((e) => (
                        <tr key={e.id} className="hover:bg-zinc-50">
                          <td className="px-4 py-3 text-zinc-600">{formatDate(e.createdAt)}</td>
                          <td className="px-4 py-3">
                            <div className="font-medium">{e.targetUserName}</div>
                            <div className="text-xs text-zinc-400">{e.targetUserEmail}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded text-xs ${ROLE_COLORS[e.oldRole]}`}>
                              {ROLE_LABELS[e.oldRole]}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded text-xs ${ROLE_COLORS[e.newRole]}`}>
                              {ROLE_LABELS[e.newRole]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-zinc-600">{e.actorUserName}</td>
                          <td className="px-4 py-3 text-zinc-500">{e.note || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* ロール変更確認モーダル */}
        {pendingChange && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
              <h3 className="text-lg font-semibold mb-4">ロール変更の確認</h3>
              {(() => {
                const user = users.find((u) => u.id === pendingChange.userId);
                if (!user) return null;
                return (
                  <div className="mb-4">
                    <p className="text-sm text-zinc-600 mb-2">
                      <strong>{user.name}</strong> のロールを変更します：
                    </p>
                    <div className="flex items-center gap-2 mb-4">
                      <span className={`px-2 py-1 rounded text-xs ${ROLE_COLORS[user.role]}`}>
                        {ROLE_LABELS[user.role]}
                      </span>
                      <span className="text-zinc-400">→</span>
                      <span
                        className={`px-2 py-1 rounded text-xs ${ROLE_COLORS[pendingChange.newRole]}`}
                      >
                        {ROLE_LABELS[pendingChange.newRole]}
                      </span>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1">
                        変更理由（任意）
                      </label>
                      <input
                        type="text"
                        value={changeNote}
                        onChange={(e) => setChangeNote(e.target.value)}
                        placeholder="例：昇進のため"
                        className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm"
                      />
                    </div>
                  </div>
                );
              })()}
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setPendingChange(null);
                    setChangeNote('');
                  }}
                >
                  キャンセル
                </Button>
                <Button variant="primary" onClick={executeRoleChange} disabled={!!saving}>
                  {saving ? '変更中...' : '変更を確定'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
