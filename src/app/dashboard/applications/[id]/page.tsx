'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardContent, Button, Badge, Input, Select } from '@/components/ui';
import {
  ArrowLeft,
  Send,
  CheckCircle,
  XCircle,
  RotateCcw,
  Clock,
  Edit,
  Trash2,
  AlertCircle,
  History,
  User,
  Calendar,
  Wallet,
  Timer,
  Receipt,
  Save,
} from 'lucide-react';
import {
  ApplicationType,
  APPLICATION_TYPE_LABELS,
  APPLICATION_STATUS_LABELS,
  APPLICATION_STATUS_COLORS,
  ExpensePayload,
  OvertimePayload,
  EXPENSE_CATEGORIES,
  EXPENSE_PAYMENT_METHODS,
  OVERTIME_REASONS,
} from '@/types/application';
import { RingiStatus } from '@/types/ringi';
import { hasMinRole } from '@/lib/auth';

interface ApplicationDetail {
  id: string;
  type: ApplicationType;
  title: string;
  status: RingiStatus;
  authorId: string;
  authorName: string;
  branchId: string;
  amount?: number;
  payload: ExpensePayload | OvertimePayload;
  createdAt: string;
  submittedAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  approvedByName?: string;
  approvalComment?: string;
  rejectedAt?: string;
  rejectedBy?: string;
  rejectedByName?: string;
  rejectionReason?: string;
  returnedAt?: string;
  returnedBy?: string;
  returnedByName?: string;
  returnReason?: string;
}

interface AuditLog {
  id: string;
  action: string;
  fromStatus?: string;
  toStatus?: string;
  performedBy: string;
  performedByName: string;
  comment?: string;
  createdAt: string;
}

export default function ApplicationDetailPage() {
  return (
    <AuthGuard>
      <ApplicationDetailContent />
    </AuthGuard>
  );
}

function ApplicationDetailContent() {
  const params = useParams();
  const router = useRouter();
  const { user, firebaseUser } = useAuth();
  const applicationId = params.id as string;

  const [application, setApplication] = useState<ApplicationDetail | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<ExpensePayload | OvertimePayload | null>(null);

  // Modal states
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [returnReason, setReturnReason] = useState('');

  const loadApplication = useCallback(async () => {
    if (!firebaseUser) return;

    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch(`/api/applications/${applicationId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'データの取得に失敗しました');
      }

      const data = await res.json();
      setApplication(data.application);
      setAuditLogs(data.auditLogs || []);
      setEditData(data.application.payload);
    } catch (err) {
      console.error('Failed to load application:', err);
      setError(err instanceof Error ? err.message : 'データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, applicationId]);

  useEffect(() => {
    loadApplication();
  }, [loadApplication]);

  const handleAction = async (action: 'submit' | 'withdraw' | 'approve' | 'reject' | 'return', payload?: Record<string, string>) => {
    if (!firebaseUser) return;

    setActionLoading(true);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch(`/api/applications/${applicationId}/${action}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: payload ? JSON.stringify(payload) : undefined,
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'アクションに失敗しました');
      }

      await loadApplication();
      setShowRejectModal(false);
      setShowReturnModal(false);
      setRejectReason('');
      setReturnReason('');
    } catch (err) {
      console.error('Action failed:', err);
      alert(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!firebaseUser || !confirm('この申請を削除しますか？')) return;

    setActionLoading(true);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch(`/api/applications/${applicationId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.error || '削除に失敗しました');
      }

      router.push('/dashboard/applications');
    } catch (err) {
      console.error('Delete failed:', err);
      alert(err instanceof Error ? err.message : '削除に失敗しました');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!firebaseUser || !editData) return;

    setActionLoading(true);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch(`/api/applications/${applicationId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: editData }),
      });

      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.error || '更新に失敗しました');
      }

      await loadApplication();
      setIsEditing(false);
    } catch (err) {
      console.error('Update failed:', err);
      alert(err instanceof Error ? err.message : '更新に失敗しました');
    } finally {
      setActionLoading(false);
    }
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('ja-JP', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isAuthor = user?.id === application?.authorId;
  const canEdit = isAuthor && (application?.status === 'draft' || application?.status === 'returned');
  const canSubmit = isAuthor && (application?.status === 'draft' || application?.status === 'returned');
  const canWithdraw = isAuthor && application?.status === 'submitted';
  const canDelete = isAuthor && application?.status === 'draft';
  const canApprove = user && application?.status === 'submitted' && (
    hasMinRole(user.role, 'admin') ||
    (hasMinRole(user.role, 'leader') && user.branchId === application?.branchId)
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <Header />
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900" />
            <p className="text-sm text-zinc-500">読み込み中...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !application) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <Header />
        <div className="max-w-2xl mx-auto px-4 py-6">
          <Card className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <p className="text-zinc-700">{error || '申請が見つかりません'}</p>
            <Link href="/dashboard/applications" className="mt-4 inline-block">
              <Button variant="secondary">一覧に戻る</Button>
            </Link>
          </Card>
        </div>
      </div>
    );
  }

  const colors = APPLICATION_STATUS_COLORS[application.status];

  return (
    <div className="min-h-screen bg-zinc-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6 safe-bottom">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/dashboard/applications">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              {application.type === 'EXPENSE' ? (
                <Wallet className="w-5 h-5 text-blue-600" />
              ) : (
                <Timer className="w-5 h-5 text-purple-600" />
              )}
              <h1 className="text-lg font-bold text-zinc-900">
                {APPLICATION_TYPE_LABELS[application.type]}
              </h1>
              <Badge className={`${colors.bg} ${colors.text}`}>
                {APPLICATION_STATUS_LABELS[application.status]}
              </Badge>
            </div>
          </div>
        </div>

        {/* Status Alerts */}
        {application.status === 'returned' && application.returnReason && (
          <Card className="p-4 mb-6 bg-orange-50 border-orange-200">
            <div className="flex items-start gap-3">
              <RotateCcw className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-orange-800">差戻し</p>
                <p className="text-sm text-orange-700 mt-1">{application.returnReason}</p>
                <p className="text-xs text-orange-600 mt-2">
                  {application.returnedByName} / {formatDateTime(application.returnedAt!)}
                </p>
              </div>
            </div>
          </Card>
        )}

        {application.status === 'rejected' && application.rejectionReason && (
          <Card className="p-4 mb-6 bg-red-50 border-red-200">
            <div className="flex items-start gap-3">
              <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-800">却下</p>
                <p className="text-sm text-red-700 mt-1">{application.rejectionReason}</p>
                <p className="text-xs text-red-600 mt-2">
                  {application.rejectedByName} / {formatDateTime(application.rejectedAt!)}
                </p>
              </div>
            </div>
          </Card>
        )}

        {application.status === 'approved' && (
          <Card className="p-4 mb-6 bg-green-50 border-green-200">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-green-800">承認済み</p>
                {application.approvalComment && (
                  <p className="text-sm text-green-700 mt-1">{application.approvalComment}</p>
                )}
                <p className="text-xs text-green-600 mt-2">
                  {application.approvedByName} / {formatDateTime(application.approvedAt!)}
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Detail Card */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-zinc-900">申請内容</h2>
              {canEdit && !isEditing && (
                <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                  <Edit className="w-4 h-4 mr-1" />
                  編集
                </Button>
              )}
              {isEditing && (
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setIsEditing(false)}>
                    キャンセル
                  </Button>
                  <Button size="sm" onClick={handleSaveEdit} disabled={actionLoading}>
                    <Save className="w-4 h-4 mr-1" />
                    保存
                  </Button>
                </div>
              )}
            </div>

            {application.type === 'EXPENSE' ? (
              <ExpenseDetailView
                payload={application.payload as ExpensePayload}
                isEditing={isEditing}
                editData={editData as ExpensePayload}
                setEditData={setEditData}
              />
            ) : (
              <OvertimeDetailView
                payload={application.payload as OvertimePayload}
                isEditing={isEditing}
                editData={editData as OvertimePayload}
                setEditData={setEditData}
              />
            )}

            {/* Meta Info */}
            <div className="mt-6 pt-6 border-t border-zinc-200">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2 text-zinc-500">
                  <User className="w-4 h-4" />
                  <span>申請者: {application.authorName}</span>
                </div>
                <div className="flex items-center gap-2 text-zinc-500">
                  <Calendar className="w-4 h-4" />
                  <span>作成: {formatDateTime(application.createdAt)}</span>
                </div>
                {application.submittedAt && (
                  <div className="flex items-center gap-2 text-zinc-500">
                    <Clock className="w-4 h-4" />
                    <span>申請: {formatDateTime(application.submittedAt)}</span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3 mb-6">
          {canSubmit && (
            <Button onClick={() => handleAction('submit')} disabled={actionLoading}>
              <Send className="w-4 h-4 mr-1" />
              {application.status === 'returned' ? '再申請' : '申請する'}
            </Button>
          )}
          {canWithdraw && (
            <Button variant="secondary" onClick={() => handleAction('withdraw')} disabled={actionLoading}>
              <RotateCcw className="w-4 h-4 mr-1" />
              取り下げ
            </Button>
          )}
          {canApprove && (
            <>
              <Button onClick={() => handleAction('approve')} disabled={actionLoading}>
                <CheckCircle className="w-4 h-4 mr-1" />
                承認
              </Button>
              <Button variant="secondary" onClick={() => setShowReturnModal(true)} disabled={actionLoading}>
                <RotateCcw className="w-4 h-4 mr-1" />
                差戻し
              </Button>
              <Button variant="danger" onClick={() => setShowRejectModal(true)} disabled={actionLoading}>
                <XCircle className="w-4 h-4 mr-1" />
                却下
              </Button>
            </>
          )}
          {canDelete && (
            <Button variant="danger" onClick={handleDelete} disabled={actionLoading}>
              <Trash2 className="w-4 h-4 mr-1" />
              削除
            </Button>
          )}
        </div>

        {/* Audit Logs */}
        {auditLogs.length > 0 && (
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <History className="w-5 h-5 text-zinc-500" />
                <h3 className="font-semibold text-zinc-900">履歴</h3>
              </div>
              <div className="space-y-3">
                {auditLogs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 text-sm">
                    <div className="w-2 h-2 rounded-full bg-zinc-300 mt-1.5 shrink-0" />
                    <div>
                      <p className="text-zinc-900">
                        <span className="font-medium">{log.performedByName}</span>が
                        {log.action === 'create' && '作成'}
                        {log.action === 'update' && '更新'}
                        {log.action === 'submit' && '申請'}
                        {log.action === 'approve' && '承認'}
                        {log.action === 'reject' && '却下'}
                        {log.action === 'return' && '差戻し'}
                        {log.action === 'withdraw' && '取り下げ'}
                      </p>
                      {log.comment && (
                        <p className="text-zinc-500 mt-1">{log.comment}</p>
                      )}
                      <p className="text-xs text-zinc-400 mt-1">
                        {formatDateTime(log.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Reject Modal */}
        {showRejectModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-md">
              <CardContent className="p-6">
                <h3 className="text-lg font-bold text-zinc-900 mb-4">却下</h3>
                <p className="text-sm text-zinc-600 mb-4">却下理由を入力してください（必須）</p>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="却下理由"
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-zinc-200 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-red-500 mb-4"
                />
                <div className="flex gap-3">
                  <Button variant="secondary" onClick={() => setShowRejectModal(false)} className="flex-1">
                    キャンセル
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => handleAction('reject', { reason: rejectReason })}
                    disabled={!rejectReason.trim() || actionLoading}
                    className="flex-1"
                  >
                    却下する
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Return Modal */}
        {showReturnModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-md">
              <CardContent className="p-6">
                <h3 className="text-lg font-bold text-zinc-900 mb-4">差戻し</h3>
                <p className="text-sm text-zinc-600 mb-4">差戻し理由を入力してください（必須）</p>
                <textarea
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder="差戻し理由・修正依頼内容"
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-zinc-200 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-orange-500 mb-4"
                />
                <div className="flex gap-3">
                  <Button variant="secondary" onClick={() => setShowReturnModal(false)} className="flex-1">
                    キャンセル
                  </Button>
                  <Button
                    onClick={() => handleAction('return', { reason: returnReason })}
                    disabled={!returnReason.trim() || actionLoading}
                    className="flex-1 bg-orange-500 hover:bg-orange-600"
                  >
                    差戻す
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

// Expense Detail View
function ExpenseDetailView({
  payload,
  isEditing,
  editData,
  setEditData,
}: {
  payload: ExpensePayload;
  isEditing: boolean;
  editData: ExpensePayload;
  setEditData: (data: ExpensePayload | OvertimePayload | null) => void;
}) {
  if (isEditing) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">経費発生日</label>
            <Input
              type="date"
              value={editData.expenseDate}
              onChange={(e) => setEditData({ ...editData, expenseDate: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">金額</label>
            <Input
              type="number"
              value={editData.amount}
              onChange={(e) => setEditData({ ...editData, amount: Number(e.target.value) })}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">カテゴリ</label>
            <Select
              value={editData.category}
              onChange={(e) => setEditData({ ...editData, category: e.target.value as ExpensePayload['category'] })}
              options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c }))}
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">支払方法</label>
            <Select
              value={editData.paymentMethod}
              onChange={(e) => setEditData({ ...editData, paymentMethod: e.target.value as ExpensePayload['paymentMethod'] })}
              options={EXPENSE_PAYMENT_METHODS.map((m) => ({ value: m, label: m }))}
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">内容</label>
          <textarea
            value={editData.description}
            onChange={(e) => setEditData({ ...editData, description: e.target.value })}
            rows={3}
            className="w-full px-4 py-3 rounded-xl border border-zinc-200 bg-white resize-none"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-zinc-500">経費発生日</p>
          <p className="font-medium">{payload.expenseDate}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">金額</p>
          <p className="font-medium text-lg">¥{payload.amount.toLocaleString()}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-zinc-500">カテゴリ</p>
          <p className="font-medium">{payload.category}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">支払方法</p>
          <p className="font-medium">{payload.paymentMethod}</p>
        </div>
      </div>
      {payload.vendor && (
        <div>
          <p className="text-xs text-zinc-500">支払先</p>
          <p className="font-medium">{payload.vendor}</p>
        </div>
      )}
      <div>
        <p className="text-xs text-zinc-500">内容</p>
        <p className="font-medium whitespace-pre-wrap">{payload.description}</p>
      </div>
      {payload.purpose && (
        <div>
          <p className="text-xs text-zinc-500">利用目的</p>
          <p className="font-medium">{payload.purpose}</p>
        </div>
      )}
      {payload.receiptUrls.length > 0 && (
        <div>
          <p className="text-xs text-zinc-500 mb-2">領収書</p>
          <div className="flex gap-2">
            {payload.receiptUrls.map((url, idx) => (
              <a
                key={idx}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
              >
                <Receipt className="w-4 h-4" />
                領収書 {idx + 1}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Overtime Detail View
function OvertimeDetailView({
  payload,
  isEditing,
  editData,
  setEditData,
}: {
  payload: OvertimePayload;
  isEditing: boolean;
  editData: OvertimePayload;
  setEditData: (data: ExpensePayload | OvertimePayload | null) => void;
}) {
  if (isEditing) {
    return (
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">日付</label>
          <Input
            type="date"
            value={editData.date}
            onChange={(e) => setEditData({ ...editData, date: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">開始時間</label>
            <Input
              type="time"
              value={editData.startTime}
              onChange={(e) => setEditData({ ...editData, startTime: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">終了時間</label>
            <Input
              type="time"
              value={editData.endTime}
              onChange={(e) => setEditData({ ...editData, endTime: e.target.value })}
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">理由</label>
          <Select
            value={editData.reason}
            onChange={(e) => setEditData({ ...editData, reason: e.target.value as OvertimePayload['reason'] })}
            options={OVERTIME_REASONS.map((r) => ({ value: r, label: r }))}
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-500 mb-1">作業内容</label>
          <textarea
            value={editData.workContent || ''}
            onChange={(e) => setEditData({ ...editData, workContent: e.target.value })}
            rows={3}
            className="w-full px-4 py-3 rounded-xl border border-zinc-200 bg-white resize-none"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-zinc-500">日付</p>
        <p className="font-medium">{payload.date}</p>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-zinc-500">開始</p>
          <p className="font-medium">{payload.startTime}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">終了</p>
          <p className="font-medium">{payload.endTime}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">時間</p>
          <p className="font-medium text-lg">{payload.hours}時間</p>
        </div>
      </div>
      <div className="flex gap-4">
        {payload.isHoliday && (
          <Badge className="bg-purple-100 text-purple-700">休日出勤</Badge>
        )}
        {payload.isNightShift && (
          <Badge className="bg-indigo-100 text-indigo-700">深夜帯</Badge>
        )}
      </div>
      <div>
        <p className="text-xs text-zinc-500">理由</p>
        <p className="font-medium">{payload.reason}</p>
      </div>
      {payload.reasonDetail && (
        <div>
          <p className="text-xs text-zinc-500">詳細理由</p>
          <p className="font-medium">{payload.reasonDetail}</p>
        </div>
      )}
      {payload.workContent && (
        <div>
          <p className="text-xs text-zinc-500">作業内容</p>
          <p className="font-medium whitespace-pre-wrap">{payload.workContent}</p>
        </div>
      )}
    </div>
  );
}
