'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Wallet,
  AlertTriangle,
  Clock,
  TrendingUp,
  Plus,
  Search,
  Filter,
  Phone,
  Mail,
  User,
  Calendar,
  ChevronRight,
} from 'lucide-react';
import type {
  Receivable,
  ReceivableStatus,
  ReceivablePriority,
  ReceivableSubjectType,
  NextActionType,
} from '@/lib/receivables/types';
import {
  RECEIVABLE_STATUS_LABELS,
  RECEIVABLE_STATUS_COLORS,
  RECEIVABLE_PRIORITY_LABELS,
  RECEIVABLE_PRIORITY_COLORS,
  RECEIVABLE_SUBJECT_TYPE_LABELS,
  formatAmount,
  maskSubjectName,
} from '@/lib/receivables/types';

// タブ定義
type TabType = 'overdue' | 'high_amount' | 'long_aging' | 'my_assigned' | 'all';

const TABS: { id: TabType; label: string; icon: React.ReactNode }[] = [
  { id: 'overdue', label: '期限超過', icon: <AlertTriangle className="h-4 w-4" /> },
  { id: 'high_amount', label: '高額', icon: <TrendingUp className="h-4 w-4" /> },
  { id: 'long_aging', label: '長期滞留', icon: <Clock className="h-4 w-4" /> },
  { id: 'my_assigned', label: '自分の担当', icon: <User className="h-4 w-4" /> },
  { id: 'all', label: '全体', icon: <Wallet className="h-4 w-4" /> },
];

interface Stats {
  openTotal: number;
  overdueTotal: number;
  overdueCount: number;
  criticalOverdueCount: number;
  countByStatus: Record<ReceivableStatus, number>;
  agingBuckets: {
    '1-30': number;
    '31-60': number;
    '61-90': number;
    '90+': number;
  };
  totalAmount: number;
}

export default function ReceivablesPage() {
  const [activeTab, setActiveTab] = useState<TabType>('overdue');
  const [items, setItems] = useState<Receivable[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ReceivableStatus | ''>('');
  const [priorityFilter, setPriorityFilter] = useState<ReceivablePriority | ''>('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // フェッチ
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // タブに応じたフィルタ
      const params = new URLSearchParams();
      if (activeTab === 'overdue') {
        params.set('overdue', 'true');
      } else if (activeTab === 'high_amount') {
        params.set('amountMin', '100000');
      } else if (activeTab === 'long_aging') {
        params.set('agingMinDays', '30');
      } else if (activeTab === 'my_assigned') {
        params.set('ownerUserId', 'user_manager'); // デモ用
      }
      if (statusFilter) {
        params.set('status', statusFilter);
      }
      if (priorityFilter) {
        params.set('priority', priorityFilter);
      }
      if (searchQuery) {
        params.set('q', searchQuery);
      }

      const [itemsRes, statsRes] = await Promise.all([
        fetch(`/api/receivables?${params.toString()}`),
        fetch('/api/receivables/stats'),
      ]);

      if (itemsRes.ok) {
        const data = await itemsRes.json();
        setItems(data.items);
      }
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, [activeTab, statusFilter, priorityFilter, searchQuery]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 新規作成
  const handleCreate = async (formData: CreateFormData) => {
    try {
      const res = await fetch('/api/receivables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        setShowCreateModal(false);
        fetchData();
      }
    } catch (error) {
      console.error('Error creating receivable:', error);
    }
  };

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-900">
            <Wallet className="h-6 w-6" />
            未収管理
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            未収金の一覧・回収状況を管理
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          <Plus className="h-4 w-4" />
          新規登録
        </button>
      </div>

      {/* 統計カード */}
      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Wallet className="h-4 w-4" />
              未回収総額
            </div>
            <p className="mt-2 text-2xl font-bold text-zinc-900">
              {formatAmount(stats.openTotal)}
            </p>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertTriangle className="h-4 w-4" />
              期限超過
            </div>
            <p className="mt-2 text-2xl font-bold text-red-700">
              {formatAmount(stats.overdueTotal)}
            </p>
            <p className="mt-1 text-xs text-red-500">
              {stats.overdueCount}件（緊急: {stats.criticalOverdueCount}件）
            </p>
          </div>
          <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
            <div className="flex items-center gap-2 text-sm text-orange-600">
              <Clock className="h-4 w-4" />
              長期滞留（60日超）
            </div>
            <p className="mt-2 text-2xl font-bold text-orange-700">
              {formatAmount(stats.agingBuckets['61-90'] + stats.agingBuckets['90+'])}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <TrendingUp className="h-4 w-4" />
              経過日数内訳
            </div>
            <div className="mt-2 space-y-1 text-xs">
              <div className="flex justify-between">
                <span>1-30日</span>
                <span className="font-medium">{formatAmount(stats.agingBuckets['1-30'])}</span>
              </div>
              <div className="flex justify-between">
                <span>31-60日</span>
                <span className="font-medium">{formatAmount(stats.agingBuckets['31-60'])}</span>
              </div>
              <div className="flex justify-between">
                <span>61-90日</span>
                <span className="font-medium">{formatAmount(stats.agingBuckets['61-90'])}</span>
              </div>
              <div className="flex justify-between text-red-600">
                <span>90日超</span>
                <span className="font-medium">{formatAmount(stats.agingBuckets['90+'])}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* タブ */}
      <div className="border-b border-zinc-200">
        <nav className="-mb-px flex gap-4">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-zinc-900 text-zinc-900'
                  : 'border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* フィルタ */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="対象名・請求番号で検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 py-2 pl-10 pr-4 text-sm focus:border-zinc-400 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-zinc-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ReceivableStatus | '')}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
          >
            <option value="">全ステータス</option>
            {Object.entries(RECEIVABLE_STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as ReceivablePriority | '')}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
          >
            <option value="">全優先度</option>
            {Object.entries(RECEIVABLE_PRIORITY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 一覧 */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-200 border-t-zinc-600" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white py-12 text-center">
          <Wallet className="mx-auto h-12 w-12 text-zinc-300" />
          <p className="mt-4 text-sm text-zinc-500">該当する未収がありません</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <table className="min-w-full divide-y divide-zinc-200">
            <thead className="bg-zinc-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                  対象
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-zinc-500">
                  金額
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-zinc-500">
                  期日 / 経過
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-zinc-500">
                  ステータス
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-zinc-500">
                  次アクション
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-zinc-500">
                  優先度
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-zinc-900">
                        {maskSubjectName(item.subjectName)}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {RECEIVABLE_SUBJECT_TYPE_LABELS[item.subjectType]}
                        {item.invoiceNo && ` / ${item.invoiceNo}`}
                        {item.period && ` / ${item.period}`}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p className="font-medium text-zinc-900">
                      {formatAmount(item.amount)}
                    </p>
                    {item.paidAmount && item.paidAmount > 0 && (
                      <p className="text-xs text-green-600">
                        入金済: {formatAmount(item.paidAmount)}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <p className="text-sm text-zinc-900">{item.dueAt}</p>
                    {item.agingDays !== null && item.agingDays > 0 && (
                      <p className={`text-xs ${item.agingDays >= 30 ? 'text-red-600 font-medium' : 'text-orange-500'}`}>
                        {item.agingDays}日超過
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                        RECEIVABLE_STATUS_COLORS[item.status]
                      }`}
                    >
                      {RECEIVABLE_STATUS_LABELS[item.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {item.nextActionAt ? (
                      <div className="flex items-center justify-center gap-1 text-xs">
                        {item.nextActionType === 'call' && <Phone className="h-3 w-3" />}
                        {item.nextActionType === 'email' && <Mail className="h-3 w-3" />}
                        <Calendar className="h-3 w-3 text-zinc-400" />
                        <span>{item.nextActionAt}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                        RECEIVABLE_PRIORITY_COLORS[item.priority]
                      }`}
                    >
                      {RECEIVABLE_PRIORITY_LABELS[item.priority]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/receivables/${item.id}`}
                      className="inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900"
                    >
                      詳細
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 作成モーダル */}
      {showCreateModal && (
        <CreateModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreate}
        />
      )}
    </div>
  );
}

// 作成フォーム型
interface CreateFormData {
  subjectType: ReceivableSubjectType;
  subjectId: string | null;
  subjectName: string;
  invoiceNo: string | null;
  period: string | null;
  description: string | null;
  amount: number;
  dueAt: string;
  issuedAt: string | null;
  priority: ReceivablePriority;
  nextActionAt: string | null;
  nextActionType: NextActionType;
}

// 作成モーダル
function CreateModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (data: CreateFormData) => void;
}) {
  const [formData, setFormData] = useState<CreateFormData>({
    subjectType: 'client',
    subjectId: null,
    subjectName: '',
    invoiceNo: null,
    period: null,
    description: null,
    amount: 0,
    dueAt: '',
    issuedAt: null,
    priority: 'normal',
    nextActionAt: null,
    nextActionType: null,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.subjectName || !formData.amount || !formData.dueAt) {
      return;
    }
    onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-zinc-900">未収新規登録</h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-zinc-700">
                対象タイプ <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.subjectType}
                onChange={(e) =>
                  setFormData({ ...formData, subjectType: e.target.value as ReceivableSubjectType })
                }
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              >
                {Object.entries(RECEIVABLE_SUBJECT_TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">
                対象名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.subjectName}
                onChange={(e) => setFormData({ ...formData, subjectName: e.target.value })}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-zinc-700">
                金額 <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={formData.amount || ''}
                onChange={(e) => setFormData({ ...formData, amount: parseInt(e.target.value, 10) || 0 })}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">
                支払期日 <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={formData.dueAt}
                onChange={(e) => setFormData({ ...formData, dueAt: e.target.value })}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-zinc-700">
                請求書番号
              </label>
              <input
                type="text"
                value={formData.invoiceNo || ''}
                onChange={(e) => setFormData({ ...formData, invoiceNo: e.target.value || null })}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">
                対象期間
              </label>
              <input
                type="text"
                value={formData.period || ''}
                onChange={(e) => setFormData({ ...formData, period: e.target.value || null })}
                placeholder="例: 2026-01"
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-zinc-700">
                優先度
              </label>
              <select
                value={formData.priority}
                onChange={(e) =>
                  setFormData({ ...formData, priority: e.target.value as ReceivablePriority })
                }
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              >
                {Object.entries(RECEIVABLE_PRIORITY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">
                請求日
              </label>
              <input
                type="date"
                value={formData.issuedAt || ''}
                onChange={(e) => setFormData({ ...formData, issuedAt: e.target.value || null })}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700">
              内容
            </label>
            <textarea
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value || null })}
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              登録
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
