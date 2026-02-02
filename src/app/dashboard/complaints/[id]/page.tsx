'use client';

/**
 * クレーム詳細ページ
 *
 * /dashboard/complaints/[id]
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  AlertTriangle,
  Clock,
  User,
  Calendar,
  MessageSquare,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Plus,
  Edit2,
  Save,
  X,
} from 'lucide-react';
import type {
  Complaint,
  ComplaintComment,
  ComplaintAction,
  ComplaintEvent,
  ComplaintStatus,
  ComplaintActionStatus,
} from '@/lib/complaints/types';
import {
  COMPLAINT_STATUS_CONFIG,
  COMPLAINT_SEVERITY_CONFIG,
  COMPLAINT_CATEGORY_LABELS,
  REQUESTER_TYPE_LABELS,
  COMPLAINT_ACTION_STATUS_LABELS,
} from '@/lib/complaints/types';

// デモユーザー
const DEMO_USER = {
  userId: 'user_manager',
  role: 'manager' as const,
};

// ステータス遷移オプション
const STATUS_OPTIONS: ComplaintStatus[] = [
  'new',
  'triaging',
  'investigating',
  'responding',
  'preventing',
  'resolved',
  'closed',
];

// アクションステータスオプション
const ACTION_STATUS_OPTIONS: ComplaintActionStatus[] = [
  'open',
  'in_progress',
  'done',
  'cancelled',
];

export default function ComplaintDetailPage() {
  const params = useParams();
  const router = useRouter();
  const complaintId = params.id as string;

  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [comments, setComments] = useState<ComplaintComment[]>([]);
  const [actions, setActions] = useState<ComplaintAction[]>([]);
  const [events, setEvents] = useState<ComplaintEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 編集モード
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({
    rootCause: '',
    preventivePlan: '',
    resolutionSummary: '',
  });

  // 新規コメント
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  // 新規アクション
  const [showActionForm, setShowActionForm] = useState(false);
  const [newAction, setNewAction] = useState({
    title: '',
    ownerUserId: '',
    dueAt: '',
  });
  const [submittingAction, setSubmittingAction] = useState(false);

  // イベントログ展開
  const [showEvents, setShowEvents] = useState(false);

  // データ取得
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [resComplaint, resComments, resActions] = await Promise.all([
        fetch(`/api/complaints/${complaintId}`),
        fetch(`/api/complaints/${complaintId}/comments`),
        fetch(`/api/complaints/${complaintId}/actions`),
      ]);

      if (!resComplaint.ok) {
        throw new Error('クレーム情報の取得に失敗しました');
      }

      const dataComplaint = await resComplaint.json();
      const dataComments = await resComments.json();
      const dataActions = await resActions.json();

      setComplaint(dataComplaint.complaint);
      setComments(dataComments.comments || []);
      setActions(dataActions.actions || []);

      // 編集データ初期化
      setEditData({
        rootCause: dataComplaint.complaint.rootCause || '',
        preventivePlan: dataComplaint.complaint.preventivePlan || '',
        resolutionSummary: dataComplaint.complaint.resolutionSummary || '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [complaintId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ステータス変更
  const handleStatusChange = async (newStatus: ComplaintStatus) => {
    if (!complaint) return;
    try {
      const res = await fetch(`/api/complaints/${complaintId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('ステータス変更に失敗しました');
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'エラーが発生しました');
    }
  };

  // 詳細情報保存
  const handleSaveDetails = async () => {
    try {
      const res = await fetch(`/api/complaints/${complaintId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      });
      if (!res.ok) throw new Error('保存に失敗しました');
      await fetchData();
      setEditMode(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'エラーが発生しました');
    }
  };

  // コメント追加
  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    setSubmittingComment(true);
    try {
      const res = await fetch(`/api/complaints/${complaintId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: newComment }),
      });
      if (!res.ok) throw new Error('コメント追加に失敗しました');
      setNewComment('');
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setSubmittingComment(false);
    }
  };

  // アクション追加
  const handleAddAction = async () => {
    if (!newAction.title.trim()) return;
    setSubmittingAction(true);
    try {
      const res = await fetch(`/api/complaints/${complaintId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newAction.title,
          ownerUserId: newAction.ownerUserId || null,
          dueAt: newAction.dueAt || null,
        }),
      });
      if (!res.ok) throw new Error('アクション追加に失敗しました');
      setNewAction({ title: '', ownerUserId: '', dueAt: '' });
      setShowActionForm(false);
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setSubmittingAction(false);
    }
  };

  // アクションステータス変更
  const handleActionStatusChange = async (
    actionId: string,
    status: ComplaintActionStatus
  ) => {
    try {
      const res = await fetch(`/api/complaints/actions/${actionId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('ステータス変更に失敗しました');
      await fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'エラーが発生しました');
    }
  };

  // 日付フォーマット
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ja-JP');
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('ja-JP');
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-zinc-200 rounded w-1/3" />
          <div className="h-32 bg-zinc-200 rounded" />
          <div className="h-64 bg-zinc-200 rounded" />
        </div>
      </div>
    );
  }

  if (error || !complaint) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">{error || 'クレームが見つかりません'}</p>
          <Link
            href="/dashboard/complaints"
            className="text-red-600 underline mt-2 inline-block"
          >
            一覧に戻る
          </Link>
        </div>
      </div>
    );
  }

  const severityConfig = COMPLAINT_SEVERITY_CONFIG[complaint.severity];
  const statusConfig = COMPLAINT_STATUS_CONFIG[complaint.status];

  return (
    <div className="p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/complaints"
            className="text-zinc-500 hover:text-zinc-700"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium ${severityConfig.bg} ${severityConfig.text}`}
              >
                {severityConfig.label}
              </span>
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium ${statusConfig.bg} ${statusConfig.text}`}
              >
                {statusConfig.label}
              </span>
              <span className="text-xs text-zinc-500">
                {COMPLAINT_CATEGORY_LABELS[complaint.category]}
              </span>
            </div>
            <h1 className="text-xl font-bold text-zinc-800 mt-1">
              {complaint.title}
            </h1>
          </div>
        </div>
      </div>

      {/* 概要カード */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-zinc-200 p-4">
          <div className="flex items-center gap-2 text-zinc-500 text-sm mb-1">
            <User size={14} />
            申立人
          </div>
          <p className="font-medium">
            {REQUESTER_TYPE_LABELS[complaint.requesterType]}
            {complaint.requesterName && ` - ${complaint.requesterName}`}
          </p>
        </div>

        <div className="bg-white rounded-lg border border-zinc-200 p-4">
          <div className="flex items-center gap-2 text-zinc-500 text-sm mb-1">
            <Calendar size={14} />
            受付日
          </div>
          <p className="font-medium">{formatDate(complaint.receivedAt)}</p>
        </div>

        <div className="bg-white rounded-lg border border-zinc-200 p-4">
          <div className="flex items-center gap-2 text-zinc-500 text-sm mb-1">
            <Clock size={14} />
            対応期限
          </div>
          <p
            className={`font-medium ${
              complaint.dueAt && new Date(complaint.dueAt) < new Date()
                ? 'text-red-600'
                : ''
            }`}
          >
            {formatDate(complaint.dueAt)}
          </p>
        </div>

        <div className="bg-white rounded-lg border border-zinc-200 p-4">
          <div className="flex items-center gap-2 text-zinc-500 text-sm mb-1">
            <User size={14} />
            担当者
          </div>
          <p className="font-medium">
            {complaint.assigneeUserId || '未アサイン'}
          </p>
        </div>
      </div>

      {/* ステータス変更 */}
      <div className="bg-white rounded-lg border border-zinc-200 p-4">
        <h2 className="text-sm font-semibold text-zinc-700 mb-3">
          ステータス変更
        </h2>
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((status) => {
            const config = COMPLAINT_STATUS_CONFIG[status];
            const isActive = complaint.status === status;
            return (
              <button
                key={status}
                onClick={() => handleStatusChange(status)}
                disabled={isActive}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  isActive
                    ? `${config.bg} ${config.text} ring-2 ring-offset-1 ring-zinc-400`
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}
              >
                {config.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 内容 */}
      <div className="bg-white rounded-lg border border-zinc-200 p-4">
        <h2 className="text-sm font-semibold text-zinc-700 mb-3">内容</h2>
        <p className="text-zinc-700 whitespace-pre-wrap">
          {complaint.description}
        </p>
      </div>

      {/* 原因・対策・解決 */}
      <div className="bg-white rounded-lg border border-zinc-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-zinc-700">
            原因分析・再発防止・解決要約
          </h2>
          {!editMode ? (
            <button
              onClick={() => setEditMode(true)}
              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
            >
              <Edit2 size={14} />
              編集
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setEditMode(false)}
                className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
              >
                <X size={14} />
                キャンセル
              </button>
              <button
                onClick={handleSaveDetails}
                className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
              >
                <Save size={14} />
                保存
              </button>
            </div>
          )}
        </div>

        {editMode ? (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">
                原因分析
              </label>
              <textarea
                value={editData.rootCause}
                onChange={(e) =>
                  setEditData({ ...editData, rootCause: e.target.value })
                }
                className="w-full border border-zinc-300 rounded-lg p-2 text-sm"
                rows={3}
                placeholder="原因を記入..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">
                再発防止策
              </label>
              <textarea
                value={editData.preventivePlan}
                onChange={(e) =>
                  setEditData({ ...editData, preventivePlan: e.target.value })
                }
                className="w-full border border-zinc-300 rounded-lg p-2 text-sm"
                rows={3}
                placeholder="再発防止策を記入..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">
                解決要約
              </label>
              <textarea
                value={editData.resolutionSummary}
                onChange={(e) =>
                  setEditData({ ...editData, resolutionSummary: e.target.value })
                }
                className="w-full border border-zinc-300 rounded-lg p-2 text-sm"
                rows={3}
                placeholder="解決内容を記入..."
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-xs text-zinc-500 mb-1">原因分析</p>
              <p className="text-sm text-zinc-700 whitespace-pre-wrap">
                {complaint.rootCause || '（未入力）'}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-1">再発防止策</p>
              <p className="text-sm text-zinc-700 whitespace-pre-wrap">
                {complaint.preventivePlan || '（未入力）'}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-1">解決要約</p>
              <p className="text-sm text-zinc-700 whitespace-pre-wrap">
                {complaint.resolutionSummary || '（未入力）'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* コメント */}
      <div className="bg-white rounded-lg border border-zinc-200 p-4">
        <h2 className="text-sm font-semibold text-zinc-700 mb-3 flex items-center gap-2">
          <MessageSquare size={16} />
          コメント ({comments.length})
        </h2>

        {/* コメント一覧 */}
        <div className="space-y-3 mb-4">
          {comments.length === 0 ? (
            <p className="text-sm text-zinc-500">コメントはありません</p>
          ) : (
            comments.map((comment) => (
              <div
                key={comment.id}
                className="border-l-2 border-zinc-200 pl-3 py-1"
              >
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span className="font-medium">{comment.userId}</span>
                  <span>{formatDateTime(comment.createdAt)}</span>
                </div>
                <p className="text-sm text-zinc-700 mt-1 whitespace-pre-wrap">
                  {comment.message}
                </p>
              </div>
            ))
          )}
        </div>

        {/* 新規コメント */}
        <div className="flex gap-2">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="コメントを入力..."
            className="flex-1 border border-zinc-300 rounded-lg p-2 text-sm"
            rows={2}
          />
          <button
            onClick={handleAddComment}
            disabled={submittingComment || !newComment.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            送信
          </button>
        </div>
      </div>

      {/* 是正アクション */}
      <div className="bg-white rounded-lg border border-zinc-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-zinc-700 flex items-center gap-2">
            <CheckCircle2 size={16} />
            是正アクション ({actions.length})
          </h2>
          <button
            onClick={() => setShowActionForm(!showActionForm)}
            className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
          >
            <Plus size={14} />
            追加
          </button>
        </div>

        {/* 新規アクションフォーム */}
        {showActionForm && (
          <div className="bg-zinc-50 rounded-lg p-3 mb-4 space-y-3">
            <input
              type="text"
              value={newAction.title}
              onChange={(e) =>
                setNewAction({ ...newAction, title: e.target.value })
              }
              placeholder="アクションタイトル"
              className="w-full border border-zinc-300 rounded-lg p-2 text-sm"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                value={newAction.ownerUserId}
                onChange={(e) =>
                  setNewAction({ ...newAction, ownerUserId: e.target.value })
                }
                placeholder="担当者ID"
                className="border border-zinc-300 rounded-lg p-2 text-sm"
              />
              <input
                type="date"
                value={newAction.dueAt}
                onChange={(e) =>
                  setNewAction({ ...newAction, dueAt: e.target.value })
                }
                className="border border-zinc-300 rounded-lg p-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowActionForm(false)}
                className="px-3 py-1.5 text-sm text-zinc-600 hover:text-zinc-800"
              >
                キャンセル
              </button>
              <button
                onClick={handleAddAction}
                disabled={submittingAction || !newAction.title.trim()}
                className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                追加
              </button>
            </div>
          </div>
        )}

        {/* アクション一覧 */}
        <div className="space-y-2">
          {actions.length === 0 ? (
            <p className="text-sm text-zinc-500">アクションはありません</p>
          ) : (
            actions.map((action) => (
              <div
                key={action.id}
                className="flex items-center justify-between border border-zinc-200 rounded-lg p-3"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium text-zinc-700">
                    {action.title}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-zinc-500 mt-1">
                    {action.ownerUserId && (
                      <span>担当: {action.ownerUserId}</span>
                    )}
                    {action.dueAt && (
                      <span
                        className={
                          new Date(action.dueAt) < new Date() &&
                          action.status !== 'done'
                            ? 'text-red-600'
                            : ''
                        }
                      >
                        期限: {formatDate(action.dueAt)}
                      </span>
                    )}
                  </div>
                </div>
                <select
                  value={action.status}
                  onChange={(e) =>
                    handleActionStatusChange(
                      action.id,
                      e.target.value as ComplaintActionStatus
                    )
                  }
                  className="border border-zinc-300 rounded px-2 py-1 text-sm"
                >
                  {ACTION_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {COMPLAINT_ACTION_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 監査ログ（管理者のみ） */}
      {DEMO_USER.role === 'manager' && (
        <div className="bg-white rounded-lg border border-zinc-200 p-4">
          <button
            onClick={() => setShowEvents(!showEvents)}
            className="flex items-center gap-2 text-sm font-semibold text-zinc-700 w-full"
          >
            {showEvents ? (
              <ChevronDown size={16} />
            ) : (
              <ChevronRight size={16} />
            )}
            監査ログ
          </button>

          {showEvents && (
            <div className="mt-3 space-y-2">
              {events.length === 0 ? (
                <p className="text-sm text-zinc-500">イベントはありません</p>
              ) : (
                events.map((event) => (
                  <div
                    key={event.id}
                    className="text-xs text-zinc-600 border-l-2 border-zinc-200 pl-2 py-1"
                  >
                    <span className="font-medium">{event.action}</span>
                    <span className="mx-2">by {event.actorUserId || 'system'}</span>
                    <span className="text-zinc-400">
                      {formatDateTime(event.createdAt)}
                    </span>
                    {event.note && (
                      <p className="text-zinc-500 mt-0.5">{event.note}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
