'use client';

/**
 * HR オフボーディングページ
 *
 * Ticket 110: HR 入退社基盤
 *
 * - オフボーディングタスク一覧
 * - タスク完了処理
 * - 退社処理開始
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

// ========== 型定義 ==========

interface OffboardingTask {
  id: string;
  userId: string;
  status: 'open' | 'done';
  taskType: string;
  dueAt: string;
  doneAt: string | null;
  doneByUserId: string | null;
  note: string | null;
}

interface HrEmployee {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  employmentStatus: string;
}

const TASK_TYPE_CONFIG: Record<string, { label: string; description: string }> = {
  disable_account: { label: 'アカウント無効化', description: 'ログインを即座に停止' },
  revoke_permissions: { label: '権限剥奪', description: 'ロールを無効化' },
  revoke_external_access: { label: '外部アクセス無効化', description: '外部共有を無効化' },
  collect_devices: { label: '端末回収', description: '貸与端末・備品の回収' },
  export_audit: { label: '監査ログエクスポート', description: '操作ログのエクスポート' },
  archive_documents: { label: 'ドキュメントアーカイブ', description: '関連文書のアーカイブ' },
};

// ========== メインコンポーネント ==========

export default function HrOffboardingPage() {
  const searchParams = useSearchParams();
  const initialUserId = searchParams.get('userId');

  const [tasks, setTasks] = useState<OffboardingTask[]>([]);
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'open' | 'done'>('open');
  const [showTerminateModal, setShowTerminateModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<HrEmployee | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [tasksRes, employeesRes] = await Promise.all([
        fetch('/api/hr/offboarding-tasks'),
        fetch('/api/hr/employees?status=active'),
      ]);

      if (tasksRes.ok) {
        const data = await tasksRes.json();
        setTasks(data.tasks);
      }

      if (employeesRes.ok) {
        const data = await employeesRes.json();
        setEmployees(data.employees);

        // 初期選択
        if (initialUserId) {
          const emp = data.employees.find((e: HrEmployee) => e.userId === initialUserId);
          if (emp) {
            setSelectedEmployee(emp);
            setShowTerminateModal(true);
          }
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [initialUserId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCompleteTask = async (taskId: string) => {
    if (!confirm('このタスクを完了としてマークしますか？')) return;

    try {
      const res = await fetch(`/api/hr/offboarding-tasks/${taskId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (res.ok) {
        fetchData();
      } else {
        alert('エラーが発生しました');
      }
    } catch {
      alert('エラーが発生しました');
    }
  };

  const filteredTasks = tasks.filter((task) => {
    if (filter === 'all') return true;
    return task.status === filter;
  });

  // タスクをユーザーごとにグループ化
  const tasksByUser = filteredTasks.reduce((acc, task) => {
    if (!acc[task.userId]) acc[task.userId] = [];
    acc[task.userId].push(task);
    return acc;
  }, {} as Record<string, OffboardingTask[]>);

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
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">オフボーディング</h1>
          <p className="text-sm text-gray-600 mt-1">
            退社処理・タスク管理
          </p>
        </div>
        <button
          onClick={() => setShowTerminateModal(true)}
          className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg"
        >
          退社処理を開始
        </button>
      </div>

      {/* サマリー */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="text-xs text-red-600">未完了タスク</div>
          <div className="text-2xl font-bold text-red-700">
            {tasks.filter((t) => t.status === 'open').length}
          </div>
        </div>
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="text-xs text-green-600">完了タスク</div>
          <div className="text-2xl font-bold text-green-700">
            {tasks.filter((t) => t.status === 'done').length}
          </div>
        </div>
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="text-xs text-amber-600">対象者数</div>
          <div className="text-2xl font-bold text-amber-700">
            {Object.keys(tasksByUser).length}
          </div>
        </div>
      </div>

      {/* フィルター */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setFilter('open')}
          className={`px-3 py-1.5 text-sm rounded ${filter === 'open' ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
        >
          未完了
        </button>
        <button
          onClick={() => setFilter('done')}
          className={`px-3 py-1.5 text-sm rounded ${filter === 'done' ? 'bg-green-600 text-white' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
        >
          完了
        </button>
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 text-sm rounded ${filter === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          全て
        </button>
      </div>

      {/* タスク一覧（ユーザーごと） */}
      {Object.keys(tasksByUser).length === 0 ? (
        <div className="p-8 text-center text-gray-500 bg-white rounded-lg border border-gray-200">
          該当するタスクがありません
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(tasksByUser).map(([userId, userTasks]) => (
            <div key={userId} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                <div className="font-medium text-gray-900">ユーザーID: {userId}</div>
                <div className="text-xs text-gray-500">
                  {userTasks.filter((t) => t.status === 'done').length} / {userTasks.length} 完了
                </div>
              </div>
              <div className="divide-y divide-gray-100">
                {userTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onComplete={() => handleCompleteTask(task.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 関連リンク */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h3 className="text-sm font-medium text-gray-700 mb-3">関連リンク</h3>
        <div className="flex flex-wrap gap-3">
          <Link href="/dashboard/hr/employees" className="text-sm text-blue-600 hover:underline">
            従業員管理
          </Link>
          <Link href="/dashboard/audit" className="text-sm text-blue-600 hover:underline">
            監査ログ
          </Link>
        </div>
      </div>

      {/* 退社処理モーダル */}
      {showTerminateModal && (
        <TerminateModal
          employees={employees}
          initialEmployee={selectedEmployee}
          onClose={() => {
            setShowTerminateModal(false);
            setSelectedEmployee(null);
          }}
          onSuccess={() => {
            setShowTerminateModal(false);
            setSelectedEmployee(null);
            fetchData();
          }}
        />
      )}
    </div>
  );
}

// ========== サブコンポーネント ==========

function TaskRow({
  task,
  onComplete,
}: {
  task: OffboardingTask;
  onComplete: () => void;
}) {
  const config = TASK_TYPE_CONFIG[task.taskType] || { label: task.taskType, description: '' };
  const isOverdue = task.status === 'open' && new Date(task.dueAt) < new Date();

  return (
    <div className="px-4 py-3 flex items-center justify-between">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900">{config.label}</span>
          {task.status === 'done' && (
            <span className="px-2 py-0.5 text-xs font-medium rounded bg-green-100 text-green-700">
              完了
            </span>
          )}
          {isOverdue && (
            <span className="px-2 py-0.5 text-xs font-medium rounded bg-red-100 text-red-700">
              期限超過
            </span>
          )}
        </div>
        <div className="text-xs text-gray-500">{config.description}</div>
        <div className="text-xs text-gray-400 mt-1">
          期限: {new Date(task.dueAt).toLocaleDateString('ja-JP')}
          {task.doneAt && ` / 完了: ${new Date(task.doneAt).toLocaleDateString('ja-JP')}`}
        </div>
      </div>
      {task.status === 'open' && (
        <button
          onClick={onComplete}
          className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded"
        >
          完了
        </button>
      )}
    </div>
  );
}

function TerminateModal({
  employees,
  initialEmployee,
  onClose,
  onSuccess,
}: {
  employees: HrEmployee[];
  initialEmployee: HrEmployee | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string>(initialEmployee?.id || '');
  const [terminationDate, setTerminationDate] = useState(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) {
      setError('対象者を選択してください');
      return;
    }

    if (!confirm('この従業員の退社処理を開始しますか？この操作は取り消せません。')) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/hr/employees/${selectedId}/terminate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          terminationDate,
          terminationReason: reason || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to terminate');
      }

      const data = await res.json();
      alert(data.message || '退社処理を開始しました');
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
        <div className="p-4 border-b border-gray-200 bg-red-50">
          <h2 className="text-lg font-semibold text-red-900">退社処理を開始</h2>
          <p className="text-xs text-red-700 mt-1">
            オフボーディングタスクが自動生成されます
          </p>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">対象者</label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
            >
              <option value="">選択してください</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.displayName} ({emp.email})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">退社日</label>
            <input
              type="date"
              value={terminationDate}
              onChange={(e) => setTerminationDate(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">退社理由（任意）</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              placeholder="自己都合、定年退職、など"
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
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50"
            >
              {submitting ? '処理中...' : '退社処理を開始'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
