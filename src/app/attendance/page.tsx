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
import {
  MapPin,
  Edit2,
  Clock,
  AlertCircle,
  CheckCircle,
  XCircle,
  Play,
  Square,
  Coffee,
  Home,
  Building2,
  History,
} from 'lucide-react';

// 状態表示ラベル
const STATUS_LABELS: Record<ClockStatus, { label: string; color: string; bgColor: string }> = {
  not_started: { label: '未出勤', color: 'text-zinc-700', bgColor: 'bg-zinc-100' },
  working: { label: '勤務中', color: 'text-emerald-700', bgColor: 'bg-emerald-50' },
  on_break: { label: '休憩中', color: 'text-amber-700', bgColor: 'bg-amber-50' },
  completed: { label: '退勤済', color: 'text-blue-700', bgColor: 'bg-blue-50' },
  missing_out: { label: '退勤漏れ', color: 'text-red-700', bgColor: 'bg-red-50' },
};

// 打刻履歴アイテムの型
interface PunchHistoryItem {
  type: 'clock_in' | 'break_start' | 'break_end' | 'clock_out';
  time: Date;
  label: string;
  icon: typeof Play;
  color: string;
}

// トースト通知の型
interface Toast {
  type: 'success' | 'error';
  message: string;
}

// localStorage key
const LAST_BRANCH_KEY = 'aa-hub-last-branch';

export default function AttendancePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [state, setState] = useState<TodayAttendanceState | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [isEditingBranch, setIsEditingBranch] = useState(false);
  const [editBranchId, setEditBranchId] = useState<string>('');

  // 確認ダイアログ
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'clock_out' | null>(null);

  // トースト通知
  const [toast, setToast] = useState<Toast | null>(null);

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

  // トースト自動消去
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // 前回の拠点をlocalStorageから読み込み
  useEffect(() => {
    const savedBranch = localStorage.getItem(LAST_BRANCH_KEY);
    if (savedBranch && BRANCHES_SEED.some((b) => b.id === savedBranch)) {
      setSelectedBranchId(savedBranch);
    }
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

  // トースト表示
  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
  };

  // 打刻アクション
  const handleClockIn = async () => {
    if (!user) return;
    if (!selectedBranchId) {
      setError('勤務先を選択してください');
      return;
    }
    setActionLoading(true);
    setError(null);

    try {
      await clockIn(
        user.id,
        user.email,
        selectedBranchId,
        user.tenantId
      );
      // 選択した拠点をlocalStorageに保存
      localStorage.setItem(LAST_BRANCH_KEY, selectedBranchId);
      await fetchState();
      showToast('success', '出勤しました');
    } catch (err) {
      const message = err instanceof Error ? err.message : '出勤打刻に失敗しました';
      setError(message);
      showToast('error', message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleClockOut = async () => {
    if (!user) return;
    setActionLoading(true);
    setError(null);
    setShowConfirmDialog(false);
    setConfirmAction(null);

    try {
      await clockOut(user.id, user.tenantId);
      await fetchState();
      showToast('success', '退勤しました。お疲れさまでした！');
    } catch (err) {
      const message = err instanceof Error ? err.message : '退勤打刻に失敗しました';
      setError(message);
      showToast('error', message);
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
      showToast('success', '休憩を開始しました');
    } catch (err) {
      const message = err instanceof Error ? err.message : '休憩開始に失敗しました';
      setError(message);
      showToast('error', message);
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
      showToast('success', '休憩を終了しました');
    } catch (err) {
      const message = err instanceof Error ? err.message : '休憩終了に失敗しました';
      setError(message);
      showToast('error', message);
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
      localStorage.setItem(LAST_BRANCH_KEY, editBranchId);
      await fetchState();
      setIsEditingBranch(false);
      showToast('success', '勤務先を変更しました');
    } catch (err) {
      const message = err instanceof Error ? err.message : '拠点変更に失敗しました';
      setError(message);
      showToast('error', message);
    } finally {
      setActionLoading(false);
    }
  };

  const startEditingBranch = () => {
    setEditBranchId(state?.branchId || '');
    setIsEditingBranch(true);
  };

  // 退勤確認ダイアログを表示
  const requestClockOut = () => {
    setConfirmAction('clock_out');
    setShowConfirmDialog(true);
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
      showToast('success', '打刻を修正しました');
    } catch (err) {
      const message = err instanceof Error ? err.message : '打刻修正に失敗しました';
      setError(message);
      showToast('error', message);
    } finally {
      setActionLoading(false);
    }
  };

  // 今日の打刻履歴を生成
  const getPunchHistory = (): PunchHistoryItem[] => {
    if (!state) return [];
    const history: PunchHistoryItem[] = [];

    if (state.clockIn) {
      history.push({
        type: 'clock_in',
        time: state.clockIn,
        label: '出勤',
        icon: Play,
        color: 'text-green-600',
      });
    }
    if (state.breakStart) {
      history.push({
        type: 'break_start',
        time: state.breakStart,
        label: '休憩開始',
        icon: Coffee,
        color: 'text-amber-600',
      });
    }
    if (state.breakEnd) {
      history.push({
        type: 'break_end',
        time: state.breakEnd,
        label: '休憩終了',
        icon: Coffee,
        color: 'text-amber-600',
      });
    }
    if (state.clockOut) {
      history.push({
        type: 'clock_out',
        time: state.clockOut,
        label: '退勤',
        icon: Square,
        color: 'text-blue-600',
      });
    }

    return history.sort((a, b) => a.time.getTime() - b.time.getTime());
  };

  if (loading) {
    return <Loading />;
  }

  const statusInfo = state ? STATUS_LABELS[state.status] : STATUS_LABELS.not_started;
  const punchHistory = getPunchHistory();

  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-50">
        <Header />

        {/* トースト通知 */}
        {toast && (
          <div
            className={`fixed top-20 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-fade-in ${
              toast.type === 'success'
                ? 'bg-green-600 text-white'
                : 'bg-red-600 text-white'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle className="w-5 h-5" />
            ) : (
              <XCircle className="w-5 h-5" />
            )}
            <span className="font-medium">{toast.message}</span>
          </div>
        )}

        {/* 確認ダイアログ */}
        {showConfirmDialog && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-sm">
              <div className="p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-2">退勤確認</h3>
                <p className="text-gray-600 mb-6">
                  退勤してよろしいですか？
                  {state?.totalWorkMinutes && state.totalWorkMinutes > 0 && (
                    <span className="block mt-2 text-sm">
                      本日の勤務時間: {formatMinutesToHHMM(state.totalWorkMinutes)}
                    </span>
                  )}
                </p>
                <div className="flex gap-3">
                  <Button
                    onClick={() => {
                      setShowConfirmDialog(false);
                      setConfirmAction(null);
                    }}
                    variant="secondary"
                    className="flex-1 py-3"
                  >
                    キャンセル
                  </Button>
                  <Button
                    onClick={handleClockOut}
                    disabled={actionLoading}
                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-700"
                  >
                    {actionLoading ? '処理中...' : '退勤する'}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}

        <main className="max-w-lg mx-auto px-4 py-6 safe-area-inset-bottom pb-24">
          {/* A: ステータスカード */}
          <Card className="mb-5 overflow-hidden border-zinc-200">
            <div className={`px-5 py-4 ${statusInfo.bgColor}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-zinc-500 mb-0.5">今の状態</div>
                  <div className={`text-xl font-bold ${statusInfo.color}`}>
                    {statusInfo.label}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-zinc-800 tabular-nums">
                    {currentTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {currentTime.toLocaleDateString('ja-JP', {
                      month: 'short',
                      day: 'numeric',
                      weekday: 'short',
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4">
              {/* 勤務時間サマリー */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-zinc-50 rounded-xl p-3 text-center">
                  <div className="text-xs text-zinc-500 mb-1">出勤</div>
                  <div className="text-lg font-bold text-zinc-800 tabular-nums">
                    {state?.clockIn ? formatTimeJST(state.clockIn) : '--:--'}
                  </div>
                </div>
                <div className="bg-zinc-50 rounded-xl p-3 text-center">
                  <div className="text-xs text-zinc-500 mb-1">退勤</div>
                  <div className="text-lg font-bold text-zinc-800 tabular-nums">
                    {state?.clockOut ? formatTimeJST(state.clockOut) : '--:--'}
                  </div>
                </div>
              </div>

              {/* 勤務時間 */}
              {state?.totalWorkMinutes !== undefined && state.totalWorkMinutes > 0 && (
                <div className="mt-3 bg-blue-50 rounded-xl p-3 text-center">
                  <div className="text-xs text-blue-600 mb-1">本日の勤務時間</div>
                  <div className="text-xl font-bold text-blue-700 tabular-nums">
                    {formatMinutesToHHMM(state.totalWorkMinutes)}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* エラーメッセージ */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* B: 大きい打刻ボタン */}
          <div className="space-y-4 mb-6">
            {/* 出勤前: 拠点選択 + 出勤ボタン */}
            {state?.status === 'not_started' && (
              <>
                {/* C: 勤務地セレクタ（チップUI） */}
                <Card>
                  <div className="p-4">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
                      <MapPin className="w-4 h-4" />
                      勤務先を選択
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {BRANCHES_SEED.map((branch) => {
                        const isRemote = branch.id === 'remote';
                        const isSelected = selectedBranchId === branch.id;
                        return (
                          <button
                            key={branch.id}
                            onClick={() => setSelectedBranchId(branch.id)}
                            className={`
                              inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-medium
                              transition-all duration-200 border-2
                              ${
                                isSelected
                                  ? isRemote
                                    ? 'bg-purple-100 border-purple-400 text-purple-700'
                                    : 'bg-blue-100 border-blue-400 text-blue-700'
                                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                              }
                            `}
                          >
                            {isRemote ? (
                              <Home className="w-4 h-4" />
                            ) : (
                              <Building2 className="w-4 h-4" />
                            )}
                            {branch.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </Card>

                <Button
                  onClick={handleClockIn}
                  disabled={actionLoading || !selectedBranchId}
                  className="w-full py-5 text-xl font-bold bg-green-600 hover:bg-green-700 disabled:bg-gray-300 rounded-2xl shadow-lg active:scale-98 transition-transform"
                >
                  {actionLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                      処理中...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <Play className="w-6 h-6" />
                      出勤
                    </span>
                  )}
                </Button>
              </>
            )}

            {/* 勤務中: 休憩開始 + 退勤ボタン */}
            {state?.status === 'working' && (
              <>
                {/* 現在の勤務先表示 */}
                <Card className="bg-blue-50 border-blue-200">
                  <div className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {state.branchId === 'remote' ? (
                          <Home className="w-5 h-5 text-purple-600" />
                        ) : (
                          <Building2 className="w-5 h-5 text-blue-600" />
                        )}
                        <div>
                          <div className="text-xs text-gray-500">勤務先</div>
                          <div className="font-bold text-gray-800">{state.branchName || '未設定'}</div>
                        </div>
                      </div>
                      {!isEditingBranch && (
                        <button
                          onClick={startEditingBranch}
                          className="text-blue-600 hover:text-blue-800 p-2"
                          title="拠点を変更"
                        >
                          <Edit2 className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                    {isEditingBranch && (
                      <div className="mt-3 space-y-2">
                        <div className="flex flex-wrap gap-2">
                          {BRANCHES_SEED.map((branch) => {
                            const isRemote = branch.id === 'remote';
                            const isSelected = editBranchId === branch.id;
                            return (
                              <button
                                key={branch.id}
                                onClick={() => setEditBranchId(branch.id)}
                                className={`
                                  inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium
                                  transition-all duration-200 border-2
                                  ${
                                    isSelected
                                      ? isRemote
                                        ? 'bg-purple-100 border-purple-400 text-purple-700'
                                        : 'bg-blue-100 border-blue-400 text-blue-700'
                                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                                  }
                                `}
                              >
                                {isRemote ? (
                                  <Home className="w-3 h-3" />
                                ) : (
                                  <Building2 className="w-3 h-3" />
                                )}
                                {branch.name}
                              </button>
                            );
                          })}
                        </div>
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
                    )}
                  </div>
                </Card>

                <Button
                  onClick={handleBreakStart}
                  disabled={actionLoading}
                  variant="secondary"
                  className="w-full py-4 text-lg font-semibold rounded-xl"
                >
                  {actionLoading ? (
                    '処理中...'
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <Coffee className="w-5 h-5" />
                      休憩開始
                    </span>
                  )}
                </Button>

                <Button
                  onClick={requestClockOut}
                  disabled={actionLoading}
                  className="w-full py-5 text-xl font-bold bg-blue-600 hover:bg-blue-700 rounded-2xl shadow-lg active:scale-98 transition-transform"
                >
                  {actionLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                      処理中...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <Square className="w-6 h-6" />
                      退勤
                    </span>
                  )}
                </Button>
              </>
            )}

            {/* 休憩中: 休憩終了ボタン */}
            {state?.status === 'on_break' && (
              <>
                <Card className="bg-amber-50 border-amber-200">
                  <div className="p-4 text-center">
                    <Coffee className="w-8 h-8 text-amber-600 mx-auto mb-2" />
                    <div className="text-amber-800 font-medium">休憩中です</div>
                    {state.breakStart && (
                      <div className="text-sm text-amber-600 mt-1">
                        {formatTimeJST(state.breakStart)} から
                      </div>
                    )}
                  </div>
                </Card>

                <Button
                  onClick={handleBreakEnd}
                  disabled={actionLoading}
                  className="w-full py-5 text-xl font-bold bg-amber-600 hover:bg-amber-700 rounded-2xl shadow-lg active:scale-98 transition-transform"
                >
                  {actionLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                      処理中...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <Play className="w-6 h-6" />
                      休憩終了
                    </span>
                  )}
                </Button>

                <p className="text-center text-sm text-gray-500">
                  ※ 退勤するには先に休憩を終了してください
                </p>
              </>
            )}

            {/* 退勤済み */}
            {state?.status === 'completed' && (
              <Card className="bg-blue-50 border-blue-200">
                <div className="p-6 text-center">
                  <CheckCircle className="w-12 h-12 text-blue-600 mx-auto mb-3" />
                  <div className="text-lg font-bold text-blue-800 mb-1">
                    本日の勤務は終了しました
                  </div>
                  <div className="text-blue-600">お疲れさまでした！</div>
                </div>
              </Card>
            )}
          </div>

          {/* 打刻修正ボタン（勤務中 or 退勤済み） */}
          {(state?.status === 'working' || state?.status === 'completed') && !isEditingTime && (
            <Button
              onClick={startEditingTime}
              variant="secondary"
              className="w-full py-3 flex items-center justify-center gap-2 text-sm mb-6"
            >
              <Clock className="w-4 h-4" />
              打刻を修正する
            </Button>
          )}

          {/* 打刻修正フォーム */}
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

          {/* E: 今日の履歴 */}
          {punchHistory.length > 0 && (
            <Card className="mb-6">
              <div className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <History className="w-4 h-4 text-gray-500" />
                  <h3 className="text-sm font-medium text-gray-700">今日の打刻履歴</h3>
                </div>
                <div className="space-y-2">
                  {punchHistory.map((item, index) => {
                    const Icon = item.icon;
                    return (
                      <div
                        key={index}
                        className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0"
                      >
                        <Icon className={`w-4 h-4 ${item.color}`} />
                        <span className="text-sm text-gray-700 flex-1">{item.label}</span>
                        <span className="text-sm font-medium text-gray-900">
                          {formatTimeJST(item.time)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          )}

          {/* ナビゲーション */}
          <div className="pt-4 border-t border-zinc-200">
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => router.push('/attendance/history')}
                className="flex items-center justify-center gap-2 py-3 px-4 bg-white border border-zinc-200 rounded-xl text-sm font-medium text-zinc-700 hover:bg-zinc-50 active:scale-[0.98] transition-all"
              >
                <History className="w-4 h-4" />
                勤務履歴
              </button>
              <button
                onClick={() => router.push('/attendance/overtime')}
                className="flex items-center justify-center gap-2 py-3 px-4 bg-white border border-zinc-200 rounded-xl text-sm font-medium text-zinc-700 hover:bg-zinc-50 active:scale-[0.98] transition-all"
              >
                <Clock className="w-4 h-4" />
                残業届
              </button>
            </div>
          </div>
        </main>
      </div>

      {/* トーストアニメーション用のスタイル */}
      <style jsx global>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translate(-50%, -10px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
        .active\\:scale-98:active {
          transform: scale(0.98);
        }
      `}</style>
    </AuthGuard>
  );
}
