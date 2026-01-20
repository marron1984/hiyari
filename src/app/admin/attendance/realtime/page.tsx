'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Button, Card } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { db, DEFAULT_TENANT_ID } from '@/lib/firebase';
import {
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { BRANCHES_SEED, EMPLOYEES_SEED } from '@/data/employees';
import { formatTimeJST, getTodayJST } from '@/lib/attendance-calc';
import { ClockStatus } from '@/types/attendance';
import { RefreshCw, MapPin, Clock, Coffee, UserCheck, UserX } from 'lucide-react';

interface StaffStatus {
  id: string;
  name: string;
  employeeCode: string;
  branchId: string;
  branchName: string;
  status: ClockStatus;
  clockIn?: Date;
  clockOut?: Date;
  breakStart?: Date;
  qualification?: string;
  notes?: string;
}

interface BranchSummary {
  id: string;
  name: string;
  working: StaffStatus[];
  onBreak: StaffStatus[];
  completed: StaffStatus[];
  notStarted: StaffStatus[];
}

const STATUS_CONFIG: Record<ClockStatus, { label: string; color: string; bgColor: string; icon: typeof Clock }> = {
  not_started: { label: '未出勤', color: 'text-gray-600', bgColor: 'bg-gray-100', icon: UserX },
  working: { label: '勤務中', color: 'text-green-600', bgColor: 'bg-green-100', icon: UserCheck },
  on_break: { label: '休憩中', color: 'text-yellow-600', bgColor: 'bg-yellow-100', icon: Coffee },
  completed: { label: '退勤済', color: 'text-blue-600', bgColor: 'bg-blue-100', icon: Clock },
  missing_out: { label: '退勤漏れ', color: 'text-red-600', bgColor: 'bg-red-100', icon: UserX },
};

export default function AttendanceDashboardPage() {
  const { isAdmin } = useAuth();
  const [branchSummaries, setBranchSummaries] = useState<BranchSummary[]>([]);
  const [allStaff, setAllStaff] = useState<StaffStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);

  // データ取得
  const fetchData = useCallback(async () => {
    if (!db) return;

    try {
      const today = getTodayJST();

      // 従業員一覧を取得（単一フィルターに簡素化してインデックス不要に）
      const employeesQuery = query(
        collection(db, 'employees'),
        where('tenantId', '==', DEFAULT_TENANT_ID)
      );
      const employeesSnapshot = await getDocs(employeesQuery);
      const employees = new Map<string, { name: string; branchId: string; qualification?: string; notes?: string }>();

      // クライアント側でisActiveフィルタ
      employeesSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        if (data.isActive !== true) return; // クライアント側フィルタ
        employees.set(data.employeeCode, {
          name: data.name,
          branchId: data.branchId || data.defaultBranchId,
          qualification: data.qualification,
          notes: data.notes,
        });
      });

      // Firestoreに従業員データがない場合、シードデータをフォールバックとして使用
      if (employees.size === 0) {
        EMPLOYEES_SEED.forEach((emp) => {
          employees.set(emp.employeeCode, {
            name: emp.name,
            branchId: emp.defaultBranchId,
            qualification: emp.qualification,
            notes: emp.notes,
          });
        });
      }

      // 今日の打刻記録を取得（単一フィルターに簡素化）
      const timeEntriesQuery = query(
        collection(db, 'timeEntries'),
        where('workDate', '==', today)
      );
      const timeEntriesSnapshot = await getDocs(timeEntriesQuery);
      const timeEntries = new Map<string, {
        status: ClockStatus;
        clockIn?: Date;
        clockOut?: Date;
        breakStart?: Date;
        branchId?: string;
      }>();
      // クライアント側でtenantIdフィルタ
      timeEntriesSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        if (data.tenantId !== DEFAULT_TENANT_ID) return; // クライアント側フィルタ
        timeEntries.set(data.employeeCode, {
          status: data.status as ClockStatus,
          clockIn: data.clockIn?.toDate(),
          clockOut: data.clockOut?.toDate(),
          breakStart: data.breakStart?.toDate(),
          branchId: data.branchId,
        });
      });

      // 事業所マップ
      const branchMap = new Map<string, string>(
        BRANCHES_SEED.map((b) => [b.id, b.name])
      );

      // 全スタッフの状態を構築
      const staffList: StaffStatus[] = [];
      employees.forEach((emp, employeeCode) => {
        const entry = timeEntries.get(employeeCode);
        // 勤務中は打刻の拠点を優先（勤務場所変更に対応）
        const currentBranchId = entry?.branchId || emp.branchId;
        staffList.push({
          id: employeeCode,
          name: emp.name,
          employeeCode,
          branchId: currentBranchId,
          branchName: branchMap.get(currentBranchId) || currentBranchId,
          status: entry?.status || 'not_started',
          clockIn: entry?.clockIn,
          clockOut: entry?.clockOut,
          breakStart: entry?.breakStart,
          qualification: emp.qualification,
          notes: emp.notes,
        });
      });

      setAllStaff(staffList);

      // 事業所ごとのサマリーを構築
      const summaries: BranchSummary[] = BRANCHES_SEED.map((branch) => {
        const branchStaff = staffList.filter((s) => s.branchId === branch.id);
        return {
          id: branch.id,
          name: branch.name,
          working: branchStaff.filter((s) => s.status === 'working'),
          onBreak: branchStaff.filter((s) => s.status === 'on_break'),
          completed: branchStaff.filter((s) => s.status === 'completed'),
          notStarted: branchStaff.filter((s) => s.status === 'not_started'),
        };
      });

      setBranchSummaries(summaries);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to fetch attendance data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // 初回読み込み
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 自動更新（30秒ごと）
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  // 集計値
  const totals = {
    total: allStaff.length,
    working: allStaff.filter((s) => s.status === 'working').length,
    onBreak: allStaff.filter((s) => s.status === 'on_break').length,
    completed: allStaff.filter((s) => s.status === 'completed').length,
    notStarted: allStaff.filter((s) => s.status === 'not_started').length,
  };

  // フィルター適用
  const filteredSummaries = selectedBranch === 'all'
    ? branchSummaries
    : branchSummaries.filter((b) => b.id === selectedBranch);

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

        <main className="max-w-7xl mx-auto px-4 py-6">
          {/* ヘッダー */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold">出勤状況</h1>
              {lastUpdated && (
                <p className="text-sm text-gray-500">
                  最終更新: {lastUpdated.toLocaleTimeString('ja-JP')}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="rounded"
                />
                自動更新
              </label>
              <Button
                variant="secondary"
                onClick={fetchData}
                className="flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                更新
              </Button>
            </div>
          </div>

          {/* サマリーカード */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <UserCheck className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600">{totals.working}</div>
                  <div className="text-sm text-gray-500">勤務中</div>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <Coffee className="w-6 h-6 text-yellow-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-yellow-600">{totals.onBreak}</div>
                  <div className="text-sm text-gray-500">休憩中</div>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Clock className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-blue-600">{totals.completed}</div>
                  <div className="text-sm text-gray-500">退勤済</div>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-100 rounded-lg">
                  <UserX className="w-6 h-6 text-gray-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-600">{totals.notStarted}</div>
                  <div className="text-sm text-gray-500">未出勤</div>
                </div>
              </div>
            </Card>
          </div>

          {/* 事業所フィルター */}
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
            <button
              onClick={() => setSelectedBranch('all')}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap ${
                selectedBranch === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border hover:bg-gray-50'
              }`}
            >
              全事業所
            </button>
            {BRANCHES_SEED.map((branch) => {
              const summary = branchSummaries.find((b) => b.id === branch.id);
              const workingCount = (summary?.working.length || 0) + (summary?.onBreak.length || 0);
              return (
                <button
                  key={branch.id}
                  onClick={() => setSelectedBranch(branch.id)}
                  className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap flex items-center gap-2 ${
                    selectedBranch === branch.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-700 border hover:bg-gray-50'
                  }`}
                >
                  {branch.name}
                  {workingCount > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                      selectedBranch === branch.id ? 'bg-white text-blue-600' : 'bg-green-100 text-green-700'
                    }`}>
                      {workingCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* 事業所ごとの状況 */}
          <div className="space-y-6">
            {filteredSummaries.map((branch) => {
              const activeStaff = [...branch.working, ...branch.onBreak];
              const hasActiveStaff = activeStaff.length > 0;

              return (
                <Card key={branch.id} className="overflow-hidden">
                  <div className="p-4 bg-gray-50 border-b flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-5 h-5 text-gray-400" />
                      <h2 className="font-semibold text-lg">{branch.name}</h2>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-green-600 font-medium">
                        勤務中: {branch.working.length}
                      </span>
                      <span className="text-yellow-600 font-medium">
                        休憩中: {branch.onBreak.length}
                      </span>
                      <span className="text-gray-500">
                        未出勤: {branch.notStarted.length}
                      </span>
                    </div>
                  </div>

                  <div className="p-4">
                    {/* 現在勤務中・休憩中 */}
                    {hasActiveStaff ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {activeStaff.map((staff) => {
                          const config = STATUS_CONFIG[staff.status];
                          return (
                            <div
                              key={staff.id}
                              className={`p-3 rounded-lg border-l-4 ${
                                staff.status === 'working'
                                  ? 'bg-green-50 border-green-500'
                                  : 'bg-yellow-50 border-yellow-500'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="font-medium">{staff.name}</div>
                                <span className={`text-xs px-2 py-1 rounded-full ${config.bgColor} ${config.color}`}>
                                  {config.label}
                                </span>
                              </div>
                              <div className="mt-1 text-sm text-gray-500">
                                {staff.clockIn && (
                                  <span>出勤: {formatTimeJST(staff.clockIn)}</span>
                                )}
                                {staff.status === 'on_break' && staff.breakStart && (
                                  <span className="ml-2">
                                    休憩開始: {formatTimeJST(staff.breakStart)}
                                  </span>
                                )}
                              </div>
                              {staff.qualification && staff.qualification !== 'なし' && (
                                <div className="mt-1 text-xs text-gray-400">
                                  {staff.qualification}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-gray-500">
                        現在勤務中のスタッフはいません
                      </div>
                    )}

                    {/* 未出勤者（折りたたみ） */}
                    {branch.notStarted.length > 0 && (
                      <details className="mt-4">
                        <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                          未出勤のスタッフを表示 ({branch.notStarted.length}名)
                        </summary>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {branch.notStarted.map((staff) => (
                            <span
                              key={staff.id}
                              className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-sm"
                            >
                              {staff.name}
                            </span>
                          ))}
                        </div>
                      </details>
                    )}

                    {/* 退勤済（折りたたみ） */}
                    {branch.completed.length > 0 && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                          退勤済のスタッフを表示 ({branch.completed.length}名)
                        </summary>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {branch.completed.map((staff) => (
                            <span
                              key={staff.id}
                              className="px-2 py-1 bg-blue-50 text-blue-600 rounded text-sm"
                            >
                              {staff.name}
                              {staff.clockOut && (
                                <span className="ml-1 text-xs opacity-75">
                                  ({formatTimeJST(staff.clockOut)})
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
