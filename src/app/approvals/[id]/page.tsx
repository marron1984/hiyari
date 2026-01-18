'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  RotateCcw,
  Paperclip,
  Download,
  Clock,
  User,
  Building,
  AlertTriangle,
  History,
} from 'lucide-react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import {
  getApproval,
  getApprovalActions,
  getApprovalAttachments,
  approveApproval,
  returnApproval,
  rejectApproval,
  resubmitApproval,
  uploadApprovalAttachment,
  canApprove as canApproveCheck,
  getApprovalFlowInfo,
} from '@/lib/repositories/approvals';
import {
  Approval,
  ApprovalAction,
  ApprovalAttachment,
  APPROVAL_STATUSES,
  ApprovalStatus,
  UserRole,
  USER_ROLES,
} from '@/types/database';
import { formatDateJP } from '@/lib/utils';
import { getSignedUrl, STORAGE_BUCKETS } from '@/lib/supabase';

type ActionType = 'approve' | 'return' | 'reject' | null;

function ApprovalDetailContent() {
  const router = useRouter();
  const params = useParams();
  const approvalId = params.id as string;
  const { profile, organization, isManagerOrAbove, isAdmin } = useSupabaseAuth();

  const [approval, setApproval] = useState<Approval | null>(null);
  const [actions, setActions] = useState<ApprovalAction[]>([]);
  const [attachments, setAttachments] = useState<ApprovalAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionType, setActionType] = useState<ActionType>(null);
  const [actionComment, setActionComment] = useState('');
  const [processing, setProcessing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!approvalId) return;

    setLoading(true);
    try {
      const [approvalData, actionsData, attachmentsData] = await Promise.all([
        getApproval(approvalId),
        getApprovalActions(approvalId),
        getApprovalAttachments(approvalId),
      ]);

      setApproval(approvalData);
      setActions(actionsData);
      setAttachments(attachmentsData);
    } catch (error) {
      console.error('Error fetching approval:', error);
    } finally {
      setLoading(false);
    }
  }, [approvalId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const canApprove = useCallback(() => {
    if (!approval || !profile) return false;

    // 自分の申請は承認不可
    if (approval.applicant_id === profile.id) return false;

    // 5段階承認フロー: ロールとステータスに基づいて承認可能か判定
    return canApproveCheck(profile.role, approval.status as ApprovalStatus);
  }, [approval, profile]);

  const canResubmit = useCallback(() => {
    if (!approval || !profile) return false;
    return approval.status === 'returned' && approval.applicant_id === profile.id;
  }, [approval, profile]);

  const handleAction = async () => {
    if (!actionType || !approval || !profile) return;

    // 差戻し・却下はコメント必須
    if ((actionType === 'return' || actionType === 'reject') && !actionComment.trim()) {
      alert('コメントを入力してください');
      return;
    }

    const actionLabel =
      actionType === 'approve' ? '承認' : actionType === 'return' ? '差戻し' : '却下';

    if (!confirm(`この稟議を${actionLabel}しますか？`)) {
      return;
    }

    setProcessing(true);
    try {
      if (actionType === 'approve') {
        await approveApproval(approval.id, profile.id, profile.role, actionComment || undefined);
      } else if (actionType === 'return') {
        await returnApproval(approval.id, profile.id, actionComment);
      } else if (actionType === 'reject') {
        await rejectApproval(approval.id, profile.id, actionComment);
      }

      setActionType(null);
      setActionComment('');
      await fetchData();
    } catch (error) {
      console.error('Error processing action:', error);
      alert('処理に失敗しました');
    } finally {
      setProcessing(false);
    }
  };

  const handleResubmit = async () => {
    if (!approval || !profile) return;

    if (!confirm('この稟議を再申請しますか？')) {
      return;
    }

    setProcessing(true);
    try {
      await resubmitApproval(approval.id, profile.id, {});
      await fetchData();
    } catch (error) {
      console.error('Error resubmitting:', error);
      alert('再申請に失敗しました');
    } finally {
      setProcessing(false);
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
        await uploadApprovalAttachment(approvalId, profile.id, file);
      }
      await fetchData();
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('ファイルのアップロードに失敗しました');
    } finally {
      setUploading(false);
    }
  };

  const handleFileDownload = async (attachment: ApprovalAttachment) => {
    try {
      const url = await getSignedUrl(STORAGE_BUCKETS.APPROVALS, attachment.file_path);
      if (url) {
        window.open(url, '_blank');
      }
    } catch (error) {
      console.error('Error downloading file:', error);
    }
  };

  const getStatusBadge = (status: ApprovalStatus) => {
    const statusInfo = APPROVAL_STATUSES.find((s) => s.value === status);
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

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case 'approve':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'return':
        return <RotateCcw className="w-4 h-4 text-yellow-500" />;
      case 'reject':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <History className="w-4 h-4 text-gray-400" />;
    }
  };

  const getActionLabel = (actionType: string) => {
    switch (actionType) {
      case 'submit':
        return '申請';
      case 'approve':
        return '承認';
      case 'return':
        return '差戻し';
      case 'reject':
        return '却下';
      default:
        return actionType;
    }
  };

  const isOverdue = approval && approval.desired_due_date &&
    approval.status !== 'approved' && approval.status !== 'rejected' &&
    new Date(approval.desired_due_date) < new Date();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!approval) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500">稟議が見つかりませんでした</p>
            <Button className="mt-4" onClick={() => router.push('/approvals')}>
              一覧に戻る
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.push('/approvals')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {getStatusBadge(approval.status)}
            <Badge variant="default">{approval.category}</Badge>
            {isOverdue && (
              <Badge variant="danger">
                <AlertTriangle className="w-3 h-3 mr-1" />
                期限超過
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* 件名と金額 */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <h2 className="text-xl font-bold text-gray-900 mb-2">{approval.title}</h2>
          {approval.amount && (
            <p className="text-2xl font-bold text-blue-600">
              ¥{approval.amount.toLocaleString()}
            </p>
          )}
        </CardContent>
      </Card>

      {/* 申請内容 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>申請内容</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-900 whitespace-pre-wrap">{approval.description}</p>
        </CardContent>
      </Card>

      {/* メタ情報 */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-gray-400" />
              <span>{approval.applicant_name || '不明'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Building className="w-4 h-4 text-gray-400" />
              <span>{approval.facility_name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" />
              <span>申請: {formatDateJP(approval.created_at)}</span>
            </div>
            {approval.desired_due_date && (
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-400" />
                <span className={isOverdue ? 'text-red-600 font-medium' : ''}>
                  希望: {formatDateJP(approval.desired_due_date)}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 添付ファイル */}
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>添付ファイル</CardTitle>
          {approval.applicant_id === profile?.id && (
            <label className="cursor-pointer inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
              <input
                type="file"
                multiple
                className="hidden"
                onChange={handleFileUpload}
                disabled={uploading}
              />
              <Paperclip className="w-4 h-4 mr-2" />
              {uploading ? 'アップロード中...' : 'ファイル追加'}
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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleFileDownload(attachment)}
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* 承認履歴 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>承認履歴</CardTitle>
        </CardHeader>
        <CardContent>
          {actions.length === 0 ? (
            <p className="text-sm text-gray-500">履歴はありません</p>
          ) : (
            <div className="space-y-4">
              {actions.map((action) => (
                <div key={action.id} className="flex gap-3">
                  <div className="mt-1">{getActionIcon(action.action_type)}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{action.actor_name}</span>
                      <span className="text-xs text-gray-400">
                        ({USER_ROLES.find((r) => r.value === action.actor_role)?.label || action.actor_role})
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatDateJP(action.created_at)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">{getActionLabel(action.action_type)}</span>
                      {action.comment && (
                        <span className="block mt-1 text-gray-600">{action.comment}</span>
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 承認アクション */}
      {canApprove() && (
        <Card className="mb-6 border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle>承認アクション</CardTitle>
          </CardHeader>
          <CardContent>
            {actionType ? (
              <div className="space-y-4">
                <Textarea
                  label={`コメント${actionType !== 'approve' ? '（必須）' : '（任意）'}`}
                  placeholder={
                    actionType === 'approve'
                      ? '承認に関するコメントがあれば入力してください'
                      : actionType === 'return'
                      ? '差戻しの理由を入力してください'
                      : '却下の理由を入力してください'
                  }
                  value={actionComment}
                  onChange={(e) => setActionComment(e.target.value)}
                  rows={3}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setActionType(null);
                      setActionComment('');
                    }}
                  >
                    キャンセル
                  </Button>
                  <Button
                    variant={actionType === 'reject' ? 'danger' : 'primary'}
                    onClick={handleAction}
                    loading={processing}
                  >
                    {actionType === 'approve'
                      ? '承認する'
                      : actionType === 'return'
                      ? '差戻す'
                      : '却下する'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button onClick={() => setActionType('approve')}>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  承認
                </Button>
                <Button variant="secondary" onClick={() => setActionType('return')}>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  差戻し
                </Button>
                <Button variant="danger" onClick={() => setActionType('reject')}>
                  <XCircle className="w-4 h-4 mr-2" />
                  却下
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 再申請 */}
      {canResubmit() && (
        <Card className="mb-6 border-yellow-200 bg-yellow-50">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-yellow-800">差戻しされています</p>
                <p className="text-sm text-yellow-600">
                  内容を確認の上、再申請してください
                </p>
              </div>
              <Button onClick={handleResubmit} loading={processing}>
                <RotateCcw className="w-4 h-4 mr-2" />
                再申請
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function ApprovalDetailPage() {
  return (
    <AuthGuard>
      <ApprovalDetailContent />
    </AuthGuard>
  );
}
