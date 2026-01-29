'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardContent, Badge, Button } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { getSalesDeals, getSalesAccounts } from '@/lib/sales';
import { formatPercent } from '@/lib/dashboard/calc';
import { hasMinRole } from '@/lib/auth';
import {
  SalesDeal,
  SalesAccount,
  SALES_DEAL_STATUS_CONFIG,
  SALES_DEAL_STATUSES,
} from '@/types/sales';
import {
  Building2,
  Users,
  TrendingUp,
  AlertCircle,
  Plus,
  ChevronRight,
  Phone,
  FileText,
  Handshake,
  Home,
  Receipt,
  RefreshCw,
  Clock,
  AlertTriangle,
} from 'lucide-react';

// メトリクスAPIのレスポンス型
interface SalesMetrics {
  success: boolean;
  deals: {
    total: number;
    active: number;
    completed: number;
    lost: number;
    byStatus: Record<string, number>;
    bySource: Record<string, { total: number; completed: number }>;
  };
  rates: {
    totalCv: number | null;
    teleapoCv: number | null;
    shiryouCv: number | null;
  };
  prospects: {
    total: number;
    kpiTotal: number;
    byStatus: Record<string, number>;
    expectedMoveIns: number;
    rankDistribution: { A: number; B: number; C: number; D: number };
  };
  pipeline: {
    ld: number;
    v: number;
    m: number;
    cvRate: number | null;
  };
  updatedAt: string;
  warnings: { label: string; code: string; message: string }[];
  debug?: {
    queryScope: string;
    prospectsQueried: number;
    prospectsFiltered: number;
    dealsQueried: number;
  };
}

export default function SalesDashboardPage() {
  return (
    <AuthGuard>
      <SalesDashboardContent />
    </AuthGuard>
  );
}

function SalesDashboardContent() {
  const { user, firebaseUser } = useAuth();
  const searchParams = useSearchParams();
  const debugMode = searchParams.get('debug') === '1';

  const [accounts, setAccounts] = useState<SalesAccount[]>([]);
  const [deals, setDeals] = useState<SalesDeal[]>([]);
  const [metrics, setMetrics] = useState<SalesMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const isExec = hasMinRole(user?.role, 'admin');

  // メトリクスAPIからデータ取得
  const fetchMetrics = useCallback(async (isManualRefresh = false) => {
    if (!firebaseUser) return;

    if (isManualRefresh) {
      setRefreshing(true);
    }
    setFetchError(null);

    try {
      const token = await firebaseUser.getIdToken();
      const debugParam = debugMode && isExec ? '&debug=1' : '';
      const res = await fetch(`/api/sales/metrics?_=${Date.now()}${debugParam}`, {
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const data = await res.json();
      if (data.success) {
        setMetrics(data);
        setLastUpdated(new Date());
      } else {
        throw new Error(data.error || 'データ取得に失敗しました');
      }
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
      setFetchError(error instanceof Error ? error.message : 'データ取得に失敗しました');
    } finally {
      setRefreshing(false);
    }
  }, [firebaseUser, debugMode, isExec]);

  // ローカルデータ取得（案件詳細用）
  const fetchLocalData = useCallback(async () => {
    try {
      const [accountsData, dealsData] = await Promise.all([
        getSalesAccounts(),
        getSalesDeals(),
      ]);
      setAccounts(accountsData);
      setDeals(dealsData);
    } catch (error) {
      console.error('Failed to fetch local data:', error);
    }
  }, []);

  // 初回ロード
  useEffect(() => {
    const init = async () => {
      await Promise.all([fetchMetrics(), fetchLocalData()]);
      setLoading(false);
    };
    init();
  }, [fetchMetrics, fetchLocalData]);

  // 60秒ごとの自動更新
  useEffect(() => {
    const interval = setInterval(() => {
      fetchMetrics();
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  // 手動更新
  const handleRefresh = () => {
    fetchMetrics(true);
    fetchLocalData();
  };

  if (loading) {
    return (
      <>
        <Header />
        <Loading text="読み込み中..." />
      </>
    );
  }

  const myDeals = deals.filter((d) => d.assignedToId === user?.id);
  const now = new Date();

  // 停滞案件（7日以上更新なし）
  const activeDeals = deals.filter((d) => !['請求書到着', '失注'].includes(d.status));
  const staleDeals = activeDeals.filter((deal) => {
    const lastActivity = deal.updatedAt || deal.createdAt;
    const daysSince = Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24));
    return daysSince >= 7;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'テレアポ':
        return <Phone className="w-4 h-4" />;
      case '資料送付':
        return <FileText className="w-4 h-4" />;
      case '面談':
        return <Users className="w-4 h-4" />;
      case '担当者決定':
        return <Handshake className="w-4 h-4" />;
      case '入居相談':
      case '入居契約':
      case '入居確認':
        return <Home className="w-4 h-4" />;
      case '請求書到着':
        return <Receipt className="w-4 h-4" />;
      default:
        return null;
    }
  };

  // 安全な表示（null → '--'）
  const displayRate = (rate: number | null | undefined): string => {
    if (rate === null || rate === undefined) return '--';
    return `${rate}%`;
  };

  const displayCount = (count: number | null | undefined): string => {
    if (count === null || count === undefined) return '--';
    return count.toString();
  };

  return (
    <>
      <Header />
      <main className="pb-8">
        <div className="max-w-6xl mx-auto px-4 py-6">
          {/* エラーバナー */}
          {fetchError && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2 text-red-700">
                <AlertTriangle className="w-5 h-5" />
                <span>データ取得に失敗しました: {fetchError}</span>
              </div>
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
                {refreshing ? <RefreshCw className="w-4 h-4 animate-spin" /> : '再試行'}
              </Button>
            </div>
          )}

          {/* 警告バナー */}
          {metrics?.warnings && metrics.warnings.length > 0 && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center gap-2 text-yellow-700 text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>一部のデータ取得で問題が発生しました</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">営業進捗管理</h1>
              {lastUpdated && (
                <p className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                  <Clock className="w-3 h-3" />
                  最終更新: {lastUpdated.toLocaleTimeString('ja-JP')}
                  {refreshing && <RefreshCw className="w-3 h-3 animate-spin ml-1" />}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={refreshing}>
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>
              <Link href="/sales/accounts">
                <Button variant="outline" size="sm">
                  <Building2 className="w-4 h-4 mr-1" />
                  営業先一覧
                </Button>
              </Link>
              <Link href="/sales/deals">
                <Button size="sm">
                  <Plus className="w-4 h-4 mr-1" />
                  新規案件
                </Button>
              </Link>
            </div>
          </div>

          {/* サマリーカード */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">営業先</p>
                    <p className="text-2xl font-bold">{accounts.length}</p>
                  </div>
                  <Building2 className="w-8 h-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">進行中案件</p>
                    <p className="text-2xl font-bold">{displayCount(metrics?.deals.active)}</p>
                  </div>
                  <TrendingUp className="w-8 h-8 text-green-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">成約</p>
                    <p className="text-2xl font-bold">{displayCount(metrics?.deals.completed)}</p>
                  </div>
                  <Receipt className="w-8 h-8 text-purple-500" />
                </div>
              </CardContent>
            </Card>

            <Card className={staleDeals.length > 0 ? 'border-orange-200 bg-orange-50' : ''}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">要対応</p>
                    <p className="text-2xl font-bold text-orange-600">{staleDeals.length}</p>
                  </div>
                  <AlertCircle className="w-8 h-8 text-orange-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 入居希望パイプライン（KPI） */}
          {metrics?.prospects && (
            <Card className="mb-6 border-indigo-200 bg-gradient-to-r from-indigo-50 to-purple-50">
              <CardContent>
                <h2 className="font-semibold text-gray-900 mb-4 flex items-center">
                  <Users className="w-5 h-5 mr-2 text-indigo-600" />
                  入居希望パイプライン
                  <span className="text-xs text-gray-400 ml-2">（No.252以上のみ）</span>
                </h2>
                <div className="grid grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-white rounded-xl shadow-sm">
                    <p className="text-sm text-gray-500 mb-1">LD（リード）</p>
                    <p className="text-3xl font-bold text-blue-600">{displayCount(metrics.pipeline.ld)}</p>
                    <p className="text-xs text-gray-400">新規受付・折返し</p>
                  </div>
                  <div className="text-center p-4 bg-white rounded-xl shadow-sm">
                    <p className="text-sm text-gray-500 mb-1">V（訪問）</p>
                    <p className="text-3xl font-bold text-green-600">{displayCount(metrics.pipeline.v)}</p>
                    <p className="text-xs text-gray-400">面談・見学設定</p>
                  </div>
                  <div className="text-center p-4 bg-white rounded-xl shadow-sm">
                    <p className="text-sm text-gray-500 mb-1">M（申込）</p>
                    <p className="text-3xl font-bold text-purple-600">{displayCount(metrics.pipeline.m)}</p>
                    <p className="text-xs text-gray-400">申込〜入居待ち</p>
                  </div>
                  <div className="text-center p-4 bg-white rounded-xl shadow-sm">
                    <p className="text-sm text-gray-500 mb-1">CV率</p>
                    <p className="text-3xl font-bold text-orange-600">{displayRate(metrics.pipeline.cvRate)}</p>
                    <p className="text-xs text-gray-400">入居決定/全体</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div className="p-3 bg-white rounded-lg">
                    <p className="text-sm text-gray-500">入居見込み</p>
                    <p className="text-xl font-bold text-green-600">{metrics.prospects.expectedMoveIns}</p>
                  </div>
                  <div className="p-3 bg-white rounded-lg">
                    <p className="text-sm text-gray-500">ランク分布</p>
                    <div className="flex gap-2 text-sm">
                      <span className="text-red-600">A:{metrics.prospects.rankDistribution.A}</span>
                      <span className="text-orange-600">B:{metrics.prospects.rankDistribution.B}</span>
                      <span className="text-yellow-600">C:{metrics.prospects.rankDistribution.C}</span>
                      <span className="text-gray-600">D:{metrics.prospects.rankDistribution.D}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* CV率（成約率）- 電話の大事さを強調 */}
          <Card className="mb-6 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
            <CardContent>
              <h2 className="font-semibold text-gray-900 mb-4 flex items-center">
                <Phone className="w-5 h-5 mr-2 text-blue-600" />
                成約率（CV率）- 流入元別
              </h2>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 bg-white rounded-xl shadow-sm border-2 border-blue-200">
                  <div className="flex items-center justify-center mb-2">
                    <Phone className="w-6 h-6 text-blue-600 mr-2" />
                    <span className="text-sm font-medium text-gray-700">テレアポ</span>
                  </div>
                  <p className="text-3xl font-bold text-blue-600">{displayRate(metrics?.rates.teleapoCv)}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {metrics?.deals.bySource['テレアポ']
                      ? `${metrics.deals.bySource['テレアポ'].completed} / ${metrics.deals.bySource['テレアポ'].total} 件`
                      : '--'}
                  </p>
                </div>
                <div className="text-center p-4 bg-white rounded-xl shadow-sm">
                  <div className="flex items-center justify-center mb-2">
                    <FileText className="w-6 h-6 text-gray-500 mr-2" />
                    <span className="text-sm font-medium text-gray-700">資料送付</span>
                  </div>
                  <p className="text-3xl font-bold text-gray-600">{displayRate(metrics?.rates.shiryouCv)}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {metrics?.deals.bySource['資料送付']
                      ? `${metrics.deals.bySource['資料送付'].completed} / ${metrics.deals.bySource['資料送付'].total} 件`
                      : '--'}
                  </p>
                </div>
                <div className="text-center p-4 bg-white rounded-xl shadow-sm">
                  <div className="flex items-center justify-center mb-2">
                    <TrendingUp className="w-6 h-6 text-green-500 mr-2" />
                    <span className="text-sm font-medium text-gray-700">全体</span>
                  </div>
                  <p className="text-3xl font-bold text-green-600">{displayRate(metrics?.rates.totalCv)}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {displayCount(metrics?.deals.completed)} 件成約
                  </p>
                </div>
              </div>
              {metrics?.rates.teleapoCv !== null &&
                metrics?.rates.shiryouCv !== null &&
                metrics?.rates.teleapoCv !== undefined &&
                metrics?.rates.shiryouCv !== undefined &&
                metrics.rates.teleapoCv > metrics.rates.shiryouCv &&
                (metrics.deals.bySource['テレアポ']?.total || 0) >= 3 && (
                  <div className="mt-4 p-3 bg-blue-100 rounded-lg">
                    <p className="text-sm text-blue-800 font-medium flex items-center">
                      <Phone className="w-4 h-4 mr-2" />
                      テレアポは資料送付より成約率が{metrics.rates.teleapoCv - metrics.rates.shiryouCv}%高い！電話でのアプローチを強化しましょう。
                    </p>
                  </div>
                )}
            </CardContent>
          </Card>

          {/* パイプライン（salesDeals） */}
          <Card className="mb-6">
            <CardContent>
              <h2 className="font-semibold text-gray-900 mb-4">案件パイプライン</h2>
              <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
                {SALES_DEAL_STATUSES.map((status) => {
                  const config = SALES_DEAL_STATUS_CONFIG[status];
                  const count = metrics?.deals.byStatus[status] || 0;
                  return (
                    <Link
                      key={status}
                      href={`/sales/deals?status=${encodeURIComponent(status)}`}
                      className="block"
                    >
                      <div
                        className={`p-3 rounded-lg text-center hover:opacity-80 transition-opacity ${config.bgColor}`}
                      >
                        <div className={`flex justify-center mb-1 ${config.color}`}>
                          {getStatusIcon(status)}
                        </div>
                        <p className="text-2xl font-bold">{count}</p>
                        <p className={`text-xs ${config.color}`}>{status}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-6">
            {/* 自分の案件 */}
            <Card>
              <CardContent>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-gray-900">自分の案件</h2>
                  <Link href={`/sales/deals?assignee=${user?.id}`}>
                    <Button variant="ghost" size="sm">
                      すべて見る
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </Link>
                </div>
                {myDeals.length === 0 ? (
                  <p className="text-gray-500 text-sm">担当案件がありません</p>
                ) : (
                  <div className="space-y-2">
                    {myDeals.slice(0, 5).map((deal) => {
                      const config = SALES_DEAL_STATUS_CONFIG[deal.status];
                      return (
                        <Link
                          key={deal.id}
                          href={`/sales/deals/${deal.id}`}
                          className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50"
                        >
                          <div>
                            <p className="font-medium text-sm">{deal.residentName || '未設定'}</p>
                            <p className="text-xs text-gray-500">{deal.accountName}</p>
                          </div>
                          <Badge className={`${config.bgColor} ${config.color}`}>
                            {deal.status}
                          </Badge>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 停滞案件 */}
            <Card className={staleDeals.length > 0 ? 'border-orange-200' : ''}>
              <CardContent>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-gray-900 flex items-center">
                    <AlertCircle className="w-4 h-4 mr-2 text-orange-500" />
                    要対応（7日以上更新なし）
                  </h2>
                </div>
                {staleDeals.length === 0 ? (
                  <p className="text-gray-500 text-sm">停滞案件はありません</p>
                ) : (
                  <div className="space-y-2">
                    {staleDeals.slice(0, 5).map((deal) => {
                      const config = SALES_DEAL_STATUS_CONFIG[deal.status];
                      const lastActivity = deal.updatedAt || deal.createdAt;
                      const daysSince = Math.floor(
                        (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)
                      );
                      return (
                        <Link
                          key={deal.id}
                          href={`/sales/deals/${deal.id}`}
                          className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50"
                        >
                          <div>
                            <p className="font-medium text-sm">{deal.residentName || '未設定'}</p>
                            <p className="text-xs text-gray-500">
                              {deal.assignedToName || '未割当'} • {daysSince}日経過
                            </p>
                          </div>
                          <Badge className={`${config.bgColor} ${config.color}`}>
                            {deal.status}
                          </Badge>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* デバッグ情報（exec + debug=1 のみ） */}
          {debugMode && isExec && metrics?.debug && (
            <Card className="mt-6 border-gray-300 bg-gray-50">
              <CardContent>
                <h2 className="font-semibold text-gray-700 mb-3 flex items-center">
                  <AlertCircle className="w-4 h-4 mr-2" />
                  デバッグ情報
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">スコープ</p>
                    <p className="font-mono">{metrics.debug.queryScope}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">prospects取得数</p>
                    <p className="font-mono">{metrics.debug.prospectsQueried}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">KPI対象数</p>
                    <p className="font-mono">{metrics.debug.prospectsFiltered}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">deals取得数</p>
                    <p className="font-mono">{metrics.debug.dealsQueried}</p>
                  </div>
                </div>
                {metrics.warnings.length > 0 && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-gray-500 mb-1">Warnings:</p>
                    <ul className="text-xs text-red-600 space-y-1">
                      {metrics.warnings.map((w, i) => (
                        <li key={i}>[{w.label}] {w.code}: {w.message}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </>
  );
}
