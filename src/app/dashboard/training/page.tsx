'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@/components/ui';
import {
  GraduationCap,
  Plus,
  Calendar,
  Users,
  AlertTriangle,
  CheckCircle,
  Clock,
  BookOpen,
  ChevronRight,
  Filter,
  Award,
  FileText,
} from 'lucide-react';
import type {
  TrainingSession,
  TrainingCourse,
  MyTrainingSummary,
  SessionStatus,
} from '@/lib/training/types';
import {
  SESSION_STATUS_CONFIG,
  TRAINING_CATEGORY_CONFIG,
  ATTENDANCE_STATUS_CONFIG,
} from '@/lib/training/types';
import { useApiFetch } from '@/hooks/useApiFetch';

type TabType = 'sessions' | 'courses' | 'my';

export default function TrainingPage() {
  const apiFetch = useApiFetch();
  const [activeTab, setActiveTab] = useState<TabType>('sessions');
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [courses, setCourses] = useState<TrainingCourse[]>([]);
  const [mySummary, setMySummary] = useState<MyTrainingSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // フィルタ
  const [statusFilter, setStatusFilter] = useState<SessionStatus | ''>('');

  const fetchSessions = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);

      const res = await apiFetch(`/api/training/sessions?${params.toString()}`);
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    }
  }, [statusFilter, apiFetch]);

  const fetchCourses = useCallback(async () => {
    try {
      const res = await apiFetch('/api/training/courses?active=true');
      const data = await res.json();
      setCourses(data.courses || []);
    } catch (error) {
      console.error('Failed to fetch courses:', error);
    }
  }, [apiFetch]);

  const fetchMySummary = useCallback(async () => {
    try {
      const res = await apiFetch('/api/training/my');
      const data = await res.json();
      setMySummary(data);
    } catch (error) {
      console.error('Failed to fetch my summary:', error);
    }
  }, [apiFetch]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchSessions(), fetchCourses(), fetchMySummary()]);
      setLoading(false);
    };
    loadData();
  }, [fetchSessions, fetchCourses, fetchMySummary]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDateShort = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ja-JP', {
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <main className="pb-8">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-zinc-900">研修管理</h1>
              <p className="text-sm text-zinc-500">
                研修の計画・実施・受講記録
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/certifications"
              className="flex items-center gap-2 px-4 py-2 bg-white border border-zinc-300 text-zinc-700 rounded-lg hover:bg-zinc-50 transition-colors"
            >
              <Award className="w-4 h-4" />
              資格管理
            </Link>
            <Link
              href="/dashboard/training-reports"
              className="flex items-center gap-2 px-4 py-2 bg-white border border-zinc-300 text-zinc-700 rounded-lg hover:bg-zinc-50 transition-colors"
            >
              <FileText className="w-4 h-4" />
              実施報告
            </Link>
            <Link
              href="/dashboard/training/sessions/new"
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              セッション作成
            </Link>
          </div>
        </div>

        {/* サマリーカード */}
        {mySummary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card className="bg-yellow-50 border-yellow-200">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-yellow-700">{mySummary.pendingCount}</div>
                <div className="text-xs text-yellow-600">未受講</div>
              </CardContent>
            </Card>
            <Card className="bg-red-50 border-red-200">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-red-700">{mySummary.overdueCount}</div>
                <div className="text-xs text-red-600">期限超過</div>
              </CardContent>
            </Card>
            <Card className="bg-green-50 border-green-200">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-green-700">{mySummary.completedThisYear}</div>
                <div className="text-xs text-green-600">今年受講済</div>
              </CardContent>
            </Card>
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-blue-700">{sessions.filter(s => s.status === 'planned').length}</div>
                <div className="text-xs text-blue-600">予定中</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* タブ */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
          <button
            onClick={() => setActiveTab('sessions')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === 'sessions'
                ? 'bg-emerald-600 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            <Calendar className="w-4 h-4" />
            セッション
          </button>
          <button
            onClick={() => setActiveTab('courses')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === 'courses'
                ? 'bg-emerald-600 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            コース
          </button>
          <button
            onClick={() => setActiveTab('my')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === 'my'
                ? 'bg-emerald-600 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            <Users className="w-4 h-4" />
            自分の研修
            {mySummary && mySummary.overdueCount > 0 && (
              <Badge className="bg-red-500 text-white text-xs ml-1">
                {mySummary.overdueCount}
              </Badge>
            )}
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-zinc-500">読み込み中...</div>
        ) : (
          <>
            {/* セッションタブ */}
            {activeTab === 'sessions' && (
              <>
                {/* フィルタ */}
                <Card className="mb-6">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 text-sm text-zinc-600">
                        <Filter className="w-4 h-4" />
                        <span className="font-medium">フィルタ:</span>
                      </div>
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as SessionStatus | '')}
                        className="px-3 py-1.5 border border-zinc-200 rounded-lg text-sm"
                      >
                        <option value="">全ステータス</option>
                        {Object.entries(SESSION_STATUS_CONFIG).map(([key, config]) => (
                          <option key={key} value={key}>{config.label}</option>
                        ))}
                      </select>
                    </div>
                  </CardContent>
                </Card>

                {/* セッション一覧 */}
                {sessions.length === 0 ? (
                  <div className="text-center py-12 text-zinc-500">
                    研修セッションがありません
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sessions.map((session) => (
                      <Link key={session.id} href={`/dashboard/training/sessions/${session.id}`}>
                        <Card className="hover:shadow-md transition-all cursor-pointer">
                          <CardContent className="p-4">
                            <div className="flex items-start gap-4">
                              <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${
                                SESSION_STATUS_CONFIG[session.status].bg
                              }`}>
                                {session.status === 'done' ? (
                                  <CheckCircle className={`w-5 h-5 ${SESSION_STATUS_CONFIG[session.status].color}`} />
                                ) : session.status === 'planned' ? (
                                  <Calendar className={`w-5 h-5 ${SESSION_STATUS_CONFIG[session.status].color}`} />
                                ) : (
                                  <Clock className={`w-5 h-5 ${SESSION_STATUS_CONFIG[session.status].color}`} />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <Badge className={`text-xs ${SESSION_STATUS_CONFIG[session.status].bg} ${SESSION_STATUS_CONFIG[session.status].color}`}>
                                    {SESSION_STATUS_CONFIG[session.status].label}
                                  </Badge>
                                  {session.courseName && (
                                    <Badge className="bg-zinc-100 text-zinc-600 text-xs">
                                      {session.courseName}
                                    </Badge>
                                  )}
                                </div>
                                <h3 className="font-medium text-zinc-800 mb-1 truncate">
                                  {session.name}
                                </h3>
                                <div className="flex items-center gap-4 text-xs text-zinc-500">
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {formatDate(session.scheduledAt)}
                                  </span>
                                  {session.location && (
                                    <span>{session.location}</span>
                                  )}
                                </div>
                              </div>
                              <ChevronRight className="w-5 h-5 text-zinc-400 flex-shrink-0" />
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* コースタブ */}
            {activeTab === 'courses' && (
              <div className="space-y-3">
                {courses.length === 0 ? (
                  <div className="text-center py-12 text-zinc-500">
                    研修コースがありません
                  </div>
                ) : (
                  courses.map((course) => (
                    <Card key={course.id} className="hover:shadow-md transition-all">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-4">
                          <div className={`w-10 h-10 flex items-center justify-center rounded-lg text-lg ${
                            TRAINING_CATEGORY_CONFIG[course.category].bg
                          }`}>
                            {TRAINING_CATEGORY_CONFIG[course.category].icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <Badge className={`text-xs ${TRAINING_CATEGORY_CONFIG[course.category].bg} ${TRAINING_CATEGORY_CONFIG[course.category].color}`}>
                                {TRAINING_CATEGORY_CONFIG[course.category].label}
                              </Badge>
                              {course.required && (
                                <Badge className="bg-red-100 text-red-700 text-xs">
                                  必須
                                </Badge>
                              )}
                            </div>
                            <h3 className="font-medium text-zinc-800 mb-1">
                              {course.title}
                            </h3>
                            {course.description && (
                              <p className="text-sm text-zinc-500 line-clamp-2">
                                {course.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            )}

            {/* 自分の研修タブ */}
            {activeTab === 'my' && mySummary && (
              <div className="space-y-6">
                {/* 期限超過 */}
                {mySummary.overdue.length > 0 && (
                  <Card className="border-red-200">
                    <CardHeader className="bg-red-50">
                      <CardTitle className="text-base flex items-center gap-2 text-red-700">
                        <AlertTriangle className="w-4 h-4" />
                        期限超過 ({mySummary.overdue.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="divide-y">
                        {mySummary.overdue.map((att) => (
                          <div key={att.id} className="p-4 flex items-center justify-between">
                            <div>
                              <div className="font-medium text-zinc-800">
                                {(att as unknown as { sessionName?: string }).sessionName ?? att.sessionId}
                              </div>
                              <div className="text-xs text-red-600">
                                期限: {formatDateShort(att.dueAt)}
                              </div>
                            </div>
                            <Badge className="bg-red-100 text-red-700 text-xs">
                              {ATTENDANCE_STATUS_CONFIG[att.status].emoji} 期限超過
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* 未受講 */}
                {mySummary.pending.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        未受講 ({mySummary.pending.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="divide-y">
                        {mySummary.pending.map((att) => (
                          <div key={att.id} className="p-4 flex items-center justify-between">
                            <div>
                              <div className="font-medium text-zinc-800">
                                {(att as unknown as { sessionName?: string }).sessionName ?? att.sessionId}
                              </div>
                              {att.dueAt && (
                                <div className="text-xs text-zinc-500">
                                  期限: {formatDateShort(att.dueAt)}
                                </div>
                              )}
                            </div>
                            <Badge className={`text-xs ${ATTENDANCE_STATUS_CONFIG[att.status].bg} ${ATTENDANCE_STATUS_CONFIG[att.status].color}`}>
                              {ATTENDANCE_STATUS_CONFIG[att.status].emoji} {ATTENDANCE_STATUS_CONFIG[att.status].label}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* 最近の受講 */}
                {mySummary.recentCompleted.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        最近の受講
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="divide-y">
                        {mySummary.recentCompleted.map((att) => (
                          <div key={att.id} className="p-4 flex items-center justify-between">
                            <div>
                              <div className="font-medium text-zinc-800">
                                {(att as unknown as { sessionName?: string }).sessionName ?? att.sessionId}
                              </div>
                              <div className="text-xs text-zinc-500">
                                受講日: {formatDateShort(att.attendedAt)}
                              </div>
                            </div>
                            <Badge className="bg-green-100 text-green-700 text-xs">
                              {ATTENDANCE_STATUS_CONFIG.attended.emoji} 受講済
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {mySummary.pending.length === 0 && mySummary.overdue.length === 0 && mySummary.recentCompleted.length === 0 && (
                  <div className="text-center py-12 text-zinc-500">
                    研修の記録がありません
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
