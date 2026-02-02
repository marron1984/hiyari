'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Users,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Plus,
  ChevronRight,
  Shield,
  FileText,
  ListTodo,
} from 'lucide-react';
import type {
  CommitteeSummary,
  CommitteeMeeting,
  CommitteeActionItem,
} from '@/lib/committees/types';
import {
  COMMITTEE_CATEGORY_LABELS,
  COMMITTEE_CADENCE_LABELS,
  ACTION_ITEM_STATUS_LABELS,
} from '@/lib/committees/types';

type TabType = 'committees' | 'meetings' | 'actions';

export default function CommitteesPage() {
  const [activeTab, setActiveTab] = useState<TabType>('committees');
  const [summaries, setSummaries] = useState<CommitteeSummary[]>([]);
  const [meetings, setMeetings] = useState<CommitteeMeeting[]>([]);
  const [actionItems, setActionItems] = useState<CommitteeActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewCommitteeModal, setShowNewCommitteeModal] = useState(false);
  const [showNewMeetingModal, setShowNewMeetingModal] = useState(false);

  // 統計
  const totalCommittees = summaries.length;
  const requiredCommittees = summaries.filter((s) => s.committee.required).length;
  const openActions = actionItems.filter(
    (a) => a.status === 'open' || a.status === 'in_progress'
  ).length;
  const overdueActions = actionItems.filter(
    (a) =>
      a.dueAt &&
      new Date(a.dueAt) < new Date() &&
      a.status !== 'done' &&
      a.status !== 'cancelled'
  ).length;
  const plannedMeetings = meetings.filter((m) => m.status === 'planned').length;

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [summariesRes, meetingsRes, actionsRes] = await Promise.all([
        fetch('/api/committees/summaries'),
        fetch('/api/committees/meetings'),
        fetch('/api/committees/action-items'),
      ]);

      const [summariesData, meetingsData, actionsData] = await Promise.all([
        summariesRes.json(),
        meetingsRes.json(),
        actionsRes.json(),
      ]);

      if (summariesData.success) setSummaries(summariesData.summaries);
      if (meetingsData.success) setMeetings(meetingsData.meetings);
      if (actionsData.success) setActionItems(actionsData.actionItems);
    } catch (error) {
      console.error('データ取得エラー:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateCommittee(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    try {
      const res = await fetch('/api/committees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.get('name'),
          category: formData.get('category'),
          cadence: formData.get('cadence'),
          required: formData.get('required') === 'on',
          description: formData.get('description') || null,
        }),
      });

      if (res.ok) {
        setShowNewCommitteeModal(false);
        fetchData();
      }
    } catch (error) {
      console.error('委員会作成エラー:', error);
    }
  }

  async function handleCreateMeeting(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    try {
      const res = await fetch('/api/committees/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          committeeId: formData.get('committeeId'),
          title: formData.get('title'),
          scheduledAt: formData.get('scheduledAt'),
          location: formData.get('location') || null,
        }),
      });

      if (res.ok) {
        setShowNewMeetingModal(false);
        fetchData();
      }
    } catch (error) {
      console.error('開催作成エラー:', error);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-zinc-200 rounded w-48" />
          <div className="h-32 bg-zinc-200 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">委員会管理</h1>
          <p className="text-zinc-600 mt-1">
            委員会の開催・議事録・是正タスクを管理
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowNewMeetingModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-zinc-300 text-zinc-700 rounded-lg hover:bg-zinc-50"
          >
            <Calendar className="w-4 h-4" />
            新規開催
          </button>
          <button
            onClick={() => setShowNewCommitteeModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            委員会追加
          </button>
        </div>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg border border-zinc-200 p-4">
          <div className="flex items-center gap-2 text-zinc-600 text-sm">
            <Users className="w-4 h-4" />
            委員会数
          </div>
          <div className="mt-2 text-2xl font-bold text-zinc-900">
            {totalCommittees}
          </div>
          <div className="text-xs text-zinc-500">
            うち必須: {requiredCommittees}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-zinc-200 p-4">
          <div className="flex items-center gap-2 text-zinc-600 text-sm">
            <Calendar className="w-4 h-4" />
            予定開催
          </div>
          <div className="mt-2 text-2xl font-bold text-blue-600">
            {plannedMeetings}
          </div>
          <div className="text-xs text-zinc-500">今後の予定</div>
        </div>

        <div className="bg-white rounded-lg border border-zinc-200 p-4">
          <div className="flex items-center gap-2 text-zinc-600 text-sm">
            <ListTodo className="w-4 h-4" />
            未完了アクション
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-600">
            {openActions}
          </div>
          <div className="text-xs text-zinc-500">open + in_progress</div>
        </div>

        <div className="bg-white rounded-lg border border-zinc-200 p-4">
          <div className="flex items-center gap-2 text-zinc-600 text-sm">
            <AlertTriangle className="w-4 h-4" />
            期限超過
          </div>
          <div className="mt-2 text-2xl font-bold text-red-600">
            {overdueActions}
          </div>
          <div className="text-xs text-zinc-500">要対応</div>
        </div>

        <div className="bg-white rounded-lg border border-zinc-200 p-4">
          <div className="flex items-center gap-2 text-zinc-600 text-sm">
            <CheckCircle2 className="w-4 h-4" />
            今月開催済み
          </div>
          <div className="mt-2 text-2xl font-bold text-green-600">
            {
              meetings.filter(
                (m) =>
                  m.status === 'held' &&
                  m.heldAt &&
                  new Date(m.heldAt).getMonth() === new Date().getMonth()
              ).length
            }
          </div>
          <div className="text-xs text-zinc-500">held</div>
        </div>
      </div>

      {/* タブ */}
      <div className="border-b border-zinc-200">
        <nav className="flex gap-4">
          {[
            { id: 'committees' as TabType, label: '委員会一覧', icon: Users },
            { id: 'meetings' as TabType, label: '開催予定', icon: Calendar },
            { id: 'actions' as TabType, label: 'アクション', icon: ListTodo },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* 委員会一覧 */}
      {activeTab === 'committees' && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {summaries.map((summary) => (
            <Link
              key={summary.committee.id}
              href={`/dashboard/committees/${summary.committee.id}`}
              className="block bg-white rounded-lg border border-zinc-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {summary.committee.required && (
                      <Shield className="w-4 h-4 text-red-500" />
                    )}
                    <h3 className="font-semibold text-zinc-900">
                      {summary.committee.name}
                    </h3>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    <span className="px-2 py-0.5 bg-zinc-100 text-zinc-600 rounded">
                      {COMMITTEE_CATEGORY_LABELS[summary.committee.category]}
                    </span>
                    <span className="text-zinc-500">
                      {COMMITTEE_CADENCE_LABELS[summary.committee.cadence]}
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-zinc-400" />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-zinc-500">直近開催:</span>
                  <span className="ml-1 text-zinc-900">
                    {summary.lastHeldAt
                      ? new Date(summary.lastHeldAt).toLocaleDateString('ja-JP')
                      : '未開催'}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500">次回予定:</span>
                  <span className="ml-1 text-zinc-900">
                    {summary.nextScheduledAt
                      ? new Date(summary.nextScheduledAt).toLocaleDateString(
                          'ja-JP'
                        )
                      : '未定'}
                  </span>
                </div>
              </div>

              {(summary.openActionCount > 0 ||
                summary.overdueActionCount > 0) && (
                <div className="mt-3 pt-3 border-t border-zinc-100 flex items-center gap-3 text-sm">
                  {summary.openActionCount > 0 && (
                    <span className="text-amber-600">
                      未完了: {summary.openActionCount}件
                    </span>
                  )}
                  {summary.overdueActionCount > 0 && (
                    <span className="text-red-600">
                      期限超過: {summary.overdueActionCount}件
                    </span>
                  )}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      {/* 開催予定 */}
      {activeTab === 'meetings' && (
        <div className="bg-white rounded-lg border border-zinc-200">
          <table className="w-full">
            <thead className="bg-zinc-50 border-b border-zinc-200">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-zinc-600">
                  開催
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-zinc-600">
                  委員会
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-zinc-600">
                  予定日
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-zinc-600">
                  場所
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-zinc-600">
                  ステータス
                </th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {meetings.map((meeting) => {
                const committee = summaries.find(
                  (s) => s.committee.id === meeting.committeeId
                )?.committee;
                return (
                  <tr key={meeting.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/committees/meetings/${meeting.id}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {meeting.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {committee?.name || '-'}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {new Date(meeting.scheduledAt).toLocaleDateString('ja-JP')}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {meeting.location || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                          meeting.status === 'held'
                            ? 'bg-green-100 text-green-700'
                            : meeting.status === 'cancelled'
                            ? 'bg-zinc-100 text-zinc-600'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {meeting.status === 'held' && (
                          <CheckCircle2 className="w-3 h-3" />
                        )}
                        {meeting.status === 'planned' && (
                          <Clock className="w-3 h-3" />
                        )}
                        {meeting.status === 'held'
                          ? '開催済み'
                          : meeting.status === 'cancelled'
                          ? '中止'
                          : '予定'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/committees/meetings/${meeting.id}`}
                        className="text-zinc-400 hover:text-zinc-600"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {meetings.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-zinc-500"
                  >
                    開催予定がありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* アクション一覧 */}
      {activeTab === 'actions' && (
        <div className="bg-white rounded-lg border border-zinc-200">
          <table className="w-full">
            <thead className="bg-zinc-50 border-b border-zinc-200">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-zinc-600">
                  タイトル
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-zinc-600">
                  委員会/開催
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-zinc-600">
                  期限
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-zinc-600">
                  ステータス
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {actionItems.map((item) => {
                const meeting = meetings.find((m) => m.id === item.meetingId);
                const committee = meeting
                  ? summaries.find(
                      (s) => s.committee.id === meeting.committeeId
                    )?.committee
                  : null;
                const isOverdue =
                  item.dueAt &&
                  new Date(item.dueAt) < new Date() &&
                  item.status !== 'done' &&
                  item.status !== 'cancelled';

                return (
                  <tr key={item.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-zinc-900">
                        {item.title}
                      </div>
                      {item.description && (
                        <div className="text-sm text-zinc-500 truncate max-w-xs">
                          {item.description}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 text-sm">
                      <div>{committee?.name || '-'}</div>
                      <div className="text-zinc-400">
                        {meeting?.title || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {item.dueAt ? (
                        <span
                          className={isOverdue ? 'text-red-600' : 'text-zinc-600'}
                        >
                          {new Date(item.dueAt).toLocaleDateString('ja-JP')}
                          {isOverdue && (
                            <AlertTriangle className="inline w-4 h-4 ml-1" />
                          )}
                        </span>
                      ) : (
                        <span className="text-zinc-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                          item.status === 'done'
                            ? 'bg-green-100 text-green-700'
                            : item.status === 'in_progress'
                            ? 'bg-blue-100 text-blue-700'
                            : item.status === 'cancelled'
                            ? 'bg-zinc-100 text-zinc-600'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {ACTION_ITEM_STATUS_LABELS[item.status]}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {actionItems.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-zinc-500"
                  >
                    アクション項目がありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 新規委員会モーダル */}
      {showNewCommitteeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-zinc-900 mb-4">
              委員会を追加
            </h2>
            <form onSubmit={handleCreateCommittee} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  委員会名 <span className="text-red-500">*</span>
                </label>
                <input
                  name="name"
                  type="text"
                  required
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="例: 身体拘束適正化委員会"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    カテゴリ <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="category"
                    required
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
                  >
                    <option value="safety">安全</option>
                    <option value="quality">品質</option>
                    <option value="compliance">法令遵守</option>
                    <option value="other">その他</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    開催周期 <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="cadence"
                    required
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
                  >
                    <option value="monthly">毎月</option>
                    <option value="quarterly">四半期</option>
                    <option value="semiannual">半期</option>
                    <option value="annual">年次</option>
                    <option value="adhoc">随時</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  name="required"
                  type="checkbox"
                  id="required"
                  className="w-4 h-4 text-blue-600 border-zinc-300 rounded"
                />
                <label htmlFor="required" className="text-sm text-zinc-700">
                  法定/必須委員会
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  説明
                </label>
                <textarea
                  name="description"
                  rows={2}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
                  placeholder="委員会の目的や内容"
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowNewCommitteeModal(false)}
                  className="px-4 py-2 text-zinc-600 hover:text-zinc-900"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  作成
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 新規開催モーダル */}
      {showNewMeetingModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-zinc-900 mb-4">
              開催を予定する
            </h2>
            <form onSubmit={handleCreateMeeting} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  委員会 <span className="text-red-500">*</span>
                </label>
                <select
                  name="committeeId"
                  required
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
                >
                  <option value="">選択してください</option>
                  {summaries.map((s) => (
                    <option key={s.committee.id} value={s.committee.id}>
                      {s.committee.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  タイトル <span className="text-red-500">*</span>
                </label>
                <input
                  name="title"
                  type="text"
                  required
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
                  placeholder="例: 2026年2月 定例"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  予定日時 <span className="text-red-500">*</span>
                </label>
                <input
                  name="scheduledAt"
                  type="datetime-local"
                  required
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  場所
                </label>
                <input
                  name="location"
                  type="text"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
                  placeholder="例: 会議室A"
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowNewMeetingModal(false)}
                  className="px-4 py-2 text-zinc-600 hover:text-zinc-900"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  作成
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
