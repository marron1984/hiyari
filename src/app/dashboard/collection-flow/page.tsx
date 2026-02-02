'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  GitBranch,
  Plus,
  Check,
  Clock,
  AlertTriangle,
  Play,
  ChevronRight,
  Phone,
  Mail,
  MessageSquare,
  FileText,
  MapPin,
  MoreHorizontal,
} from 'lucide-react';
import type {
  CollectionFlowTemplate,
  CollectionFlowStep,
  ReceivableFlowAssignment,
  ReceivableFlowStepLog,
  CollectionActionType,
} from '@/lib/collection/types';
import {
  COLLECTION_ACTION_TYPE_LABELS,
  STEP_SEVERITY_LABELS,
  STEP_SEVERITY_COLORS,
  ASSIGNMENT_STATUS_LABELS,
  ASSIGNMENT_STATUS_COLORS,
  STEP_LOG_STATUS_LABELS,
  STEP_LOG_STATUS_COLORS,
  isStepOverdue,
  calculateOverdueDays,
} from '@/lib/collection/types';

// タブ定義
type TabType = 'templates' | 'progress';

const TABS: { id: TabType; label: string }[] = [
  { id: 'templates', label: 'テンプレート管理' },
  { id: 'progress', label: '実行進捗' },
];

// アクションアイコン
function ActionIcon({ type }: { type: CollectionActionType }) {
  switch (type) {
    case 'call':
      return <Phone className="h-4 w-4" />;
    case 'email':
      return <Mail className="h-4 w-4" />;
    case 'sms':
      return <MessageSquare className="h-4 w-4" />;
    case 'letter':
      return <FileText className="h-4 w-4" />;
    case 'visit':
      return <MapPin className="h-4 w-4" />;
    default:
      return <MoreHorizontal className="h-4 w-4" />;
  }
}

interface Stats {
  activeAssignments: number;
  pausedAssignments: number;
  completedAssignments: number;
  overdueSteps: number;
  pendingSteps: number;
  completedStepsThisWeek: number;
  templateCount: number;
}

export default function CollectionFlowPage() {
  const [activeTab, setActiveTab] = useState<TabType>('templates');
  const [templates, setTemplates] = useState<CollectionFlowTemplate[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [templateDetail, setTemplateDetail] = useState<{
    template: CollectionFlowTemplate;
    steps: CollectionFlowStep[];
  } | null>(null);

  // フェッチ
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [templatesRes, statsRes] = await Promise.all([
        fetch('/api/collection/templates'),
        fetch('/api/collection/stats'),
      ]);

      if (templatesRes.ok) {
        const data = await templatesRes.json();
        setTemplates(data.templates);
      }
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // テンプレート詳細取得
  const fetchTemplateDetail = useCallback(async (templateId: string) => {
    try {
      const res = await fetch(`/api/collection/templates/${templateId}`);
      if (res.ok) {
        const data = await res.json();
        setTemplateDetail({ template: data.template, steps: data.steps });
      }
    } catch (error) {
      console.error('Error fetching template detail:', error);
    }
  }, []);

  useEffect(() => {
    if (selectedTemplate) {
      fetchTemplateDetail(selectedTemplate);
    } else {
      setTemplateDetail(null);
    }
  }, [selectedTemplate, fetchTemplateDetail]);

  // 新規テンプレート作成
  const handleCreateTemplate = async (name: string, subjectType: string | null, description: string) => {
    try {
      const res = await fetch('/api/collection/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, subjectType, description }),
      });
      if (res.ok) {
        setShowCreateModal(false);
        fetchData();
      }
    } catch (error) {
      console.error('Error creating template:', error);
    }
  };

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-zinc-900">
            <GitBranch className="h-6 w-6" />
            回収フロー
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            回収フローのテンプレート管理と実行進捗
          </p>
        </div>
        {activeTab === 'templates' && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            <Plus className="h-4 w-4" />
            新規テンプレート
          </button>
        )}
      </div>

      {/* 統計カード */}
      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Play className="h-4 w-4" />
              実行中フロー
            </div>
            <p className="mt-2 text-2xl font-bold text-zinc-900">
              {stats.activeAssignments}
            </p>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertTriangle className="h-4 w-4" />
              期限超過ステップ
            </div>
            <p className="mt-2 text-2xl font-bold text-red-700">
              {stats.overdueSteps}
            </p>
          </div>
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
            <div className="flex items-center gap-2 text-sm text-yellow-600">
              <Clock className="h-4 w-4" />
              未実施ステップ
            </div>
            <p className="mt-2 text-2xl font-bold text-yellow-700">
              {stats.pendingSteps}
            </p>
          </div>
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="flex items-center gap-2 text-sm text-green-600">
              <Check className="h-4 w-4" />
              今週完了
            </div>
            <p className="mt-2 text-2xl font-bold text-green-700">
              {stats.completedStepsThisWeek}
            </p>
          </div>
        </div>
      )}

      {/* タブ */}
      <div className="border-b border-zinc-200">
        <nav className="-mb-px flex gap-4">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-zinc-900 text-zinc-900'
                  : 'border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* コンテンツ */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-200 border-t-zinc-600" />
        </div>
      ) : activeTab === 'templates' ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* テンプレート一覧 */}
          <div className="space-y-4">
            <h2 className="font-bold text-zinc-900">テンプレート一覧</h2>
            {templates.length === 0 ? (
              <div className="rounded-lg border border-zinc-200 bg-white py-8 text-center">
                <GitBranch className="mx-auto h-12 w-12 text-zinc-300" />
                <p className="mt-4 text-sm text-zinc-500">テンプレートがありません</p>
              </div>
            ) : (
              <div className="space-y-2">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => setSelectedTemplate(template.id)}
                    className={`w-full rounded-lg border p-4 text-left transition-colors ${
                      selectedTemplate === template.id
                        ? 'border-zinc-900 bg-zinc-50'
                        : 'border-zinc-200 bg-white hover:bg-zinc-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-zinc-900">{template.name}</p>
                        {template.description && (
                          <p className="mt-1 text-sm text-zinc-500">
                            {template.description}
                          </p>
                        )}
                        <div className="mt-2 flex items-center gap-2">
                          {template.subjectType && (
                            <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                              {template.subjectType === 'client'
                                ? '個人'
                                : template.subjectType === 'company'
                                ? '法人'
                                : 'その他'}
                            </span>
                          )}
                          <span
                            className={`rounded px-2 py-0.5 text-xs ${
                              template.isActive
                                ? 'bg-green-100 text-green-700'
                                : 'bg-zinc-100 text-zinc-500'
                            }`}
                          >
                            {template.isActive ? '有効' : '無効'}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-zinc-400" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* テンプレート詳細 */}
          <div className="space-y-4">
            <h2 className="font-bold text-zinc-900">ステップ詳細</h2>
            {templateDetail ? (
              <div className="rounded-lg border border-zinc-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-zinc-900">
                    {templateDetail.template.name}
                  </h3>
                </div>
                {templateDetail.steps.length === 0 ? (
                  <p className="mt-4 text-sm text-zinc-500">
                    ステップがありません
                  </p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {templateDetail.steps.map((step) => (
                      <div
                        key={step.id}
                        className="flex items-start gap-3 rounded-lg border border-zinc-100 bg-zinc-50 p-3"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-200 text-sm font-bold text-zinc-700">
                          {step.stepOrder}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <ActionIcon type={step.actionType} />
                            <span className="font-medium text-zinc-900">
                              {COLLECTION_ACTION_TYPE_LABELS[step.actionType]}
                            </span>
                            <span
                              className={`rounded px-2 py-0.5 text-xs ${
                                STEP_SEVERITY_COLORS[step.severity]
                              }`}
                            >
                              {STEP_SEVERITY_LABELS[step.severity]}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-zinc-500">
                            前ステップから {step.dueDaysAfterPrevious}日後
                          </p>
                          {step.messageTemplate && (
                            <p className="mt-1 text-xs text-zinc-400">
                              {step.messageTemplate}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-zinc-200 bg-white py-8 text-center">
                <p className="text-sm text-zinc-500">
                  テンプレートを選択してください
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <ProgressTab />
      )}

      {/* 作成モーダル */}
      {showCreateModal && (
        <CreateTemplateModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateTemplate}
        />
      )}
    </div>
  );
}

// 進捗タブ
function ProgressTab() {
  const [assignments, setAssignments] = useState<
    Array<{
      assignment: ReceivableFlowAssignment;
      template: CollectionFlowTemplate | null;
      stepLogs: ReceivableFlowStepLog[];
    }>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // デモ用に receivables の割当を取得
    const fetchAssignments = async () => {
      setLoading(true);
      try {
        // デモ用: 既知の receivableId で取得
        const receivableIds = ['recv_demo_001', 'recv_demo_003'];
        const results = await Promise.all(
          receivableIds.map(async (id) => {
            const res = await fetch(`/api/collection/receivable/${id}`);
            if (res.ok) {
              return res.json();
            }
            return null;
          })
        );
        setAssignments(
          results.filter((r) => r && r.assignment) as Array<{
            assignment: ReceivableFlowAssignment;
            template: CollectionFlowTemplate | null;
            stepLogs: ReceivableFlowStepLog[];
          }>
        );
      } catch (error) {
        console.error('Error fetching assignments:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAssignments();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-200 border-t-zinc-600" />
      </div>
    );
  }

  if (assignments.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white py-12 text-center">
        <GitBranch className="mx-auto h-12 w-12 text-zinc-300" />
        <p className="mt-4 text-sm text-zinc-500">
          実行中のフローがありません
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {assignments.map(({ assignment, template, stepLogs }) => (
        <div
          key={assignment.id}
          className="rounded-lg border border-zinc-200 bg-white p-4"
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/dashboard/receivables/${assignment.receivableId}`}
                  className="font-medium text-zinc-900 hover:underline"
                >
                  未収: {assignment.receivableId}
                </Link>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    ASSIGNMENT_STATUS_COLORS[assignment.status]
                  }`}
                >
                  {ASSIGNMENT_STATUS_LABELS[assignment.status]}
                </span>
              </div>
              <p className="mt-1 text-sm text-zinc-500">
                テンプレート: {template?.name ?? '不明'}
              </p>
            </div>
            <div className="text-right text-sm text-zinc-500">
              現在ステップ: {assignment.currentStepOrder}
            </div>
          </div>

          {/* ステップ進捗 */}
          <div className="mt-4 flex items-center gap-2">
            {stepLogs.map((log, index) => {
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
                  {index < stepLogs.length - 1 && (
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

          {/* ステップ詳細 */}
          <div className="mt-4 space-y-2">
            {stepLogs.map((log) => {
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
        </div>
      ))}
    </div>
  );
}

// テンプレート作成モーダル
function CreateTemplateModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (name: string, subjectType: string | null, description: string) => void;
}) {
  const [name, setName] = useState('');
  const [subjectType, setSubjectType] = useState<string>('');
  const [description, setDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    onSubmit(name, subjectType || null, description);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-zinc-900">新規テンプレート</h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700">
              テンプレート名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              placeholder="例: 標準回収フロー（個人）"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700">
              対象タイプ
            </label>
            <select
              value={subjectType}
              onChange={(e) => setSubjectType(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            >
              <option value="">全対象</option>
              <option value="client">個人（利用者）</option>
              <option value="company">法人</option>
              <option value="other">その他</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700">
              説明
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              rows={3}
              placeholder="このテンプレートの説明..."
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
              作成
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
