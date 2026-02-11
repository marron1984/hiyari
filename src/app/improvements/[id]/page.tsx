'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  ArrowLeft, Heart, MessageCircle, Send, Trash2, CheckCircle, XCircle, Clock
} from 'lucide-react';
import {
  getImprovement, toggleLike, addComment, getComments, deleteComment,
  setReviewing, adoptImprovement, rejectImprovement, deleteImprovement
} from '@/lib/improvement';
import {
  Improvement, ImprovementComment,
  IMPROVEMENT_STATUS_LABELS, IMPROVEMENT_STATUS_COLORS, IMPROVEMENT_POINTS
} from '@/types';
import { hasMinRole } from '@/lib/auth';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

export default function ImprovementDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const [improvement, setImprovement] = useState<Improvement | null>(null);
  const [comments, setComments] = useState<ImprovementComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectModal, setRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [deleteCommentId, setDeleteCommentId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const improvementId = params.id as string;

  useEffect(() => {
    loadData();
  }, [improvementId]);

  const loadData = async () => {
    try {
      const [data, commentsData] = await Promise.all([
        getImprovement(improvementId),
        getComments(improvementId),
      ]);
      setImprovement(data);
      setComments(commentsData);
    } catch (error) {
      console.error('Failed to load:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async () => {
    if (!user || !improvement) return;
    try {
      const updated = await toggleLike(improvementId, user.id);
      setImprovement(updated);
    } catch (error) {
      console.error('Like failed:', error);
    }
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newComment.trim()) return;

    setCommentLoading(true);
    try {
      const comment = await addComment(improvementId, user.id, user.name, newComment);
      setComments([...comments, comment]);
      setNewComment('');
      setImprovement((prev) => prev ? { ...prev, commentCount: prev.commentCount + 1 } : prev);
    } catch (error) {
      console.error('Comment failed:', error);
    } finally {
      setCommentLoading(false);
    }
  };

  const handleDeleteComment = (commentId: string) => {
    setDeleteCommentId(commentId);
  };

  const executeDeleteComment = async () => {
    if (!deleteCommentId) return;
    try {
      await deleteComment(deleteCommentId, improvementId, user!.id);
      setComments(comments.filter((c) => c.id !== deleteCommentId));
      setImprovement((prev) => prev ? { ...prev, commentCount: prev.commentCount - 1 } : prev);
    } catch (error) {
      toast(error instanceof Error ? error.message : '削除に失敗しました', 'error');
    } finally {
      setDeleteCommentId(null);
    }
  };

  const handleStatusChange = async (action: 'reviewing' | 'adopt' | 'reject') => {
    if (!user || !improvement) return;

    if (action === 'reject') {
      setRejectModal(true);
      return;
    }

    setActionLoading(true);
    try {
      let updated;
      if (action === 'reviewing') {
        updated = await setReviewing(improvementId, user.id, user.role);
      } else if (action === 'adopt') {
        updated = await adoptImprovement(improvementId, user.id, user.name, user.role);
      }
      if (updated) setImprovement(updated);
    } catch (error) {
      toast(error instanceof Error ? error.message : '操作に失敗しました', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!user || !rejectReason.trim()) {
      toast('理由を入力してください', 'warning');
      return;
    }
    setActionLoading(true);
    try {
      const updated = await rejectImprovement(improvementId, user.id, user.name, user.role, rejectReason);
      setImprovement(updated);
      setRejectModal(false);
      setRejectReason('');
    } catch (error) {
      toast(error instanceof Error ? error.message : '操作に失敗しました', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = () => {
    if (!user) return;
    setShowDeleteConfirm(true);
  };

  const executeDelete = async () => {
    if (!user) return;
    try {
      await deleteImprovement(improvementId, user.id);
      setShowDeleteConfirm(false);
      router.push('/improvements');
    } catch (error) {
      toast(error instanceof Error ? error.message : '削除に失敗しました', 'error');
      setShowDeleteConfirm(false);
    }
  };

  const formatDateTime = (date: Date) => {
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(date);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900" />
      </div>
    );
  }

  if (!improvement) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <Card className="p-8 text-center">
          <p className="text-zinc-500 mb-4">改善アイデアが見つかりません</p>
          <Link href="/improvements">
            <Button variant="secondary">一覧に戻る</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const colors = IMPROVEMENT_STATUS_COLORS[improvement.status];
  const hasLiked = user && improvement.likedBy.includes(user.id);
  const isAuthor = user && improvement.authorId === user.id;
  const canManage = user && hasMinRole(user.role, 'leader');
  const canDelete = isAuthor && improvement.status === 'submitted';

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-2xl mx-auto px-4 py-6 safe-top safe-bottom">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/improvements">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold text-zinc-900">改善アイデア</h1>
        </div>

        {/* Status & Actions */}
        <Card className="p-4 mb-4">
          <div className="flex items-center justify-between">
            <Badge className={`${colors.bg} ${colors.text}`}>
              {IMPROVEMENT_STATUS_LABELS[improvement.status]}
            </Badge>
            <div className="flex items-center gap-2">
              <button
                onClick={handleLike}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors ${
                  hasLiked ? 'bg-red-50 text-red-500' : 'bg-zinc-100 text-zinc-500 hover:bg-red-50 hover:text-red-500'
                }`}
              >
                <Heart className={`w-4 h-4 ${hasLiked ? 'fill-current' : ''}`} />
                {improvement.likeCount}
              </button>
              {canDelete && (
                <Button variant="ghost" size="sm" onClick={handleDelete}>
                  <Trash2 className="w-4 h-4 text-red-500" />
                </Button>
              )}
            </div>
          </div>

          {/* Admin Actions */}
          {canManage && improvement.status !== 'adopted' && improvement.status !== 'rejected' && (
            <div className="flex gap-2 mt-4 pt-4 border-t border-zinc-100">
              {improvement.status === 'submitted' && (
                <Button size="sm" variant="secondary" onClick={() => handleStatusChange('reviewing')} disabled={actionLoading}>
                  <Clock className="w-4 h-4" />
                  検討中にする
                </Button>
              )}
              <Button size="sm" onClick={() => handleStatusChange('adopt')} disabled={actionLoading} className="bg-emerald-600 hover:bg-emerald-700">
                <CheckCircle className="w-4 h-4" />
                採用 (+{IMPROVEMENT_POINTS.adopted}pt)
              </Button>
              <Button size="sm" variant="secondary" onClick={() => handleStatusChange('reject')} disabled={actionLoading} className="text-red-600 hover:bg-red-50">
                <XCircle className="w-4 h-4" />
                不採用
              </Button>
            </div>
          )}
        </Card>

        {/* Content */}
        <Card className="p-6 mb-4">
          <div className="mb-4">
            <span className="text-xs text-zinc-400">{improvement.category}</span>
            <h2 className="text-lg font-bold text-zinc-900 mt-1">{improvement.title}</h2>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-xs text-zinc-400 mb-1">提案内容</p>
              <p className="text-zinc-700 whitespace-pre-wrap">{improvement.description}</p>
            </div>

            {improvement.expectedEffect && (
              <div>
                <p className="text-xs text-zinc-400 mb-1">期待される効果</p>
                <p className="text-zinc-700 whitespace-pre-wrap">{improvement.expectedEffect}</p>
              </div>
            )}

            <div className="pt-4 border-t border-zinc-100">
              <p className="text-sm text-zinc-900 font-medium">{improvement.authorName}</p>
              <p className="text-xs text-zinc-400">{formatDateTime(improvement.createdAt)}</p>
            </div>

            {improvement.status === 'adopted' && improvement.adoptedByName && (
              <div className="pt-4 border-t border-zinc-100">
                <p className="text-xs text-emerald-600 mb-1">採用情報</p>
                <p className="text-sm text-zinc-900">{improvement.adoptedByName}が採用</p>
                <p className="text-xs text-zinc-400">{improvement.adoptedAt && formatDateTime(improvement.adoptedAt)}</p>
                {improvement.adoptionComment && (
                  <p className="text-sm text-zinc-600 mt-2 p-2 bg-emerald-50 rounded-lg">{improvement.adoptionComment}</p>
                )}
              </div>
            )}

            {improvement.status === 'rejected' && improvement.rejectedByName && (
              <div className="pt-4 border-t border-zinc-100">
                <p className="text-xs text-red-600 mb-1">不採用情報</p>
                <p className="text-sm text-zinc-900">{improvement.rejectedByName}が不採用</p>
                <p className="text-xs text-zinc-400">{improvement.rejectedAt && formatDateTime(improvement.rejectedAt)}</p>
                {improvement.rejectionReason && (
                  <p className="text-sm text-red-600 mt-2 p-2 bg-red-50 rounded-lg">{improvement.rejectionReason}</p>
                )}
              </div>
            )}
          </div>
        </Card>

        {/* Comments */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <MessageCircle className="w-5 h-5 text-zinc-400" />
            <span className="font-medium text-zinc-900">コメント ({improvement.commentCount})</span>
          </div>

          {comments.length > 0 && (
            <div className="space-y-3 mb-4">
              {comments.map((comment) => (
                <div key={comment.id} className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-zinc-200 flex items-center justify-center text-xs font-medium text-zinc-600 shrink-0">
                    {comment.authorName.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-900">{comment.authorName}</span>
                      <span className="text-xs text-zinc-400">{formatDateTime(comment.createdAt)}</span>
                      {user && comment.authorId === user.id && (
                        <button
                          onClick={() => handleDeleteComment(comment.id)}
                          className="text-xs text-red-500 hover:underline"
                        >
                          削除
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-zinc-700 mt-1">{comment.content}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleComment} className="flex gap-2">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="コメントを入力..."
              className="flex-1 px-4 py-2 rounded-xl border border-zinc-200 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
            <Button type="submit" disabled={commentLoading || !newComment.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </Card>
      </div>

      {/* Delete Comment Confirm */}
      <ConfirmDialog
        open={!!deleteCommentId}
        title="コメントの削除"
        message="コメントを削除しますか？"
        confirmLabel="削除する"
        variant="danger"
        onConfirm={executeDeleteComment}
        onCancel={() => setDeleteCommentId(null)}
      />

      {/* Delete Improvement Confirm */}
      <ConfirmDialog
        open={showDeleteConfirm}
        title="提案の削除"
        message="この提案を削除しますか？"
        confirmLabel="削除する"
        variant="danger"
        onConfirm={executeDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-zinc-900 mb-4">不採用理由</h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="不採用の理由を入力してください"
              rows={4}
              className="w-full px-4 py-3 rounded-xl border border-zinc-200 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 resize-none mb-4"
            />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setRejectModal(false)} className="flex-1">
                キャンセル
              </Button>
              <Button onClick={handleReject} disabled={actionLoading} className="flex-1 bg-red-600 hover:bg-red-700">
                不採用にする
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
