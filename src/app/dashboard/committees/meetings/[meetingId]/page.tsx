'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Clock,
  CheckCircle2,
  XCircle,
  Plus,
  AlertTriangle,
  FileText,
  ListTodo,
  Save,
  User,
} from 'lucide-react';
import type {
  Committee,
  CommitteeMeeting,
  CommitteeMinutes,
  CommitteeActionItem,
  MeetingStats,
} from '@/lib/committees/types';
import {
  MEETING_STATUS_LABELS,
  ACTION_ITEM_STATUS_LABELS,
} from '@/lib/committees/types';

export default function MeetingDetailPage({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  const { meetingId } = use(params);
  const [meeting, setMeeting] = useState<CommitteeMeeting | null>(null);
  const [committee, setCommittee] = useState<Committee | null>(null);
  const [minutes, setMinutes] = useState<CommitteeMinutes | null>(null);
  const [actionItems, setActionItems] = useState<CommitteeActionItem[]>([]);
  const [stats, setStats] = useState<MeetingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // フォーム状態
  const [minutesForm, setMinutesForm] = useState({
    summary: '',
    discussion: '',
    decisions: '',
    risks: '',
  });
  const [showNewActionModal, setShowNewActionModal] = useState(false);

  useEffect(() => {
    fetchData();
  }, [meetingId]);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch(`/api/committees/meetings/${meetingId}`);
      const data = await res.json();

      if (data.success) {
        setMeeting(data.meeting);
        setCommittee(data.committee);
        setMinutes(data.minutes);
        setActionItems(data.actionItems || []);
        setStats(data.stats);

        if (data.minutes) {
          setMinutesForm({
            summary: data.minutes.summary || '',
            discussion: data.minutes.discussion || '',
            decisions: data.minutes.decisions || '',
            risks: data.minutes.risks || '',
          });
        }
      }
    } catch (error) {
      console.error('データ取得エラー:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveMinutes() {
    if (!minutesForm.summary.trim()) {
      alert('要点を入力してください');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/committees/meetings/${meetingId}/minutes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(minutesForm),
      });

      if (res.ok) {
        const data = await res.json();
        setMinutes(data.minutes);
      }
    } catch (error) {
      console.error('議事録保存エラー:', error);
    } finally {
      setSaving(false);
    }
  }

  async function handleChangeStatus(status: 'held' | 'cancelled' | 'planned') {
    try {
      const res = await fetch(`/api/committees/meetings/${meetingId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      if (res.ok) {
        fetchData();
      }
    } catch (error) {
      console.error('ステータス変更エラー:', error);
    }
  }

  async function handleCreateAction(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    try {
      const res = await fetch(
        `/api/committees/meetings/${meetingId}/action-items`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: formData.get('title'),
            description: formData.get('description') || null,
            ownerUserId: formData.get('ownerUserId') || null,
            dueAt: formData.get('dueAt') || null,
          }),
        }
      );

      if (res.ok) {
        setShowNewActionModal(false);
        fetchData();
      }
    } catch (error) {
      console.error('アクション作成エラー:', error);
    }
  }

  async function handleActionStatusChange(
    actionId: string,
    status: string
  ) {
    try {
      const res = await fetch(`/api/committees/action-items/${actionId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      if (res.ok) {
        fetchData();
      }
    } catch (error) {
      console.error('ステータス変更エラー:', error);
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

  if (!meeting || !committee) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <p className="text-zinc-500">開催回が見つかりません</p>
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
            href={`/dashboard/committees/${committee.id}`}
            className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            {committee.name}
          </Link>
          <h1 className="text-2xl font-bold text-zinc-900">{meeting.title}</h1>
          <div className="mt-2 flex items-center gap-4 text-sm text-zinc-600">
            <span className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              予定: {new Date(meeting.scheduledAt).toLocaleDateString('ja-JP')}
            </span>
            {meeting.heldAt && (
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                開催: {new Date(meeting.heldAt).toLocaleDateString('ja-JP')}
              </span>
            )}
            {meeting.location && (
              <span className="flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {meeting.location}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`px-3 py-1 rounded-full text-sm font-medium ${
              meeting.status === 'held'
                ? 'bg-green-100 text-green-700'
                : meeting.status === 'cancelled'
                ? 'bg-zinc-100 text-zinc-600'
                : 'bg-blue-100 text-blue-700'
            }`}
          >
            {MEETING_STATUS_LABELS[meeting.status]}
          </span>
        </div>
      </div>

      {/* ステータス変更ボタン */}
      {meeting.status === 'planned' && (
        <div className="flex gap-2">
          <button
            onClick={() => handleChangeStatus('held')}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <CheckCircle2 className="w-4 h-4" />
            開催済みにする
          </button>
          <button
            onClick={() => handleChangeStatus('cancelled')}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-600 text-white rounded-lg hover:bg-zinc-700"
          >
            <XCircle className="w-4 h-4" />
            中止にする
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* メインコンテンツ */}
        <div className="lg:col-span-2 space-y-6">
          {/* 議事録 */}
          <div className="bg-white rounded-lg border border-zinc-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-zinc-900 flex items-center gap-2">
                <FileText className="w-5 h-5" />
                議事録
              </h2>
              <button
                onClick={handleSaveMinutes}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? '保存中...' : '保存'}
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  要点 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={minutesForm.summary}
                  onChange={(e) =>
                    setMinutesForm({ ...minutesForm, summary: e.target.value })
                  }
                  rows={3}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="会議の要点を簡潔に記載"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  決定事項
                </label>
                <textarea
                  value={minutesForm.decisions}
                  onChange={(e) =>
                    setMinutesForm({ ...minutesForm, decisions: e.target.value })
                  }
                  rows={3}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
                  placeholder="・決定事項1&#10;・決定事項2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  詳細・議論内容
                </label>
                <textarea
                  value={minutesForm.discussion}
                  onChange={(e) =>
                    setMinutesForm({
                      ...minutesForm,
                      discussion: e.target.value,
                    })
                  }
                  rows={4}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
                  placeholder="議論の詳細を記載"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  リスク・課題
                </label>
                <textarea
                  value={minutesForm.risks}
                  onChange={(e) =>
                    setMinutesForm({ ...minutesForm, risks: e.target.value })
                  }
                  rows={2}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
                  placeholder="認識されたリスクや課題"
                />
              </div>
            </div>
          </div>

          {/* アクション項目 */}
          <div className="bg-white rounded-lg border border-zinc-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-zinc-900 flex items-center gap-2">
                <ListTodo className="w-5 h-5" />
                アクション項目
              </h2>
              <button
                onClick={() => setShowNewActionModal(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-zinc-100 text-zinc-700 rounded-lg hover:bg-zinc-200"
              >
                <Plus className="w-4 h-4" />
                追加
              </button>
            </div>

            <div className="space-y-3">
              {actionItems.map((item) => {
                const isOverdue =
                  item.dueAt &&
                  new Date(item.dueAt) < new Date() &&
                  item.status !== 'done' &&
                  item.status !== 'cancelled';

                return (
                  <div
                    key={item.id}
                    className={`p-4 rounded-lg border ${
                      isOverdue
                        ? 'border-red-200 bg-red-50'
                        : 'border-zinc-200 bg-zinc-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-zinc-900">
                          {item.title}
                        </div>
                        {item.description && (
                          <div className="text-sm text-zinc-600 mt-1">
                            {item.description}
                          </div>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-sm text-zinc-500">
                          {item.ownerUserId && (
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {item.ownerUserId}
                            </span>
                          )}
                          {item.dueAt && (
                            <span
                              className={`flex items-center gap-1 ${
                                isOverdue ? 'text-red-600' : ''
                              }`}
                            >
                              <Clock className="w-3 h-3" />
                              {new Date(item.dueAt).toLocaleDateString('ja-JP')}
                              {isOverdue && (
                                <AlertTriangle className="w-3 h-3 ml-1" />
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                      <select
                        value={item.status}
                        onChange={(e) =>
                          handleActionStatusChange(item.id, e.target.value)
                        }
                        className={`px-2 py-1 rounded text-xs font-medium border-0 ${
                          item.status === 'done'
                            ? 'bg-green-100 text-green-700'
                            : item.status === 'in_progress'
                            ? 'bg-blue-100 text-blue-700'
                            : item.status === 'cancelled'
                            ? 'bg-zinc-100 text-zinc-600'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        <option value="open">未着手</option>
                        <option value="in_progress">対応中</option>
                        <option value="done">完了</option>
                        <option value="cancelled">取消</option>
                      </select>
                    </div>
                  </div>
                );
              })}

              {actionItems.length === 0 && (
                <div className="text-center py-8 text-zinc-500">
                  アクション項目がありません
                </div>
              )}
            </div>
          </div>
        </div>

        {/* サイドバー */}
        <div className="space-y-6">
          {/* 統計 */}
          {stats && (
            <div className="bg-white rounded-lg border border-zinc-200 p-4">
              <h3 className="font-medium text-zinc-900 mb-3">統計</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-600">アクション（未完了）</span>
                  <span className="font-medium text-amber-600">
                    {stats.actionOpenCount}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-600">アクション（期限超過）</span>
                  <span className="font-medium text-red-600">
                    {stats.actionOverdueCount}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 会議情報 */}
          <div className="bg-white rounded-lg border border-zinc-200 p-4">
            <h3 className="font-medium text-zinc-900 mb-3">会議情報</h3>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-zinc-500">委員会:</span>
                <Link
                  href={`/dashboard/committees/${committee.id}`}
                  className="ml-2 text-blue-600 hover:underline"
                >
                  {committee.name}
                </Link>
              </div>
              <div>
                <span className="text-zinc-500">作成日:</span>
                <span className="ml-2 text-zinc-900">
                  {new Date(meeting.createdAt).toLocaleDateString('ja-JP')}
                </span>
              </div>
              {meeting.notes && (
                <div>
                  <span className="text-zinc-500">備考:</span>
                  <p className="mt-1 text-zinc-900">{meeting.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 新規アクションモーダル */}
      {showNewActionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-zinc-900 mb-4">
              アクション項目を追加
            </h2>
            <form onSubmit={handleCreateAction} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  タイトル <span className="text-red-500">*</span>
                </label>
                <input
                  name="title"
                  type="text"
                  required
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
                  placeholder="例: 資料作成"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  説明
                </label>
                <textarea
                  name="description"
                  rows={2}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
                  placeholder="詳細な説明"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  担当者ID
                </label>
                <input
                  name="ownerUserId"
                  type="text"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
                  placeholder="例: user_tanaka"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  期限
                </label>
                <input
                  name="dueAt"
                  type="date"
                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowNewActionModal(false)}
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
