'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Clock,
  Plus,
  ChevronRight,
  User,
  Filter,
  AlertCircle,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import type { Complaint, ComplaintStats } from '@/lib/complaints/types';
import {
  COMPLAINT_CATEGORY_LABELS,
  COMPLAINT_SEVERITY_CONFIG,
  COMPLAINT_STATUS_CONFIG,
  REQUESTER_TYPE_LABELS,
} from '@/lib/complaints/types';

type TabType = 'urgent' | 'new' | 'active' | 'overdue' | 'myAssigned' | 'all';

export default function ComplaintsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('urgent');
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [stats, setStats] = useState<ComplaintStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  async function fetchData() {
    setLoading(true);
    try {
      // 統計取得
      const statsRes = await fetch('/api/complaints/stats');
      const statsData = await statsRes.json();
      if (statsData.success) setStats(statsData.stats);

      // 一覧取得（タブに応じてフィルタ）
      let url = '/api/complaints?';
      switch (activeTab) {
        case 'urgent':
          url += 'severity=critical&severity=high';
          break;
        case 'new':
          url += 'status=new&status=triaging';
          break;
        case 'active':
          url += 'status=investigating&status=responding&status=preventing';
          break;
        case 'overdue':
          url += 'overdue=true';
          break;
        case 'myAssigned':
          url += 'myAssigned=true';
          break;
        default:
          break;
      }

      const complaintsRes = await fetch(url);
      const complaintsData = await complaintsRes.json();
      if (complaintsData.success) setComplaints(complaintsData.complaints);
    } catch (error) {
      console.error('データ取得エラー:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateComplaint(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    try {
      const res = await fetch('/api/complaints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.get('title'),
          description: formData.get('description'),
          category: formData.get('category'),
          severity: formData.get('severity'),
          requesterType: formData.get('requesterType'),
          requesterName: formData.get('requesterName') || null,
          dueAt: formData.get('dueAt') || null,
        }),
      });

      if (res.ok) {
        setShowNewModal(false);
        fetchData();
      }
    } catch (error) {
      console.error('クレーム作成エラー:', error);
    }
  }

  if (loading && complaints.length === 0) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-zinc-200 rounded w-48" />
          <div className="h-32 bg-zinc-200 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">クレーム対応</h1>
          <p className="text-zinc-600 mt-1">
            クレームの受付・調査・対応・再発防止を管理
          </p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          新規受付
        </button>
      </div>

      {/* サマリーカード */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-white rounded-lg border border-zinc-200 p-4">
            <div className="flex items-center gap-2 text-zinc-600 text-sm">
              <AlertCircle className="w-4 h-4" />
              未対応
            </div>
            <div className="mt-2 text-2xl font-bold text-amber-600">
              {stats.open}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-red-200 p-4 bg-red-50">
            <div className="flex items-center gap-2 text-red-600 text-sm">
              <AlertTriangle className="w-4 h-4" />
              重要（未対応）
            </div>
            <div className="mt-2 text-2xl font-bold text-red-600">
              {stats.criticalOpen}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-zinc-200 p-4">
            <div className="flex items-center gap-2 text-zinc-600 text-sm">
              <Clock className="w-4 h-4" />
              期限超過
            </div>
            <div className="mt-2 text-2xl font-bold text-red-600">
              {stats.overdue}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-zinc-200 p-4">
            <div className="flex items-center gap-2 text-zinc-600 text-sm">
              <User className="w-4 h-4" />
              自分の担当
            </div>
            <div className="mt-2 text-2xl font-bold text-blue-600">
              {stats.myAssignedOpen}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-zinc-200 p-4">
            <div className="flex items-center gap-2 text-zinc-600 text-sm">
              <CheckCircle2 className="w-4 h-4" />
              今月解決
            </div>
            <div className="mt-2 text-2xl font-bold text-green-600">
              {stats.resolvedThisMonth}
            </div>
            {stats.avgDaysToResolve && (
              <div className="text-xs text-zinc-500">
                平均 {stats.avgDaysToResolve}日
              </div>
            )}
          </div>
        </div>
      )}

      {/* タブ */}
      <div className="border-b border-zinc-200">
        <nav className="flex gap-1 overflow-x-auto">
          {[
            { id: 'urgent' as TabType, label: '重要', count: stats?.criticalOpen },
            { id: 'new' as TabType, label: '新規/トリアージ' },
            { id: 'active' as TabType, label: '対応中' },
            { id: 'overdue' as TabType, label: '期限超過', count: stats?.overdue },
            { id: 'myAssigned' as TabType, label: '自分の担当', count: stats?.myAssignedOpen },
            { id: 'all' as TabType, label: 'すべて' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-zinc-600 hover:text-zinc-900'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span
                  className={`px-1.5 py-0.5 text-xs rounded-full ${
                    tab.id === 'urgent' || tab.id === 'overdue'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-zinc-100 text-zinc-600'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* 一覧 */}
      <div className="bg-white rounded-lg border border-zinc-200">
        <table className="w-full">
          <thead className="bg-zinc-50 border-b border-zinc-200">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-zinc-600">
                重要度
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-zinc-600">
                タイトル
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-zinc-600">
                カテゴリ
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-zinc-600">
                ステータス
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-zinc-600">
                申立人
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-zinc-600">
                担当
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-zinc-600">
                期限
              </th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {complaints.map((complaint) => {
              const isOverdue =
                complaint.dueAt &&
                new Date(complaint.dueAt) < new Date() &&
                !['resolved', 'closed', 'archived'].includes(complaint.status);
              const severityConfig = COMPLAINT_SEVERITY_CONFIG[complaint.severity];
              const statusConfig = COMPLAINT_STATUS_CONFIG[complaint.status];

              return (
                <tr key={complaint.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-1 rounded text-xs font-medium ${severityConfig.bg} ${severityConfig.text}`}
                    >
                      {severityConfig.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/complaints/${complaint.id}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {complaint.title}
                    </Link>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      受付: {new Date(complaint.receivedAt).toLocaleDateString('ja-JP')}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-600">
                    {COMPLAINT_CATEGORY_LABELS[complaint.category]}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-1 rounded text-xs font-medium ${statusConfig.bg} ${statusConfig.text}`}
                    >
                      {statusConfig.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-600">
                    {REQUESTER_TYPE_LABELS[complaint.requesterType]}
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-600">
                    {complaint.assigneeUserId || '-'}
                  </td>
                  <td className="px-4 py-3">
                    {complaint.dueAt ? (
                      <span
                        className={`text-sm ${
                          isOverdue ? 'text-red-600 font-medium' : 'text-zinc-600'
                        }`}
                      >
                        {new Date(complaint.dueAt).toLocaleDateString('ja-JP')}
                        {isOverdue && (
                          <AlertTriangle className="inline w-4 h-4 ml-1" />
                        )}
                      </span>
                    ) : (
                      <span className="text-sm text-zinc-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/complaints/${complaint.id}`}
                      className="text-zinc-400 hover:text-zinc-600"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </Link>
                  </td>
                </tr>
              );
            })}
            {complaints.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-zinc-500">
                  該当するクレームがありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 新規受付モーダル */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-zinc-900 mb-4">
              クレーム新規受付
            </h2>
            <form onSubmit={handleCreateComplaint} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  タイトル <span className="text-red-500">*</span>
                </label>
                <input
                  name="title"
                  type="text"
                  required
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
                  placeholder="例: 食事の提供時間が遅れた"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  内容 <span className="text-red-500">*</span>
                </label>
                <textarea
                  name="description"
                  required
                  rows={4}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
                  placeholder="クレームの詳細な内容を記載"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    カテゴリ <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="category"
                    required
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
                  >
                    <option value="service">サービス</option>
                    <option value="staff">スタッフ</option>
                    <option value="billing">請求</option>
                    <option value="safety">安全</option>
                    <option value="facility">施設</option>
                    <option value="other">その他</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    重要度 <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="severity"
                    required
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
                  >
                    <option value="low">低</option>
                    <option value="medium">中</option>
                    <option value="high">高</option>
                    <option value="critical">重大</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    申立人種別 <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="requesterType"
                    required
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
                  >
                    <option value="family">ご家族</option>
                    <option value="client">利用者</option>
                    <option value="partner">取引先</option>
                    <option value="staff">職員</option>
                    <option value="anonymous">匿名</option>
                    <option value="other">その他</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    申立人名
                  </label>
                  <input
                    name="requesterName"
                    type="text"
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
                    placeholder="例: 山田様（ご家族）"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  対応期限
                </label>
                <input
                  name="dueAt"
                  type="date"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-4 py-2 text-zinc-600 hover:text-zinc-900"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  受付
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
