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
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
  });

  // データ取得
  const fetchData = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);

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
    } finally {
      setLoading(false);
    }
  }, [user, selectedMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 月次サマリー計算
  const summary = entries.reduce(
    (acc, entry) => {
      if (entry.status === 'completed') {
        acc.totalDays++;
        acc.totalWorkMinutes += entry.totalWorkMinutes || 0;
        acc.totalLateNightMinutes += entry.lateNightMinutes || 0;
        acc.totalOvertimeMinutes += entry.overtimeMinutes || 0;
      }
      return acc;
    },
    { totalDays: 0, totalWorkMinutes: 0, totalLateNightMinutes: 0, totalOvertimeMinutes: 0 }
  );

  if (loading) {
    return <Loading />;
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

          {/* 月次サマリー */}
          <Card className="mb-6">
            <div className="p-4">
              <h2 className="font-semibold mb-3">月次サマリー</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-sm text-gray-500">出勤日数</div>
                  <div className="text-xl font-bold">{summary.totalDays}日</div>
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
                  <div className="text-sm text-gray-500">残業時間（承認済）</div>
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
                          <span className="font-medium">{entry.workDate}</span>
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
