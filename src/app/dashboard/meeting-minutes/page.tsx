'use client';

import { useState, useEffect } from 'react';
import {
  BookOpen,
  Calendar,
  Users,
  CheckCircle,
  Clock,
  AlertTriangle,
  Filter,
} from 'lucide-react';
import type { CommitteeMeeting } from '@/lib/committees/types';
import {
  COMMITTEE_CATEGORY_LABELS,
  MEETING_STATUS_LABELS,
} from '@/lib/committees/types';

const MEETING_STATUS_CONFIG: Record<string, { color: string; bg: string }> = {
  planned: { color: 'text-blue-700', bg: 'bg-blue-50' },
  held: { color: 'text-green-700', bg: 'bg-green-50' },
  cancelled: { color: 'text-zinc-500', bg: 'bg-zinc-100' },
};

export default function MeetingMinutesPage() {
  const [meetings, setMeetings] = useState<CommitteeMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    fetchMeetings();
  }, [statusFilter]);

  async function fetchMeetings() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      params.append('limit', '50');

      const res = await fetch(`/api/committees/meetings?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setMeetings(data.meetings || []);
      }
    } catch (error) {
      console.error('データ取得エラー:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-6 safe-bottom">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-zinc-900">
            <BookOpen className="w-6 h-6" />
            議事録
          </h1>
          <p className="text-sm text-zinc-500 mt-1">委員会・会議の議事録と決定事項を管理</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">ステータス: すべて</option>
            {Object.entries(MEETING_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900" />
            <p className="text-sm text-zinc-500">読み込み中...</p>
          </div>
        </div>
      ) : meetings.length === 0 ? (
        <div className="text-center py-16 text-zinc-400">
          <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>議事録はありません</p>
        </div>
      ) : (
        <div className="space-y-3">
          {meetings.map((meeting) => {
            const statusCfg = MEETING_STATUS_CONFIG[meeting.status] || MEETING_STATUS_CONFIG.planned;
            const statusLabel = MEETING_STATUS_LABELS[meeting.status] || meeting.status;

            return (
              <div key={meeting.id} className="bg-white border rounded-xl p-4 hover:border-zinc-300 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-zinc-100 rounded-lg flex items-center justify-center shrink-0">
                    <BookOpen className="w-5 h-5 text-zinc-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusCfg.bg} ${statusCfg.color}`}>
                        {statusLabel}
                      </span>
                      {meeting.committeeName && (
                        <span className="text-xs text-zinc-500">{meeting.committeeName}</span>
                      )}
                    </div>
                    <h3 className="font-medium text-zinc-900">{meeting.title || `${meeting.committeeName || '委員会'} 会議`}</h3>
                    <div className="flex items-center gap-4 mt-2 text-xs text-zinc-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {meeting.scheduledAt ? new Date(meeting.scheduledAt).toLocaleDateString('ja-JP') : '-'}
                      </span>
                      {meeting.heldAt && (
                        <span className="flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          開催: {new Date(meeting.heldAt).toLocaleDateString('ja-JP')}
                        </span>
                      )}
                      {meeting.attendeeCount !== undefined && (
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {meeting.attendeeCount}名
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
