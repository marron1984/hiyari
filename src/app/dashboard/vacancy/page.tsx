'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Button, Card, Badge } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { hasMinRole } from '@/lib/auth';
import {
  Building2,
  RefreshCw,
  Clock,
  AlertTriangle,
  TrendingUp,
  Lock,
  Home,
  Wrench,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Filter,
} from 'lucide-react';
import Link from 'next/link';

// ===== 型定義 =====

interface FacilityMetrics {
  id: string;
  name: string;
  area: string;
  capacity: number;
  available: number;
  locked: number;
  occupied: number;
  maintenance: number;
  unknown: number;
  occupancyRate: number | null;
  vacancyRate: number | null;
  lastUpdated: string | null;
  lastUpdatedBy: string | null;
}

interface LockedRoom {
  id: string;
  buildingName: string;
  roomNumber: string;
  lockedCaseId: string | null;
  lockedByName: string | null;
  lockedAt: string | null;
}

interface Warning {
  label: string;
  code: string;
  message: string;
}

interface VacancyMetrics {
  success: boolean;
  summary: {
    totalRooms: number;
    available: number;
    locked: number;
    occupied: number;
    maintenance: number;
    unknown: number;
    occupancyRate: number | null;
    vacancyRate: number | null;
  };
  facilities: FacilityMetrics[];
  lockedRooms: LockedRoom[];
  updatedAt: string;
  warnings: Warning[];
  debug?: {
    roomsQueried: number;
    facilitiesQueried: number;
    unknownStatuses: string[];
    rawStatusCounts: Record<string, number>;
  };
}

// ===== フィルタタイプ =====
type StatusFilter = 'all' | 'available' | 'locked' | 'occupied' | 'maintenance' | 'lowOccupancy';

// ===== ユーティリティ =====

// 表示用（nullは'--'）
function displayRate(rate: number | null): string {
  if (rate === null || rate === undefined) return '--';
  return `${rate}%`;
}

function displayCount(count: number | null): string {
  if (count === null || count === undefined) return '--';
  return count.toString();
}

// 稼働率に応じた色
function getOccupancyColor(rate: number | null): { bg: string; text: string; border: string } {
  if (rate === null) return { bg: 'bg-gray-50', text: 'text-gray-500', border: 'border-gray-200' };
  if (rate >= 95) return { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' };
  if (rate >= 85) return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
  if (rate >= 70) return { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' };
  return { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' };
}

// 稼働率バー
function OccupancyBar({ rate }: { rate: number | null }) {
  if (rate === null) {
    return (
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className="h-full bg-gray-300 w-0" />
      </div>
    );
  }
  const color = rate >= 95 ? 'bg-green-500' : rate >= 85 ? 'bg-blue-500' : rate >= 70 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
      <div className={`h-full ${color} transition-all`} style={{ width: `${rate}%` }} />
    </div>
  );
}

// 時刻フォーマット
function formatTime(dateStr: string | null): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleString('ja-JP', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ===== メインコンポーネント =====

export default function VacancyPage() {
  const { user, firebaseUser } = useAuth();
  const [metrics, setMetrics] = useState<VacancyMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // フィルタ
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showLockedRooms, setShowLockedRooms] = useState(true);

  // デバッグモード
  const [debugMode, setDebugMode] = useState(false);

  // 自動更新タイマー
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const AUTO_REFRESH_INTERVAL = 60000; // 60秒

  const isAdmin = hasMinRole(user?.role, 'admin');

  // APIからデータ取得
  const fetchMetrics = useCallback(async (showLoadingState = true) => {
    if (!firebaseUser) return;

    if (showLoadingState) {
      setRefreshing(true);
    }
    setError(null);

    try {
      const token = await firebaseUser.getIdToken();

      const url = debugMode
        ? '/api/vacancy/metrics?debug=1'
        : '/api/vacancy/metrics';

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data: VacancyMetrics = await response.json();

      if (!data.success) {
        throw new Error('データ取得に失敗しました');
      }

      setMetrics(data);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Vacancy metrics fetch error:', err);
      setError(err instanceof Error ? err.message : 'データの取得に失敗しました');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [firebaseUser, debugMode]);

  // 初回ロード & デバッグモード変更時
  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  // 自動更新
  useEffect(() => {
    timerRef.current = setInterval(() => {
      fetchMetrics(false);
    }, AUTO_REFRESH_INTERVAL);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [fetchMetrics]);

  // URLパラメータからデバッグモード検出
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('debug') === '1' && isAdmin) {
        setDebugMode(true);
      }
    }
  }, [isAdmin]);

  // 手動更新
  const handleRefresh = () => {
    fetchMetrics(true);
  };

  // フィルタされた施設リスト
  const filteredFacilities = metrics?.facilities.filter((f) => {
    switch (statusFilter) {
      case 'available':
        return f.available > 0;
      case 'locked':
        return f.locked > 0;
      case 'occupied':
        return f.occupied > 0;
      case 'maintenance':
        return f.maintenance > 0;
      case 'lowOccupancy':
        return f.occupancyRate !== null && f.occupancyRate < 70;
      default:
        return true;
    }
  }) || [];

  // 低稼働施設
  const lowOccupancyFacilities = metrics?.facilities.filter(
    (f) => f.occupancyRate !== null && f.occupancyRate < 70
  ) || [];

  if (loading) {
    return <Loading />;
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <Header />

        <main className="max-w-4xl mx-auto px-4 py-6">
          {/* ヘッダー */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Building2 className="w-6 h-6" />
                空室・稼働状況
              </h1>
              {lastUpdated && (
                <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  最終更新: {formatTime(lastUpdated.toISOString())}
                </p>
              )}
            </div>
            <Button
              variant="secondary"
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              更新
            </Button>
          </div>

          {/* エラーバナー */}
          {error && (
            <Card className="p-4 mb-6 bg-red-50 border border-red-200">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-red-800">データ取得エラー</p>
                  <p className="text-sm text-red-700 mt-1">{error}</p>
                </div>
                <Button
                  variant="secondary"
                  onClick={handleRefresh}
                  className="text-sm"
                >
                  再試行
                </Button>
              </div>
            </Card>
          )}

          {/* 警告バナー */}
          {metrics?.warnings && metrics.warnings.length > 0 && (
            <Card className="p-4 mb-6 bg-yellow-50 border border-yellow-200">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-800">警告</p>
                  {metrics.warnings.map((w, i) => (
                    <p key={i} className="text-sm text-yellow-700 mt-1">
                      [{w.label}] {w.message}
                    </p>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {/* サマリーカード */}
          {metrics && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {/* 全体稼働率 */}
              <Card className={`p-4 ${getOccupancyColor(metrics.summary.occupancyRate).bg} border ${getOccupancyColor(metrics.summary.occupancyRate).border}`}>
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-gray-600" />
                  <span className="text-xs font-medium text-gray-600">稼働率</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className={`text-2xl font-bold ${getOccupancyColor(metrics.summary.occupancyRate).text}`}>
                    {displayRate(metrics.summary.occupancyRate)}
                  </span>
                </div>
                <div className="mt-2">
                  <OccupancyBar rate={metrics.summary.occupancyRate} />
                </div>
              </Card>

              {/* 空室数 */}
              <Card className="p-4 bg-blue-50 border border-blue-200">
                <div className="flex items-center gap-2 mb-2">
                  <Home className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-medium text-gray-600">空室</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-blue-600">
                    {displayCount(metrics.summary.available)}
                  </span>
                  <span className="text-gray-500 text-sm">室</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">即入居可</p>
              </Card>

              {/* ロック数 */}
              <Card className="p-4 bg-purple-50 border border-purple-200">
                <div className="flex items-center gap-2 mb-2">
                  <Lock className="w-4 h-4 text-purple-600" />
                  <span className="text-xs font-medium text-gray-600">ロック</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-purple-600">
                    {displayCount(metrics.summary.locked)}
                  </span>
                  <span className="text-gray-500 text-sm">室</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">申込中</p>
              </Card>

              {/* 入居中 */}
              <Card className="p-4 bg-green-50 border border-green-200">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="w-4 h-4 text-green-600" />
                  <span className="text-xs font-medium text-gray-600">入居中</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-green-600">
                    {displayCount(metrics.summary.occupied)}
                  </span>
                  <span className="text-gray-500 text-sm">室</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">/ {displayCount(metrics.summary.totalRooms)}室</p>
              </Card>
            </div>
          )}

          {/* フィルタチップ */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <Filter className="w-4 h-4 text-gray-400" />
            {[
              { key: 'all', label: '全て', count: metrics?.facilities.length },
              { key: 'available', label: '空室あり', count: metrics?.facilities.filter(f => f.available > 0).length },
              { key: 'locked', label: 'ロックあり', count: metrics?.facilities.filter(f => f.locked > 0).length },
              { key: 'maintenance', label: '修繕中', count: metrics?.facilities.filter(f => f.maintenance > 0).length },
              { key: 'lowOccupancy', label: '低稼働', count: lowOccupancyFacilities.length },
            ].map((chip) => (
              <button
                key={chip.key}
                onClick={() => setStatusFilter(chip.key as StatusFilter)}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  statusFilter === chip.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {chip.label}
                {chip.count !== undefined && (
                  <span className="ml-1 opacity-75">({chip.count})</span>
                )}
              </button>
            ))}
          </div>

          {/* 低稼働アラート */}
          {lowOccupancyFacilities.length > 0 && statusFilter === 'all' && (
            <Card className="p-4 mb-6 bg-red-50 border border-red-200">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-800">入居促進が必要な施設</p>
                  <p className="text-sm text-red-700 mt-1">
                    {lowOccupancyFacilities.map(f => f.name).join('、')} の稼働率が70%を下回っています
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* ロック済み部屋 */}
          {metrics && metrics.lockedRooms.length > 0 && (
            <Card className="mb-6 border border-purple-200">
              <button
                onClick={() => setShowLockedRooms(!showLockedRooms)}
                className="w-full p-4 flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-2">
                  <Lock className="w-5 h-5 text-purple-600" />
                  <span className="font-medium text-purple-800">
                    ロック中の部屋（{metrics.lockedRooms.length}室）
                  </span>
                </div>
                {showLockedRooms ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </button>
              {showLockedRooms && (
                <div className="px-4 pb-4">
                  <p className="text-sm text-gray-600 mb-3">
                    入居希望者の申込によりロックされている部屋です
                  </p>
                  <div className="space-y-2">
                    {metrics.lockedRooms.map((room) => (
                      <div
                        key={room.id}
                        className="flex items-center justify-between p-3 bg-purple-50 rounded-lg"
                      >
                        <div>
                          <span className="font-medium text-purple-800">
                            {room.buildingName} {room.roomNumber}
                          </span>
                          {room.lockedByName && (
                            <span className="text-xs text-purple-600 ml-2">
                              by {room.lockedByName}
                            </span>
                          )}
                          {room.lockedAt && (
                            <span className="text-xs text-gray-500 ml-2">
                              ({formatTime(room.lockedAt)}〜)
                            </span>
                          )}
                        </div>
                        {room.lockedCaseId && (
                          <Link
                            href={`/dashboard/prospects/${room.lockedCaseId}`}
                            className="text-sm text-purple-600 hover:underline"
                          >
                            詳細
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* 施設一覧テーブル */}
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      施設
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      稼働率
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <Home className="w-3 h-3 inline mr-1" />空室
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <Lock className="w-3 h-3 inline mr-1" />ロック
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <Building2 className="w-3 h-3 inline mr-1" />入居
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <Wrench className="w-3 h-3 inline mr-1" />修繕
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredFacilities.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                        {statusFilter === 'all' ? '施設データがありません' : '該当する施設がありません'}
                      </td>
                    </tr>
                  ) : (
                    filteredFacilities.map((facility) => {
                      const colors = getOccupancyColor(facility.occupancyRate);
                      return (
                        <tr key={facility.id} className="hover:bg-gray-50">
                          <td className="px-4 py-4">
                            <div className="font-medium text-gray-900">{facility.name}</div>
                            {facility.area && (
                              <div className="text-xs text-gray-500">{facility.area}</div>
                            )}
                            {facility.lastUpdated && (
                              <div className="text-xs text-gray-400 mt-1">
                                更新: {formatTime(facility.lastUpdated)}
                                {facility.lastUpdatedBy && ` (${facility.lastUpdatedBy})`}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-4 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <span className={`text-lg font-bold ${colors.text}`}>
                                {displayRate(facility.occupancyRate)}
                              </span>
                              <div className="w-16">
                                <OccupancyBar rate={facility.occupancyRate} />
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-center">
                            {facility.available > 0 ? (
                              <Badge variant="info" className="min-w-[2rem]">
                                {facility.available}
                              </Badge>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-center">
                            {facility.locked > 0 ? (
                              <Badge variant="default" className="min-w-[2rem]">
                                {facility.locked}
                              </Badge>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-4 text-center">
                            <span className="font-medium text-gray-700">
                              {facility.occupied}
                            </span>
                            <span className="text-gray-400 text-xs ml-1">
                              /{facility.capacity || (facility.available + facility.locked + facility.occupied + facility.maintenance)}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-center">
                            {facility.maintenance > 0 ? (
                              <Badge variant="warning" className="min-w-[2rem]">
                                {facility.maintenance}
                              </Badge>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* デバッグパネル */}
          {debugMode && metrics?.debug && (
            <Card className="mt-6 p-4 bg-gray-900 text-gray-100">
              <div className="flex items-center gap-2 mb-3">
                <HelpCircle className="w-4 h-4" />
                <span className="font-medium">Debug Info</span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm font-mono">
                <div>
                  <span className="text-gray-400">Rooms Queried:</span>
                  <span className="ml-2">{metrics.debug.roomsQueried}</span>
                </div>
                <div>
                  <span className="text-gray-400">Facilities Queried:</span>
                  <span className="ml-2">{metrics.debug.facilitiesQueried}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-400">Raw Status Counts:</span>
                  <pre className="mt-1 text-xs bg-gray-800 p-2 rounded overflow-auto">
                    {JSON.stringify(metrics.debug.rawStatusCounts, null, 2)}
                  </pre>
                </div>
                {metrics.debug.unknownStatuses.length > 0 && (
                  <div className="col-span-2">
                    <span className="text-yellow-400">Unknown Statuses:</span>
                    <span className="ml-2">{metrics.debug.unknownStatuses.join(', ')}</span>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* フッター情報 */}
          <div className="mt-6 text-center text-xs text-gray-400">
            <p>自動更新: 60秒ごと</p>
            {isAdmin && (
              <p className="mt-1">
                <button
                  onClick={() => setDebugMode(!debugMode)}
                  className="text-gray-500 hover:text-gray-700 underline"
                >
                  {debugMode ? 'デバッグモードOFF' : 'デバッグモードON'}
                </button>
              </p>
            )}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
