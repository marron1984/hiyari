'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_TENANT_ID } from '@/lib/firebase';
import {
  getIncidentsByUser,
  getIncidentsByTenant,
  getMonthlyUserStats,
  getBranches,
} from '@/lib/firestore';
import { getSalesDeals, getSalesAccounts } from '@/lib/sales';
import { SalesDeal, SalesAccount } from '@/types/sales';
import { getFacilitiesWithVacancy } from '@/lib/vacancy';
import { getActiveInsights, archiveInsight } from '@/lib/insight';
import { FacilityWithVacancy, DailyInsight, INSIGHT_PRIORITY_CONFIG } from '@/types';
import { getMonthKey, formatMonthKey, getPastMonthKeys, getDayOfWeek, getTimeSlotIndex } from '@/lib/utils';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { Incident, MonthlyUserStats, CATEGORIES, TIME_SLOTS, Branch } from '@/types';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  Plus,
  TrendingUp,
  Trophy,
  FileText,
  Star,
  ArrowRight,
  Gift,
  Users,
  Building2,
  AlertTriangle,
  Megaphone,
  X,
  Phone,
  Briefcase,
  Target,
} from 'lucide-react';

const COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
];

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}

function DashboardContent() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [myIncidents, setMyIncidents] = useState<Incident[]>([]);
  const [allIncidents, setAllIncidents] = useState<Incident[]>([]);
  const [myStats, setMyStats] = useState<MonthlyUserStats | null>(null);
  const [topUsers, setTopUsers] = useState<MonthlyUserStats[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [monthlyData, setMonthlyData] = useState<{ month: string; count: number; points: number }[]>([]);
  const [facilities, setFacilities] = useState<FacilityWithVacancy[]>([]);
  const [insights, setInsights] = useState<DailyInsight[]>([]);
  const [salesDeals, setSalesDeals] = useState<SalesDeal[]>([]);
  const [salesAccounts, setSalesAccounts] = useState<SalesAccount[]>([]);

  const currentMonthKey = getMonthKey();

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;

      try {
        const [incidentsData, allIncidentsData, branchesData, allUserStats, facilitiesData, insightsData, dealsData, accountsData] = await Promise.all([
          getIncidentsByUser(user.id, 100),
          getIncidentsByTenant(DEFAULT_TENANT_ID, 50),
          getBranches(),
          getMonthlyUserStats(DEFAULT_TENANT_ID, currentMonthKey),
          getFacilitiesWithVacancy(user.tenantId),
          getActiveInsights(user.tenantId),
          getSalesDeals(DEFAULT_TENANT_ID),
          getSalesAccounts(DEFAULT_TENANT_ID),
        ]);

        setFacilities(facilitiesData);
        setInsights(insightsData);
        setSalesDeals(dealsData);
        setSalesAccounts(accountsData);

        setMyIncidents(incidentsData);
        setAllIncidents(allIncidentsData);
        setBranches(branchesData);

        // 自分の今月の統計
        const myStatsData = allUserStats.find((s) => s.userId === user.id);
        if (myStatsData) {
          const branch = branchesData.find((b) => b.id === myStatsData.branchId);
          setMyStats({ ...myStatsData, branchName: branch?.name });
        }

        // 上位10ユーザー（ポイント降順、同点はsuggestionsCount、avgBodyLength、countで比較）
        const sortedUsers = [...allUserStats]
          .sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            if (b.suggestionsCount !== a.suggestionsCount)
              return b.suggestionsCount - a.suggestionsCount;
            if (b.avgBodyLength !== a.avgBodyLength)
              return b.avgBodyLength - a.avgBodyLength;
            return b.count - a.count;
          })
          .slice(0, 10)
          .map((s) => ({
            ...s,
            branchName: branchesData.find((b) => b.id === s.branchId)?.name,
          }));
        setTopUsers(sortedUsers);

        // 過去6ヶ月の月次データ
        const pastMonths = getPastMonthKeys(6).reverse();
        const monthlyPromises = pastMonths.map(async (monthKey) => {
          const stats = await getMonthlyUserStats(DEFAULT_TENANT_ID, monthKey);
          const userStat = stats.find((s) => s.userId === user.id);
          return {
            month: formatMonthKey(monthKey),
            count: userStat?.count || 0,
            points: userStat?.points || 0,
          };
        });
        const monthlyResults = await Promise.all(monthlyPromises);
        setMonthlyData(monthlyResults);
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, currentMonthKey]);

  // 今月のインシデントを抽出
  const thisMonthIncidents = myIncidents.filter((i) => {
    const incidentMonthKey =
      i.date.substring(0, 4) + i.date.substring(5, 7);
    return incidentMonthKey === currentMonthKey;
  });

  // カテゴリ別データ
  const categoryData = CATEGORIES.map((category) => ({
    name: category,
    value: thisMonthIncidents.filter((i) => i.category === category).length,
  })).filter((d) => d.value > 0);

  // 重大度分布
  const severityData = [1, 2, 3, 4, 5].map((severity) => ({
    name: `${severity}`,
    value: thisMonthIncidents.filter((i) => i.severity === severity).length,
  }));

  // 曜日×時間帯ヒートマップデータ
  const heatmapData: number[][] = Array.from({ length: 7 }, () =>
    Array(4).fill(0)
  );
  thisMonthIncidents.forEach((incident) => {
    const dayIndex = getDayOfWeek(incident.date);
    const timeIndex = getTimeSlotIndex(incident.timeSlot);
    if (dayIndex >= 0 && timeIndex >= 0) {
      heatmapData[dayIndex][timeIndex]++;
    }
  });

  const maxHeatValue = Math.max(...heatmapData.flat(), 1);

  // 空室関連の集計
  const totalCapacity = facilities.reduce((sum, f) => sum + (f.facility.capacity || 0), 0);
  const totalVacant = facilities.reduce((sum, f) => sum + (f.vacancy?.vacantCount ?? 0), 0);
  const totalOccupied = totalCapacity - totalVacant;
  const totalOccupancyRate = totalCapacity > 0 ? Math.round((totalOccupied / totalCapacity) * 100) : 0;

  // 稼働率に応じた色
  const getOccupancyColor = (rate: number) => {
    if (rate >= 95) return { bg: 'bg-green-50', text: 'text-green-700', bar: 'bg-green-500' };
    if (rate >= 85) return { bg: 'bg-blue-50', text: 'text-blue-700', bar: 'bg-blue-500' };
    if (rate >= 70) return { bg: 'bg-yellow-50', text: 'text-yellow-700', bar: 'bg-yellow-500' };
    return { bg: 'bg-red-50', text: 'text-red-700', bar: 'bg-red-500' };
  };

  // 低稼働施設
  const lowOccupancyFacilities = facilities.filter(f => {
    const capacity = f.facility.capacity || 0;
    const vacant = f.vacancy?.vacantCount ?? 0;
    if (capacity === 0) return false;
    const rate = Math.round(((capacity - vacant) / capacity) * 100);
    return rate < 70;
  });

  // 営業サマリー計算
  const activeDeals = salesDeals.filter((d) => !['請求書到着', '失注'].includes(d.status));
  const completedDeals = salesDeals.filter((d) => d.status === '請求書到着');
  const lostDeals = salesDeals.filter((d) => d.status === '失注');

  // CV率計算（流入元別）
  const teleapoDeals = salesDeals.filter((d) => d.source === 'テレアポ');
  const teleapoCompleted = teleapoDeals.filter((d) => d.status === '請求書到着');
  const teleapoCvRate = teleapoDeals.length > 0
    ? Math.round((teleapoCompleted.length / teleapoDeals.length) * 100)
    : 0;

  const shiryouDeals = salesDeals.filter((d) => d.source === '資料送付');
  const shiryouCompleted = shiryouDeals.filter((d) => d.status === '請求書到着');
  const shiryouCvRate = shiryouDeals.length > 0
    ? Math.round((shiryouCompleted.length / shiryouDeals.length) * 100)
    : 0;

  // 全体CV率
  const totalSalesCvRate = salesDeals.length > 0
    ? Math.round((completedDeals.length / (completedDeals.length + lostDeals.length || 1)) * 100)
    : 0;

  // インサイトを閉じる
  const handleDismissInsight = async (insightId: string) => {
    if (!user) return;
    try {
      await archiveInsight(insightId, user.id, user.role);
      setInsights(prev => prev.filter(i => i.id !== insightId));
    } catch (err) {
      console.error('Failed to dismiss insight:', err);
    }
  };

  if (loading) {
    return (
      <>
        <Header />
        <Loading text="読み込み中..." />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="pb-20 md:pb-8">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-bold text-gray-900">ダッシュボード</h1>
            <Link href="/submit">
              <Button size="sm">
                <Plus className="w-4 h-4 mr-1" />
                投稿
              </Button>
            </Link>
          </div>

          {/* 今月のサマリー */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Star className="w-5 h-5 text-yellow-500 mr-2" />
                今月のサマリー（{formatMonthKey(currentMonthKey)}）
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <p className="text-3xl font-bold text-blue-600">
                    {myStats?.points || 0}
                  </p>
                  <p className="text-sm text-gray-600">ポイント</p>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <p className="text-3xl font-bold text-green-600">
                    {myStats?.count || 0}
                  </p>
                  <p className="text-sm text-gray-600">投稿数</p>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <p className="text-3xl font-bold text-purple-600">
                    {myStats?.suggestionsCount || 0}
                  </p>
                  <p className="text-sm text-gray-600">提案数</p>
                </div>
                <div className="text-center p-4 bg-orange-50 rounded-lg">
                  <p className="text-3xl font-bold text-orange-600">
                    {myStats?.avgBodyLength || 0}
                  </p>
                  <p className="text-sm text-gray-600">平均文字数</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 連携提案（デイリーインサイト） */}
          {insights.length > 0 && (
            <div className="mb-6 space-y-3">
              {insights.slice(0, 3).map((insight) => {
                const priorityConfig = INSIGHT_PRIORITY_CONFIG[insight.priority];
                return (
                  <Card
                    key={insight.id}
                    className={`p-4 ${priorityConfig.bg} border-l-4 ${
                      insight.priority === 'high' ? 'border-l-red-500' :
                      insight.priority === 'medium' ? 'border-l-blue-500' : 'border-l-gray-400'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Megaphone className={`w-5 h-5 ${priorityConfig.color} shrink-0 mt-0.5`} />
                      <div className="flex-1">
                        <p className={`font-bold ${priorityConfig.color}`}>{insight.title}</p>
                        <p className="text-sm text-gray-700 mt-1">{insight.message}</p>
                        <p className="text-xs text-gray-500 mt-2">
                          {insight.createdByName} · {insight.createdAt.toLocaleDateString('ja-JP')}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDismissInsight(insight.id)}
                        className="p-1 hover:bg-white/50 rounded"
                        title="閉じる"
                      >
                        <X className="w-4 h-4 text-gray-400" />
                      </button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {/* 空室・稼働状況サマリー */}
          {facilities.length > 0 && (
            <Card className="mb-6">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center">
                  <Building2 className="w-5 h-5 text-gray-500 mr-2" />
                  空室・稼働状況
                </CardTitle>
                <Link href="/dashboard/vacancy" className="text-sm text-blue-600 hover:underline flex items-center">
                  詳細 <ArrowRight className="w-4 h-4 ml-1" />
                </Link>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className={`text-center p-4 rounded-lg ${getOccupancyColor(totalOccupancyRate).bg}`}>
                    <p className={`text-3xl font-bold ${getOccupancyColor(totalOccupancyRate).text}`}>
                      {totalOccupancyRate}%
                    </p>
                    <p className="text-sm text-gray-600">全体稼働率</p>
                    <div className="w-full h-2 bg-gray-200 rounded-full mt-2 overflow-hidden">
                      <div
                        className={`h-full ${getOccupancyColor(totalOccupancyRate).bar} transition-all`}
                        style={{ width: `${totalOccupancyRate}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <p className="text-3xl font-bold text-blue-600">{totalVacant}</p>
                    <p className="text-sm text-gray-600">空室合計</p>
                  </div>
                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <p className="text-3xl font-bold text-gray-700">{totalOccupied}</p>
                    <p className="text-sm text-gray-600">入居数</p>
                  </div>
                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <p className="text-3xl font-bold text-gray-700">{totalCapacity}</p>
                    <p className="text-sm text-gray-600">総定員</p>
                  </div>
                </div>

                {/* 施設別ミニリスト */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {facilities.map((f) => {
                    const capacity = f.facility.capacity || 0;
                    const vacant = f.vacancy?.vacantCount ?? 0;
                    const rate = capacity > 0 ? Math.round(((capacity - vacant) / capacity) * 100) : 0;
                    const color = getOccupancyColor(rate);
                    return (
                      <div
                        key={f.facility.id}
                        className={`p-3 rounded-lg ${color.bg} flex items-center justify-between`}
                      >
                        <span className="font-medium text-sm">{f.facility.name}</span>
                        <div className="flex items-center gap-2">
                          <span className={`font-bold ${color.text}`}>{rate}%</span>
                          <span className="text-xs text-gray-500">空{vacant}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 低稼働アラート */}
                {lowOccupancyFacilities.length > 0 && (
                  <div className="mt-4 p-3 bg-red-50 rounded-lg flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <span className="font-medium text-red-800">稼働率70%未満: </span>
                      <span className="text-red-700">
                        {lowOccupancyFacilities.map(f => f.facility.name).join('、')}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* 営業サマリー */}
          <Card className="mb-6 border-blue-200">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center">
                <Briefcase className="w-5 h-5 text-blue-600 mr-2" />
                営業サマリー
              </CardTitle>
              <Link href="/sales" className="text-sm text-blue-600 hover:underline flex items-center">
                詳細 <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </CardHeader>
            <CardContent>
              {/* 基本数値 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <p className="text-3xl font-bold text-blue-600">{salesAccounts.length}</p>
                  <p className="text-sm text-gray-600">営業先</p>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <p className="text-3xl font-bold text-green-600">{activeDeals.length}</p>
                  <p className="text-sm text-gray-600">進行中案件</p>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <p className="text-3xl font-bold text-purple-600">{completedDeals.length}</p>
                  <p className="text-sm text-gray-600">成約</p>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <p className="text-3xl font-bold text-gray-600">{totalSalesCvRate}%</p>
                  <p className="text-sm text-gray-600">全体CV率</p>
                </div>
              </div>

              {/* CV率（流入元別）- 電話の大事さを強調 */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                  <Target className="w-4 h-4 mr-2 text-blue-600" />
                  CV率（成約率）- 流入元別
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-3 bg-white rounded-lg shadow-sm border-2 border-blue-200">
                    <div className="flex items-center justify-center mb-1">
                      <Phone className="w-4 h-4 text-blue-600 mr-1" />
                      <span className="text-xs font-medium text-gray-700">テレアポ</span>
                    </div>
                    <p className="text-2xl font-bold text-blue-600">{teleapoCvRate}%</p>
                    <p className="text-xs text-gray-500">
                      {teleapoCompleted.length} / {teleapoDeals.length} 件
                    </p>
                  </div>
                  <div className="text-center p-3 bg-white rounded-lg shadow-sm">
                    <div className="flex items-center justify-center mb-1">
                      <FileText className="w-4 h-4 text-gray-500 mr-1" />
                      <span className="text-xs font-medium text-gray-700">資料送付</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-600">{shiryouCvRate}%</p>
                    <p className="text-xs text-gray-500">
                      {shiryouCompleted.length} / {shiryouDeals.length} 件
                    </p>
                  </div>
                  <div className="text-center p-3 bg-white rounded-lg shadow-sm">
                    <div className="flex items-center justify-center mb-1">
                      <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
                      <span className="text-xs font-medium text-gray-700">全体</span>
                    </div>
                    <p className="text-2xl font-bold text-green-600">{totalSalesCvRate}%</p>
                    <p className="text-xs text-gray-500">
                      {completedDeals.length} 件成約
                    </p>
                  </div>
                </div>
                {teleapoCvRate > shiryouCvRate && teleapoDeals.length >= 3 && (
                  <div className="mt-3 p-2 bg-blue-100 rounded-lg">
                    <p className="text-xs text-blue-800 font-medium flex items-center">
                      <Phone className="w-3 h-3 mr-1" />
                      テレアポは資料送付より成約率が{teleapoCvRate - shiryouCvRate}%高い！電話でのアプローチを強化しましょう。
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* グラフエリア */}
          <div className="grid md:grid-cols-2 gap-6 mb-6">
            {/* カテゴリ円グラフ */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">カテゴリ別（今月）</CardTitle>
              </CardHeader>
              <CardContent>
                {categoryData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={categoryData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, percent }) =>
                          `${name} ${((percent || 0) * 100).toFixed(0)}%`
                        }
                        labelLine={false}
                      >
                        {categoryData.map((_, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={COLORS[index % COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[250px] flex items-center justify-center text-gray-500">
                    今月のデータがありません
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 月次推移棒グラフ */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">月次投稿推移（過去6ヶ月）</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={monthlyData}>
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="count" name="投稿数" fill="#3B82F6" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* 重大度分布 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">重大度分布（今月）</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={severityData} layout="vertical">
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 12 }}
                      width={30}
                    />
                    <Tooltip />
                    <Bar
                      dataKey="value"
                      name="件数"
                      fill="#8B5CF6"
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* ヒートマップ */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">曜日×時間帯（今月）</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="p-2"></th>
                        {TIME_SLOTS.map((ts) => (
                          <th
                            key={ts.value}
                            className="p-2 text-xs font-normal text-gray-600"
                          >
                            {ts.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {DAY_NAMES.map((day, dayIndex) => (
                        <tr key={day}>
                          <td className="p-2 text-xs text-gray-600">{day}</td>
                          {TIME_SLOTS.map((_, timeIndex) => {
                            const value = heatmapData[dayIndex][timeIndex];
                            const intensity = value / maxHeatValue;
                            return (
                              <td key={timeIndex} className="p-1">
                                <div
                                  className="w-full h-8 rounded flex items-center justify-center text-xs font-medium"
                                  style={{
                                    backgroundColor:
                                      value === 0
                                        ? '#f3f4f6'
                                        : `rgba(59, 130, 246, ${0.2 + intensity * 0.8})`,
                                    color: intensity > 0.5 ? 'white' : '#374151',
                                  }}
                                >
                                  {value > 0 ? value : ''}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* テストランボーナス告知 */}
          <Card className="mb-6 bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-200">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-amber-100 rounded-xl">
                  <Gift className="w-8 h-8 text-amber-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-amber-900 mb-2">
                    1月末テストラン開催中！
                  </h3>
                  <p className="text-sm text-amber-800 mb-4">
                    たくさん投稿してポイントを稼ごう！上位入賞でボーナスゲット！
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white/80 rounded-xl p-3 text-center border border-amber-200">
                      <div className="text-2xl mb-1">🥇</div>
                      <p className="text-xs text-gray-600">1位</p>
                      <p className="font-bold text-amber-700">5,000円</p>
                      <p className="text-xs text-amber-600">+ポイント分</p>
                    </div>
                    <div className="bg-white/80 rounded-xl p-3 text-center border border-amber-200">
                      <div className="text-2xl mb-1">🥈</div>
                      <p className="text-xs text-gray-600">2位</p>
                      <p className="font-bold text-amber-700">3,000円</p>
                    </div>
                    <div className="bg-white/80 rounded-xl p-3 text-center border border-amber-200">
                      <div className="text-2xl mb-1">🥉</div>
                      <p className="text-xs text-gray-600">3位</p>
                      <p className="font-bold text-amber-700">1,000円</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ランキング（上位10） */}
          <Card className="mb-6">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center">
                <Trophy className="w-5 h-5 text-yellow-500 mr-2" />
                今月のランキング TOP 10
              </CardTitle>
              <Link href="/rankings" className="text-sm text-blue-600 hover:underline flex items-center">
                詳細 <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </CardHeader>
            <CardContent>
              {topUsers.length > 0 ? (
                <div className="space-y-2">
                  {topUsers.map((userStat, index) => (
                    <div
                      key={userStat.userId}
                      className={`flex items-center p-3 rounded-lg ${
                        userStat.userId === user?.id ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'
                      }`}
                    >
                      <div className="w-8 text-center">
                        {index === 0 ? (
                          <span className="text-xl">🥇</span>
                        ) : index === 1 ? (
                          <span className="text-xl">🥈</span>
                        ) : index === 2 ? (
                          <span className="text-xl">🥉</span>
                        ) : (
                          <span className="text-gray-500 font-medium">{index + 1}</span>
                        )}
                      </div>
                      <div className="flex-1 ml-3">
                        <p className="font-medium text-gray-900">
                          {userStat.userName || '名前未設定'}
                          {userStat.userId === user?.id && (
                            <Badge variant="info" className="ml-2">
                              あなた
                            </Badge>
                          )}
                        </p>
                        <p className="text-xs text-gray-500">
                          {userStat.branchName} · 投稿{userStat.count}件
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-blue-600">{userStat.points} pt</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-gray-500 py-8">
                  今月の投稿がありません
                </p>
              )}
            </CardContent>
          </Card>

          {/* みんなのヒヤリハット */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Users className="w-5 h-5 text-gray-500 mr-2" />
                みんなのヒヤリハット
              </CardTitle>
            </CardHeader>
            <CardContent>
              {allIncidents.length > 0 ? (
                <div className="space-y-3">
                  {allIncidents.slice(0, 10).map((incident) => (
                    <Link
                      key={incident.id}
                      href={`/incident/${incident.id}`}
                      className="block p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge
                              variant={incident.severity >= 4 ? 'danger' : 'default'}
                            >
                              重大度 {incident.severity}
                            </Badge>
                            <Badge variant="info">{incident.category}</Badge>
                            {incident.userId === user?.id && (
                              <Badge variant="success">自分</Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-700 line-clamp-2">
                            {incident.body}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {incident.userName || '名前未設定'} · {incident.date} {incident.timeSlot}
                          </p>
                        </div>
                        <div className="ml-4 text-right">
                          <p className="font-bold text-blue-600">
                            {incident.scoreTotal} pt
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500 mb-4">まだ投稿がありません</p>
                  <Link href="/submit">
                    <Button>
                      <Plus className="w-4 h-4 mr-1" />
                      最初の投稿をする
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      {/* モバイル用固定投稿ボタン */}
      <div className="fixed bottom-4 right-4 md:hidden">
        <Link href="/submit">
          <Button size="lg" className="rounded-full w-14 h-14 shadow-lg">
            <Plus className="w-6 h-6" />
          </Button>
        </Link>
      </div>
    </>
  );
}
