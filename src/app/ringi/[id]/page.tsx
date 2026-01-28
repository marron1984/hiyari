'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import {
  ArrowLeft, Send, Undo2, CheckCircle, XCircle,
  Clock, Edit, Trash2, Save, X, ChevronDown, ChevronUp,
  AlertTriangle, CircleDollarSign, Folder, Calendar
} from 'lucide-react';
import {
  getRingi, updateRingi, deleteRingi,
  submitRingi, withdrawRingi, approveRingi, rejectRingi,
  getRingiAuditLogs
} from '@/lib/ringi';
import {
  Ringi, RingiAuditLog, RingiFormData,
  RINGI_STATUS_LABELS, RINGI_STATUS_COLORS, RINGI_CATEGORIES,
  canEdit, canDelete, canTransition, RingiCategory, RETURN_REASON_TEMPLATES
} from '@/types';
import { Select } from '@/components/ui/Select';

export default function RingiDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [ringi, setRingi] = useState<Ringi | null>(null);
  const [auditLogs, setAuditLogs] = useState<RingiAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<RingiFormData | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const ringiId = params.id as string;

  useEffect(() => {
    loadData();
  }, [ringiId]);

  const loadData = async () => {
    try {
      const [ringiData, logs] = await Promise.all([
        getRingi(ringiId),
        getRingiAuditLogs(ringiId),
      ]);
      setRingi(ringiData);
      setAuditLogs(logs);
      if (ringiData) {
        setEditData({
          title: ringiData.title,
          category: ringiData.category,
          amount: ringiData.amount,
          description: ringiData.description,
        });
      }
    } catch (error) {
      console.error('Failed to load ringi:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (action: 'submit' | 'withdraw' | 'approve' | 'reject' | 'delete') => {
    if (!user || !ringi) return;

    if (action === 'reject') {
      setShowRejectModal(true);
      return;
    }

    if (action === 'delete') {
      if (!confirm('この稟議を削除しますか？')) return;
    }

    setActionLoading(true);
    try {
      switch (action) {
        case 'submit':
          await submitRingi(ringiId, user.id, user.name, user.role, user.branchId);
          break;
        case 'withdraw':
          await withdrawRingi(ringiId, user.id, user.name, user.role, user.branchId);
          break;
        case 'approve':
          await approveRingi(ringiId, user.id, user.name, user.role, user.branchId);
          break;
        case 'delete':
          await deleteRingi(ringiId, user.id);
          router.push('/ringi');
          return;
      }
      await loadData();
    } catch (error) {
      console.error('Action failed:', error);
      alert(error instanceof Error ? error.message : '操作に失敗しました');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!user || !ringi || !rejectReason.trim()) {
      alert('却下理由を入力してください');
      return;
    }

    setActionLoading(true);
    try {
      await rejectRingi(ringiId, user.id, user.name, user.role, user.branchId, rejectReason);
      setShowRejectModal(false);
      setRejectReason('');
      await loadData();
    } catch (error) {
      console.error('Reject failed:', error);
      alert(error instanceof Error ? error.message : '却下に失敗しました');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!user || !ringi || !editData) return;

    setActionLoading(true);
    try {
      await updateRingi(ringiId, editData, user.id, user.name);
      setEditMode(false);
      await loadData();
    } catch (error) {
      console.error('Update failed:', error);
      alert(error instanceof Error ? error.message : '更新に失敗しました');
    } finally {
      setActionLoading(false);
    }
  };

  const formatDateTime = (date: Date) => {
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900" />
      </div>
    );
  }

  if (!ringi) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <Card className="p-8 text-center">
          <p className="text-zinc-500 mb-4">稟議が見つかりません</p>
          <Link href="/ringi">
            <Button variant="secondary">一覧に戻る</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const colors = RINGI_STATUS_COLORS[ringi.status];
  const userCanEdit = user && canEdit(ringi, user.id);
  const userCanDelete = user && canDelete(ringi, user.id);
  const userCanSubmit = user && canTransition(ringi, 'submit', user.id, user.role, user.branchId);
  const userCanWithdraw = user && canTransition(ringi, 'withdraw', user.id, user.role, user.branchId);
  const userCanApprove = user && canTransition(ringi, 'approve', user.id, user.role, user.branchId);
  const userCanReject = user && canTransition(ringi, 'reject', user.id, user.role, user.branchId);

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-2xl mx-auto px-4 py-6 safe-top safe-bottom">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/ringi">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold text-zinc-900">稟議詳細</h1>
        </div>

        {/* Status & Actions */}
        <Card className="p-4 mb-4">
          <div className="flex items-center justify-between">
            <Badge className={`${colors.bg} ${colors.text}`}>
              {ringi.status === 'draft' && <Edit className="w-4 h-4 mr-1" />}
              {ringi.status === 'submitted' && <Clock className="w-4 h-4 mr-1" />}
              {ringi.status === 'approved' && <CheckCircle className="w-4 h-4 mr-1" />}
              {ringi.status === 'rejected' && <XCircle className="w-4 h-4 mr-1" />}
              {RINGI_STATUS_LABELS[ringi.status]}
            </Badge>
            <div className="flex gap-2">
              {userCanEdit && !editMode && (
                <Button variant="ghost" size="sm" onClick={() => setEditMode(true)}>
                  <Edit className="w-4 h-4" />
                </Button>
              )}
              {userCanDelete && (
                <Button variant="ghost" size="sm" onClick={() => handleAction('delete')} disabled={actionLoading}>
                  <Trash2 className="w-4 h-4 text-red-500" />
                </Button>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 mt-4">
            {userCanSubmit && (
              <Button size="sm" onClick={() => handleAction('submit')} disabled={actionLoading}>
                <Send className="w-4 h-4" />
                申請する
              </Button>
            )}
            {userCanWithdraw && (
              <Button variant="secondary" size="sm" onClick={() => handleAction('withdraw')} disabled={actionLoading}>
                <Undo2 className="w-4 h-4" />
                取り下げ
              </Button>
            )}
            {userCanApprove && (
              <Button size="sm" onClick={() => handleAction('approve')} disabled={actionLoading} className="bg-emerald-600 hover:bg-emerald-700">
                <CheckCircle className="w-4 h-4" />
                承認
              </Button>
            )}
            {userCanReject && (
              <Button variant="secondary" size="sm" onClick={() => handleAction('reject')} disabled={actionLoading} className="text-red-600 hover:bg-red-50">
                <XCircle className="w-4 h-4" />
                却下
              </Button>
            )}
          </div>
        </Card>

        {/* Content */}
        <Card className="p-6 mb-4">
          {editMode && editData ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">件名</label>
                <Input
                  value={editData.title}
                  onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">カテゴリ</label>
                <Select
                  value={editData.category}
                  onChange={(e) => setEditData({ ...editData, category: e.target.value as RingiCategory })}
                  options={RINGI_CATEGORIES.map((cat) => ({ value: cat, label: cat }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">金額</label>
                <Input
                  type="number"
                  value={editData.amount || ''}
                  onChange={(e) => setEditData({ ...editData, amount: e.target.value ? Number(e.target.value) : undefined })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">申請理由</label>
                <textarea
                  value={editData.description}
                  onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                  rows={5}
                  className="w-full px-4 py-3 rounded-xl border border-zinc-200 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 resize-none"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSaveEdit} disabled={actionLoading}>
                  <Save className="w-4 h-4" />
                  保存
                </Button>
                <Button variant="ghost" onClick={() => setEditMode(false)}>
                  <X className="w-4 h-4" />
                  キャンセル
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* 要点サマリー（承認者向け最優先表示） */}
              <div className="bg-zinc-50 rounded-xl p-4">
                <h3 className="text-lg font-bold text-zinc-900 mb-3">{ringi.title}</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <CircleDollarSign className="w-4 h-4 text-zinc-400" />
                    <div>
                      <p className="text-xs text-zinc-400">金額</p>
                      <p className="text-lg font-semibold text-zinc-900">
                        {ringi.amount ? `¥${ringi.amount.toLocaleString()}` : '-'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Folder className="w-4 h-4 text-zinc-400" />
                    <div>
                      <p className="text-xs text-zinc-400">カテゴリ</p>
                      <p className="text-zinc-900 font-medium">{ringi.category}</p>
                    </div>
                  </div>
                  {ringi.urgency === '至急' && (
                    <div className="col-span-2 flex items-center gap-2 text-red-600">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="font-medium">至急対応が必要です</span>
                    </div>
                  )}
                  {ringi.desiredDecisionDate && (
                    <div className="col-span-2 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-zinc-400" />
                      <div>
                        <p className="text-xs text-zinc-400">希望決裁日</p>
                        <p className="text-zinc-900">
                          {new Date(ringi.desiredDecisionDate).toLocaleDateString('ja-JP')}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 詳細（折りたたみ） */}
              <div className="border border-zinc-200 rounded-xl overflow-hidden">
                <button
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-zinc-50 transition-colors"
                  onClick={() => setShowDetails(!showDetails)}
                >
                  <span className="font-medium text-zinc-700">詳細を{showDetails ? '閉じる' : '表示'}</span>
                  {showDetails ? (
                    <ChevronUp className="w-5 h-5 text-zinc-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-zinc-400" />
                  )}
                </button>

                {showDetails && (
                  <div className="border-t border-zinc-200 p-4 space-y-4">
                    {/* 背景（新フィールド） */}
                    {ringi.background && (
                      <div>
                        <p className="text-xs text-zinc-400 mb-1 font-medium">背景（なぜ必要か）</p>
                        <p className="text-zinc-700 whitespace-pre-wrap">{ringi.background}</p>
                      </div>
                    )}

                    {/* 目的（新フィールド） */}
                    {ringi.purpose && (
                      <div>
                        <p className="text-xs text-zinc-400 mb-1 font-medium">目的（何をするか）</p>
                        <p className="text-zinc-700 whitespace-pre-wrap">{ringi.purpose}</p>
                      </div>
                    )}

                    {/* 期待効果（新フィールド） */}
                    {ringi.expectedEffect && (
                      <div>
                        <p className="text-xs text-zinc-400 mb-1 font-medium">期待効果</p>
                        <p className="text-zinc-700 whitespace-pre-wrap">{ringi.expectedEffect}</p>
                      </div>
                    )}

                    {/* 旧フィールド：申請理由（互換性） */}
                    {ringi.description && !ringi.background && (
                      <div>
                        <p className="text-xs text-zinc-400 mb-1">申請理由</p>
                        <p className="text-zinc-700 whitespace-pre-wrap">{ringi.description}</p>
                      </div>
                    )}

                    {/* 支払情報 */}
                    {(ringi.payeeName || ringi.paymentMethod) && (
                      <div>
                        <p className="text-xs text-zinc-400 mb-1 font-medium">支払情報</p>
                        <div className="text-zinc-700">
                          {ringi.payeeName && <p>支払先: {ringi.payeeName}</p>}
                          {ringi.paymentMethod && <p>支払方法: {ringi.paymentMethod}</p>}
                        </div>
                      </div>
                    )}

                    {/* リスク */}
                    {ringi.risk && (
                      <div>
                        <p className="text-xs text-amber-600 mb-1 font-medium">リスク・懸念</p>
                        <p className="text-zinc-700 whitespace-pre-wrap p-2 bg-amber-50 rounded-lg">{ringi.risk}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 申請者情報 */}
              <div className="pt-4 border-t border-zinc-100">
                <p className="text-xs text-zinc-400 mb-1">申請者</p>
                <p className="text-zinc-900">{ringi.authorName}</p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  作成: {formatDateTime(ringi.createdAt)}
                  {ringi.submittedAt && ` / 申請: ${formatDateTime(ringi.submittedAt)}`}
                </p>
              </div>

              {/* 承認情報 */}
              {ringi.status === 'approved' && ringi.approvedByName && (
                <div className="pt-4 border-t border-zinc-100">
                  <p className="text-xs text-emerald-600 mb-1">承認情報</p>
                  <p className="text-zinc-900">{ringi.approvedByName}が承認</p>
                  <p className="text-xs text-zinc-400">{ringi.approvedAt && formatDateTime(ringi.approvedAt)}</p>
                  {ringi.approvalComment && (
                    <p className="text-sm text-zinc-600 mt-1">{ringi.approvalComment}</p>
                  )}
                </div>
              )}

              {/* 却下情報 */}
              {ringi.status === 'rejected' && ringi.rejectedByName && (
                <div className="pt-4 border-t border-zinc-100">
                  <p className="text-xs text-red-600 mb-1">却下情報</p>
                  <p className="text-zinc-900">{ringi.rejectedByName}が却下</p>
                  <p className="text-xs text-zinc-400">{ringi.rejectedAt && formatDateTime(ringi.rejectedAt)}</p>
                  {ringi.rejectionReason && (
                    <p className="text-sm text-red-600 mt-1 p-2 bg-red-50 rounded-lg">{ringi.rejectionReason}</p>
                  )}
                </div>
              )}

              {/* 差戻し情報 */}
              {ringi.status === 'returned' && ringi.returnedByName && (
                <div className="pt-4 border-t border-zinc-100">
                  <p className="text-xs text-orange-600 mb-1">差戻し情報</p>
                  <p className="text-zinc-900">{ringi.returnedByName}が差戻し</p>
                  <p className="text-xs text-zinc-400">{ringi.returnedAt && formatDateTime(ringi.returnedAt)}</p>
                  {ringi.returnReason && (
                    <p className="text-sm text-orange-600 mt-1 p-2 bg-orange-50 rounded-lg">{ringi.returnReason}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Audit Log */}
        {auditLogs.length > 0 && (
          <Card className="p-4">
            <p className="text-sm font-medium text-zinc-700 mb-3">履歴</p>
            <div className="space-y-2">
              {auditLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-zinc-300 mt-1.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-zinc-600">
                      <span className="font-medium text-zinc-900">{log.performedByName}</span>
                      {' '}が
                      {log.action === 'create' && '作成'}
                      {log.action === 'update' && '編集'}
                      {log.action === 'submit' && '申請'}
                      {log.action === 'approve' && '承認'}
                      {log.action === 'reject' && '却下'}
                      {log.action === 'withdraw' && '取り下げ'}
                    </p>
                    <p className="text-xs text-zinc-400">{formatDateTime(log.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-zinc-900 mb-4">却下・差戻し理由</h3>

            {/* テンプレートボタン */}
            <div className="mb-3">
              <p className="text-xs text-zinc-500 mb-2">テンプレートから選択:</p>
              <div className="flex flex-wrap gap-2">
                {RETURN_REASON_TEMPLATES.map((template, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setRejectReason((prev) =>
                        prev ? `${prev}\n${template}` : template
                      );
                    }}
                    className="text-xs px-2.5 py-1.5 rounded-full bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-colors"
                  >
                    {template}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="却下・差戻しの理由を入力してください"
              rows={4}
              className="w-full px-4 py-3 rounded-xl border border-zinc-200 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 resize-none mb-4"
            />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setShowRejectModal(false)} className="flex-1">
                キャンセル
              </Button>
              <Button onClick={handleReject} disabled={actionLoading} className="flex-1 bg-red-600 hover:bg-red-700">
                却下する
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
