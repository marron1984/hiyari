'use client';

/**
 * 申し送り一覧ページ
 *
 * /dashboard/handover
 * - タブ: 未読 / オープン / 解決済み
 * - フィルタ: priority, shift, tag, 検索
 * - 未読インジケータ、priorityバッジ
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  MessageCircle,
  AlertTriangle,
  Circle,
  CheckCircle,
  Clock,
  Plus,
  Search,
  Filter,
  User,
  Calendar,
  Tag,
  MessageSquare,
  RefreshCw,
} from 'lucide-react';

interface HandoverItem {
  id: string;
  title: string;
  body: string;
  priority: 'normal' | 'urgent';
  status: 'open' | 'resolved' | 'archived';
  createdByUserId: string;
  createdByUserName?: string;
  dueAt: string | null;
  shift: string | null;
  tagsJson: string[] | null;
  createdAt: string;
  updatedAt: string;
  isRead?: boolean;
  commentCount?: number;
}

type TabType = 'unread' | 'open' | 'resolved';

const PRIORITY_LABELS: Record<string, string> = {
  normal: '通常',
  urgent: '重要',
};

const SHIFT_LABELS: Record<string, string> = {
  day: '日勤',
  evening: '夕勤',
  night: '夜勤',
};

function formatDateTime(isoString: string): string {
  const d = new Date(isoString);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return `今日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } else if (days === 1) {
    return `昨日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } else if (days < 7) {
    return `${days}日前`;
  } else {
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }
}

export default function HandoverPage() {
  const [items, setItems] = useState<HandoverItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // タブ・フィルタ
  const [activeTab, setActiveTab] = useState<TabType>('unread');
  const [priority, setPriority] = useState('');
  const [shift, setShift] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // 新規作成モーダル
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newPriority, setNewPriority] = useState<'normal' | 'urgent'>('normal');
  const [newShift, setNewShift] = useState('');
  const [newTags, setNewTags] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();

      // タブに応じたステータス
      if (activeTab === 'open' || activeTab === 'unread') {
        params.set('status', 'open');
      } else if (activeTab === 'resolved') {
        params.set('status', 'resolved');
      }

      if (priority) params.set('priority', priority);
      if (shift) params.set('shift', shift);
      if (searchQuery) params.set('q', searchQuery);
      params.set('limit', '100');

      const res = await fetch(`/api/handover?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();

      let fetchedItems = data.items || [];

      // 未読タブの場合は未読のみ
      if (activeTab === 'unread') {
        fetchedItems = fetchedItems.filter((item: HandoverItem) => !item.isRead);
      }

      setItems(fetchedItems);
      setTotalCount(data.totalCount);
    } catch (error) {
      console.error('Failed to fetch handover items:', error);
    } finally {
      setLoading(false);
    }
  }, [activeTab, priority, shift, searchQuery]);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch('/api/handover/unread-count');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setUnreadCount(data.unreadCount);
    } catch (error) {
      console.error('Failed to fetch unread count:', error);
    }
  }, []);

  useEffect(() => {
    fetchItems();
    fetchUnreadCount();
  }, [fetchItems, fetchUnreadCount]);

  const handleCreate = async () => {
    if (!newTitle.trim() || !newBody.trim()) {
      alert('タイトルと本文を入力してください');
      return;
    }

    setCreating(true);
    try {
      const tags = newTags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t);

      const res = await fetch('/api/handover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          body: newBody,
          priority: newPriority,
          shift: newShift || undefined,
          tags: tags.length > 0 ? tags : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create');
      }

      // リセット
      setNewTitle('');
      setNewBody('');
      setNewPriority('normal');
      setNewShift('');
      setNewTags('');
      setShowCreateModal(false);

      // 再取得
      fetchItems();
      fetchUnreadCount();
    } catch (error) {
      console.error('Failed to create handover:', error);
      alert('申し送りの作成に失敗しました');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <MessageCircle className="h-8 w-8 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">申し送り</h1>
            <p className="text-sm text-zinc-500">シフト間の情報共有・引き継ぎ</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              fetchItems();
              fetchUnreadCount();
            }}
            className="p-2 text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            新規作成
          </button>
        </div>
      </div>

      {/* タブ */}
      <div className="flex border-b border-zinc-200 mb-4">
        <button
          onClick={() => setActiveTab('unread')}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${
            activeTab === 'unread'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-zinc-500 hover:text-zinc-700'
          }`}
        >
          未読
          {unreadCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full">
              {unreadCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('open')}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${
            activeTab === 'open'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-zinc-500 hover:text-zinc-700'
          }`}
        >
          オープン
        </button>
        <button
          onClick={() => setActiveTab('resolved')}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${
            activeTab === 'resolved'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-zinc-500 hover:text-zinc-700'
          }`}
        >
          解決済み
        </button>
      </div>

      {/* フィルタトグル */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-600 hover:text-zinc-800 hover:bg-zinc-100 rounded"
        >
          <Filter className="h-4 w-4" />
          フィルタ
        </button>
        <span className="text-sm text-zinc-500">{items.length}件</span>
      </div>

      {/* フィルタパネル */}
      {showFilters && (
        <div className="bg-white rounded-lg border border-zinc-200 p-4 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">優先度</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm"
              >
                <option value="">すべて</option>
                <option value="urgent">重要</option>
                <option value="normal">通常</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">シフト</label>
              <select
                value={shift}
                onChange={(e) => setShift(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm"
              >
                <option value="">すべて</option>
                <option value="day">日勤</option>
                <option value="evening">夕勤</option>
                <option value="night">夜勤</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-zinc-700 mb-1">検索</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="タイトル・本文で検索..."
                  className="w-full pl-10 pr-3 py-2 border border-zinc-300 rounded-lg text-sm"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 一覧 */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-8 text-zinc-500">読み込み中...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-8 text-zinc-500">
            {activeTab === 'unread' ? '未読の申し送りはありません' : '申し送りがありません'}
          </div>
        ) : (
          items.map((item) => (
            <Link
              key={item.id}
              href={`/dashboard/handover/${item.id}`}
              className="block bg-white rounded-lg border border-zinc-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-start gap-3">
                {/* 未読インジケータ */}
                <div className="pt-1">
                  {!item.isRead ? (
                    <Circle className="h-3 w-3 text-blue-600 fill-blue-600" />
                  ) : (
                    <Circle className="h-3 w-3 text-zinc-200" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {/* 優先度バッジ */}
                    {item.priority === 'urgent' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded">
                        <AlertTriangle className="h-3 w-3" />
                        重要
                      </span>
                    )}

                    {/* ステータス */}
                    {item.status === 'resolved' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">
                        <CheckCircle className="h-3 w-3" />
                        解決済み
                      </span>
                    )}

                    {/* シフト */}
                    {item.shift && (
                      <span className="px-2 py-0.5 bg-zinc-100 text-zinc-600 text-xs rounded">
                        {SHIFT_LABELS[item.shift] || item.shift}
                      </span>
                    )}
                  </div>

                  {/* タイトル */}
                  <h3 className="font-medium text-zinc-900 truncate">{item.title}</h3>

                  {/* 本文プレビュー */}
                  <p className="text-sm text-zinc-500 mt-1 line-clamp-2">{item.body}</p>

                  {/* メタ情報 */}
                  <div className="flex items-center gap-4 mt-2 text-xs text-zinc-400">
                    <span className="inline-flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {item.createdByUserName || item.createdByUserId}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDateTime(item.createdAt)}
                    </span>
                    {item.commentCount && item.commentCount > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        {item.commentCount}
                      </span>
                    )}
                    {item.tagsJson && item.tagsJson.length > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Tag className="h-3 w-3" />
                        {item.tagsJson.slice(0, 2).join(', ')}
                        {item.tagsJson.length > 2 && `...`}
                      </span>
                    )}
                  </div>
                </div>

                {/* 期限 */}
                {item.dueAt && (
                  <div className="text-xs text-zinc-500 flex items-center gap-1 shrink-0">
                    <Calendar className="h-3 w-3" />
                    期限: {new Date(item.dueAt).toLocaleDateString('ja-JP')}
                  </div>
                )}
              </div>
            </Link>
          ))
        )}
      </div>

      {/* 新規作成モーダル */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b">
              <h2 className="text-lg font-semibold">新規申し送り</h2>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  タイトル <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="申し送りのタイトル"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  本文 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  rows={5}
                  placeholder="申し送りの内容を入力..."
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">優先度</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as 'normal' | 'urgent')}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
                  >
                    <option value="normal">通常</option>
                    <option value="urgent">重要</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">シフト</label>
                  <select
                    value={newShift}
                    onChange={(e) => setNewShift(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
                  >
                    <option value="">指定なし</option>
                    <option value="day">日勤</option>
                    <option value="evening">夕勤</option>
                    <option value="night">夜勤</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  タグ（カンマ区切り）
                </label>
                <input
                  type="text"
                  value={newTags}
                  onChange={(e) => setNewTags(e.target.value)}
                  placeholder="利用者, 服薬, 家族連絡"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
                />
              </div>
            </div>
            <div className="p-4 border-t flex justify-end gap-2">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-zinc-600 hover:text-zinc-800"
                disabled={creating}
              >
                キャンセル
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {creating ? '作成中...' : '作成'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
