'use client';

import { useState, useEffect, useCallback } from 'react';
import { Trophy, TrendingUp, Award, Star, ChevronLeft, ChevronRight } from 'lucide-react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import {
  getPointHistory,
  getUserTotalPoints,
  getUserMonthlyPoints,
  getMonthlyUserRanking,
  getMonthlyFacilityRanking,
} from '@/lib/repositories/points';
import {
  PointLedger,
  MonthlyUserStats,
  MonthlyFacilityStats,
  POINT_SOURCE_LABELS,
  PointSourceType,
} from '@/types/database';
import { formatDateJP, getMonthKey, getPastMonthKeys } from '@/lib/utils';

type ViewTab = 'myPoints' | 'userRanking' | 'facilityRanking';

function PointsPageContent() {
  const { profile, organization, facility, isManagerOrAbove } = useSupabaseAuth();
  const [activeTab, setActiveTab] = useState<ViewTab>('myPoints');
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(getMonthKey());

  // 自分のポイント関連
  const [totalPoints, setTotalPoints] = useState(0);
  const [monthlyPoints, setMonthlyPoints] = useState(0);
  const [pointHistory, setPointHistory] = useState<PointLedger[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyCount, setHistoryCount] = useState(0);

  // ランキング関連
  const [userRanking, setUserRanking] = useState<MonthlyUserStats[]>([]);
  const [facilityRanking, setFacilityRanking] = useState<MonthlyFacilityStats[]>([]);

  const monthOptions = getPastMonthKeys(12).map((key) => ({
    value: key,
    label: `${key.substring(0, 4)}年${parseInt(key.substring(4))}月`,
  }));

  const fetchMyPoints = useCallback(async () => {
    if (!profile) return;

    setLoading(true);
    try {
      const [total, monthly, history] = await Promise.all([
        getUserTotalPoints(profile.id),
        getUserMonthlyPoints(profile.id, selectedMonth),
        getPointHistory({ user_id: profile.id }, historyPage, 20),
      ]);

      setTotalPoints(total);
      setMonthlyPoints(monthly);
      setPointHistory(history.data);
      setHistoryCount(history.count);
    } catch (error) {
      console.error('Error fetching points:', error);
    } finally {
      setLoading(false);
    }
  }, [profile, selectedMonth, historyPage]);

  const fetchUserRanking = useCallback(async () => {
    if (!organization) return;

    setLoading(true);
    try {
      const ranking = await getMonthlyUserRanking(
        organization.id,
        selectedMonth,
        !isManagerOrAbove ? facility?.id : undefined,
        20
      );
      setUserRanking(ranking);
    } catch (error) {
      console.error('Error fetching user ranking:', error);
    } finally {
      setLoading(false);
    }
  }, [organization, facility, selectedMonth, isManagerOrAbove]);

  const fetchFacilityRanking = useCallback(async () => {
    if (!organization) return;

    setLoading(true);
    try {
      const ranking = await getMonthlyFacilityRanking(organization.id, selectedMonth, 20);
      setFacilityRanking(ranking);
    } catch (error) {
      console.error('Error fetching facility ranking:', error);
    } finally {
      setLoading(false);
    }
  }, [organization, selectedMonth]);

  useEffect(() => {
    if (activeTab === 'myPoints') {
      fetchMyPoints();
    } else if (activeTab === 'userRanking') {
      fetchUserRanking();
    } else if (activeTab === 'facilityRanking') {
      fetchFacilityRanking();
    }
  }, [activeTab, fetchMyPoints, fetchUserRanking, fetchFacilityRanking]);

  const getSourceIcon = (sourceType: PointSourceType) => {
    switch (sourceType) {
      case 'incident_report':
        return '📋';
      case 'idea_submission':
      case 'idea_adopted':
      case 'idea_implemented':
        return '💡';
      case 'approval_submission':
      case 'approval_approved':
        return '📝';
      case 'bonus':
        return '🎁';
      case 'adjustment':
        return '⚖️';
      default:
        return '•';
    }
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1) return <Trophy className="w-5 h-5 text-yellow-500" />;
    if (rank === 2) return <Trophy className="w-5 h-5 text-gray-400" />;
    if (rank === 3) return <Trophy className="w-5 h-5 text-amber-600" />;
    return <span className="w-5 h-5 flex items-center justify-center text-sm text-gray-500">{rank}</span>;
  };

  const historyPageSize = 20;
  const historyTotalPages = Math.ceil(historyCount / historyPageSize);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* ヘッダー */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">ポイント台帳</h1>
        <p className="text-sm text-gray-500 mt-1">
          活動によって獲得したポイントを確認できます
        </p>
      </div>

      {/* タブ */}
      <div className="flex items-center gap-4 mb-6 border-b">
        <button
          onClick={() => setActiveTab('myPoints')}
          className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'myPoints'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          マイポイント
        </button>
        <button
          onClick={() => setActiveTab('userRanking')}
          className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'userRanking'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          個人ランキング
        </button>
        {isManagerOrAbove && (
          <button
            onClick={() => setActiveTab('facilityRanking')}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'facilityRanking'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            事業所ランキング
          </button>
        )}
      </div>

      {/* 月選択 */}
      <div className="mb-6">
        <Select
          label="対象月"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          options={monthOptions}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <>
          {/* マイポイント */}
          {activeTab === 'myPoints' && (
            <div className="space-y-6">
              {/* サマリーカード */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
                  <CardContent className="py-6">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-white/20 rounded-lg">
                        <Star className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-sm text-blue-100">累計ポイント</p>
                        <p className="text-3xl font-bold">{totalPoints.toLocaleString()}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
                  <CardContent className="py-6">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-white/20 rounded-lg">
                        <TrendingUp className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-sm text-green-100">今月のポイント</p>
                        <p className="text-3xl font-bold">{monthlyPoints.toLocaleString()}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* ポイント履歴 */}
              <Card>
                <CardHeader>
                  <CardTitle>ポイント履歴</CardTitle>
                </CardHeader>
                <CardContent>
                  {pointHistory.length === 0 ? (
                    <p className="text-sm text-gray-500 py-4 text-center">
                      ポイント履歴はありません
                    </p>
                  ) : (
                    <>
                      <div className="space-y-3">
                        {pointHistory.map((point) => (
                          <div
                            key={point.id}
                            className="flex items-center justify-between py-2 border-b last:border-b-0"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-xl">
                                {getSourceIcon(point.source_type)}
                              </span>
                              <div>
                                <p className="text-sm font-medium text-gray-900">
                                  {point.reason}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {POINT_SOURCE_LABELS[point.source_type]} • {formatDateJP(point.created_at)}
                                </p>
                              </div>
                            </div>
                            <span
                              className={`text-lg font-bold ${
                                point.points > 0 ? 'text-green-600' : 'text-red-600'
                              }`}
                            >
                              {point.points > 0 ? '+' : ''}
                              {point.points}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* ページネーション */}
                      {historyTotalPages > 1 && (
                        <div className="flex items-center justify-between mt-4 pt-4 border-t">
                          <p className="text-sm text-gray-500">
                            {historyCount}件中 {(historyPage - 1) * historyPageSize + 1}〜
                            {Math.min(historyPage * historyPageSize, historyCount)}件を表示
                          </p>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                              disabled={historyPage === 1}
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </Button>
                            <span className="text-sm text-gray-600">
                              {historyPage} / {historyTotalPages}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
                              disabled={historyPage === historyTotalPages}
                            >
                              <ChevronRight className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* 個人ランキング */}
          {activeTab === 'userRanking' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-yellow-500" />
                  今月の個人ランキング
                </CardTitle>
              </CardHeader>
              <CardContent>
                {userRanking.length === 0 ? (
                  <p className="text-sm text-gray-500 py-4 text-center">
                    ランキングデータがありません
                  </p>
                ) : (
                  <div className="space-y-2">
                    {userRanking.map((user, index) => (
                      <div
                        key={user.user_id}
                        className={`flex items-center gap-4 p-3 rounded-lg ${
                          index < 3 ? 'bg-yellow-50' : 'bg-gray-50'
                        } ${user.user_id === profile?.id ? 'ring-2 ring-blue-500' : ''}`}
                      >
                        <div className="w-8 flex justify-center">
                          {getRankBadge(index + 1)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">
                            {user.user_name}
                            {user.user_id === profile?.id && (
                              <Badge variant="info" className="ml-2">
                                あなた
                              </Badge>
                            )}
                          </p>
                          <p className="text-xs text-gray-500">
                            {user.facility_name} • 報告 {user.incident_count}件 • アイデア {user.idea_count}件
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-blue-600">
                            {user.total_points.toLocaleString()}
                          </p>
                          <p className="text-xs text-gray-500">ポイント</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* 事業所ランキング */}
          {activeTab === 'facilityRanking' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-yellow-500" />
                  今月の事業所ランキング
                </CardTitle>
              </CardHeader>
              <CardContent>
                {facilityRanking.length === 0 ? (
                  <p className="text-sm text-gray-500 py-4 text-center">
                    ランキングデータがありません
                  </p>
                ) : (
                  <div className="space-y-2">
                    {facilityRanking.map((fac, index) => (
                      <div
                        key={fac.facility_id}
                        className={`flex items-center gap-4 p-3 rounded-lg ${
                          index < 3 ? 'bg-yellow-50' : 'bg-gray-50'
                        } ${fac.facility_id === facility?.id ? 'ring-2 ring-blue-500' : ''}`}
                      >
                        <div className="w-8 flex justify-center">
                          {getRankBadge(index + 1)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">
                            {fac.facility_name}
                            {fac.facility_id === facility?.id && (
                              <Badge variant="info" className="ml-2">
                                あなたの事業所
                              </Badge>
                            )}
                          </p>
                          <p className="text-xs text-gray-500">
                            アクティブ {fac.active_users}名 • 報告 {fac.incident_count}件 • アイデア {fac.idea_count}件
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-blue-600">
                            {fac.total_points.toLocaleString()}
                          </p>
                          <p className="text-xs text-gray-500">ポイント</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export default function PointsPage() {
  return (
    <AuthGuard>
      <PointsPageContent />
    </AuthGuard>
  );
}
