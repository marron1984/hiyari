'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  Clock,
  CheckCircle2,
  Plus,
  AlertTriangle,
  ListTodo,
  Shield,
  ChevronRight,
} from 'lucide-react';
import type {
  Committee,
  CommitteeMeeting,
  CommitteeActionItem,
} from '@/lib/committees/types';
import {
  COMMITTEE_CATEGORY_LABELS,
  COMMITTEE_CADENCE_LABELS,
  MEETING_STATUS_LABELS,
  ACTION_ITEM_STATUS_LABELS,
} from '@/lib/committees/types';

type TabType = 'meetings' | 'actions';

export default function CommitteeDetailPage({
  params,
}: {
  params: Promise<{ committeeId: string }>;
}) {
  const { committeeId } = use(params);
  const [activeTab, setActiveTab] = useState<TabType>('meetings');
  const [committee, setCommittee] = useState<Committee | null>(null);
  const [meetings, setMeetings] = useState<CommitteeMeeting[]>([]);
  const [actionItems, setActionItems] = useState<CommitteeActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewMeetingModal, setShowNewMeetingModal] = useState(false);

  useEffect(() => {
    fetchData();
  }, [committeeId]);

  async function fetchData() {
    setLoading(true);
    try {
      const [committeeRes, meetingsRes, actionsRes] = await Promise.all([
        fetch(`/api/committees/${committeeId}`),
        fetch(`/api/committees/meetings?committeeId=${committeeId}`),
        fetch(`/api/committees/action-items?committeeId=${committeeId}`),
      ]);

      const [committeeData, meetingsData, actionsData] = await Promise.all([
        committeeRes.json(),
        meetingsRes.json(),
        actionsRes.json(),
      ]);

      if (committeeData.success) setCommittee(committeeData.committee);
      if (meetingsData.success) setMeetings(meetingsData.meetings);
      if (actionsData.success) setActionItems(actionsData.actionItems);
    } catch (error) {
      console.error('データ取得エラー:', error);
    } finally {
      setLoading(false);
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
          committeeId,
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

  // 統計
  const heldMeetings = meetings.filter((m) => m.status === 'held').length;
  const plannedMeetings = meetings.filter((m) => m.status === 'planned').length;
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

  if (!committee) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <p className="text-zinc-500">委員会が見つかりません</p>
          <Link
            href="/dashboard/committees"
            className="mt-4 inline-block text-blue-600 hover:underline"
          >
            委員会一覧に戻る
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/dashboard/committees"
            className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            委員会一覧
          </Link>
          <div className="flex items-center gap-3">
            {committee.required && (
              <Shield className="w-6 h-6 text-red-500" />
            )}
            <h1 className="text-2xl font-bold text-zinc-900">
              {committee.name}
            </h1>
          </div>
          <div className="mt-2 flex items-center gap-3 text-sm">
            <span className="px-2 py-1 bg-zinc-100 text-zinc-600 rounded">
              {COMMITTEE_CATEGORY_LABELS[committee.category]}
            </span>
            <span className="text-zinc-500">
              {COMMITTEE_CADENCE_LABELS[committee.cadence]}
            </span>
            {committee.required && (
              <span className="px-2 py-1 bg-red-100 text-red-700 rounded">
                法定/必須
              </span>
            )}
          </div>
          {committee.description && (
            <p className="mt-2 text-zinc-600">{committee.description}</p>
          )}
        </div>
        <button
          onClick={() => setShowNewMeetingModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          新規開催
        </button>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-zinc-200 p-4">
          <div className="flex items-center gap-2 text-zinc-600 text-sm">
            <CheckCircle2 className="w-4 h-4" />
            開催済み
          </div>
          <div className="mt-2 text-2xl font-bold text-green-600">
            {heldMeetings}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-zinc-200 p-4">
          <div className="flex items-center gap-2 text-zinc-600 text-sm">
            <Clock className="w-4 h-4" />
            予定
          </div>
          <div className="mt-2 text-2xl font-bold text-blue-600">
            {plannedMeetings}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-zinc-200 p-4">
          <div className="flex items-center gap-2 text-zinc-600 text-sm">
            <ListTodo className="w-4 h-4" />
            未完了アクション
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-600">
            {openActions}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-zinc-200 p-4">
          <div className="flex items-center gap-2 text-zinc-600 text-sm">
            <AlertTriangle className="w-4 h-4" />
            期限超過
          </div>
          <div className="mt-2 text-2xl font-bold text-red-600">
            {overdueActions}
          </div>
        </div>
      </div>

      {/* タブ */}
      <div className="border-b border-zinc-200">
        <nav className="flex gap-4">
          {[
            { id: 'meetings' as TabType, label: '開催履歴', icon: Calendar },
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

      {/* 開催履歴 */}
      {activeTab === 'meetings' && (
        <div className="bg-white rounded-lg border border-zinc-200">
          <table className="w-full">
            <thead className="bg-zinc-50 border-b border-zinc-200">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-zinc-600">
                  開催
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-zinc-600">
                  予定日
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-zinc-600">
                  開催日
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
              {meetings.map((meeting) => (
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
                    {new Date(meeting.scheduledAt).toLocaleDateString('ja-JP')}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {meeting.heldAt
                      ? new Date(meeting.heldAt).toLocaleDateString('ja-JP')
                      : '-'}
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
                      {MEETING_STATUS_LABELS[meeting.status]}
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
              ))}
              {meetings.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-zinc-500"
                  >
                    開催履歴がありません
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
                  開催
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
                      {meeting ? (
                        <Link
                          href={`/dashboard/committees/meetings/${meeting.id}`}
                          className="text-blue-600 hover:underline"
                        >
                          {meeting.title}
                        </Link>
                      ) : (
                        '-'
                      )}
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
