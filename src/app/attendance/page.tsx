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
  changeBranch,
  selfEditTimeEntry,
} from '@/lib/attendance';
import { formatTimeJST, formatMinutesToHHMM } from '@/lib/attendance-calc';
import { TodayAttendanceState, ClockStatus } from '@/types/attendance';
import { BRANCHES_SEED } from '@/data/employees';
import { MapPin, Edit2, Clock, AlertCircle } from 'lucide-react';

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
  const [selectedBranchId, setSelectedBranchId] = useState<string>(BRANCHES_SEED[0]?.id || '');
  const [isEditingBranch, setIsEditingBranch] = useState(false);
  const [editBranchId, setEditBranchId] = useState<string>('');

  // 打刻修正用state
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [editClockIn, setEditClockIn] = useState<string>('');
  const [editClockOut, setEditClockOut] = useState<string>('');
  const [editBreakStart, setEditBreakStart] = useState<string>('');
  const [editBreakEnd, setEditBreakEnd] = useState<string>('');
  const [editReason, setEditReason] = useState<string>('');

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
    if (!selectedBranchId) {
      setError('勤務先の拠点を選択してください');
      return;
    }
    setActionLoading(true);
    setError(null);

    try {
      await clockIn(
        user.id,
        user.email, // 仮のemployeeCode（本来は別途管理）
        selectedBranchId, // 選択した拠点
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

  const handleChangeBranch = async () => {
    if (!user || !editBranchId) return;
    setActionLoading(true);
    setError(null);

    try {
      await changeBranch(user.id, editBranchId, user.tenantId);
      await fetchState();
      setIsEditingBranch(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '拠点変更に失敗しました');
    } finally {
      setActionLoading(false);
    }
  };

  const startEditingBranch = () => {
    setEditBranchId(state?.branchId || '');
    setIsEditingBranch(true);
  };

  // 打刻修正を開始
  const startEditingTime = () => {
    if (state?.clockIn) {
      setEditClockIn(formatTimeForInput(state.clockIn));
    }
    if (state?.clockOut) {
      setEditClockOut(formatTimeForInput(state.clockOut));
    }
    if (state?.breakStart) {
      setEditBreakStart(formatTimeForInput(state.breakStart));
    }
    if (state?.breakEnd) {
      setEditBreakEnd(formatTimeForInput(state.breakEnd));
    }
    setEditReason('');
    setIsEditingTime(true);
  };

  // 時刻をinput用にフォーマット (HH:mm)
  const formatTimeForInput = (date: Date): string => {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  // HH:mm文字列をDateに変換（今日の日付で）
  const parseTimeInput = (timeStr: string): Date | undefined => {
    if (!timeStr) return undefined;
    const [hours, minutes] = timeStr.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date;
  };

  // 打刻修正を実行
  const handleEditTime = async () => {
    if (!user) return;
    if (!editReason.trim()) {
      setError('修正理由を入力してください');
      return;
    }

    setActionLoading(true);
    setError(null);

    try {
      const updates: {
        clockIn?: Date;
        clockOut?: Date;
        breakStart?: Date;
        breakEnd?: Date;
      } = {};

      // 変更があった項目のみ更新
      if (editClockIn && state?.clockIn) {
        const newClockIn = parseTimeInput(editClockIn);
        if (newClockIn && formatTimeForInput(state.clockIn) !== editClockIn) {
          updates.clockIn = newClockIn;
        }
      }
      if (editClockOut && state?.clockOut) {
        const newClockOut = parseTimeInput(editClockOut);
        if (newClockOut && formatTimeForInput(state.clockOut) !== editClockOut) {
          updates.clockOut = newClockOut;
        }
      }
      if (editBreakStart) {
        const newBreakStart = parseTimeInput(editBreakStart);
        if (newBreakStart) {
          if (!state?.breakStart || formatTimeForInput(state.breakStart) !== editBreakStart) {
            updates.breakStart = newBreakStart;
          }
        }
      }
      if (editBreakEnd) {
        const newBreakEnd = parseTimeInput(editBreakEnd);
        if (newBreakEnd) {
          if (!state?.breakEnd || formatTimeForInput(state.breakEnd) !== editBreakEnd) {
            updates.breakEnd = newBreakEnd;
          }
        }
      }

      if (Object.keys(updates).length === 0) {
        setError('変更がありません');
        setActionLoading(false);
        return;
      }

      await selfEditTimeEntry(user.id, updates, editReason.trim(), user.tenantId);
      await fetchState();
      setIsEditingTime(false);
      setEditReason('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '打刻修正に失敗しました');
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

              {/* 勤務先拠点 */}
              {state?.status !== 'not_started' && state?.status !== 'completed' && (
                <div className="bg-blue-50 rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <MapPin className="w-4 h-4" />
                      勤務先拠点
                    </div>
                    {!isEditingBranch && (
                      <button
                        onClick={startEditingBranch}
                        className="text-blue-600 hover:text-blue-800 p-1"
                        title="拠点を変更"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {isEditingBranch ? (
                    <div className="space-y-2">
                      <select
                        value={editBranchId}
                        onChange={(e) => setEditBranchId(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        {BRANCHES_SEED.map((branch) => (
                          <option key={branch.id} value={branch.id}>
                            {branch.name}
                          </option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <Button
                          onClick={handleChangeBranch}
                          disabled={actionLoading || !editBranchId}
                          className="flex-1 py-2 text-sm bg-blue-600 hover:bg-blue-700"
                        >
                          {actionLoading ? '変更中...' : '変更'}
                        </Button>
                        <Button
                          onClick={() => setIsEditingBranch(false)}
                          variant="secondary"
                          className="flex-1 py-2 text-sm"
                        >
                          キャンセル
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="font-bold text-blue-700 text-lg">
                      {state?.branchName || '未設定'}
                    </div>
                  )}
                </div>
              )}

              {/* 退勤済みの場合は表示のみ */}
              {state?.status === 'completed' && state?.branchName && (
                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                    <MapPin className="w-4 h-4" />
                    勤務先拠点
                  </div>
                  <div className="font-medium text-gray-700">
                    {state.branchName}
                  </div>
                </div>
              )}

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
            {/* 出勤前：拠点選択 */}
            {state?.status === 'not_started' && (
              <>
                <Card className="mb-2">
                  <div className="p-4">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                      <MapPin className="w-4 h-4" />
                      勤務先拠点を選択
                    </label>
                    <select
                      value={selectedBranchId}
                      onChange={(e) => setSelectedBranchId(e.target.value)}
                      className="w-full px-3 py-3 border border-gray-300 rounded-lg text-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">-- 選択してください --</option>
                      {BRANCHES_SEED.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </Card>
                <Button
                  onClick={handleClockIn}
                  disabled={actionLoading || !selectedBranchId}
                  className="w-full py-4 text-lg bg-green-600 hover:bg-green-700 disabled:bg-gray-400"
                >
                  {actionLoading ? '処理中...' : '出勤'}
                </Button>
              </>
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
                <Button
                  onClick={startEditingTime}
                  variant="secondary"
                  className="w-full py-3 flex items-center justify-center gap-2 text-sm"
                >
                  <Clock className="w-4 h-4" />
                  出勤時刻を修正
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

            {/* 退勤済みメッセージと修正ボタン */}
            {state?.status === 'completed' && (
              <div className="space-y-3">
                <div className="text-center py-4 text-gray-600">
                  本日の勤務は終了しました。お疲れさまでした。
                </div>
                <Button
                  onClick={startEditingTime}
                  variant="secondary"
                  className="w-full py-3 flex items-center justify-center gap-2"
                >
                  <Clock className="w-4 h-4" />
                  打刻を修正する
                </Button>
              </div>
            )}
          </div>

          {/* 打刻修正モーダル */}
          {isEditingTime && (
            <Card className="mb-6 border-2 border-orange-200">
              <div className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <AlertCircle className="w-5 h-5 text-orange-500" />
                  <h3 className="text-lg font-semibold text-gray-800">打刻の修正</h3>
                </div>
                <p className="text-sm text-gray-600 mb-4">
                  当日の打刻のみ修正できます。修正理由は必須です。
                </p>

                <div className="space-y-4">
                  {/* 出勤時刻 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      出勤時刻
                    </label>
                    <input
                      type="time"
                      value={editClockIn}
                      onChange={(e) => setEditClockIn(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    />
                  </div>

                  {/* 退勤時刻 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      退勤時刻
                    </label>
                    <input
                      type="time"
                      value={editClockOut}
                      onChange={(e) => setEditClockOut(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    />
                  </div>

                  {/* 休憩開始 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      休憩開始
                    </label>
                    <input
                      type="time"
                      value={editBreakStart}
                      onChange={(e) => setEditBreakStart(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    />
                  </div>

                  {/* 休憩終了 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      休憩終了
                    </label>
                    <input
                      type="time"
                      value={editBreakEnd}
                      onChange={(e) => setEditBreakEnd(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    />
                  </div>

                  {/* 修正理由 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      修正理由 <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={editReason}
                      onChange={(e) => setEditReason(e.target.value)}
                      placeholder="例：打刻忘れのため、実際の退勤時刻に修正"
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    />
                  </div>
                </div>

                <div className="flex gap-2 mt-6">
                  <Button
                    onClick={handleEditTime}
                    disabled={actionLoading || !editReason.trim()}
                    className="flex-1 py-3 bg-orange-600 hover:bg-orange-700"
                  >
                    {actionLoading ? '修正中...' : '修正を保存'}
                  </Button>
                  <Button
                    onClick={() => setIsEditingTime(false)}
                    variant="secondary"
                    className="flex-1 py-3"
                  >
                    キャンセル
                  </Button>
                </div>
              </div>
            </Card>
          )}

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
