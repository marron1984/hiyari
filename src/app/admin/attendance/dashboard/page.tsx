'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Button, Card, Select } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { MonthlyHoursChart, BranchComparisonChart } from '@/components/attendance/MonthlyHoursChart';
import { AttendanceAlertList, AlertSummary } from '@/components/attendance/AttendanceAlertList';
import {
  getTodaySummary,
  getMonthlySummary,
  getAttendanceAlerts,
  getDailyWorkData,
  getBranchSummaries,
  TodaySummary,
  MonthlySummary,
  AttendanceAlert,
  DailyWorkData,
  BranchAttendanceSummary,
} from '@/lib/attendance-summary';
import { generateFreeeCSVData, generateFreeeCSV } from '@/lib/attendance';
import { getBranches } from '@/lib/firestore';
import { Branch } from '@/types';
import { formatMinutesToHHMM } from '@/lib/attendance-calc';
import {
  Users,
  Clock,
  AlertTriangle,
  TrendingUp,
  Download,
  RefreshCw,
  Moon,
  Coffee,
  CheckCircle,
  UserX,
} from 'lucide-react';

export default function AttendanceDashboardPage() {
  const { user, isAdmin } = useAuth();
  const router = useRouter();

  // State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
  });

  // Data
  const [todaySummary, setTodaySummary] = useState<TodaySummary | null>(null);
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary | null>(null);
  const [alerts, setAlerts] = useState<AttendanceAlert[]>([]);
  const [dailyData, setDailyData] = useState<DailyWorkData[]>([]);
  const [branchSummaries, setBranchSummaries] = useState<BranchAttendanceSummary[]>([]);

  // Chart type toggle
  const [chartType, setChartType] = useState<'bar' | 'line' | 'composed'>('composed');

  // Fetch data
  const fetchData = useCallback(async () => {
    if (!user) return;

    try {
      const [year, month] = selectedMonth.split('-').map(Number);

      // Parallel fetch
      const [
        todayData,
        monthlyData,
        alertData,
        chartData,
        branchData,
        branchList,
      ] = await Promise.all([
        getTodaySummary(user.tenantId),
        getMonthlySummary(user.tenantId, year, month, selectedBranch || undefined),
        getAttendanceAlerts(user.tenantId, selectedBranch || undefined),
        getDailyWorkData(user.tenantId, year, month, selectedBranch || undefined),
        getBranchSummaries(user.tenantId),
        getBranches(user.tenantId),
      ]);

      setTodaySummary(todayData);
      setMonthlySummary(monthlyData);
      setAlerts(alertData);
      setDailyData(chartData);
      setBranchSummaries(branchData);
      setBranches(branchList);
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, selectedMonth, selectedBranch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshing(true);
      fetchData();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchData]);

  // Manual refresh
  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // CSV export
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

  // Alert click handler
  const handleAlertClick = (alert: AttendanceAlert) => {
    if (alert.type === 'overtime_pending') {
      router.push('/admin/attendance?tab=overtime');
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

        <main className="max-w-7xl mx-auto px-4 py-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-xl font-bold">勤怠ダッシュボード</h1>
              <p className="text-sm text-gray-500 mt-1">
                リアルタイム出勤状況と月次サマリー
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
              >
                <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
                更新
              </Button>
              <Button size="sm" onClick={handleExportCSV}>
                <Download className="w-4 h-4 mr-1" />
                CSV出力
              </Button>
            </div>
          </div>

          {/* Filters */}
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

          {/* Today's Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Users className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <div className="text-sm text-gray-500">従業員数</div>
                  <div className="text-xl font-bold">{todaySummary?.total || 0}</div>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Clock className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <div className="text-sm text-gray-500">勤務中</div>
                  <div className="text-xl font-bold text-green-600">
                    {todaySummary?.working || 0}
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <Coffee className="w-5 h-5 text-yellow-600" />
                </div>
                <div>
                  <div className="text-sm text-gray-500">休憩中</div>
                  <div className="text-xl font-bold text-yellow-600">
                    {todaySummary?.onBreak || 0}
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <div className="text-sm text-gray-500">退勤済</div>
                  <div className="text-xl font-bold text-blue-600">
                    {todaySummary?.completed || 0}
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-100 rounded-lg">
                  <UserX className="w-5 h-5 text-gray-600" />
                </div>
                <div>
                  <div className="text-sm text-gray-500">未出勤</div>
                  <div className="text-xl font-bold text-gray-600">
                    {todaySummary?.notStarted || 0}
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <div className="text-sm text-gray-500">遅刻</div>
                  <div className="text-xl font-bold text-red-600">
                    {todaySummary?.late || 0}
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Main content grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Monthly Summary */}
            <Card className="lg:col-span-2">
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold">月次サマリー</h2>
                  <TrendingUp className="w-5 h-5 text-gray-400" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-500">総労働時間</div>
                    <div className="text-xl font-bold">
                      {monthlySummary ? formatMinutesToHHMM(monthlySummary.totalWorkMinutes) : '-'}
                    </div>
                  </div>
                  <div className="bg-yellow-50 rounded-lg p-4">
                    <div className="text-sm text-gray-500">総残業時間</div>
                    <div className="text-xl font-bold text-yellow-600">
                      {monthlySummary ? formatMinutesToHHMM(monthlySummary.totalOvertimeMinutes) : '-'}
                    </div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-4">
                    <div className="flex items-center gap-1 text-sm text-gray-500">
                      <Moon className="w-4 h-4" />
                      深夜時間
                    </div>
                    <div className="text-xl font-bold text-purple-600">
                      {monthlySummary ? formatMinutesToHHMM(monthlySummary.totalLateNightMinutes) : '-'}
                    </div>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-4">
                    <div className="text-sm text-gray-500">出勤日数</div>
                    <div className="text-xl font-bold text-blue-600">
                      {monthlySummary?.workDays || 0}日
                    </div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4">
                    <div className="text-sm text-gray-500">日平均労働</div>
                    <div className="text-xl font-bold text-green-600">
                      {monthlySummary ? formatMinutesToHHMM(monthlySummary.avgWorkMinutesPerDay) : '-'}
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="text-sm text-gray-500">総休憩時間</div>
                    <div className="text-xl font-bold">
                      {monthlySummary ? formatMinutesToHHMM(monthlySummary.totalBreakMinutes) : '-'}
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* Alerts */}
            <Card>
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold">アラート</h2>
                  <AlertSummary alerts={alerts} />
                </div>
                <AttendanceAlertList
                  alerts={alerts}
                  onAlertClick={handleAlertClick}
                  maxItems={5}
                />
              </div>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Daily Hours Chart */}
            <Card>
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold">日別労働時間</h2>
                  <div className="flex gap-1">
                    <button
                      className={`px-2 py-1 text-xs rounded ${chartType === 'bar' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100'}`}
                      onClick={() => setChartType('bar')}
                    >
                      棒
                    </button>
                    <button
                      className={`px-2 py-1 text-xs rounded ${chartType === 'line' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100'}`}
                      onClick={() => setChartType('line')}
                    >
                      線
                    </button>
                    <button
                      className={`px-2 py-1 text-xs rounded ${chartType === 'composed' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100'}`}
                      onClick={() => setChartType('composed')}
                    >
                      複合
                    </button>
                  </div>
                </div>
                <MonthlyHoursChart data={dailyData} chartType={chartType} />
              </div>
            </Card>

            {/* Branch Comparison Chart */}
            <Card>
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold">事業所別出勤状況</h2>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => router.push('/admin/attendance/realtime')}
                  >
                    詳細
                  </Button>
                </div>
                <BranchComparisonChart data={branchSummaries} />
              </div>
            </Card>
          </div>

          {/* Quick Links */}
          <Card>
            <div className="p-4">
              <h2 className="font-semibold mb-4">クイックアクセス</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Button
                  variant="secondary"
                  className="justify-start"
                  onClick={() => router.push('/admin/attendance/realtime')}
                >
                  <Clock className="w-4 h-4 mr-2" />
                  リアルタイム状況
                </Button>
                <Button
                  variant="secondary"
                  className="justify-start"
                  onClick={() => router.push('/admin/attendance')}
                >
                  <Users className="w-4 h-4 mr-2" />
                  打刻一覧
                </Button>
                <Button
                  variant="secondary"
                  className="justify-start"
                  onClick={() => router.push('/admin/attendance/import')}
                >
                  <Download className="w-4 h-4 mr-2" />
                  シフト取込
                </Button>
                <Button
                  variant="secondary"
                  className="justify-start"
                  onClick={() => router.push('/admin/employees')}
                >
                  <Users className="w-4 h-4 mr-2" />
                  従業員管理
                </Button>
              </div>
            </div>
          </Card>
        </main>
      </div>
    </AuthGuard>
  );
}
