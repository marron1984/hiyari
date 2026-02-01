'use client';

/**
 * 申し送り詳細ページ
 *
 * /dashboard/handover/[id]
 * - 閲覧時に既読化
 * - コメント追加
 * - 解決/再オープン操作
 * - 既読率表示（manager以上）
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  MessageCircle,
  ArrowLeft,
  AlertTriangle,
  CheckCircle,
  Clock,
  User,
  Calendar,
  Tag,
  Send,
  RefreshCw,
  Users,
  Eye,
  RotateCcw,
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
}

interface HandoverComment {
  id: string;
  itemId: string;
  userId: string;
  userName?: string;
  message: string;
  createdAt: string;
}

interface ReadStats {
  itemId: string;
  targetCount: number;
  readCount: number;
  unreadCount: number;
  readRate: number;
  unreadUsers?: { id: string; name: string }[];
}

const SHIFT_LABELS: Record<string, string> = {
  day: '日勤',
  evening: '夕勤',
  night: '夜勤',
};

function formatDateTime(isoString: string): string {
  const d = new Date(isoString);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function HandoverDetailPage() {
  const params = useParams();
  const router = useRouter();
  const itemId = params.id as string;

  const [item, setItem] = useState<HandoverItem | null>(null);
  const [comments, setComments] = useState<HandoverComment[]>([]);
  const [readStats, setReadStats] = useState<ReadStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // コメント入力
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // アクション
  const [actionLoading, setActionLoading] = useState(false);

  // 未読者表示
  const [showUnreadUsers, setShowUnreadUsers] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/handover/${itemId}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError('申し送りが見つかりません');
        } else if (res.status === 403) {
          setError('この申し送りを閲覧する権限がありません');
        } else {
          setError('データの取得に失敗しました');
        }
        return;
      }
      const data = await res.json();
      setItem(data.item);
      setComments(data.comments || []);
      setReadStats(data.readStats || null);
    } catch (err) {
      console.error('Failed to fetch:', err);
      setError('データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddComment = async () => {
    if (!newComment.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/handover/${itemId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: newComment }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add comment');
      }

      setNewComment('');
      fetchData();
    } catch (err) {
      console.error('Failed to add comment:', err);
      alert('コメントの追加に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolve = async () => {
    if (!confirm('この申し送りを解決済みにしますか？')) return;

    setActionLoading(true);
    try {
      const res = await fetch(`/api/handover/${itemId}/resolve`, {
        method: 'POST',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to resolve');
      }

      fetchData();
    } catch (err) {
      console.error('Failed to resolve:', err);
      alert('解決に失敗しました');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReopen = async () => {
    if (!confirm('この申し送りを再オープンしますか？')) return;

    setActionLoading(true);
    try {
      const res = await fetch(`/api/handover/${itemId}/reopen`, {
        method: 'POST',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to reopen');
      }

      fetchData();
    } catch (err) {
      console.error('Failed to reopen:', err);
      alert('再オープンに失敗しました');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="text-center py-8 text-zinc-500">読み込み中...</div>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="text-center py-8">
          <p className="text-red-500 mb-4">{error || '申し送りが見つかりません'}</p>
          <Link
            href="/dashboard/handover"
            className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800"
          >
            <ArrowLeft className="h-4 w-4" />
            一覧に戻る
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* ヘッダー */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/dashboard/handover"
          className="p-2 hover:bg-zinc-100 rounded-lg"
        >
          <ArrowLeft className="h-5 w-5 text-zinc-600" />
        </Link>
        <MessageCircle className="h-6 w-6 text-blue-600" />
        <span className="text-sm text-zinc-500">申し送り詳細</span>
      </div>

      {/* メインカード */}
      <div className="bg-white rounded-lg border border-zinc-200 mb-6">
        <div className="p-6">
          {/* バッジ */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            {item.priority === 'urgent' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded">
                <AlertTriangle className="h-3 w-3" />
                重要
              </span>
            )}
            {item.status === 'resolved' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">
                <CheckCircle className="h-3 w-3" />
                解決済み
              </span>
            )}
            {item.status === 'open' && (
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                オープン
              </span>
            )}
            {item.shift && (
              <span className="px-2 py-0.5 bg-zinc-100 text-zinc-600 text-xs rounded">
                {SHIFT_LABELS[item.shift] || item.shift}
              </span>
            )}
          </div>

          {/* タイトル */}
          <h1 className="text-xl font-bold text-zinc-900 mb-4">{item.title}</h1>

          {/* 本文 */}
          <div className="prose prose-sm max-w-none text-zinc-700 whitespace-pre-wrap mb-6">
            {item.body}
          </div>

          {/* メタ情報 */}
          <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-500">
            <span className="inline-flex items-center gap-1">
              <User className="h-4 w-4" />
              {item.createdByUserName || item.createdByUserId}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {formatDateTime(item.createdAt)}
            </span>
            {item.dueAt && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                期限: {new Date(item.dueAt).toLocaleDateString('ja-JP')}
              </span>
            )}
          </div>

          {/* タグ */}
          {item.tagsJson && item.tagsJson.length > 0 && (
            <div className="flex items-center gap-2 mt-4">
              <Tag className="h-4 w-4 text-zinc-400" />
              {item.tagsJson.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 bg-zinc-100 text-zinc-600 text-xs rounded"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* アクションボタン */}
        <div className="px-6 py-4 border-t border-zinc-200 flex gap-2">
          {item.status === 'open' && (
            <button
              onClick={handleResolve}
              disabled={actionLoading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              <CheckCircle className="h-4 w-4" />
              解決済みにする
            </button>
          )}
          {item.status === 'resolved' && (
            <button
              onClick={handleReopen}
              disabled={actionLoading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" />
              再オープン
            </button>
          )}
          <button
            onClick={fetchData}
            className="inline-flex items-center gap-2 px-4 py-2 border border-zinc-300 rounded-lg hover:bg-zinc-50"
          >
            <RefreshCw className="h-4 w-4" />
            更新
          </button>
        </div>
      </div>

      {/* 既読統計（manager以上） */}
      {readStats && (
        <div className="bg-white rounded-lg border border-zinc-200 p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Eye className="h-4 w-4 text-zinc-500" />
            <span className="font-medium text-zinc-700">既読状況</span>
          </div>

          <div className="flex items-center gap-6">
            <div>
              <div className="text-2xl font-bold text-blue-600">{readStats.readRate}%</div>
              <div className="text-xs text-zinc-500">既読率</div>
            </div>
            <div>
              <div className="text-lg font-semibold text-zinc-700">
                {readStats.readCount} / {readStats.targetCount}
              </div>
              <div className="text-xs text-zinc-500">確認済み</div>
            </div>
            <div>
              <div className="text-lg font-semibold text-zinc-700">{readStats.unreadCount}</div>
              <div className="text-xs text-zinc-500">未読</div>
            </div>
          </div>

          {/* 未読者一覧 */}
          {readStats.unreadUsers && readStats.unreadUsers.length > 0 && (
            <div className="mt-4">
              <button
                onClick={() => setShowUnreadUsers(!showUnreadUsers)}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                {showUnreadUsers ? '未読者を隠す' : `未読者を表示（${readStats.unreadUsers.length}人）`}
              </button>
              {showUnreadUsers && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {readStats.unreadUsers.map((user) => (
                    <span
                      key={user.id}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-zinc-100 rounded text-sm"
                    >
                      <Users className="h-3 w-3 text-zinc-400" />
                      {user.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* コメント */}
      <div className="bg-white rounded-lg border border-zinc-200">
        <div className="p-4 border-b border-zinc-200">
          <span className="font-medium text-zinc-700">コメント ({comments.length})</span>
        </div>

        {/* コメント一覧 */}
        <div className="divide-y divide-zinc-100">
          {comments.length === 0 ? (
            <div className="p-4 text-center text-zinc-500">コメントはありません</div>
          ) : (
            comments.map((comment) => (
              <div key={comment.id} className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-medium text-zinc-700">
                    {comment.userName || comment.userId}
                  </span>
                  <span className="text-xs text-zinc-400">
                    {formatDateTime(comment.createdAt)}
                  </span>
                </div>
                <p className="text-sm text-zinc-600 whitespace-pre-wrap">{comment.message}</p>
              </div>
            ))
          )}
        </div>

        {/* コメント入力 */}
        <div className="p-4 border-t border-zinc-200">
          <div className="flex gap-2">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              rows={2}
              placeholder="コメントを入力..."
              className="flex-1 px-3 py-2 border border-zinc-300 rounded-lg text-sm resize-none"
            />
            <button
              onClick={handleAddComment}
              disabled={submitting || !newComment.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
