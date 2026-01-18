'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { DEFAULT_TENANT_ID } from '@/lib/firebase';
import {
  getIncidentsByUser,
  getMonthlyUserStats,
  getBranches,
} from '@/lib/firestore';
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
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [myIncidents, setMyIncidents] = useState<Incident[]>([]);
  const [myStats, setMyStats] = useState<MonthlyUserStats | null>(null);
  const [topUsers, setTopUsers] = useState<MonthlyUserStats[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [monthlyData, setMonthlyData] = useState<{ month: string; count: number; points: number }[]>([]);

  const currentMonthKey = getMonthKey();

  useEffect(() => {
    const fetchData = async () => {
      if (!profile) return;

      try {
        const [incidentsData, branchesData, allUserStats] = await Promise.all([
          getIncidentsByUser(profile?.id, 100),
          getBranches(),
          getMonthlyUserStats(DEFAULT_TENANT_ID, currentMonthKey),
        ]);

        setMyIncidents(incidentsData);
        setBranches(branchesData);

        // 自分の今月の統計
        const myStatsData = allUserStats.find((s) => s.userId === profile?.id);
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
          const userStat = stats.find((s) => s.userId === profile?.id);
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
  }, [profile, currentMonthKey]);

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
                        userStat.userId === profile?.id ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'
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
                          {userStat.userId === profile?.id && (
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

          {/* 最近の投稿 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="w-5 h-5 text-gray-500 mr-2" />
                最近の投稿
              </CardTitle>
            </CardHeader>
            <CardContent>
              {myIncidents.length > 0 ? (
                <div className="space-y-3">
                  {myIncidents.slice(0, 5).map((incident) => (
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
                            {incident.fraudFlag && (
                              <Badge variant="warning">要確認</Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-700 line-clamp-1">
                            {incident.body}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {incident.date} {incident.timeSlot}
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
                  {myIncidents.length > 5 && (
                    <p className="text-center text-sm text-gray-500">
                      他 {myIncidents.length - 5} 件の投稿
                    </p>
                  )}
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
