'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Button, Card, Select, Input } from '@/components/ui';
import { Loading } from '@/components/Loading';
import {
  getTimeEntriesByPeriod,
  getPendingOvertimeRequests,
  approveOvertimeRequest,
  rejectOvertimeRequest,
  generateFreeeCSVData,
  generateFreeeCSV,
  editTimeEntry,
  getAuditLogs,
} from '@/lib/attendance';
import { formatTimeJST, formatMinutesToHHMM } from '@/lib/attendance-calc';
import { TimeEntry, OvertimeRequest, ClockStatus, AttendanceAuditLog } from '@/types/attendance';
import { getBranches } from '@/lib/firestore';
import { Branch } from '@/types';
import { X, Edit2, History, AlertTriangle } from 'lucide-react';

const STATUS_LABELS: Record<ClockStatus, string> = {
  not_started: '未出勤',
  working: '勤務中',
  on_break: '休憩中',
  completed: '退勤済',
  missing_out: '退勤漏れ',
};

const ACTION_LABELS: Record<string, string> = {
  create: '作成',
  update: '更新',
  delete: '削除',
};

export default function AdminAttendancePage() {
  const { user, isAdmin } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'entries' | 'overtime' | 'audit' | 'export'>('entries');
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [overtimeRequests, setOvertimeRequests] = useState<OvertimeRequest[]>([]);
  const [auditLogs, setAuditLogs] = useState<AttendanceAuditLog[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // フィルター
  const [selectedBranch, setSelectedBranch] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
  });

  // 編集モーダル
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [editForm, setEditForm] = useState({
    clockIn: '',
    clockOut: '',
    reason: '',
  });
  const [editError, setEditError] = useState('');

  // データ取得
  const fetchData = useCallback(async () => {
    if (!user || !isAdmin) return;

    try {
      setLoading(true);

      const branchList = await getBranches(user.tenantId);
      setBranches(branchList);

      const [year, month] = selectedMonth.split('-').map(Number);
      const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${month.toString().padStart(2, '0')}-${lastDay}`;

      const entryData = await getTimeEntriesByPeriod(
        user.tenantId,
        startDate,
        endDate,
        selectedBranch || undefined
      );
      setEntries(entryData);

      const overtimeData = await getPendingOvertimeRequests(
        user.tenantId,
        selectedBranch || undefined
      );
      setOvertimeRequests(overtimeData);

      const logs = await getAuditLogs(user.tenantId, { limitCount: 100 });
      setAuditLogs(logs);
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

  // 編集モーダルを開く
  const openEditModal = (entry: TimeEntry) => {
    setEditingEntry(entry);
    setEditForm({
      clockIn: entry.clockIn ? formatDateTimeLocal(entry.clockIn) : '',
      clockOut: entry.clockOut ? formatDateTimeLocal(entry.clockOut) : '',
      reason: '',
    });
    setEditError('');
    setEditModalOpen(true);
  };

  // 編集を保存
  const handleSaveEdit = async () => {
    if (!user || !editingEntry) return;

    if (!editForm.reason.trim()) {
      setEditError('修正理由は必須です');
      return;
    }

    setActionLoading(editingEntry.id);
    setEditError('');

    try {
      const updates: {
        clockIn?: Date;
        clockOut?: Date;
      } = {};

      if (editForm.clockIn) {
        updates.clockIn = new Date(editForm.clockIn);
      }
      if (editForm.clockOut) {
        updates.clockOut = new Date(editForm.clockOut);
      }

      await editTimeEntry(
        editingEntry.id,
        updates,
        user.id,
        user.name,
        editForm.reason,
        user.tenantId
      );

      setEditModalOpen(false);
      setEditingEntry(null);
      await fetchData();
    } catch (err) {
      console.error('Failed to edit:', err);
      setEditError('修正に失敗しました');
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
        <div className="min-h-screen bg-zinc-50">
          <Header />
          <main className="max-w-4xl mx-auto px-4 py-6">
            <div className="text-center py-12">
              <p className="text-zinc-600">このページは管理者のみアクセスできます</p>
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
      <div className="min-h-screen bg-zinc-50">
        <Header />

        <main className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-bold">勤怠管理</h1>
            <div className="flex gap-2">
              <Button onClick={() => router.push('/admin/attendance/dashboard')}>
                ダッシュボード
              </Button>
              <Button variant="secondary" onClick={() => router.push('/admin/attendance/realtime')}>
                出勤状況
              </Button>
              <Button variant="secondary" onClick={() => router.push('/admin/attendance/import')}>
                シフト取込
              </Button>
            </div>
          </div>

          {/* フィルター */}
          <Card className="mb-6">
            <div className="p-4">
              <div className="flex flex-wrap gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    対象月
                  </label>
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="h-10 px-3 border border-zinc-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
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
          <div className="flex border-b border-zinc-200 mb-6 overflow-x-auto">
            <button
              className={`px-4 py-2 font-medium whitespace-nowrap ${
                activeTab === 'entries'
                  ? 'text-zinc-900 border-b-2 border-zinc-900'
                  : 'text-zinc-500'
              }`}
              onClick={() => setActiveTab('entries')}
            >
              打刻一覧
            </button>
            <button
              className={`px-4 py-2 font-medium whitespace-nowrap ${
                activeTab === 'overtime'
                  ? 'text-zinc-900 border-b-2 border-zinc-900'
                  : 'text-zinc-500'
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
              className={`px-4 py-2 font-medium whitespace-nowrap ${
                activeTab === 'audit'
                  ? 'text-zinc-900 border-b-2 border-zinc-900'
                  : 'text-zinc-500'
              }`}
              onClick={() => setActiveTab('audit')}
            >
              <History className="w-4 h-4 inline mr-1" />
              監査ログ
            </button>
            <button
              className={`px-4 py-2 font-medium whitespace-nowrap ${
                activeTab === 'export'
                  ? 'text-zinc-900 border-b-2 border-zinc-900'
                  : 'text-zinc-500'
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
                  <thead className="bg-zinc-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-zinc-600">日付</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-zinc-600">従業員</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-zinc-600">出勤</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-zinc-600">退勤</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-zinc-600">勤務時間</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-zinc-600">状態</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-zinc-600">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {entries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-zinc-50">
                        <td className="px-4 py-3 text-sm">{entry.workDate}</td>
                        <td className="px-4 py-3 text-sm">
                          {entry.employeeCode}
                          {entry.isEdited && (
                            <span className="ml-1 text-xs text-amber-600">(修正済)</span>
                          )}
                        </td>
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
                            className={`px-2 py-1 rounded-full text-xs ${
                              entry.status === 'completed'
                                ? 'bg-emerald-50 text-emerald-600'
                                : entry.status === 'missing_out'
                                ? 'bg-red-50 text-red-600'
                                : entry.status === 'working'
                                ? 'bg-blue-50 text-blue-600'
                                : 'bg-zinc-100 text-zinc-600'
                            }`}
                          >
                            {STATUS_LABELS[entry.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <button
                            onClick={() => openEditModal(entry)}
                            className="p-1.5 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg"
                            title="修正"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {entries.length === 0 && (
                  <div className="text-center py-8 text-zinc-500">
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
                  <div className="text-center py-8 text-zinc-500">
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
                          className="border border-zinc-200 rounded-xl p-4"
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="font-medium">{request.userName}</div>
                              <div className="text-sm text-zinc-600">
                                {request.workDate} / {hours}時間{mins > 0 ? `${mins}分` : ''}
                              </div>
                              <div className="text-sm text-zinc-500 mt-2">
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

          {/* 監査ログ */}
          {activeTab === 'audit' && (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-zinc-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-zinc-600">日時</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-zinc-600">対象</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-zinc-600">操作</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-zinc-600">実行者</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-zinc-600">理由</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-zinc-600">変更内容</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-zinc-50">
                        <td className="px-4 py-3 text-sm whitespace-nowrap">
                          {log.createdAt.toLocaleString('ja-JP')}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {log.targetType === 'time_entry' && '打刻'}
                          {log.targetType === 'work_shift' && 'シフト'}
                          {log.targetType === 'overtime_request' && '残業申請'}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            log.action === 'create' ? 'bg-emerald-50 text-emerald-600' :
                            log.action === 'update' ? 'bg-amber-50 text-amber-600' :
                            'bg-red-50 text-red-600'
                          }`}>
                            {ACTION_LABELS[log.action]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">{log.editedByName || log.editedBy}</td>
                        <td className="px-4 py-3 text-sm text-zinc-600">{log.reason || '-'}</td>
                        <td className="px-4 py-3 text-sm">
                          {log.before && log.after && (
                            <details className="cursor-pointer">
                              <summary className="text-blue-600 hover:text-blue-800">詳細</summary>
                              <div className="mt-2 p-2 bg-zinc-50 rounded text-xs">
                                <div className="mb-1"><strong>変更前:</strong></div>
                                <pre className="whitespace-pre-wrap text-zinc-600">
                                  {JSON.stringify(log.before, null, 2)}
                                </pre>
                                <div className="mt-2 mb-1"><strong>変更後:</strong></div>
                                <pre className="whitespace-pre-wrap text-zinc-600">
                                  {JSON.stringify(log.after, null, 2)}
                                </pre>
                              </div>
                            </details>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {auditLogs.length === 0 && (
                  <div className="text-center py-8 text-zinc-500">
                    監査ログがありません
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
                <p className="text-zinc-600 mb-6">
                  選択した月の勤怠データをfreee形式のCSVファイルとして出力します。
                  <br />
                  承認済みの残業時間のみが出力に含まれます。
                </p>

                <div className="bg-zinc-50 rounded-xl p-4 mb-6">
                  <h3 className="font-medium mb-2">出力内容</h3>
                  <ul className="text-sm text-zinc-600 space-y-1">
                    <li>・従業員コード (employee_code)</li>
                    <li>・勤務日 (work_date)</li>
                    <li>・労働時間（分）(work_minutes)</li>
                    <li>・残業時間（分）(overtime_minutes) ※承認済みのみ</li>
                    <li>・深夜時間（分）(late_night_minutes) 22:00-05:00</li>
                    <li>・休憩時間（分）(break_minutes)</li>
                  </ul>
                </div>

                <div className="text-sm text-zinc-500 mb-4">
                  対象: {selectedMonth}
                  {selectedBranch && ` / ${branches.find((b) => b.id === selectedBranch)?.name}`}
                </div>

                <Button onClick={handleExportCSV} className="w-full sm:w-auto">
                  CSVダウンロード (UTF-8 BOM)
                </Button>
              </div>
            </Card>
          )}
        </main>

        {/* 編集モーダル */}
        {editModalOpen && editingEntry && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-md animate-slide-up">
              <div className="flex items-center justify-between p-4 border-b border-zinc-100">
                <h2 className="text-lg font-semibold">打刻修正</h2>
                <button
                  onClick={() => setEditModalOpen(false)}
                  className="p-2 hover:bg-zinc-100 rounded-xl"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                  <p className="text-sm text-amber-800">
                    打刻の修正は監査ログに記録されます。修正理由は必須です。
                  </p>
                </div>

                <div>
                  <p className="text-sm text-zinc-600 mb-2">
                    {editingEntry.workDate} / {editingEntry.employeeCode}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    出勤時刻
                  </label>
                  <input
                    type="datetime-local"
                    value={editForm.clockIn}
                    onChange={(e) => setEditForm({ ...editForm, clockIn: e.target.value })}
                    className="w-full h-11 px-3 border border-zinc-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    退勤時刻
                  </label>
                  <input
                    type="datetime-local"
                    value={editForm.clockOut}
                    onChange={(e) => setEditForm({ ...editForm, clockOut: e.target.value })}
                    className="w-full h-11 px-3 border border-zinc-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    修正理由 <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={editForm.reason}
                    onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })}
                    placeholder="例: 打刻忘れのため代理入力"
                  />
                </div>

                {editError && (
                  <p className="text-sm text-red-500">{editError}</p>
                )}
              </div>

              <div className="p-4 border-t border-zinc-100 flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setEditModalOpen(false)}
                  className="flex-1"
                >
                  キャンセル
                </Button>
                <Button
                  onClick={handleSaveEdit}
                  loading={actionLoading === editingEntry.id}
                  className="flex-1"
                >
                  保存
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}

// datetime-local形式に変換
function formatDateTimeLocal(date: Date): string {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 16);
}
