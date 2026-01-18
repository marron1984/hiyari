'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_TENANT_ID } from '@/lib/firebase';
import {
  getMonthlyUserStats,
  getMonthlyBranchStats,
  getBranches,
} from '@/lib/firestore';
import { getMonthKey, formatMonthKey, getPastMonthKeys } from '@/lib/utils';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardHeader, CardTitle, CardContent, Badge, Select } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { MonthlyUserStats, MonthlyBranchStats, Branch } from '@/types';
import { Trophy, Building, User, TrendingUp } from 'lucide-react';

export default function RankingsPage() {
  return (
    <AuthGuard>
      <RankingsContent />
    </AuthGuard>
  );
}

function RankingsContent() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(getMonthKey());
  const [activeTab, setActiveTab] = useState<'user' | 'branch'>('user');
  const [userStats, setUserStats] = useState<MonthlyUserStats[]>([]);
  const [branchStats, setBranchStats] = useState<MonthlyBranchStats[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  const monthOptions = getPastMonthKeys(12).map((key) => ({
    value: key,
    label: formatMonthKey(key),
  }));

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [userStatsData, branchStatsData, branchesData] = await Promise.all([
          getMonthlyUserStats(DEFAULT_TENANT_ID, selectedMonth),
          getMonthlyBranchStats(DEFAULT_TENANT_ID, selectedMonth),
          getBranches(),
        ]);

        setBranches(branchesData);

        // ユーザーランキング（ポイント降順、同点は suggestionsCount → avgBodyLength → count）
        const sortedUsers = [...userStatsData]
          .sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            if (b.suggestionsCount !== a.suggestionsCount)
              return b.suggestionsCount - a.suggestionsCount;
            if (b.avgBodyLength !== a.avgBodyLength)
              return b.avgBodyLength - a.avgBodyLength;
            return b.count - a.count;
          })
          .map((s) => ({
            ...s,
            branchName: branchesData.find((b) => b.id === s.branchId)?.name,
          }));
        setUserStats(sortedUsers);

        // 事業所ランキング（ポイント降順）
        const sortedBranches = [...branchStatsData]
          .map((s) => ({
            ...s,
            branchName:
              branchesData.find((b) => b.id === s.branchId)?.name || s.branchName,
            headcount:
              branchesData.find((b) => b.id === s.branchId)?.headcount ||
              s.headcount,
            postRate:
              s.headcount > 0
                ? s.count /
                  (branchesData.find((b) => b.id === s.branchId)?.headcount ||
                    s.headcount)
                : 0,
          }))
          .sort((a, b) => b.points - a.points);
        setBranchStats(sortedBranches);
      } catch (error) {
        console.error('Failed to fetch ranking data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedMonth]);

  // ランク計算（同点は同順位）
  const getRank = (stats: { points: number }[], index: number): number => {
    if (index === 0) return 1;
    if (stats[index].points === stats[index - 1].points) {
      return getRank(stats, index - 1);
    }
    return index + 1;
  };

  const getRankEmoji = (rank: number): string | null => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return null;
  };

  return (
    <>
      <Header />
      <main className="pb-8">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-bold text-gray-900 flex items-center">
              <Trophy className="w-6 h-6 text-yellow-500 mr-2" />
              ランキング
            </h1>
            <div className="w-40">
              <Select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                options={monthOptions}
              />
            </div>
          </div>

          {/* タブ */}
          <div className="flex border-b border-gray-200 mb-6">
            <button
              onClick={() => setActiveTab('user')}
              className={`flex-1 py-3 text-center font-medium border-b-2 transition-colors ${
                activeTab === 'user'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <User className="w-4 h-4 inline mr-1" />
              個人ランキング
            </button>
            <button
              onClick={() => setActiveTab('branch')}
              className={`flex-1 py-3 text-center font-medium border-b-2 transition-colors ${
                activeTab === 'branch'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Building className="w-4 h-4 inline mr-1" />
              事業所ランキング
            </button>
          </div>

          {loading ? (
            <Loading text="読み込み中..." />
          ) : activeTab === 'user' ? (
            /* 個人ランキング */
            <Card>
              <CardContent className="p-0">
                {userStats.length > 0 ? (
                  <div className="divide-y divide-gray-100">
                    {userStats.map((stat, index) => {
                      const rank = getRank(userStats, index);
                      const emoji = getRankEmoji(rank);
                      const isCurrentUser = stat.userId === user?.id;

                      return (
                        <div
                          key={stat.userId}
                          className={`flex items-center p-4 ${
                            isCurrentUser ? 'bg-blue-50' : ''
                          }`}
                        >
                          <div className="w-12 text-center">
                            {emoji ? (
                              <span className="text-2xl">{emoji}</span>
                            ) : (
                              <span className="text-lg font-bold text-gray-400">
                                {rank}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 ml-3">
                            <div className="flex items-center">
                              <p className="font-medium text-gray-900">
                                {stat.userName || '名前未設定'}
                              </p>
                              {isCurrentUser && (
                                <Badge variant="info" className="ml-2">
                                  あなた
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-gray-500">
                              {stat.branchName}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xl font-bold text-blue-600">
                              {stat.points}
                              <span className="text-sm text-gray-500 ml-1">pt</span>
                            </p>
                            <div className="flex items-center justify-end text-xs text-gray-500 mt-1">
                              <span className="mr-2">{stat.count}件</span>
                              <span className="mr-2">提案{stat.suggestionsCount}</span>
                              <span>平均{stat.avgBodyLength}字</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    この月のデータがありません
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            /* 事業所ランキング */
            <Card>
              <CardContent className="p-0">
                {branchStats.length > 0 ? (
                  <div className="divide-y divide-gray-100">
                    {branchStats.map((stat, index) => {
                      const rank = getRank(branchStats, index);
                      const emoji = getRankEmoji(rank);

                      return (
                        <div key={stat.branchId} className="flex items-center p-4">
                          <div className="w-12 text-center">
                            {emoji ? (
                              <span className="text-2xl">{emoji}</span>
                            ) : (
                              <span className="text-lg font-bold text-gray-400">
                                {rank}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 ml-3">
                            <p className="font-medium text-gray-900">
                              {stat.branchName}
                            </p>
                            <p className="text-sm text-gray-500">
                              在籍 {stat.headcount}名
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-xl font-bold text-blue-600">
                              {stat.points}
                              <span className="text-sm text-gray-500 ml-1">pt</span>
                            </p>
                            <div className="flex items-center justify-end text-xs text-gray-500 mt-1">
                              <span className="mr-2">{stat.count}件</span>
                              <span>
                                投稿率 {(stat.postRate * 100).toFixed(0)}%
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    この月のデータがありません
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* 凡例 */}
          <div className="mt-6 text-sm text-gray-500">
            <p className="font-medium mb-2">順位決定ルール</p>
            {activeTab === 'user' ? (
              <ol className="list-decimal list-inside space-y-1">
                <li>ポイント合計（高い順）</li>
                <li>再発防止提案数（多い順）</li>
                <li>平均本文文字数（多い順）</li>
                <li>投稿件数（多い順）</li>
                <li>上記すべて同じ場合は同順位</li>
              </ol>
            ) : (
              <ol className="list-decimal list-inside space-y-1">
                <li>ポイント合計（高い順）</li>
                <li>投稿件数（多い順）</li>
                <li>投稿率（高い順）</li>
              </ol>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
