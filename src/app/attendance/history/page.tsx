'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Button, Card } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { getTimeEntriesByUser } from '@/lib/attendance';
import { formatTimeJST, formatMinutesToHHMM } from '@/lib/attendance-calc';
import { TimeEntry, ClockStatus } from '@/types/attendance';
import { BRANCHES_SEED } from '@/data/employees';
import { RefreshCw, Info, AlertCircle, MapPin } from 'lucide-react';

const STATUS_LABELS: Record<ClockStatus, { label: string; color: string }> = {
  not_started: { label: '未出勤', color: 'bg-gray-100 text-gray-700' },
  working: { label: '勤務中', color: 'bg-green-100 text-green-700' },
  on_break: { label: '休憩中', color: 'bg-yellow-100 text-yellow-700' },
  completed: { label: '退勤済', color: 'bg-blue-100 text-blue-700' },
  missing_out: { label: '退勤漏れ', color: 'bg-red-100 text-red-700' },
};

export default function AttendanceHistoryPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
  });

  // ブランチ名取得
  const getBranchName = (branchId: string) => {
    const branch = BRANCHES_SEED.find((b) => b.id === branchId);
    return branch?.name || branchId;
  };

  // データ取得
  const fetchData = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      const [year, month] = selectedMonth.split('-').map(Number);
      const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${month.toString().padStart(2, '0')}-${lastDay}`;

      const data = await getTimeEntriesByUser(
        user.id,
        user.tenantId,
        startDate,
        endDate
      );
      setEntries(data);
    } catch (err) {
      console.error('Failed to fetch data:', err);
      const message = err instanceof Error ? err.message : 'データの取得に失敗しました';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [user, selectedMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 月次サマリー計算（全レコードを集計）
  const summary = entries.reduce(
    (acc, entry) => {
      // 出勤記録がある全レコードをカウント
      acc.totalDays++;
      acc.totalWorkMinutes += entry.totalWorkMinutes || 0;
      acc.totalLateNightMinutes += entry.lateNightMinutes || 0;
      acc.totalOvertimeMinutes += entry.overtimeMinutes || 0;
      if (entry.status === 'completed') acc.completedDays++;
      if (entry.status === 'working' || entry.status === 'on_break') acc.activeDays++;
      return acc;
    },
    { totalDays: 0, completedDays: 0, activeDays: 0, totalWorkMinutes: 0, totalLateNightMinutes: 0, totalOvertimeMinutes: 0 }
  );

  if (loading) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-gray-50">
          <Header />
          <Loading text="勤務履歴を読み込み中..." />
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <Header />

        <main className="max-w-lg mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-bold">勤務履歴</h1>
            <Button variant="secondary" onClick={() => router.push('/attendance')}>
              打刻に戻る
            </Button>
          </div>

          {/* 月選択 */}
          <Card className="mb-6">
            <div className="p-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                対象月
              </label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg w-full"
              />
            </div>
          </Card>

          {/* エラー表示 */}
          {error && (
            <Card className="mb-6 bg-red-50 border-red-200">
              <div className="p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-red-800">データ取得エラー</p>
                  <p className="text-sm text-red-700 mt-1">{error}</p>
                  <p className="text-xs text-red-500 mt-2">
                    Firestoreインデックスが未作成の可能性があります。管理者に連絡してください。
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={fetchData}>
                  再試行
                </Button>
              </div>
            </Card>
          )}

          {/* 月次サマリー */}
          <Card className="mb-6">
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold">月次サマリー</h2>
                <div className="flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
                  <RefreshCw className="w-3 h-3" />
                  <span>リアルタイム集計</span>
                </div>
              </div>

              {/* 集計の説明 */}
              <div className="flex items-start gap-2 mb-4 p-2 bg-gray-50 rounded text-xs text-gray-600">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>
                  全打刻記録から集計しています。勤務中のレコードは勤務時間が未確定です。
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-sm text-gray-500">出勤日数</div>
                  <div className="text-xl font-bold">
                    {summary.totalDays}日
                    {summary.activeDays > 0 && (
                      <span className="text-sm font-normal text-green-600 ml-1">
                        ({summary.activeDays}日勤務中)
                      </span>
                    )}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-sm text-gray-500">総勤務時間</div>
                  <div className="text-xl font-bold">
                    {formatMinutesToHHMM(summary.totalWorkMinutes)}
                  </div>
                </div>
                <div className="bg-blue-50 rounded-lg p-3">
                  <div className="text-sm text-gray-500">深夜時間</div>
                  <div className="text-lg font-medium text-blue-600">
                    {formatMinutesToHHMM(summary.totalLateNightMinutes)}
                  </div>
                </div>
                <div className="bg-green-50 rounded-lg p-3">
                  <div className="text-sm text-gray-500">残業時間</div>
                  <div className="text-lg font-medium text-green-600">
                    {formatMinutesToHHMM(summary.totalOvertimeMinutes)}
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* 勤務履歴一覧 */}
          <Card>
            <div className="p-4">
              <h2 className="font-semibold mb-3">勤務記録</h2>

              {entries.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  この月の勤務記録がありません
                </div>
              ) : (
                <div className="space-y-3">
                  {entries.map((entry) => {
                    const statusInfo = STATUS_LABELS[entry.status];
                    return (
                      <div
                        key={entry.id}
                        className="border rounded-lg p-3"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{entry.workDate}</span>
                            {entry.branchId && (
                              <span className="flex items-center gap-1 text-xs text-gray-400">
                                <MapPin className="w-3 h-3" />
                                {getBranchName(entry.branchId)}
                              </span>
                            )}
                          </div>
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}
                          >
                            {statusInfo.label}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <div>
                            <span className="text-gray-500">出勤: </span>
                            {entry.clockIn ? formatTimeJST(entry.clockIn) : '-'}
                          </div>
                          <div>
                            <span className="text-gray-500">退勤: </span>
                            {entry.clockOut ? formatTimeJST(entry.clockOut) : '-'}
                          </div>
                          <div>
                            <span className="text-gray-500">勤務: </span>
                            {entry.totalWorkMinutes
                              ? formatMinutesToHHMM(entry.totalWorkMinutes)
                              : '-'}
                          </div>
                        </div>
                        {((entry.lateNightMinutes && entry.lateNightMinutes > 0) || (entry.overtimeMinutes && entry.overtimeMinutes > 0)) && (
                          <div className="mt-2 text-xs text-gray-500">
                            {entry.lateNightMinutes && entry.lateNightMinutes > 0 && (
                              <span className="mr-3">
                                深夜: {formatMinutesToHHMM(entry.lateNightMinutes)}
                              </span>
                            )}
                            {entry.overtimeMinutes && entry.overtimeMinutes > 0 && (
                              <span>
                                残業: {formatMinutesToHHMM(entry.overtimeMinutes)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>
        </main>
      </div>
    </AuthGuard>
  );
}
