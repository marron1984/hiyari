'use client';

import { useState, useEffect } from 'react';
import {
  GraduationCap,
  Calendar,
  Users,
  CheckCircle,
  Clock,
  MapPin,
  Filter,
} from 'lucide-react';
import type { TrainingSession, SessionStatus } from '@/lib/training/types';

const SESSION_STATUS_CONFIG: Record<SessionStatus, { label: string; color: string; bg: string }> = {
  planned: { label: '予定', color: 'text-blue-700', bg: 'bg-blue-50' },
  done: { label: '実施済み', color: 'text-green-700', bg: 'bg-green-50' },
  cancelled: { label: '中止', color: 'text-zinc-500', bg: 'bg-zinc-100' },
};

type TabType = 'all' | 'planned' | 'done';

export default function TrainingReportsPage() {
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('all');

  useEffect(() => {
    fetchSessions();
  }, [activeTab]);

  async function fetchSessions() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeTab !== 'all') params.append('status', activeTab);

      const res = await fetch(`/api/training/sessions?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } catch (error) {
      console.error('データ取得エラー:', error);
    } finally {
      setLoading(false);
    }
  }

  const tabs: { id: TabType; label: string }[] = [
    { id: 'all', label: 'すべて' },
    { id: 'planned', label: '予定' },
    { id: 'done', label: '実施済み' },
  ];

  return (
    <main className="max-w-5xl mx-auto px-4 py-6 safe-bottom">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-zinc-900">
            <GraduationCap className="w-6 h-6" />
            研修実施報告
          </h1>
          <p className="text-sm text-zinc-500 mt-1">研修セッションの実施結果を確認</p>
        </div>
      </div>

      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'bg-zinc-900 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900" />
            <p className="text-sm text-zinc-500">読み込み中...</p>
          </div>
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-16 text-zinc-400">
          <GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>研修セッションはありません</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => {
            const statusCfg = SESSION_STATUS_CONFIG[session.status];

            return (
              <div key={session.id} className="bg-white border rounded-xl p-4 hover:border-zinc-300 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-zinc-100 rounded-lg flex items-center justify-center shrink-0">
                    <GraduationCap className="w-5 h-5 text-zinc-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusCfg.bg} ${statusCfg.color}`}>
                        {statusCfg.label}
                      </span>
                      {session.courseName && (
                        <span className="text-xs text-zinc-500">{session.courseName}</span>
                      )}
                    </div>
                    <h3 className="font-medium text-zinc-900">{session.name}</h3>
                    <div className="flex items-center gap-4 mt-2 text-xs text-zinc-400 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(session.scheduledAt).toLocaleDateString('ja-JP')}
                      </span>
                      {session.durationMinutes && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {session.durationMinutes}分
                        </span>
                      )}
                      {session.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {session.location}
                        </span>
                      )}
                      {session.instructorName && (
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          講師: {session.instructorName}
                        </span>
                      )}
                      {session.attendedCount !== undefined && (
                        <span className="flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          受講: {session.attendedCount}名
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
