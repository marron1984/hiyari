'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Button, Card } from '@/components/ui';
import { Loading } from '@/components/Loading';
import {
  getTodayAttendanceState,
  clockIn,
  clockOut,
  breakStart,
  breakEnd,
} from '@/lib/attendance';
import { formatTimeJST, formatMinutesToHHMM } from '@/lib/attendance-calc';
import { TodayAttendanceState, ClockStatus } from '@/types/attendance';

// 状態表示ラベル
const STATUS_LABELS: Record<ClockStatus, { label: string; color: string }> = {
  not_started: { label: '未出勤', color: 'bg-gray-100 text-gray-700' },
  working: { label: '勤務中', color: 'bg-green-100 text-green-700' },
  on_break: { label: '休憩中', color: 'bg-yellow-100 text-yellow-700' },
  completed: { label: '退勤済', color: 'bg-blue-100 text-blue-700' },
  missing_out: { label: '退勤漏れ', color: 'bg-red-100 text-red-700' },
};

export default function AttendancePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [state, setState] = useState<TodayAttendanceState | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // 現在時刻の更新
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 勤怠状態の取得
  const fetchState = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      const todayState = await getTodayAttendanceState(user.id, user.tenantId);
      setState(todayState);
    } catch (err) {
      console.error('Failed to fetch attendance state:', err);
      setError('勤怠情報の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  // 打刻アクション
  const handleClockIn = async () => {
    if (!user) return;
    setActionLoading(true);
    setError(null);

    try {
      await clockIn(
        user.id,
        user.email, // 仮のemployeeCode（本来は別途管理）
        user.branchId,
        user.tenantId
      );
      await fetchState();
    } catch (err) {
      setError(err instanceof Error ? err.message : '出勤打刻に失敗しました');
    } finally {
      setActionLoading(false);
    }
  };

  const handleClockOut = async () => {
    if (!user) return;
    setActionLoading(true);
    setError(null);

    try {
      await clockOut(user.id, user.tenantId);
      await fetchState();
    } catch (err) {
      setError(err instanceof Error ? err.message : '退勤打刻に失敗しました');
    } finally {
      setActionLoading(false);
    }
  };

  const handleBreakStart = async () => {
    if (!user) return;
    setActionLoading(true);
    setError(null);

    try {
      await breakStart(user.id, user.tenantId);
      await fetchState();
    } catch (err) {
      setError(err instanceof Error ? err.message : '休憩開始に失敗しました');
    } finally {
      setActionLoading(false);
    }
  };

  const handleBreakEnd = async () => {
    if (!user) return;
    setActionLoading(true);
    setError(null);

    try {
      await breakEnd(user.id, user.tenantId);
      await fetchState();
    } catch (err) {
      setError(err instanceof Error ? err.message : '休憩終了に失敗しました');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <Loading />;
  }

  const statusInfo = state ? STATUS_LABELS[state.status] : STATUS_LABELS.not_started;

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <Header />

        <main className="max-w-lg mx-auto px-4 py-6">
          {/* 現在時刻 */}
          <div className="text-center mb-6">
            <div className="text-4xl font-bold text-gray-800">
              {currentTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className="text-gray-500 mt-1">
              {currentTime.toLocaleDateString('ja-JP', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                weekday: 'long',
              })}
            </div>
          </div>

          {/* 勤務状態カード */}
          <Card className="mb-6">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">今日の勤務状況</h2>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusInfo.color}`}>
                  {statusInfo.label}
                </span>
              </div>

              {/* シフト情報 */}
              {state?.shift && (
                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <div className="text-sm text-gray-500 mb-1">予定シフト</div>
                  <div className="font-medium">
                    {state.shift.shiftType}：{state.shift.plannedStart} - {state.shift.plannedEnd}
                  </div>
                  <div className="text-sm text-gray-500">
                    休憩 {state.shift.breakMinutes}分
                  </div>
                </div>
              )}

              {/* 打刻情報 */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-500">出勤</div>
                  <div className="text-xl font-bold">
                    {state?.clockIn ? formatTimeJST(state.clockIn) : '--:--'}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-500">退勤</div>
                  <div className="text-xl font-bold">
                    {state?.clockOut ? formatTimeJST(state.clockOut) : '--:--'}
                  </div>
                </div>
              </div>

              {/* 休憩情報 */}
              {(state?.breakStart || state?.status === 'on_break') && (
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-yellow-50 rounded-lg p-4">
                    <div className="text-sm text-gray-500">休憩開始</div>
                    <div className="text-lg font-medium">
                      {state?.breakStart ? formatTimeJST(state.breakStart) : '--:--'}
                    </div>
                  </div>
                  <div className="bg-yellow-50 rounded-lg p-4">
                    <div className="text-sm text-gray-500">休憩終了</div>
                    <div className="text-lg font-medium">
                      {state?.breakEnd ? formatTimeJST(state.breakEnd) : '--:--'}
                    </div>
                  </div>
                </div>
              )}

              {/* 勤務時間 */}
              {state?.totalWorkMinutes !== undefined && state.totalWorkMinutes > 0 && (
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="text-sm text-gray-500">本日の勤務時間</div>
                  <div className="text-2xl font-bold text-blue-600">
                    {formatMinutesToHHMM(state.totalWorkMinutes)}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* エラーメッセージ */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          {/* 打刻ボタン */}
          <div className="space-y-3">
            {/* 出勤ボタン */}
            {state?.status === 'not_started' && (
              <Button
                onClick={handleClockIn}
                disabled={actionLoading}
                className="w-full py-4 text-lg bg-green-600 hover:bg-green-700"
              >
                {actionLoading ? '処理中...' : '出勤'}
              </Button>
            )}

            {/* 休憩開始ボタン */}
            {state?.status === 'working' && (
              <>
                <Button
                  onClick={handleBreakStart}
                  disabled={actionLoading}
                  variant="secondary"
                  className="w-full py-4 text-lg"
                >
                  {actionLoading ? '処理中...' : '休憩開始'}
                </Button>
                <Button
                  onClick={handleClockOut}
                  disabled={actionLoading}
                  className="w-full py-4 text-lg bg-blue-600 hover:bg-blue-700"
                >
                  {actionLoading ? '処理中...' : '退勤'}
                </Button>
              </>
            )}

            {/* 休憩終了ボタン */}
            {state?.status === 'on_break' && (
              <Button
                onClick={handleBreakEnd}
                disabled={actionLoading}
                className="w-full py-4 text-lg bg-yellow-600 hover:bg-yellow-700"
              >
                {actionLoading ? '処理中...' : '休憩終了'}
              </Button>
            )}

            {/* 退勤済みメッセージ */}
            {state?.status === 'completed' && (
              <div className="text-center py-4 text-gray-600">
                本日の勤務は終了しました。お疲れさまでした。
              </div>
            )}
          </div>

          {/* ナビゲーション */}
          <div className="mt-8 pt-6 border-t">
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="secondary"
                onClick={() => router.push('/attendance/history')}
                className="py-3"
              >
                勤務履歴
              </Button>
              <Button
                variant="secondary"
                onClick={() => router.push('/attendance/overtime')}
                className="py-3"
              >
                残業申請
              </Button>
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
