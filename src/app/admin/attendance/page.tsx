'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Button, Card, Select } from '@/components/ui';
import { Loading } from '@/components/Loading';
import {
  getTimeEntriesByPeriod,
  getPendingOvertimeRequests,
  approveOvertimeRequest,
  rejectOvertimeRequest,
  generateFreeeCSVData,
  generateFreeeCSV,
} from '@/lib/attendance';
import { formatTimeJST, formatMinutesToHHMM } from '@/lib/attendance-calc';
import { TimeEntry, OvertimeRequest, ClockStatus } from '@/types/attendance';
import { getBranches } from '@/lib/firestore';
import { Branch } from '@/types';

const STATUS_LABELS: Record<ClockStatus, string> = {
  not_started: '未出勤',
  working: '勤務中',
  on_break: '休憩中',
  completed: '退勤済',
  missing_out: '退勤漏れ',
};

export default function AdminAttendancePage() {
  const { user, isAdmin } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'entries' | 'overtime' | 'export'>('entries');
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [overtimeRequests, setOvertimeRequests] = useState<OvertimeRequest[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // フィルター
  const [selectedBranch, setSelectedBranch] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
  });

  // データ取得
  const fetchData = useCallback(async () => {
    if (!user || !isAdmin) return;

    try {
      setLoading(true);

      // 事業所一覧
      const branchList = await getBranches(user.tenantId);
      setBranches(branchList);

      // 月の開始・終了日
      const [year, month] = selectedMonth.split('-').map(Number);
      const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${month.toString().padStart(2, '0')}-${lastDay}`;

      // 打刻記録
      const entryData = await getTimeEntriesByPeriod(
        user.tenantId,
        startDate,
        endDate,
        selectedBranch || undefined
      );
      setEntries(entryData);

      // 残業申請
      const overtimeData = await getPendingOvertimeRequests(
        user.tenantId,
        selectedBranch || undefined
      );
      setOvertimeRequests(overtimeData);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin, selectedMonth, selectedBranch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 残業申請承認
  const handleApprove = async (requestId: string) => {
    if (!user) return;
    setActionLoading(requestId);

    try {
      await approveOvertimeRequest(requestId, user.id, user.name);
      await fetchData();
    } catch (err) {
      console.error('Failed to approve:', err);
    } finally {
      setActionLoading(null);
    }
  };

  // 残業申請却下
  const handleReject = async (requestId: string) => {
    if (!user) return;
    const reason = prompt('却下理由を入力してください');
    if (!reason) return;

    setActionLoading(requestId);

    try {
      await rejectOvertimeRequest(requestId, user.id, user.name, reason);
      await fetchData();
    } catch (err) {
      console.error('Failed to reject:', err);
    } finally {
      setActionLoading(null);
    }
  };

  // CSV出力
  const handleExportCSV = async () => {
    if (!user) return;

    const [year, month] = selectedMonth.split('-').map(Number);
    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${month.toString().padStart(2, '0')}-${lastDay}`;

    try {
      const data = await generateFreeeCSVData(
        user.tenantId,
        startDate,
        endDate,
        selectedBranch || undefined
      );
      const csv = generateFreeeCSV(data);

      // ダウンロード
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `freee_attendance_${selectedMonth}${selectedBranch ? `_${selectedBranch}` : ''}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export CSV:', err);
      alert('CSV出力に失敗しました');
    }
  };

  if (!isAdmin) {
    return (
      <AuthGuard>
        <div className="min-h-screen bg-gray-50">
          <Header />
          <main className="max-w-4xl mx-auto px-4 py-6">
            <div className="text-center py-12">
              <p className="text-gray-600">このページは管理者のみアクセスできます</p>
            </div>
          </main>
        </div>
      </AuthGuard>
    );
  }

  if (loading) {
    return <Loading />;
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <Header />

        <main className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-bold">勤怠管理</h1>
            <Button variant="secondary" onClick={() => router.push('/admin/attendance/import')}>
              シフト取込
            </Button>
          </div>

          {/* フィルター */}
          <Card className="mb-6">
            <div className="p-4">
              <div className="flex flex-wrap gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    対象月
                  </label>
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    事業所
                  </label>
                  <Select
                    value={selectedBranch}
                    onChange={(e) => setSelectedBranch(e.target.value)}
                    options={[
                      { value: '', label: '全事業所' },
                      ...branches.map((branch) => ({
                        value: branch.id,
                        label: branch.name,
                      })),
                    ]}
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* タブ */}
          <div className="flex border-b mb-6">
            <button
              className={`px-4 py-2 font-medium ${
                activeTab === 'entries'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500'
              }`}
              onClick={() => setActiveTab('entries')}
            >
              打刻一覧
            </button>
            <button
              className={`px-4 py-2 font-medium ${
                activeTab === 'overtime'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500'
              }`}
              onClick={() => setActiveTab('overtime')}
            >
              残業承認 {overtimeRequests.length > 0 && (
                <span className="ml-1 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                  {overtimeRequests.length}
                </span>
              )}
            </button>
            <button
              className={`px-4 py-2 font-medium ${
                activeTab === 'export'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500'
              }`}
              onClick={() => setActiveTab('export')}
            >
              CSV出力
            </button>
          </div>

          {/* 打刻一覧 */}
          {activeTab === 'entries' && (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">日付</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">従業員</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">出勤</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">退勤</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">勤務時間</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">状態</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {entries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm">{entry.workDate}</td>
                        <td className="px-4 py-3 text-sm">{entry.employeeCode}</td>
                        <td className="px-4 py-3 text-sm">
                          {entry.clockIn ? formatTimeJST(entry.clockIn) : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {entry.clockOut ? formatTimeJST(entry.clockOut) : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {entry.totalWorkMinutes
                            ? formatMinutesToHHMM(entry.totalWorkMinutes)
                            : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              entry.status === 'completed'
                                ? 'bg-green-100 text-green-700'
                                : entry.status === 'missing_out'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {STATUS_LABELS[entry.status]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {entries.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    データがありません
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* 残業承認 */}
          {activeTab === 'overtime' && (
            <Card>
              <div className="p-4">
                {overtimeRequests.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    承認待ちの残業申請はありません
                  </div>
                ) : (
                  <div className="space-y-4">
                    {overtimeRequests.map((request) => {
                      const hours = Math.floor(request.requestedMinutes / 60);
                      const mins = request.requestedMinutes % 60;

                      return (
                        <div
                          key={request.id}
                          className="border rounded-lg p-4"
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="font-medium">{request.userName}</div>
                              <div className="text-sm text-gray-600">
                                {request.workDate} / {hours}時間{mins > 0 ? `${mins}分` : ''}
                              </div>
                              <div className="text-sm text-gray-500 mt-2">
                                理由: {request.reason}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleApprove(request.id)}
                                disabled={actionLoading === request.id}
                              >
                                承認
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleReject(request.id)}
                                disabled={actionLoading === request.id}
                              >
                                却下
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* CSV出力 */}
          {activeTab === 'export' && (
            <Card>
              <div className="p-6">
                <h2 className="text-lg font-semibold mb-4">freee CSV出力</h2>
                <p className="text-gray-600 mb-6">
                  選択した月の勤怠データをfreee形式のCSVファイルとして出力します。
                  <br />
                  承認済みの残業時間のみが出力に含まれます。
                </p>

                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <h3 className="font-medium mb-2">出力内容</h3>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>・従業員コード</li>
                    <li>・勤務日</li>
                    <li>・労働時間（分）</li>
                    <li>・残業時間（分）※承認済みのみ</li>
                    <li>・深夜時間（分）22:00-05:00</li>
                    <li>・休憩時間（分）</li>
                  </ul>
                </div>

                <div className="text-sm text-gray-500 mb-4">
                  対象: {selectedMonth}
                  {selectedBranch && ` / ${branches.find((b) => b.id === selectedBranch)?.name}`}
                </div>

                <Button onClick={handleExportCSV} className="w-full sm:w-auto">
                  CSVダウンロード
                </Button>
              </div>
            </Card>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
