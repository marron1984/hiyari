'use client';

/**
 * HR 従業員管理ページ
 *
 * Ticket 110: HR 入退社基盤
 *
 * - 入社予定者の登録（prehire）
 * - オンボーディング進捗表示
 * - 従業員一覧管理
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

// ========== 型定義 ==========

interface HrEmployee {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  role: string;
  employmentStatus: 'prehire' | 'active' | 'leave' | 'terminated';
  hireDate: string;
  onboardingStatus: 'pending' | 'completed' | null;
  businessUnitId: string | null;
}

interface HrStats {
  totalEmployees: number;
  prehire: number;
  active: number;
  leave: number;
  terminated: number;
  pendingOnboarding: number;
  openOffboardingTasks: number;
}

const STATUS_CONFIG = {
  prehire: { label: '入社予定', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  active: { label: '在籍中', color: 'text-green-700', bgColor: 'bg-green-100' },
  leave: { label: '休職中', color: 'text-amber-700', bgColor: 'bg-amber-100' },
  terminated: { label: '退社済', color: 'text-gray-700', bgColor: 'bg-gray-100' },
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'システム管理者',
  executive: '経営層',
  manager: '管理職',
  leader: 'リーダー',
  staff: '一般職員',
  auditor: '監査',
};

// ========== メインコンポーネント ==========

export default function HrEmployeesPage() {
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [stats, setStats] = useState<HrStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('');
  const [showAddModal, setShowAddModal] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/hr/employees?includeStats=true');
      if (res.ok) {
        const data = await res.json();
        setEmployees(data.employees);
        setStats(data.stats);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredEmployees = employees.filter((emp) => {
    if (!filter) return true;
    return emp.employmentStatus === filter;
  });

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">従業員管理</h1>
          <p className="text-sm text-gray-600 mt-1">
            入退社手続き・オンボーディング状況の管理
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
        >
          入社予定者を登録
        </button>
      </div>

      {/* 統計カード */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
          <StatCard label="入社予定" count={stats.prehire} color="blue" onClick={() => setFilter('prehire')} />
          <StatCard label="在籍中" count={stats.active} color="green" onClick={() => setFilter('active')} />
          <StatCard label="休職中" count={stats.leave} color="amber" onClick={() => setFilter('leave')} />
          <StatCard label="退社済" count={stats.terminated} color="gray" onClick={() => setFilter('terminated')} />
          <StatCard label="OB未完了" count={stats.pendingOnboarding} color="purple" onClick={() => setFilter('')} />
          <StatCard label="退社タスク" count={stats.openOffboardingTasks} color="red" />
        </div>
      )}

      {/* フィルター */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setFilter('')}
          className={`px-3 py-1.5 text-sm rounded ${!filter ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          全て
        </button>
        {Object.entries(STATUS_CONFIG).map(([key, config]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 text-sm rounded ${filter === key ? 'bg-gray-900 text-white' : `${config.bgColor} ${config.color} hover:opacity-80`}`}
          >
            {config.label}
          </button>
        ))}
      </div>

      {/* 従業員テーブル */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">名前</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ステータス</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ロール</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">入社日</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">OB状況</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredEmployees.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  従業員がいません
                </td>
              </tr>
            ) : (
              filteredEmployees.map((emp) => (
                <tr key={emp.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{emp.displayName}</div>
                    <div className="text-xs text-gray-500">{emp.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={emp.employmentStatus} />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {ROLE_LABELS[emp.role] || emp.role}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {emp.hireDate}
                  </td>
                  <td className="px-4 py-3">
                    <OnboardingBadge status={emp.onboardingStatus} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <Link
                        href={`/dashboard/hr/employees/${emp.id}`}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        詳細
                      </Link>
                      {emp.employmentStatus !== 'terminated' && (
                        <Link
                          href={`/dashboard/hr/offboarding?userId=${emp.userId}`}
                          className="text-xs text-red-600 hover:underline"
                        >
                          退社処理
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 関連リンク */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h3 className="text-sm font-medium text-gray-700 mb-3">関連リンク</h3>
        <div className="flex flex-wrap gap-3">
          <Link href="/dashboard/hr/offboarding" className="text-sm text-blue-600 hover:underline">
            オフボーディングタスク
          </Link>
          <Link href="/dashboard/training" className="text-sm text-blue-600 hover:underline">
            研修管理
          </Link>
          <Link href="/dashboard/e-sign" className="text-sm text-blue-600 hover:underline">
            電子署名
          </Link>
        </div>
      </div>

      {/* 登録モーダル */}
      {showAddModal && (
        <AddEmployeeModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            fetchData();
          }}
        />
      )}
    </div>
  );
}

// ========== サブコンポーネント ==========

function StatCard({
  label,
  count,
  color,
  onClick,
}: {
  label: string;
  count: number;
  color: string;
  onClick?: () => void;
}) {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    gray: 'bg-gray-50 border-gray-200 text-gray-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
    red: 'bg-red-50 border-red-200 text-red-700',
  };

  return (
    <button
      onClick={onClick}
      className={`p-3 rounded-lg border ${colorClasses[color]} text-left hover:opacity-80 transition-opacity`}
    >
      <div className="text-xs opacity-75">{label}</div>
      <div className="text-xl font-bold">{count}</div>
    </button>
  );
}

function StatusBadge({ status }: { status: keyof typeof STATUS_CONFIG }) {
  const config = STATUS_CONFIG[status];
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded ${config.bgColor} ${config.color}`}>
      {config.label}
    </span>
  );
}

function OnboardingBadge({ status }: { status: 'pending' | 'completed' | null }) {
  if (!status) return <span className="text-xs text-gray-400">-</span>;

  if (status === 'completed') {
    return (
      <span className="px-2 py-0.5 text-xs font-medium rounded bg-green-100 text-green-700">
        完了
      </span>
    );
  }

  return (
    <span className="px-2 py-0.5 text-xs font-medium rounded bg-amber-100 text-amber-700">
      未完了
    </span>
  );
}

function AddEmployeeModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    displayName: '',
    email: '',
    role: 'staff',
    hireDate: new Date().toISOString().split('T')[0],
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/hr/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create');
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">入社予定者を登録</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">氏名</label>
            <input
              type="text"
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ロール</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="staff">一般職員</option>
              <option value="leader">リーダー</option>
              <option value="manager">管理職</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">入社日</label>
            <input
              type="date"
              value={form.hireDate}
              onChange={(e) => setForm({ ...form, hireDate: e.target.value })}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
            >
              {submitting ? '登録中...' : '登録'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
