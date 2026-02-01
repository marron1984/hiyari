'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@/components/ui';
import {
  ArrowLeft,
  User,
  Clock,
  Calendar,
  Tag,
  MapPin,
  MessageSquare,
  History,
  Send,
  AlertTriangle,
  CheckCircle,
  Play,
  Pause,
  RotateCcw,
  XCircle,
  Archive,
  UserPlus,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type {
  Ticket,
  TicketComment,
  TicketEvent,
  TicketStatus,
} from '@/lib/tickets/types';
import {
  TICKET_STATUS_CONFIG,
  TICKET_PRIORITY_CONFIG,
  TICKET_CATEGORY_CONFIG,
  TICKET_EVENT_ACTION_LABELS,
} from '@/lib/tickets/types';

// デモユーザー一覧（本番ではAPIから取得）
const DEMO_USERS = [
  { id: 'user_001', name: '山田太郎' },
  { id: 'user_002', name: '佐藤次郎' },
  { id: 'user_003', name: '鈴木花子' },
  { id: 'user_004', name: '高橋三郎' },
  { id: 'user_005', name: '田中美咲' },
];

export default function TicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [events, setEvents] = useState<TicketEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showEvents, setShowEvents] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);

  const fetchTicket = useCallback(async () => {
    try {
      const res = await fetch(`/api/tickets/${id}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'チケットの取得に失敗しました');
        return;
      }

      setTicket(data.ticket);
    } catch (err) {
      setError('チケットの取得に失敗しました');
    }
  }, [id]);

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/tickets/${id}/comments`);
      const data = await res.json();
      setComments(data.comments || []);
    } catch (err) {
      console.error('Failed to fetch comments:', err);
    }
  }, [id]);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(`/api/tickets/${id}/events`);
      const data = await res.json();
      setEvents(data.events || []);
    } catch (err) {
      console.error('Failed to fetch events:', err);
    }
  }, [id]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchTicket(), fetchComments(), fetchEvents()]);
      setLoading(false);
    };
    loadData();
  }, [fetchTicket, fetchComments, fetchEvents]);

  const handleStatusChange = async (newStatus: TicketStatus) => {
    try {
      const res = await fetch(`/api/tickets/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        fetchTicket();
        fetchEvents();
      }
    } catch (err) {
      console.error('Failed to change status:', err);
    }
  };

  const handleAssign = async (assigneeUserId: string) => {
    try {
      const res = await fetch(`/api/tickets/${id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigneeUserId }),
      });

      if (res.ok) {
        fetchTicket();
        fetchEvents();
        setShowAssignModal(false);
      }
    } catch (err) {
      console.error('Failed to assign:', err);
    }
  };

  const handleUnassign = async () => {
    try {
      const res = await fetch(`/api/tickets/${id}/unassign`, {
        method: 'POST',
      });

      if (res.ok) {
        fetchTicket();
        fetchEvents();
      }
    } catch (err) {
      console.error('Failed to unassign:', err);
    }
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/tickets/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: newComment }),
      });

      if (res.ok) {
        setNewComment('');
        fetchComments();
        fetchEvents();
      }
    } catch (err) {
      console.error('Failed to add comment:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isOverdue = (t: Ticket) => {
    if (!t.dueAt) return false;
    if (['resolved', 'closed', 'archived'].includes(t.status)) return false;
    return new Date(t.dueAt) < new Date();
  };

  if (loading) {
    return (
      <main className="pb-8">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="text-center py-12 text-zinc-500">読み込み中...</div>
        </div>
      </main>
    );
  }

  if (error || !ticket) {
    return (
      <main className="pb-8">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="text-center py-12">
            <p className="text-red-600 mb-4">{error || 'チケットが見つかりません'}</p>
            <Link
              href="/dashboard/tickets"
              className="text-blue-600 hover:underline"
            >
              チケット一覧に戻る
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="pb-8">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* ヘッダー */}
        <div className="flex items-center gap-4 mb-6">
          <Link
            href="/dashboard/tickets"
            className="p-2 hover:bg-zinc-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge className={`${TICKET_PRIORITY_CONFIG[ticket.priority].bg} ${TICKET_PRIORITY_CONFIG[ticket.priority].color}`}>
                {TICKET_PRIORITY_CONFIG[ticket.priority].emoji} {TICKET_PRIORITY_CONFIG[ticket.priority].label}
              </Badge>
              <Badge className={`${TICKET_STATUS_CONFIG[ticket.status].bg} ${TICKET_STATUS_CONFIG[ticket.status].color}`}>
                {TICKET_STATUS_CONFIG[ticket.status].label}
              </Badge>
              <Badge className="bg-zinc-100 text-zinc-600">
                {TICKET_CATEGORY_CONFIG[ticket.category].icon} {TICKET_CATEGORY_CONFIG[ticket.category].label}
              </Badge>
              {isOverdue(ticket) && (
                <Badge className="bg-red-100 text-red-700 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  期限超過
                </Badge>
              )}
            </div>
            <h1 className="text-xl font-bold text-zinc-900">{ticket.title}</h1>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* メインコンテンツ */}
          <div className="lg:col-span-2 space-y-6">
            {/* 説明 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">説明</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-zinc-700 whitespace-pre-wrap">{ticket.description}</p>
              </CardContent>
            </Card>

            {/* コメント */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  コメント ({comments.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {comments.length === 0 ? (
                  <p className="text-zinc-500 text-sm">コメントはまだありません</p>
                ) : (
                  <div className="space-y-4">
                    {comments.map((comment) => (
                      <div key={comment.id} className="flex gap-3">
                        <div className="w-8 h-8 bg-zinc-200 rounded-full flex items-center justify-center flex-shrink-0">
                          <User className="w-4 h-4 text-zinc-600" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm">{comment.userName}</span>
                            <span className="text-xs text-zinc-400">{formatDate(comment.createdAt)}</span>
                          </div>
                          <p className="text-sm text-zinc-700 whitespace-pre-wrap">{comment.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* コメント投稿フォーム */}
                <form onSubmit={handleSubmitComment} className="mt-4 pt-4 border-t">
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="コメントを入力..."
                    rows={3}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm resize-none"
                  />
                  <div className="flex justify-end mt-2">
                    <button
                      type="submit"
                      disabled={!newComment.trim() || submitting}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                    >
                      <Send className="w-4 h-4" />
                      {submitting ? '送信中...' : 'コメント'}
                    </button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* 履歴 */}
            <Card>
              <CardHeader>
                <button
                  onClick={() => setShowEvents(!showEvents)}
                  className="w-full flex items-center justify-between"
                >
                  <CardTitle className="text-base flex items-center gap-2">
                    <History className="w-4 h-4" />
                    履歴 ({events.length})
                  </CardTitle>
                  {showEvents ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>
              </CardHeader>
              {showEvents && (
                <CardContent>
                  {events.length === 0 ? (
                    <p className="text-zinc-500 text-sm">履歴はありません</p>
                  ) : (
                    <div className="space-y-3">
                      {events.map((event) => (
                        <div key={event.id} className="flex gap-3 text-sm">
                          <div className="w-2 h-2 bg-zinc-300 rounded-full mt-1.5 flex-shrink-0" />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">
                                {event.actorUserName || 'システム'}
                              </span>
                              <span className="text-zinc-600">
                                {TICKET_EVENT_ACTION_LABELS[event.action]}
                              </span>
                            </div>
                            <span className="text-xs text-zinc-400">
                              {formatDate(event.createdAt)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          </div>

          {/* サイドバー */}
          <div className="space-y-4">
            {/* ステータス操作 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">ステータス操作</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {ticket.status === 'open' && (
                  <button
                    onClick={() => handleStatusChange('in_progress')}
                    className="w-full flex items-center gap-2 px-3 py-2 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 transition-colors text-sm"
                  >
                    <Play className="w-4 h-4" />
                    対応開始
                  </button>
                )}
                {ticket.status === 'in_progress' && (
                  <>
                    <button
                      onClick={() => handleStatusChange('waiting')}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors text-sm"
                    >
                      <Pause className="w-4 h-4" />
                      待機中へ
                    </button>
                    <button
                      onClick={() => handleStatusChange('resolved')}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors text-sm"
                    >
                      <CheckCircle className="w-4 h-4" />
                      解決済へ
                    </button>
                  </>
                )}
                {ticket.status === 'waiting' && (
                  <>
                    <button
                      onClick={() => handleStatusChange('in_progress')}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 transition-colors text-sm"
                    >
                      <Play className="w-4 h-4" />
                      対応再開
                    </button>
                    <button
                      onClick={() => handleStatusChange('resolved')}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors text-sm"
                    >
                      <CheckCircle className="w-4 h-4" />
                      解決済へ
                    </button>
                  </>
                )}
                {ticket.status === 'resolved' && (
                  <>
                    <button
                      onClick={() => handleStatusChange('closed')}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-zinc-100 text-zinc-700 rounded-lg hover:bg-zinc-200 transition-colors text-sm"
                    >
                      <XCircle className="w-4 h-4" />
                      クローズ
                    </button>
                    <button
                      onClick={() => handleStatusChange('open')}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm"
                    >
                      <RotateCcw className="w-4 h-4" />
                      再オープン
                    </button>
                  </>
                )}
                {ticket.status === 'closed' && (
                  <button
                    onClick={() => handleStatusChange('open')}
                    className="w-full flex items-center gap-2 px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm"
                  >
                    <RotateCcw className="w-4 h-4" />
                    再オープン
                  </button>
                )}
              </CardContent>
            </Card>

            {/* 担当者 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">担当者</CardTitle>
              </CardHeader>
              <CardContent>
                {ticket.assigneeUserId ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                        <User className="w-4 h-4 text-blue-600" />
                      </div>
                      <span className="font-medium">{ticket.assigneeUserName}</span>
                    </div>
                    <button
                      onClick={handleUnassign}
                      className="text-xs text-zinc-500 hover:text-zinc-700"
                    >
                      解除
                    </button>
                  </div>
                ) : (
                  <p className="text-zinc-500 text-sm">未割当</p>
                )}
                <button
                  onClick={() => setShowAssignModal(true)}
                  className="w-full mt-3 flex items-center justify-center gap-2 px-3 py-2 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors text-sm"
                >
                  <UserPlus className="w-4 h-4" />
                  担当を割り当て
                </button>
              </CardContent>
            </Card>

            {/* 詳細情報 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">詳細情報</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-zinc-400" />
                  <span className="text-zinc-500">起票者:</span>
                  <span className="font-medium">{ticket.requesterUserName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-zinc-400" />
                  <span className="text-zinc-500">作成日:</span>
                  <span>{formatDate(ticket.createdAt)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-zinc-400" />
                  <span className="text-zinc-500">更新日:</span>
                  <span>{formatDate(ticket.updatedAt)}</span>
                </div>
                {ticket.dueAt && (
                  <div className={`flex items-center gap-2 ${isOverdue(ticket) ? 'text-red-600' : ''}`}>
                    <Calendar className="w-4 h-4 text-zinc-400" />
                    <span className="text-zinc-500">期限:</span>
                    <span className={isOverdue(ticket) ? 'font-medium' : ''}>
                      {formatDate(ticket.dueAt)}
                    </span>
                  </div>
                )}
                {ticket.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-zinc-400" />
                    <span className="text-zinc-500">場所:</span>
                    <span>{ticket.location}</span>
                  </div>
                )}
                {ticket.tagsJson && ticket.tagsJson.length > 0 && (
                  <div className="flex items-start gap-2">
                    <Tag className="w-4 h-4 text-zinc-400 mt-0.5" />
                    <span className="text-zinc-500">タグ:</span>
                    <div className="flex flex-wrap gap-1">
                      {ticket.tagsJson.map((tag, i) => (
                        <Badge key={i} className="bg-zinc-100 text-zinc-600 text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* 担当割り当てモーダル */}
        {showAssignModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl w-full max-w-md mx-4 p-6">
              <h3 className="text-lg font-bold mb-4">担当者を選択</h3>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {DEMO_USERS.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => handleAssign(user.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 rounded-lg transition-colors text-left"
                  >
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <User className="w-4 h-4 text-blue-600" />
                    </div>
                    <span>{user.name}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowAssignModal(false)}
                className="w-full mt-4 px-4 py-2 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
