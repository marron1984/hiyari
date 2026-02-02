'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@/components/ui';
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  User,
  Users,
  CheckCircle,
  XCircle,
  AlertTriangle,
  UserPlus,
  Play,
} from 'lucide-react';
import type {
  TrainingSession,
  TrainingAttendance,
  SessionStats,
} from '@/lib/training/types';
import {
  SESSION_STATUS_CONFIG,
  ATTENDANCE_STATUS_CONFIG,
} from '@/lib/training/types';

// デモユーザー一覧（本番ではAPIから取得）
const DEMO_USERS = [
  { id: 'user_001', name: '山田太郎' },
  { id: 'user_002', name: '佐藤次郎' },
  { id: 'user_003', name: '鈴木花子' },
  { id: 'user_004', name: '高橋三郎' },
  { id: 'user_005', name: '田中美咲' },
];

export default function SessionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [session, setSession] = useState<TrainingSession | null>(null);
  const [attendances, setAttendances] = useState<TrainingAttendance[]>([]);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [assignDueAt, setAssignDueAt] = useState('');

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch(`/api/training/sessions/${id}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'セッションの取得に失敗しました');
        return;
      }
      setSession(data.session);
    } catch (err) {
      setError('セッションの取得に失敗しました');
    }
  }, [id]);

  const fetchAttendances = useCallback(async () => {
    try {
      const res = await fetch(`/api/training/sessions/${id}/attendances`);
      const data = await res.json();
      setAttendances(data.attendances || []);
    } catch (err) {
      console.error('Failed to fetch attendances:', err);
    }
  }, [id]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/training/sessions/${id}/stats`);
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  }, [id]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchSession(), fetchAttendances(), fetchStats()]);
      setLoading(false);
    };
    loadData();
  }, [fetchSession, fetchAttendances, fetchStats]);

  const handleMarkAttended = async (userId: string) => {
    try {
      const res = await fetch(`/api/training/sessions/${id}/attendances/${userId}/attended`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        fetchAttendances();
        fetchStats();
      }
    } catch (err) {
      console.error('Failed to mark attended:', err);
    }
  };

  const handleMarkAbsent = async (userId: string) => {
    try {
      const res = await fetch(`/api/training/sessions/${id}/attendances/${userId}/absent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        fetchAttendances();
        fetchStats();
      }
    } catch (err) {
      console.error('Failed to mark absent:', err);
    }
  };

  const handleAssignUsers = async () => {
    if (selectedUsers.length === 0) return;

    try {
      const res = await fetch(`/api/training/sessions/${id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds: selectedUsers,
          dueAt: assignDueAt ? new Date(assignDueAt).toISOString() : null,
        }),
      });
      if (res.ok) {
        setShowAssignModal(false);
        setSelectedUsers([]);
        setAssignDueAt('');
        fetchAttendances();
        fetchStats();
      }
    } catch (err) {
      console.error('Failed to assign users:', err);
    }
  };

  const handleSetStatus = async (status: 'planned' | 'done' | 'cancelled') => {
    try {
      const res = await fetch(`/api/training/sessions/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        fetchSession();
      }
    } catch (err) {
      console.error('Failed to set status:', err);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
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

  const isOverdue = (att: TrainingAttendance) => {
    if (att.status !== 'assigned') return false;
    if (!att.dueAt) return false;
    return new Date(att.dueAt) < new Date();
  };

  // 未割当のユーザーを取得
  const assignedUserIds = new Set(attendances.map((a) => a.userId));
  const unassignedUsers = DEMO_USERS.filter((u) => !assignedUserIds.has(u.id));

  if (loading) {
    return (
      <main className="pb-8">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="text-center py-12 text-zinc-500">読み込み中...</div>
        </div>
      </main>
    );
  }

  if (error || !session) {
    return (
      <main className="pb-8">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="text-center py-12">
            <p className="text-red-600 mb-4">{error || 'セッションが見つかりません'}</p>
            <Link href="/dashboard/training" className="text-emerald-600 hover:underline">
              研修管理に戻る
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="pb-8">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* ヘッダー */}
        <div className="flex items-center gap-4 mb-6">
          <Link
            href="/dashboard/training"
            className="p-2 hover:bg-zinc-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge className={`${SESSION_STATUS_CONFIG[session.status].bg} ${SESSION_STATUS_CONFIG[session.status].color}`}>
                {SESSION_STATUS_CONFIG[session.status].label}
              </Badge>
              {session.courseName && (
                <Badge className="bg-zinc-100 text-zinc-600">
                  {session.courseName}
                </Badge>
              )}
            </div>
            <h1 className="text-xl font-bold text-zinc-900">{session.name}</h1>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* メインコンテンツ */}
          <div className="lg:col-span-2 space-y-6">
            {/* セッション情報 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">セッション情報</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <Calendar className="w-4 h-4 text-zinc-400" />
                  <span>{formatDate(session.scheduledAt)}</span>
                </div>
                {session.durationMinutes && (
                  <div className="flex items-center gap-3">
                    <Clock className="w-4 h-4 text-zinc-400" />
                    <span>{session.durationMinutes}分</span>
                  </div>
                )}
                {session.location && (
                  <div className="flex items-center gap-3">
                    <MapPin className="w-4 h-4 text-zinc-400" />
                    <span>{session.location}</span>
                  </div>
                )}
                {session.instructorName && (
                  <div className="flex items-center gap-3">
                    <User className="w-4 h-4 text-zinc-400" />
                    <span>講師: {session.instructorName}</span>
                  </div>
                )}
                {session.notes && (
                  <p className="text-sm text-zinc-600 pt-2 border-t">
                    {session.notes}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* 対象者一覧 */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  対象者 ({attendances.length})
                </CardTitle>
                <button
                  onClick={() => setShowAssignModal(true)}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors"
                >
                  <UserPlus className="w-4 h-4" />
                  追加
                </button>
              </CardHeader>
              <CardContent>
                {attendances.length === 0 ? (
                  <p className="text-zinc-500 text-sm">対象者が割り当てられていません</p>
                ) : (
                  <div className="divide-y -mx-4">
                    {attendances.map((att) => (
                      <div key={att.id} className="px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-zinc-200 rounded-full flex items-center justify-center">
                            <User className="w-4 h-4 text-zinc-600" />
                          </div>
                          <div>
                            <div className="font-medium text-sm">{att.userName}</div>
                            {att.dueAt && (
                              <div className={`text-xs ${isOverdue(att) ? 'text-red-600' : 'text-zinc-500'}`}>
                                期限: {formatDateShort(att.dueAt)}
                                {isOverdue(att) && ' (超過)'}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={`text-xs ${ATTENDANCE_STATUS_CONFIG[att.status].bg} ${ATTENDANCE_STATUS_CONFIG[att.status].color}`}>
                            {ATTENDANCE_STATUS_CONFIG[att.status].emoji} {ATTENDANCE_STATUS_CONFIG[att.status].label}
                          </Badge>
                          {att.status === 'assigned' && (
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleMarkAttended(att.userId)}
                                className="p-1.5 bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
                                title="出席"
                              >
                                <CheckCircle className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleMarkAbsent(att.userId)}
                                className="p-1.5 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                                title="欠席"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* サイドバー */}
          <div className="space-y-4">
            {/* 統計 */}
            {stats && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">統計</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">対象者</span>
                    <span className="font-medium">{stats.targetCount}名</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">受講済</span>
                    <span className="font-medium text-green-600">{stats.attendedCount}名</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">欠席</span>
                    <span className="font-medium text-red-600">{stats.absentCount}名</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">期限超過</span>
                    <span className="font-medium text-amber-600">{stats.overdueCount}名</span>
                  </div>
                  <div className="pt-2 border-t">
                    <div className="flex justify-between">
                      <span className="text-zinc-500">受講率</span>
                      <span className="font-bold text-emerald-600">{stats.attendedRate}%</span>
                    </div>
                    <div className="mt-2 h-2 bg-zinc-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${stats.attendedRate}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ステータス操作 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">ステータス操作</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {session.status === 'planned' && (
                  <>
                    <button
                      onClick={() => handleSetStatus('done')}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors text-sm"
                    >
                      <CheckCircle className="w-4 h-4" />
                      完了にする
                    </button>
                    <button
                      onClick={() => handleSetStatus('cancelled')}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-zinc-100 text-zinc-600 rounded-lg hover:bg-zinc-200 transition-colors text-sm"
                    >
                      <XCircle className="w-4 h-4" />
                      中止にする
                    </button>
                  </>
                )}
                {session.status === 'done' && (
                  <button
                    onClick={() => handleSetStatus('planned')}
                    className="w-full flex items-center gap-2 px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm"
                  >
                    <Play className="w-4 h-4" />
                    予定に戻す
                  </button>
                )}
                {session.status === 'cancelled' && (
                  <button
                    onClick={() => handleSetStatus('planned')}
                    className="w-full flex items-center gap-2 px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm"
                  >
                    <Play className="w-4 h-4" />
                    予定に戻す
                  </button>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* 対象者追加モーダル */}
        {showAssignModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl w-full max-w-md mx-4 p-6">
              <h3 className="text-lg font-bold mb-4">対象者を追加</h3>

              {/* 期限設定 */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  受講期限
                </label>
                <input
                  type="datetime-local"
                  value={assignDueAt}
                  onChange={(e) => setAssignDueAt(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm"
                />
              </div>

              {/* ユーザー選択 */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  ユーザー選択
                </label>
                {unassignedUsers.length === 0 ? (
                  <p className="text-zinc-500 text-sm">全ユーザーが割り当て済みです</p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {unassignedUsers.map((user) => (
                      <label
                        key={user.id}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-zinc-50 rounded-lg cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedUsers.includes(user.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedUsers([...selectedUsers, user.id]);
                            } else {
                              setSelectedUsers(selectedUsers.filter((id) => id !== user.id));
                            }
                          }}
                          className="rounded"
                        />
                        <span>{user.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowAssignModal(false);
                    setSelectedUsers([]);
                    setAssignDueAt('');
                  }}
                  className="flex-1 px-4 py-2 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleAssignUsers}
                  disabled={selectedUsers.length === 0}
                  className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  追加 ({selectedUsers.length})
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
