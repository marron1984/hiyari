'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { Card, Button } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { useRole } from '@/contexts/RoleContext';
import { useApiFetch } from '@/hooks/useApiFetch';
import Link from 'next/link';
import {
  ArrowLeft,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  User,
  Calendar,
  History,
  MessageSquare,
  RotateCcw,
  Ban,
  ClipboardList,
  ExternalLink,
} from 'lucide-react';
import type {
  ApprovalRequest,
  ApprovalAction,
  ApprovalFlow,
  RequestStatus,
  ActionType,
} from '@/lib/approvals/types';

// ステータス設定
const STATUS_CONFIG: Record<
  RequestStatus,
  { label: string; color: string; icon: React.ReactNode }
> = {
  draft: {
    label: '下書き',
    color: 'bg-zinc-100 text-zinc-600',
    icon: <FileText className="w-4 h-4" />,
  },
  pending: {
    label: '承認待ち',
    color: 'bg-amber-100 text-amber-700',
    icon: <Clock className="w-4 h-4" />,
  },
  approved: {
    label: '承認済',
    color: 'bg-green-100 text-green-700',
    icon: <CheckCircle className="w-4 h-4" />,
  },
  rejected: {
    label: '却下',
    color: 'bg-red-100 text-red-700',
    icon: <XCircle className="w-4 h-4" />,
  },
  returned: {
    label: '差戻し',
    color: 'bg-orange-100 text-orange-700',
    icon: <RotateCcw className="w-4 h-4" />,
  },
  cancelled: {
    label: '取消',
    color: 'bg-zinc-100 text-zinc-500',
    icon: <Ban className="w-4 h-4" />,
  },
};

// アクションタイプ設定
const ACTION_CONFIG: Record<ActionType, { label: string; color: string }> = {
  submit: { label: '提出', color: 'bg-blue-100 text-blue-700' },
  approve: { label: '承認', color: 'bg-green-100 text-green-700' },
  reject: { label: '却下', color: 'bg-red-100 text-red-700' },
  return: { label: '差戻し', color: 'bg-orange-100 text-orange-700' },
  cancel: { label: '取消', color: 'bg-zinc-100 text-zinc-600' },
  comment: { label: 'コメント', color: 'bg-purple-100 text-purple-700' },
};

export default function ApprovalRequestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const requestId = params.id as string;

  const { currentRole } = useRole();
  const apiFetch = useApiFetch();
  const isAdmin = currentRole === 'admin';
  const isManager = ['admin', 'executive', 'manager'].includes(currentRole);

  const [request, setRequest] = useState<ApprovalRequest | null>(null);
  const [actions, setActions] = useState<ApprovalAction[]>([]);
  const [flow, setFlow] = useState<ApprovalFlow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionNote, setActionNote] = useState('');

  // データ取得
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/approval-requests/${requestId}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError('申請が見つかりません');
        } else if (res.status === 403) {
          setError('この申請を閲覧する権限がありません');
        } else {
          setError('データの取得に失敗しました');
        }
        return;
      }
      const data = await res.json();
      setRequest(data.request);
      setActions(data.actions || []);
      setFlow(data.flow || null);
    } catch (err) {
      console.error('Failed to fetch request:', err);
      setError('データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [requestId, apiFetch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // アクション実行
  const handleAction = async (actionType: 'approve' | 'reject' | 'return' | 'cancel') => {
    if (!request) return;

    const confirmMessages: Record<string, string> = {
      approve: 'この申請を承認しますか？',
      reject: 'この申請を却下しますか？',
      return: 'この申請を差戻しますか？',
      cancel: 'この申請を取消しますか？',
    };

    if (!confirm(confirmMessages[actionType])) return;

    setActionLoading(true);
    try {
      const res = await apiFetch(`/api/approval-requests/${requestId}/${actionType}`, {
        method: 'POST',
        body: JSON.stringify({ note: actionNote || undefined }),
      });

      if (res.ok) {
        setActionNote('');
        fetchData();
      } else {
        const data = await res.json();
        alert(data.error || 'アクションの実行に失敗しました');
      }
    } catch (err) {
      console.error('Failed to execute action:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // 日時フォーマット
  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return <Loading />;
  }

  if (error || !request) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <Header />
        <main className="max-w-4xl mx-auto px-4 py-6">
          <Card>
            <div className="p-8 text-center">
              <XCircle className="w-12 h-12 mx-auto mb-4 text-red-500" />
              <p className="text-zinc-600">{error || '申請が見つかりません'}</p>
              <Link href="/dashboard/approvals">
                <Button variant="outline" className="mt-4">
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  一覧に戻る
                </Button>
              </Link>
            </div>
          </Card>
        </main>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[request.status];
  const currentStep = flow?.steps.find((s) => s.stepOrder === request.currentStepOrder);

  return (
    <div className="min-h-screen bg-zinc-50">
      <Header />

      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/approvals"
              className="p-2 hover:bg-zinc-100 rounded-lg"
            >
              <ArrowLeft className="w-5 h-5 text-zinc-600" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold">{request.title}</h1>
                <span
                  className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded ${statusConfig.color}`}
                >
                  {statusConfig.icon}
                  {statusConfig.label}
                </span>
              </div>
              <p className="text-sm text-zinc-500">ID: {request.id}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="w-4 h-4 mr-1" />
            更新
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* メインコンテンツ */}
          <div className="lg:col-span-2 space-y-6">
            {/* 申請内容 */}
            <Card>
              <div className="p-4 border-b">
                <h2 className="font-semibold">申請内容</h2>
              </div>
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-zinc-500">申請タイプ</div>
                    <div className="font-medium">
                      {request.requestType === 'expense' && '経費申請'}
                      {request.requestType === 'overtime' && '残業申請'}
                      {request.requestType === 'generic' && '汎用申請'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500">フロー</div>
                    <div className="font-medium">{request.flowName || '-'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500">申請者</div>
                    <div className="flex items-center gap-1 font-medium">
                      <User className="w-4 h-4 text-zinc-400" />
                      {request.requesterUserName || request.requesterUserId}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500">現在ステップ</div>
                    <div className="font-medium">
                      {request.status === 'pending'
                        ? `${request.currentStepOrder}/${flow?.steps.length || '?'}`
                        : '-'}
                    </div>
                  </div>
                </div>

                {request.summary && (
                  <div>
                    <div className="text-xs text-zinc-500">サマリー</div>
                    <p className="text-sm mt-1">{request.summary}</p>
                  </div>
                )}

                {request.metaJson && (
                  <div>
                    <div className="text-xs text-zinc-500">詳細情報</div>
                    <div className="mt-1 p-3 bg-zinc-50 rounded-lg text-sm">
                      {request.metaJson.amount && (
                        <div>金額: ¥{request.metaJson.amount.toLocaleString()}</div>
                      )}
                      {request.metaJson.targetMonth && (
                        <div>対象月: {request.metaJson.targetMonth}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* アクション（承認待ちの場合） */}
            {request.status === 'pending' && isManager && (
              <Card>
                <div className="p-4 border-b">
                  <h2 className="font-semibold">アクション</h2>
                </div>
                <div className="p-4 space-y-4">
                  {currentStep && (
                    <div className="p-3 bg-blue-50 rounded-lg text-sm">
                      <div className="text-blue-700 font-medium">現在の承認者</div>
                      <div className="mt-1">
                        {currentStep.approverType === 'role' && (
                          <span>ロール: {currentStep.approverRole}</span>
                        )}
                        {currentStep.approverType === 'user' && (
                          <span>
                            ユーザー: {currentStep.approverUserName || currentStep.approverUserId}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="text-sm text-zinc-500">コメント（任意）</label>
                    <textarea
                      value={actionNote}
                      onChange={(e) => setActionNote(e.target.value)}
                      rows={2}
                      placeholder="承認/却下/差戻しの理由など"
                      className="w-full px-3 py-2 border rounded-lg text-sm mt-1"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleAction('approve')}
                      disabled={actionLoading}
                    >
                      <CheckCircle className="w-4 h-4 mr-1" />
                      承認
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAction('return')}
                      disabled={actionLoading}
                    >
                      <RotateCcw className="w-4 h-4 mr-1" />
                      差戻し
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAction('reject')}
                      disabled={actionLoading}
                    >
                      <XCircle className="w-4 h-4 mr-1" />
                      却下
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {/* 履歴 */}
            <Card>
              <div className="p-4 border-b flex items-center gap-2">
                <History className="w-4 h-4" />
                <h2 className="font-semibold">履歴</h2>
              </div>
              <div className="p-4">
                {actions.length === 0 ? (
                  <div className="text-center text-zinc-500 py-4">
                    履歴がありません
                  </div>
                ) : (
                  <div className="space-y-3">
                    {actions.map((action) => {
                      const actionConfig = ACTION_CONFIG[action.action];
                      return (
                        <div
                          key={action.id}
                          className="flex items-start gap-3 p-3 bg-zinc-50 rounded-lg"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span
                                className={`px-1.5 py-0.5 text-xs rounded ${actionConfig.color}`}
                              >
                                {actionConfig.label}
                              </span>
                              <span className="text-sm font-medium">
                                {action.actorUserName || action.actorUserId}
                              </span>
                            </div>
                            {action.note && (
                              <p className="text-sm text-zinc-600 flex items-start gap-1">
                                <MessageSquare className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                {action.note}
                              </p>
                            )}
                            <div className="text-xs text-zinc-400 mt-1">
                              {formatDateTime(action.createdAt)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* サイドバー */}
          <div className="space-y-6">
            {/* 日時情報 */}
            <Card>
              <div className="p-4 border-b">
                <h2 className="font-semibold">日時情報</h2>
              </div>
              <div className="p-4 space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-zinc-400" />
                  <div>
                    <div className="text-xs text-zinc-500">作成日時</div>
                    <div>{formatDateTime(request.createdAt)}</div>
                  </div>
                </div>
                {request.submittedAt && (
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-zinc-400" />
                    <div>
                      <div className="text-xs text-zinc-500">提出日時</div>
                      <div>{formatDateTime(request.submittedAt)}</div>
                    </div>
                  </div>
                )}
                {request.decidedAt && (
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-zinc-400" />
                    <div>
                      <div className="text-xs text-zinc-500">決定日時</div>
                      <div>{formatDateTime(request.decidedAt)}</div>
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* 承認ログリンク */}
            <Card>
              <div className="p-4">
                <Link
                  href={`/dashboard/approval-log?requestId=${request.id}`}
                  className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
                >
                  <ClipboardList className="w-4 h-4" />
                  承認ログで表示
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            </Card>

            {/* フローステップ */}
            {flow && (
              <Card>
                <div className="p-4 border-b">
                  <h2 className="font-semibold">承認フロー</h2>
                </div>
                <div className="p-4">
                  <div className="space-y-2">
                    {flow.steps.map((step, index) => {
                      const isCurrentStep =
                        request.status === 'pending' &&
                        step.stepOrder === request.currentStepOrder;
                      const isCompleted =
                        request.status === 'approved' ||
                        (request.status === 'pending' &&
                          step.stepOrder < request.currentStepOrder);

                      return (
                        <div
                          key={step.id}
                          className={`flex items-center gap-2 p-2 rounded ${
                            isCurrentStep
                              ? 'bg-blue-50 border border-blue-200'
                              : isCompleted
                              ? 'bg-green-50'
                              : 'bg-zinc-50'
                          }`}
                        >
                          <div
                            className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${
                              isCompleted
                                ? 'bg-green-500 text-white'
                                : isCurrentStep
                                ? 'bg-blue-500 text-white'
                                : 'bg-zinc-300 text-zinc-600'
                            }`}
                          >
                            {isCompleted ? (
                              <CheckCircle className="w-4 h-4" />
                            ) : (
                              step.stepOrder
                            )}
                          </div>
                          <div className="text-sm">
                            {step.approverType === 'role'
                              ? step.approverRole
                              : step.approverUserName || step.approverUserId}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
