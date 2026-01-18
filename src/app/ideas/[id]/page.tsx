'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft,
  Send,
  Paperclip,
  Download,
  Trash2,
  Clock,
  User,
  Building,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import {
  getIdea,
  getIdeaComments,
  getIdeaAttachments,
  addIdeaComment,
  uploadIdeaAttachment,
  deleteIdeaAttachment,
  updateIdeaStatus,
} from '@/lib/repositories/ideas';
import {
  ImprovementIdea,
  IdeaComment,
  IdeaAttachment,
  IDEA_STATUSES,
  IdeaStatus,
  IDEA_DIFFICULTIES,
  IDEA_COST_LEVELS,
} from '@/types/database';
import { formatDateJP } from '@/lib/utils';
import { getSignedUrl, STORAGE_BUCKETS } from '@/lib/supabase';

function IdeaDetailContent() {
  const router = useRouter();
  const params = useParams();
  const ideaId = params.id as string;
  const { profile, organization, isManagerOrAbove, isAdmin } = useSupabaseAuth();

  const [idea, setIdea] = useState<ImprovementIdea | null>(null);
  const [comments, setComments] = useState<IdeaComment[]>([]);
  const [attachments, setAttachments] = useState<IdeaAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [commenting, setCommenting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [newStatus, setNewStatus] = useState<IdeaStatus | ''>('');

  const fetchData = useCallback(async () => {
    if (!ideaId) return;

    setLoading(true);
    try {
      const [ideaData, commentsData, attachmentsData] = await Promise.all([
        getIdea(ideaId),
        getIdeaComments(ideaId),
        getIdeaAttachments(ideaId),
      ]);

      setIdea(ideaData);
      setComments(commentsData);
      setAttachments(attachmentsData);
    } catch (error) {
      console.error('Error fetching idea:', error);
    } finally {
      setLoading(false);
    }
  }, [ideaId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !profile) return;

    setCommenting(true);
    try {
      await addIdeaComment(ideaId, profile.id, newComment.trim());
      setNewComment('');
      await fetchData();
    } catch (error) {
      console.error('Error adding comment:', error);
      alert('コメントの投稿に失敗しました');
    } finally {
      setCommenting(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !profile) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 10 * 1024 * 1024) {
          alert(`${file.name}は10MBを超えています`);
          continue;
        }
        await uploadIdeaAttachment(ideaId, profile.id, file);
      }
      await fetchData();
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('ファイルのアップロードに失敗しました');
    } finally {
      setUploading(false);
    }
  };

  const handleFileDelete = async (attachment: IdeaAttachment) => {
    if (!confirm('このファイルを削除しますか？')) return;

    try {
      await deleteIdeaAttachment(attachment);
      await fetchData();
    } catch (error) {
      console.error('Error deleting file:', error);
      alert('ファイルの削除に失敗しました');
    }
  };

  const handleFileDownload = async (attachment: IdeaAttachment) => {
    try {
      const url = await getSignedUrl(STORAGE_BUCKETS.IDEAS, attachment.file_path);
      if (url) {
        window.open(url, '_blank');
      }
    } catch (error) {
      console.error('Error downloading file:', error);
    }
  };

  const handleStatusChange = async () => {
    if (!newStatus || !organization || !profile) return;

    if (!confirm(`ステータスを「${IDEA_STATUSES.find((s) => s.value === newStatus)?.label}」に変更しますか？`)) {
      return;
    }

    try {
      await updateIdeaStatus(ideaId, newStatus, organization.id, profile.id);
      setShowStatusDialog(false);
      setNewStatus('');
      await fetchData();
    } catch (error) {
      console.error('Error updating status:', error);
      alert('ステータスの更新に失敗しました');
    }
  };

  const getStatusBadge = (status: IdeaStatus) => {
    const statusInfo = IDEA_STATUSES.find((s) => s.value === status);
    if (!statusInfo) return null;

    const variantMap: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
      default: 'default',
      success: 'success',
      warning: 'warning',
      danger: 'danger',
      info: 'info',
    };

    return (
      <Badge variant={variantMap[statusInfo.color] || 'default'}>
        {statusInfo.label}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!idea) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500">アイデアが見つかりませんでした</p>
            <Button className="mt-4" onClick={() => router.push('/ideas')}>
              一覧に戻る
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const canEdit = idea.created_by === profile?.id || isAdmin;
  const canChangeStatus = isManagerOrAbove;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.push('/ideas')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {getStatusBadge(idea.status)}
            <Badge variant="default">{idea.category}</Badge>
            {idea.points_awarded > 0 && (
              <span className="text-sm text-green-600 font-medium">
                +{idea.points_awarded}pt
              </span>
            )}
          </div>
        </div>
        {canChangeStatus && (
          <Button variant="outline" onClick={() => setShowStatusDialog(true)}>
            ステータス変更
          </Button>
        )}
      </div>

      {/* メイン情報 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>課題・問題点</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-900 whitespace-pre-wrap">{idea.problem}</p>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>改善アイデア</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-900 whitespace-pre-wrap">{idea.idea}</p>
        </CardContent>
      </Card>

      {/* 期待される効果 */}
      {idea.expected_effects && idea.expected_effects.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>期待される効果</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {idea.expected_effects.map((effect, index) => (
                <li key={index} className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>{effect}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* メタ情報 */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-gray-400" />
              <span>{idea.creator_name || '不明'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Building className="w-4 h-4 text-gray-400" />
              <span>{idea.facility_name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" />
              <span>{formatDateJP(idea.created_at)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">難易度:</span>
              <span>
                {IDEA_DIFFICULTIES.find((d) => d.value === idea.difficulty)?.label || '-'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 添付ファイル */}
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>添付ファイル</CardTitle>
          {canEdit && (
            <label className="cursor-pointer">
              <input
                type="file"
                multiple
                className="hidden"
                onChange={handleFileUpload}
                disabled={uploading}
              />
              <Button variant="outline" size="sm" disabled={uploading} asChild>
                <span>
                  <Paperclip className="w-4 h-4 mr-2" />
                  {uploading ? 'アップロード中...' : 'ファイル追加'}
                </span>
              </Button>
            </label>
          )}
        </CardHeader>
        <CardContent>
          {attachments.length === 0 ? (
            <p className="text-sm text-gray-500">添付ファイルはありません</p>
          ) : (
            <ul className="space-y-2">
              {attachments.map((attachment) => (
                <li
                  key={attachment.id}
                  className="flex items-center justify-between p-2 bg-gray-50 rounded"
                >
                  <div className="flex items-center gap-2">
                    <Paperclip className="w-4 h-4 text-gray-400" />
                    <span className="text-sm">{attachment.file_name}</span>
                    <span className="text-xs text-gray-400">
                      ({Math.round((attachment.file_size || 0) / 1024)}KB)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleFileDownload(attachment)}
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleFileDelete(attachment)}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* コメント */}
      <Card>
        <CardHeader>
          <CardTitle>コメント ({comments.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {/* コメント一覧 */}
          {comments.length === 0 ? (
            <p className="text-sm text-gray-500 mb-4">コメントはありません</p>
          ) : (
            <div className="space-y-4 mb-4">
              {comments.map((comment) => (
                <div key={comment.id} className="border-b pb-4 last:border-b-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{comment.user_name}</span>
                    <span className="text-xs text-gray-400">
                      {formatDateJP(comment.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {comment.content}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* コメント入力 */}
          <form onSubmit={handleCommentSubmit} className="flex gap-2">
            <Textarea
              placeholder="コメントを入力..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              rows={2}
              className="flex-1"
            />
            <Button type="submit" loading={commenting} disabled={!newComment.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ステータス変更ダイアログ */}
      {showStatusDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>ステータス変更</CardTitle>
            </CardHeader>
            <CardContent>
              <Select
                label="新しいステータス"
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as IdeaStatus)}
                options={[
                  { value: '', label: '選択してください' },
                  ...IDEA_STATUSES.filter((s) => s.value !== idea.status).map((s) => ({
                    value: s.value,
                    label: s.label,
                  })),
                ]}
              />
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => setShowStatusDialog(false)}>
                  キャンセル
                </Button>
                <Button onClick={handleStatusChange} disabled={!newStatus}>
                  変更する
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export default function IdeaDetailPage() {
  return (
    <AuthGuard>
      <IdeaDetailContent />
    </AuthGuard>
  );
}
