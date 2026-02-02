'use client';

/**
 * 家族連絡ログ一覧ページ
 *
 * /dashboard/family-contact
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Phone,
  Mail,
  MessageSquare,
  Users,
  Search,
  Plus,
  AlertTriangle,
  Calendar,
  ArrowUpRight,
  ArrowDownLeft,
  Filter,
  X,
} from 'lucide-react';
import type {
  FamilyContactLog,
  FamilyLogStats,
  FamilyLogCategory,
  FamilyLogContactType,
  FamilyLogDirection,
  FamilyLogImportance,
} from '@/lib/familyLog/types';
import {
  FAMILY_LOG_CATEGORY_LABELS,
  FAMILY_LOG_CONTACT_TYPE_LABELS,
  FAMILY_LOG_DIRECTION_LABELS,
  FAMILY_LOG_IMPORTANCE_LABELS,
  FAMILY_LOG_IMPORTANCE_CONFIG,
  FAMILY_LOG_CATEGORY_CONFIG,
} from '@/lib/familyLog/types';

// 連絡手段アイコン
const ContactTypeIcon = ({ type }: { type: FamilyLogContactType }) => {
  switch (type) {
    case 'phone':
      return <Phone size={14} />;
    case 'email':
      return <Mail size={14} />;
    case 'sms':
    case 'line':
      return <MessageSquare size={14} />;
    case 'in_person':
      return <Users size={14} />;
    default:
      return <MessageSquare size={14} />;
  }
};

// 連絡方向アイコン
const DirectionIcon = ({ direction }: { direction: FamilyLogDirection }) => {
  return direction === 'outbound' ? (
    <ArrowUpRight size={12} className="text-blue-500" />
  ) : (
    <ArrowDownLeft size={12} className="text-green-500" />
  );
};

export default function FamilyContactPage() {
  const [logs, setLogs] = useState<FamilyContactLog[]>([]);
  const [stats, setStats] = useState<FamilyLogStats | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // フィルタ
  const [searchQuery, setSearchQuery] = useState('');
  const [filterImportance, setFilterImportance] = useState<FamilyLogImportance | ''>('');
  const [filterCategory, setFilterCategory] = useState<FamilyLogCategory | ''>('');
  const [filterContactType, setFilterContactType] = useState<FamilyLogContactType | ''>('');
  const [showFilters, setShowFilters] = useState(false);

  // 新規作成モーダル
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newLog, setNewLog] = useState({
    subjectId: '',
    contactType: 'phone' as FamilyLogContactType,
    direction: 'outbound' as FamilyLogDirection,
    category: 'routine' as FamilyLogCategory,
    importance: 'normal' as FamilyLogImportance,
    counterpartName: '',
    counterpartRelation: '',
    summary: '',
    detail: '',
    occurredAt: new Date().toISOString().slice(0, 16),
  });
  const [submitting, setSubmitting] = useState(false);

  // データ取得
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      const params = new URLSearchParams();
      if (searchQuery) params.set('q', searchQuery);
      if (filterImportance) params.set('importance', filterImportance);
      if (filterCategory) params.set('category', filterCategory);
      if (filterContactType) params.set('contactType', filterContactType);

      const [resLogs, resStats] = await Promise.all([
        fetch(`/api/family-contact?${params.toString()}`),
        fetch('/api/family-contact/stats'),
      ]);

      const dataLogs = await resLogs.json();
      const dataStats = await resStats.json();

      setLogs(dataLogs.logs || []);
      setTotal(dataLogs.total || 0);
      setStats(dataStats.stats || null);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, filterImportance, filterCategory, filterContactType]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 新規作成
  const handleCreate = async () => {
    if (!newLog.subjectId || !newLog.summary) {
      alert('利用者IDと要約は必須です');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/family-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectType: 'client',
          ...newLog,
          occurredAt: new Date(newLog.occurredAt).toISOString(),
        }),
      });

      if (!res.ok) throw new Error('作成に失敗しました');

      setShowCreateModal(false);
      setNewLog({
        subjectId: '',
        contactType: 'phone',
        direction: 'outbound',
        category: 'routine',
        importance: 'normal',
        counterpartName: '',
        counterpartRelation: '',
        summary: '',
        detail: '',
        occurredAt: new Date().toISOString().slice(0, 16),
      });
      await fetchData();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'エラーが発生しました');
    } finally {
      setSubmitting(false);
    }
  };

  // 日時フォーマット
  const formatDateTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString('ja-JP', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // フィルタクリア
  const clearFilters = () => {
    setSearchQuery('');
    setFilterImportance('');
    setFilterCategory('');
    setFilterContactType('');
  };

  const hasActiveFilters = searchQuery || filterImportance || filterCategory || filterContactType;

  return (
    <div className="p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-800">家族連絡ログ</h1>
          <p className="text-sm text-zinc-500 mt-1">
            利用者ごとの家族連絡履歴を記録・検索
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={18} />
          新規記録
        </button>
      </div>

      {/* 統計カード */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border border-zinc-200 p-4">
            <p className="text-sm text-zinc-500">総件数</p>
            <p className="text-2xl font-bold text-zinc-800">{stats.total}</p>
          </div>
          <div className="bg-white rounded-lg border border-red-200 p-4">
            <p className="text-sm text-red-600">緊急</p>
            <p className="text-2xl font-bold text-red-700">{stats.criticalCount}</p>
          </div>
          <div className="bg-white rounded-lg border border-amber-200 p-4">
            <p className="text-sm text-amber-600">重要</p>
            <p className="text-2xl font-bold text-amber-700">{stats.highCount}</p>
          </div>
          <div className="bg-white rounded-lg border border-blue-200 p-4">
            <p className="text-sm text-blue-600">今週</p>
            <p className="text-2xl font-bold text-blue-700">{stats.thisWeekCount}</p>
          </div>
        </div>
      )}

      {/* 検索・フィルタ */}
      <div className="bg-white rounded-lg border border-zinc-200 p-4 space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="要約・詳細を検索..."
              className="w-full pl-10 pr-4 py-2 border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors ${
              showFilters || hasActiveFilters
                ? 'border-blue-500 text-blue-600 bg-blue-50'
                : 'border-zinc-300 text-zinc-600 hover:bg-zinc-50'
            }`}
          >
            <Filter size={18} />
            フィルタ
            {hasActiveFilters && (
              <span className="bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                !
              </span>
            )}
          </button>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-sm text-zinc-500 hover:text-zinc-700"
            >
              クリア
            </button>
          )}
        </div>

        {/* 詳細フィルタ */}
        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-zinc-200">
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">
                重要度
              </label>
              <select
                value={filterImportance}
                onChange={(e) => setFilterImportance(e.target.value as FamilyLogImportance | '')}
                className="w-full border border-zinc-300 rounded-lg p-2 text-sm"
              >
                <option value="">すべて</option>
                <option value="critical">緊急</option>
                <option value="high">重要</option>
                <option value="normal">通常</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">
                カテゴリ
              </label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value as FamilyLogCategory | '')}
                className="w-full border border-zinc-300 rounded-lg p-2 text-sm"
              >
                <option value="">すべて</option>
                {Object.entries(FAMILY_LOG_CATEGORY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">
                連絡手段
              </label>
              <select
                value={filterContactType}
                onChange={(e) => setFilterContactType(e.target.value as FamilyLogContactType | '')}
                className="w-full border border-zinc-300 rounded-lg p-2 text-sm"
              >
                <option value="">すべて</option>
                {Object.entries(FAMILY_LOG_CONTACT_TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* 一覧 */}
      <div className="bg-white rounded-lg border border-zinc-200">
        {loading ? (
          <div className="p-8 text-center text-zinc-500">読み込み中...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-zinc-500">
            連絡ログがありません
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {logs.map((log) => {
              const importanceConfig = FAMILY_LOG_IMPORTANCE_CONFIG[log.importance];
              const categoryConfig = FAMILY_LOG_CATEGORY_CONFIG[log.category];

              return (
                <Link
                  key={log.id}
                  href={`/dashboard/family-contact/${log.id}`}
                  className="block p-4 hover:bg-zinc-50 transition-colors"
                >
                  <div className="flex items-start gap-4">
                    {/* アイコン */}
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center">
                      <ContactTypeIcon type={log.contactType} />
                    </div>

                    {/* 内容 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${importanceConfig.bg} ${importanceConfig.text}`}
                        >
                          {importanceConfig.label}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${categoryConfig.bg} ${categoryConfig.text}`}
                        >
                          {categoryConfig.label}
                        </span>
                        <DirectionIcon direction={log.direction} />
                        <span className="text-xs text-zinc-500">
                          {FAMILY_LOG_DIRECTION_LABELS[log.direction]}
                        </span>
                      </div>

                      <p className="text-sm font-medium text-zinc-800 truncate">
                        {log.summary}
                      </p>

                      <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                        {log.counterpartName && (
                          <span>
                            {log.counterpartName}
                            {log.counterpartRelation && ` (${log.counterpartRelation})`}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Calendar size={12} />
                          {formatDateTime(log.occurredAt)}
                        </span>
                        <span>記録: {log.recordedByUserId}</span>
                      </div>
                    </div>

                    {/* 緊急マーク */}
                    {log.importance === 'critical' && (
                      <div className="flex-shrink-0">
                        <AlertTriangle size={20} className="text-red-500" />
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* ページネーション情報 */}
        {total > 0 && (
          <div className="px-4 py-3 border-t border-zinc-200 text-sm text-zinc-500">
            全 {total} 件
          </div>
        )}
      </div>

      {/* 新規作成モーダル */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-zinc-200">
              <h2 className="text-lg font-semibold">新規連絡ログ</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-zinc-400 hover:text-zinc-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  利用者ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newLog.subjectId}
                  onChange={(e) =>
                    setNewLog({ ...newLog, subjectId: e.target.value })
                  }
                  placeholder="例: client_001"
                  className="w-full border border-zinc-300 rounded-lg p-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    連絡手段
                  </label>
                  <select
                    value={newLog.contactType}
                    onChange={(e) =>
                      setNewLog({
                        ...newLog,
                        contactType: e.target.value as FamilyLogContactType,
                      })
                    }
                    className="w-full border border-zinc-300 rounded-lg p-2"
                  >
                    {Object.entries(FAMILY_LOG_CONTACT_TYPE_LABELS).map(
                      ([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      )
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    方向
                  </label>
                  <select
                    value={newLog.direction}
                    onChange={(e) =>
                      setNewLog({
                        ...newLog,
                        direction: e.target.value as FamilyLogDirection,
                      })
                    }
                    className="w-full border border-zinc-300 rounded-lg p-2"
                  >
                    {Object.entries(FAMILY_LOG_DIRECTION_LABELS).map(
                      ([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      )
                    )}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    カテゴリ
                  </label>
                  <select
                    value={newLog.category}
                    onChange={(e) =>
                      setNewLog({
                        ...newLog,
                        category: e.target.value as FamilyLogCategory,
                      })
                    }
                    className="w-full border border-zinc-300 rounded-lg p-2"
                  >
                    {Object.entries(FAMILY_LOG_CATEGORY_LABELS).map(
                      ([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      )
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    重要度
                  </label>
                  <select
                    value={newLog.importance}
                    onChange={(e) =>
                      setNewLog({
                        ...newLog,
                        importance: e.target.value as FamilyLogImportance,
                      })
                    }
                    className="w-full border border-zinc-300 rounded-lg p-2"
                  >
                    {Object.entries(FAMILY_LOG_IMPORTANCE_LABELS).map(
                      ([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      )
                    )}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    相手方氏名
                  </label>
                  <input
                    type="text"
                    value={newLog.counterpartName}
                    onChange={(e) =>
                      setNewLog({ ...newLog, counterpartName: e.target.value })
                    }
                    placeholder="例: 山田様"
                    className="w-full border border-zinc-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    続柄
                  </label>
                  <input
                    type="text"
                    value={newLog.counterpartRelation}
                    onChange={(e) =>
                      setNewLog({
                        ...newLog,
                        counterpartRelation: e.target.value,
                      })
                    }
                    placeholder="例: 長女"
                    className="w-full border border-zinc-300 rounded-lg p-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  連絡日時
                </label>
                <input
                  type="datetime-local"
                  value={newLog.occurredAt}
                  onChange={(e) =>
                    setNewLog({ ...newLog, occurredAt: e.target.value })
                  }
                  className="w-full border border-zinc-300 rounded-lg p-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  要約 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newLog.summary}
                  onChange={(e) =>
                    setNewLog({ ...newLog, summary: e.target.value })
                  }
                  placeholder="連絡内容の要約（1行）"
                  className="w-full border border-zinc-300 rounded-lg p-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  詳細
                </label>
                <textarea
                  value={newLog.detail}
                  onChange={(e) =>
                    setNewLog({ ...newLog, detail: e.target.value })
                  }
                  rows={4}
                  placeholder="詳細な連絡内容..."
                  className="w-full border border-zinc-300 rounded-lg p-2"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 p-4 border-t border-zinc-200">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-zinc-600 hover:text-zinc-800"
              >
                キャンセル
              </button>
              <button
                onClick={handleCreate}
                disabled={submitting}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? '作成中...' : '作成'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
