'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Wallet,
  ArrowLeft,
  Calendar,
  User,
  Phone,
  Mail,
  FileText,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Plus,
  Edit2,
  History,
  GitBranch,
  Check,
} from 'lucide-react';
import type {
  Receivable,
  ReceivableAction,
  ReceivableStatus,
  ReceivablePriority,
  ReceivableActionType,
  ReceivableActionOutcome,
} from '@/lib/receivables/types';
import {
  RECEIVABLE_STATUS_LABELS,
  RECEIVABLE_STATUS_COLORS,
  RECEIVABLE_PRIORITY_LABELS,
  RECEIVABLE_PRIORITY_COLORS,
  RECEIVABLE_SUBJECT_TYPE_LABELS,
  ACTION_TYPE_LABELS,
  ACTION_OUTCOME_LABELS,
  formatAmount,
  maskSubjectName,
  calculateAgingDays,
  isOverdue,
} from '@/lib/receivables/types';
import type {
  ReceivableFlowAssignment,
  ReceivableFlowStepLog,
  CollectionFlowTemplate,
} from '@/lib/collection/types';
import {
  STEP_LOG_STATUS_LABELS,
  STEP_LOG_STATUS_COLORS,
  ASSIGNMENT_STATUS_LABELS,
  ASSIGNMENT_STATUS_COLORS,
  isStepOverdue,
  calculateOverdueDays,
} from '@/lib/collection/types';

export default function ReceivableDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [receivable, setReceivable] = useState<Receivable | null>(null);
  const [actions, setActions] = useState<ReceivableAction[]>([]);
  const [flowInfo, setFlowInfo] = useState<{
    assignment: ReceivableFlowAssignment | null;
    template: CollectionFlowTemplate | null;
    stepLogs: ReceivableFlowStepLog[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showActionModal, setShowActionModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showPaidModal, setShowPaidModal] = useState(false);
  const [showWriteoffModal, setShowWriteoffModal] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [recvRes, actionsRes, flowRes] = await Promise.all([
        fetch(`/api/receivables/${id}`),
        fetch(`/api/receivables/${id}/actions`),
        fetch(`/api/collection/receivable/${id}`),
      ]);

      if (recvRes.ok) {
        const data = await recvRes.json();
        setReceivable(data.receivable);
      }
      if (actionsRes.ok) {
        const data = await actionsRes.json();
        setActions(data.actions);
      }
      if (flowRes.ok) {
        const data = await flowRes.json();
        setFlowInfo(data);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // アクション追加
  const handleAddAction = async (input: AddActionInput) => {
    try {
      const res = await fetch(`/api/receivables/${id}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (res.ok) {
        setShowActionModal(false);
        fetchData();
      }
    } catch (error) {
      console.error('Error adding action:', error);
    }
  };

  // ステータス変更
  const handleStatusChange = async (status: ReceivableStatus) => {
    try {
      const res = await fetch(`/api/receivables/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setShowStatusModal(false);
        fetchData();
      }
    } catch (error) {
      console.error('Error changing status:', error);
    }
  };

  // 完済
  const handleMarkPaid = async (paidAt: string) => {
    try {
      const res = await fetch(`/api/receivables/${id}/paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paidAt }),
      });
      if (res.ok) {
        setShowPaidModal(false);
        fetchData();
      }
    } catch (error) {
      console.error('Error marking paid:', error);
    }
  };

  // 貸倒
  const handleWriteoff = async (note: string) => {
    try {
      const res = await fetch(`/api/receivables/${id}/writeoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      if (res.ok) {
        setShowWriteoffModal(false);
        fetchData();
      }
    } catch (error) {
      console.error('Error writing off:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-200 border-t-zinc-600" />
      </div>
    );
  }

  if (!receivable) {
    return (
      <div className="text-center py-12">
        <p className="text-zinc-500">未収が見つかりません</p>
        <Link href="/dashboard/receivables" className="mt-4 text-sm text-blue-600 hover:underline">
          一覧に戻る
        </Link>
      </div>
    );
  }

  const overdue = isOverdue(receivable);
  const agingDays = overdue ? calculateAgingDays(receivable.dueAt) : 0;

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/receivables"
            className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
          >
            <ArrowLeft className="h-4 w-4" />
            一覧へ戻る
          </Link>
          <h1 className="flex items-center gap-2 text-xl font-bold text-zinc-900">
            <Wallet className="h-5 w-5" />
            {maskSubjectName(receivable.subjectName)}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${
              RECEIVABLE_STATUS_COLORS[receivable.status]
            }`}
          >
            {RECEIVABLE_STATUS_LABELS[receivable.status]}
          </span>
          <span
            className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${
              RECEIVABLE_PRIORITY_COLORS[receivable.priority]
            }`}
          >
            {RECEIVABLE_PRIORITY_LABELS[receivable.priority]}
          </span>
        </div>
      </div>

      {/* 期限超過警告 */}
      {overdue && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-medium">
              支払期日を {agingDays}日 超過しています
            </span>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* 基本情報 */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-lg border border-zinc-200 bg-white p-6">
            <h2 className="flex items-center gap-2 text-lg font-bold text-zinc-900">
              <FileText className="h-5 w-5" />
              基本情報
            </h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-zinc-500">対象タイプ</dt>
                <dd className="mt-1 font-medium text-zinc-900">
                  {RECEIVABLE_SUBJECT_TYPE_LABELS[receivable.subjectType]}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-zinc-500">対象名</dt>
                <dd className="mt-1 font-medium text-zinc-900">
                  {receivable.subjectName}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-zinc-500">金額</dt>
                <dd className="mt-1 text-xl font-bold text-zinc-900">
                  {formatAmount(receivable.amount)}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-zinc-500">入金済</dt>
                <dd className="mt-1 font-medium text-green-600">
                  {formatAmount(receivable.paidAmount ?? 0)}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-zinc-500">支払期日</dt>
                <dd className={`mt-1 font-medium ${overdue ? 'text-red-600' : 'text-zinc-900'}`}>
                  {receivable.dueAt}
                  {overdue && ` (${agingDays}日超過)`}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-zinc-500">請求日</dt>
                <dd className="mt-1 font-medium text-zinc-900">
                  {receivable.issuedAt ?? '-'}
                </dd>
              </div>
              {receivable.invoiceNo && (
                <div>
                  <dt className="text-sm text-zinc-500">請求書番号</dt>
                  <dd className="mt-1 font-medium text-zinc-900">
                    {receivable.invoiceNo}
                  </dd>
                </div>
              )}
              {receivable.period && (
                <div>
                  <dt className="text-sm text-zinc-500">対象期間</dt>
                  <dd className="mt-1 font-medium text-zinc-900">
                    {receivable.period}
                  </dd>
                </div>
              )}
              {receivable.description && (
                <div className="sm:col-span-2">
                  <dt className="text-sm text-zinc-500">内容</dt>
                  <dd className="mt-1 font-medium text-zinc-900">
                    {receivable.description}
                  </dd>
                </div>
              )}
              {receivable.promisedAt && (
                <div>
                  <dt className="text-sm text-zinc-500">支払約束日</dt>
                  <dd className="mt-1 font-medium text-blue-600">
                    {receivable.promisedAt}
                  </dd>
                </div>
              )}
              {receivable.riskNote && (
                <div className="sm:col-span-2">
                  <dt className="text-sm text-zinc-500">リスク所見</dt>
                  <dd className="mt-1 font-medium text-orange-600">
                    {receivable.riskNote}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* 回収フロー進捗 */}
          {flowInfo && flowInfo.assignment && (
            <div className="rounded-lg border border-zinc-200 bg-white p-6">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-lg font-bold text-zinc-900">
                  <GitBranch className="h-5 w-5" />
                  回収フロー進捗
                </h2>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    ASSIGNMENT_STATUS_COLORS[flowInfo.assignment.status]
                  }`}
                >
                  {ASSIGNMENT_STATUS_LABELS[flowInfo.assignment.status]}
                </span>
              </div>
              <p className="mt-2 text-sm text-zinc-500">
                テンプレート: {flowInfo.template?.name ?? '不明'}
              </p>

              {/* ステップ進捗バー */}
              <div className="mt-4 flex items-center gap-2">
                {flowInfo.stepLogs.map((log, index) => {
                  const overdue = isStepOverdue(log);
                  const overdueDays = overdue ? calculateOverdueDays(log.plannedDueAt) : 0;

                  return (
                    <div key={log.id} className="flex items-center">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                          log.status === 'done'
                            ? 'bg-green-500 text-white'
                            : log.status === 'skipped'
                            ? 'bg-yellow-500 text-white'
                            : overdue
                            ? 'bg-red-500 text-white'
                            : 'bg-zinc-200 text-zinc-700'
                        }`}
                        title={
                          log.status === 'done'
                            ? '完了'
                            : log.status === 'skipped'
                            ? 'スキップ'
                            : overdue
                            ? `${overdueDays}日超過`
                            : `期限: ${log.plannedDueAt}`
                        }
                      >
                        {log.status === 'done' ? (
                          <Check className="h-4 w-4" />
                        ) : log.status === 'skipped' ? (
                          '-'
                        ) : overdue ? (
                          <AlertTriangle className="h-4 w-4" />
                        ) : (
                          log.stepOrder
                        )}
                      </div>
                      {index < flowInfo.stepLogs.length - 1 && (
                        <div
                          className={`h-0.5 w-6 ${
                            log.status === 'done' ? 'bg-green-500' : 'bg-zinc-200'
                          }`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* ステップ詳細リスト */}
              <div className="mt-4 space-y-2">
                {flowInfo.stepLogs.map((log) => {
                  const overdue = isStepOverdue(log);
                  return (
                    <div
                      key={log.id}
                      className={`flex items-center justify-between rounded px-3 py-2 text-sm ${
                        log.status === 'done'
                          ? 'bg-green-50'
                          : log.status === 'skipped'
                          ? 'bg-yellow-50'
                          : overdue
                          ? 'bg-red-50'
                          : 'bg-zinc-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          ステップ {log.stepOrder}
                        </span>
                        <span
                          className={`rounded px-2 py-0.5 text-xs ${
                            STEP_LOG_STATUS_COLORS[log.status]
                          }`}
                        >
                          {STEP_LOG_STATUS_LABELS[log.status]}
                        </span>
                        {overdue && (
                          <span className="text-xs text-red-600">
                            {calculateOverdueDays(log.plannedDueAt)}日超過
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-500">
                        期限: {log.plannedDueAt}
                        {log.doneAt && ` / 完了: ${log.doneAt.split('T')[0]}`}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4">
                <Link
                  href="/dashboard/collection-flow?tab=progress"
                  className="text-sm text-blue-600 hover:underline"
                >
                  回収フロー管理へ →
                </Link>
              </div>
            </div>
          )}

          {/* アクションログ */}
          <div className="rounded-lg border border-zinc-200 bg-white p-6">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold text-zinc-900">
                <History className="h-5 w-5" />
                アクションログ
              </h2>
              <button
                onClick={() => setShowActionModal(true)}
                className="flex items-center gap-1 rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
              >
                <Plus className="h-4 w-4" />
                アクション追加
              </button>
            </div>
            {actions.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-500">
                アクションログがありません
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {actions.map((action) => (
                  <div
                    key={action.id}
                    className="rounded-lg border border-zinc-100 bg-zinc-50 p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        {action.actionType === 'call' && <Phone className="h-4 w-4 text-zinc-500" />}
                        {action.actionType === 'email' && <Mail className="h-4 w-4 text-zinc-500" />}
                        {action.actionType === 'visit' && <User className="h-4 w-4 text-zinc-500" />}
                        {action.actionType === 'letter' && <FileText className="h-4 w-4 text-zinc-500" />}
                        <span className="font-medium text-zinc-900">
                          {ACTION_TYPE_LABELS[action.actionType]}
                        </span>
                        {action.outcome && (
                          <span className="rounded bg-zinc-200 px-2 py-0.5 text-xs text-zinc-700">
                            {ACTION_OUTCOME_LABELS[action.outcome] ?? action.outcome}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-zinc-500">
                        {new Date(action.occurredAt).toLocaleString('ja-JP')}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-zinc-700">{action.summary}</p>
                    {action.detail && (
                      <p className="mt-1 text-xs text-zinc-500">{action.detail}</p>
                    )}
                    {action.promisedAt && (
                      <p className="mt-2 text-xs text-blue-600">
                        <Calendar className="mr-1 inline h-3 w-3" />
                        約束日: {action.promisedAt}
                      </p>
                    )}
                    {action.amountPaid && (
                      <p className="mt-1 text-xs text-green-600">
                        入金額: {formatAmount(action.amountPaid)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* サイドバー: 操作・次アクション */}
        <div className="space-y-6">
          {/* 次アクション */}
          <div className="rounded-lg border border-zinc-200 bg-white p-6">
            <h2 className="flex items-center gap-2 font-bold text-zinc-900">
              <Clock className="h-5 w-5" />
              次アクション
            </h2>
            {receivable.nextActionAt ? (
              <div className="mt-4">
                <p className="text-sm text-zinc-500">予定日</p>
                <p className="mt-1 text-lg font-bold text-zinc-900">
                  {receivable.nextActionAt}
                </p>
                {receivable.nextActionType && (
                  <p className="mt-2 text-sm text-zinc-600">
                    種別: {receivable.nextActionType === 'call' ? '電話' :
                           receivable.nextActionType === 'email' ? 'メール' :
                           receivable.nextActionType === 'visit' ? '訪問' :
                           receivable.nextActionType === 'letter' ? '書面' : 'その他'}
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-4 text-sm text-zinc-500">
                次アクションは設定されていません
              </p>
            )}
          </div>

          {/* 担当 */}
          <div className="rounded-lg border border-zinc-200 bg-white p-6">
            <h2 className="flex items-center gap-2 font-bold text-zinc-900">
              <User className="h-5 w-5" />
              担当
            </h2>
            <p className="mt-4 text-sm text-zinc-700">
              {receivable.ownerUserId ?? '未割当'}
            </p>
          </div>

          {/* 操作 */}
          <div className="rounded-lg border border-zinc-200 bg-white p-6">
            <h2 className="flex items-center gap-2 font-bold text-zinc-900">
              <Edit2 className="h-5 w-5" />
              操作
            </h2>
            <div className="mt-4 space-y-2">
              <button
                onClick={() => setShowStatusModal(true)}
                className="w-full rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                ステータス変更
              </button>
              {receivable.status !== 'paid' && receivable.status !== 'writeoff' && (
                <>
                  <button
                    onClick={() => setShowPaidModal(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500"
                  >
                    <CheckCircle className="h-4 w-4" />
                    完済処理
                  </button>
                  <button
                    onClick={() => setShowWriteoffModal(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    <XCircle className="h-4 w-4" />
                    貸倒処理
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* アクション追加モーダル */}
      {showActionModal && (
        <ActionModal
          onClose={() => setShowActionModal(false)}
          onSubmit={handleAddAction}
        />
      )}

      {/* ステータス変更モーダル */}
      {showStatusModal && (
        <StatusModal
          currentStatus={receivable.status}
          onClose={() => setShowStatusModal(false)}
          onSubmit={handleStatusChange}
        />
      )}

      {/* 完済モーダル */}
      {showPaidModal && (
        <PaidModal
          onClose={() => setShowPaidModal(false)}
          onSubmit={handleMarkPaid}
        />
      )}

      {/* 貸倒モーダル */}
      {showWriteoffModal && (
        <WriteoffModal
          onClose={() => setShowWriteoffModal(false)}
          onSubmit={handleWriteoff}
        />
      )}
    </div>
  );
}

// アクション追加モーダル
interface AddActionInput {
  actionType: ReceivableActionType;
  summary: string;
  detail?: string;
  outcome?: ReceivableActionOutcome;
  promisedAt?: string;
  amountPaid?: number;
  nextActionAt?: string;
}

function ActionModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (input: AddActionInput) => void;
}) {
  const [formData, setFormData] = useState<AddActionInput>({
    actionType: 'call',
    summary: '',
    detail: '',
    outcome: null,
    promisedAt: '',
    amountPaid: undefined,
    nextActionAt: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.summary) return;
    onSubmit({
      ...formData,
      promisedAt: formData.promisedAt || undefined,
      amountPaid: formData.amountPaid || undefined,
      nextActionAt: formData.nextActionAt || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-zinc-900">アクション追加</h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700">
              種別 <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.actionType}
              onChange={(e) =>
                setFormData({ ...formData, actionType: e.target.value as ReceivableActionType })
              }
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            >
              {Object.entries(ACTION_TYPE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700">
              要約 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.summary}
              onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700">詳細</label>
            <textarea
              value={formData.detail}
              onChange={(e) => setFormData({ ...formData, detail: e.target.value })}
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              rows={2}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700">結果</label>
            <select
              value={formData.outcome ?? ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  outcome: (e.target.value || null) as ReceivableActionOutcome,
                })
              }
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            >
              <option value="">選択してください</option>
              {Object.entries(ACTION_OUTCOME_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          {formData.outcome === 'promised' && (
            <div>
              <label className="block text-sm font-medium text-zinc-700">約束日</label>
              <input
                type="date"
                value={formData.promisedAt}
                onChange={(e) => setFormData({ ...formData, promisedAt: e.target.value })}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </div>
          )}

          {formData.outcome === 'partial_paid' && (
            <div>
              <label className="block text-sm font-medium text-zinc-700">入金額</label>
              <input
                type="number"
                value={formData.amountPaid ?? ''}
                onChange={(e) =>
                  setFormData({ ...formData, amountPaid: parseInt(e.target.value, 10) || undefined })
                }
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-zinc-700">次アクション日</label>
            <input
              type="date"
              value={formData.nextActionAt}
              onChange={(e) => setFormData({ ...formData, nextActionAt: e.target.value })}
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              追加
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ステータス変更モーダル
function StatusModal({
  currentStatus,
  onClose,
  onSubmit,
}: {
  currentStatus: ReceivableStatus;
  onClose: () => void;
  onSubmit: (status: ReceivableStatus) => void;
}) {
  const [status, setStatus] = useState<ReceivableStatus>(currentStatus);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-zinc-900">ステータス変更</h2>
        <div className="mt-4">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ReceivableStatus)}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          >
            {Object.entries(RECEIVABLE_STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            キャンセル
          </button>
          <button
            onClick={() => onSubmit(status)}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            変更
          </button>
        </div>
      </div>
    </div>
  );
}

// 完済モーダル
function PaidModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (paidAt: string) => void;
}) {
  const [paidAt, setPaidAt] = useState(new Date().toISOString().split('T')[0]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-zinc-900">完済処理</h2>
        <div className="mt-4">
          <label className="block text-sm font-medium text-zinc-700">完済日</label>
          <input
            type="date"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            キャンセル
          </button>
          <button
            onClick={() => onSubmit(paidAt)}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500"
          >
            完済
          </button>
        </div>
      </div>
    </div>
  );
}

// 貸倒モーダル
function WriteoffModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (note: string) => void;
}) {
  const [note, setNote] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-zinc-900">貸倒処理</h2>
        <p className="mt-2 text-sm text-zinc-500">
          この操作は取り消せません。理由を記入してください。
        </p>
        <div className="mt-4">
          <label className="block text-sm font-medium text-zinc-700">理由</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            rows={3}
            placeholder="貸倒理由を入力..."
          />
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            キャンセル
          </button>
          <button
            onClick={() => onSubmit(note)}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
          >
            貸倒処理
          </button>
        </div>
      </div>
    </div>
  );
}
