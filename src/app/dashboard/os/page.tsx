'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { PreviewBadge } from '@/components/PreviewBadge';
import { getChaosDashboardMetrics, getInterventions } from '@/lib/chaos';
import { getSalesDeals, getSalesAccounts } from '@/lib/sales';
import { DEFAULT_TENANT_ID } from '@/lib/firebase';
import { Intervention } from '@/types/chaos';
import { SalesDeal } from '@/types/sales';
import {
  Activity,
  AlertTriangle,
  TrendingUp,
  Phone,
  Calendar,
  Target,
  Heart,
  Brain,
  Shield,
  ArrowRight,
  CheckCircle,
} from 'lucide-react';

export default function OSDashboardPage() {
  return (
    <AuthGuard>
      <OSDashboardContent />
    </AuthGuard>
  );
}

function OSDashboardContent() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [orgMetrics, setOrgMetrics] = useState<{
    burnoutRiskHeatmap: { userId: string; userName: string; score: number; level: string }[];
    avgFatigue: number;
    avgMentalLoad: number;
    alertCount: { yellow: number; red: number };
  } | null>(null);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [salesDeals, setSalesDeals] = useState<SalesDeal[]>([]);
  const [salesAccounts, setSalesAccounts] = useState<{ length: number }>({ length: 0 });

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;

      try {
        const [chaosData, interventionsData, dealsData, accountsData] = await Promise.all([
          getChaosDashboardMetrics(DEFAULT_TENANT_ID),
          getInterventions('open', 10),
          getSalesDeals(DEFAULT_TENANT_ID),
          getSalesAccounts(DEFAULT_TENANT_ID),
        ]);

        setOrgMetrics(chaosData.organization);
        setInterventions(interventionsData);
        setSalesDeals(dealsData);
        setSalesAccounts({ length: accountsData.length });
      } catch (error) {
        console.error('Failed to fetch OS data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  if (loading) {
    return (
      <>
        <Header />
        <Loading text="読み込み中..." />
      </>
    );
  }

  // 営業KPI計算
  const activeDeals = salesDeals.filter((d) => !['請求書到着', '失注'].includes(d.status));
  const completedDeals = salesDeals.filter((d) => d.status === '請求書到着');
  const teleapoDeals = salesDeals.filter((d) => d.source === 'テレアポ');
  const shiryouDeals = salesDeals.filter((d) => d.source === '資料送付');

  // 入居確率ランク分布（ダミーデータ）
  const rankDistribution = { A: 2, B: 5, C: 8, D: activeDeals.length > 15 ? activeDeals.length - 15 : 0 };

  return (
    <>
      <Header />
      <PreviewBadge />
      <main className="pb-8">
        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* ヘッダー */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                <Activity className="w-6 h-6 mr-2 text-indigo-600" />
                AA CHAOS 経営OS
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                経営OS・営業OS 統合管理ダッシュボード
              </p>
            </div>
            <div className="flex gap-2">
              <Link href="/dashboard/os/checkin">
                <Button variant="outline" size="sm">
                  <Heart className="w-4 h-4 mr-1" />
                  チェックイン
                </Button>
              </Link>
              <Link href="/dashboard/wbr">
                <Button size="sm">
                  <Calendar className="w-4 h-4 mr-1" />
                  WBR
                </Button>
              </Link>
            </div>
          </div>

          {/* 支援目的の注意文（固定） */}
          <Card className="mb-6 bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-800">
                    これは支援のための指標です。評価や査定のためではありません。
                  </p>
                  <p className="text-xs text-blue-600 mt-1">
                    1on1は評価や指導ではなく、あなたを支えるための安全装置です。
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* アラートバナー */}
          {orgMetrics && (orgMetrics.alertCount.red > 0 || orgMetrics.alertCount.yellow > 0) && (
            <Card className="mb-6 border-red-200 bg-red-50">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                  <div>
                    <p className="font-semibold text-red-800">要対応のアラートがあります</p>
                    <p className="text-sm text-red-600">
                      {orgMetrics.alertCount.red > 0 && (
                        <span className="mr-3">レッド: {orgMetrics.alertCount.red}件</span>
                      )}
                      {orgMetrics.alertCount.yellow > 0 && (
                        <span>イエロー: {orgMetrics.alertCount.yellow}件</span>
                      )}
                    </p>
                  </div>
                  <Link href="/dashboard/os/team" className="ml-auto">
                    <Button size="sm" variant="outline" className="border-red-300 text-red-700">
                      チームを確認
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 営業OS セクション */}
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-gray-800 flex items-center">
                <TrendingUp className="w-5 h-5 mr-2 text-green-600" />
                営業OS
              </h2>

              {/* 営業KPI サマリー */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">パイプライン概要</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-blue-600">{salesAccounts.length}</p>
                      <p className="text-xs text-gray-500">営業先 (LD)</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-purple-600">{activeDeals.length}</p>
                      <p className="text-xs text-gray-500">進行中 (V)</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-green-600">{completedDeals.length}</p>
                      <p className="text-xs text-gray-500">成約 (M)</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-gray-600">
                        {salesDeals.length > 0
                          ? Math.round((completedDeals.length / salesDeals.length) * 100)
                          : 0}%
                      </p>
                      <p className="text-xs text-gray-500">CV率</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 流入元別 */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center">
                    <Target className="w-4 h-4 mr-2" />
                    流入元別分析
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="flex items-center mb-2">
                        <Phone className="w-4 h-4 text-blue-600 mr-1" />
                        <span className="text-sm font-medium">テレアポ</span>
                      </div>
                      <p className="text-2xl font-bold text-blue-600">{teleapoDeals.length}件</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center mb-2">
                        <span className="text-sm font-medium">資料送付</span>
                      </div>
                      <p className="text-2xl font-bold text-gray-600">{shiryouDeals.length}件</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 入居確率ランク分布（ダミー） */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">入居確率ランク分布</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-2">
                    {(['A', 'B', 'C', 'D'] as const).map((rank) => (
                      <div
                        key={rank}
                        className={`p-3 rounded-lg text-center ${
                          rank === 'A' ? 'bg-green-100 text-green-800' :
                          rank === 'B' ? 'bg-blue-100 text-blue-800' :
                          rank === 'C' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}
                      >
                        <p className="text-lg font-bold">{rankDistribution[rank]}</p>
                        <p className="text-xs">ランク{rank}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-3">
                    ※ ダミーデータです。スコアリング機能はPR6で実装予定
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* 経営OS セクション */}
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-gray-800 flex items-center">
                <Heart className="w-5 h-5 mr-2 text-red-500" />
                経営OS（組織コンディション）
              </h2>

              {/* コンディションサマリー */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">組織コンディション</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="p-3 bg-orange-50 rounded-lg">
                      <div className="flex items-center mb-1">
                        <Activity className="w-4 h-4 text-orange-600 mr-1" />
                        <span className="text-sm">平均疲労度</span>
                      </div>
                      <p className="text-2xl font-bold text-orange-600">
                        {orgMetrics?.avgFatigue || 0}
                      </p>
                    </div>
                    <div className="p-3 bg-purple-50 rounded-lg">
                      <div className="flex items-center mb-1">
                        <Brain className="w-4 h-4 text-purple-600 mr-1" />
                        <span className="text-sm">平均メンタル負荷</span>
                      </div>
                      <p className="text-2xl font-bold text-purple-600">
                        {orgMetrics?.avgMentalLoad || 0}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* バーンアウトリスクヒートマップ */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center">
                    <Shield className="w-4 h-4 mr-2" />
                    バーンアウトリスク
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {orgMetrics?.burnoutRiskHeatmap && orgMetrics.burnoutRiskHeatmap.length > 0 ? (
                    <div className="space-y-2">
                      {orgMetrics.burnoutRiskHeatmap.slice(0, 5).map((item) => (
                        <div
                          key={item.userId}
                          className={`flex items-center justify-between p-2 rounded-lg ${
                            item.level === 'red' ? 'bg-red-50 border border-red-200' :
                            item.level === 'yellow' ? 'bg-yellow-50 border border-yellow-200' :
                            'bg-green-50'
                          }`}
                        >
                          <span className="text-sm font-medium">{item.userName}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{item.score}</span>
                            <Badge
                              className={
                                item.level === 'red' ? 'bg-red-100 text-red-700' :
                                item.level === 'yellow' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-green-100 text-green-700'
                              }
                            >
                              {item.level}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 text-center py-4">
                      チェックインデータがありません
                    </p>
                  )}
                  <Link
                    href="/dashboard/os/team"
                    className="text-sm text-blue-600 hover:underline flex items-center mt-3"
                  >
                    チーム詳細を見る <ArrowRight className="w-4 h-4 ml-1" />
                  </Link>
                </CardContent>
              </Card>

              {/* 介入タスク */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">要対応タスク（支援）</CardTitle>
                  <Badge className="bg-gray-100 text-gray-700">{interventions.length}件</Badge>
                </CardHeader>
                <CardContent>
                  {interventions.length > 0 ? (
                    <div className="space-y-2">
                      {interventions.slice(0, 3).map((item) => (
                        <div
                          key={item.id}
                          className={`p-3 rounded-lg border ${
                            item.severity === 'red' ? 'border-red-200 bg-red-50' :
                            item.severity === 'yellow' ? 'border-yellow-200 bg-yellow-50' :
                            'border-gray-200'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className="text-sm font-medium">{item.title}</p>
                              <p className="text-xs text-gray-500 mt-1">
                                {item.createdAt.toLocaleDateString('ja-JP')}
                              </p>
                            </div>
                            <Badge
                              className={
                                item.severity === 'red' ? 'bg-red-100 text-red-700' :
                                item.severity === 'yellow' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-gray-100 text-gray-700'
                              }
                            >
                              {item.severity}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">未対応のタスクはありません</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
