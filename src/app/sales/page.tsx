'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardContent, Badge, Button } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { getSalesDeals, getSalesAccounts, getPipelineSummary } from '@/lib/sales';
import {
  SalesDeal,
  SalesAccount,
  PipelineSummary,
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
} from 'lucide-react';

export default function SalesDashboardPage() {
  return (
    <AuthGuard>
      <SalesDashboardContent />
    </AuthGuard>
  );
}

function SalesDashboardContent() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<SalesAccount[]>([]);
  const [deals, setDeals] = useState<SalesDeal[]>([]);
  const [pipeline, setPipeline] = useState<PipelineSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [accountsData, dealsData, pipelineData] = await Promise.all([
          getSalesAccounts(),
          getSalesDeals(),
          getPipelineSummary(),
        ]);
        setAccounts(accountsData);
        setDeals(dealsData);
        setPipeline(pipelineData);
      } catch (error) {
        console.error('Failed to fetch data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <>
        <Header />
        <Loading text="読み込み中..." />
      </>
    );
  }

  const activeDeals = deals.filter((d) => !['請求書到着', '失注'].includes(d.status));
  const completedDeals = deals.filter((d) => d.status === '請求書到着');
  const lostDeals = deals.filter((d) => d.status === '失注');
  const myDeals = deals.filter((d) => d.assignedToId === user?.id);

  // CV率計算（流入元別）
  const teleapoDeals = deals.filter((d) => d.source === 'テレアポ');
  const teleapoCompleted = teleapoDeals.filter((d) => d.status === '請求書到着');
  const teleapoCvRate = teleapoDeals.length > 0
    ? Math.round((teleapoCompleted.length / teleapoDeals.length) * 100)
    : 0;

  const shiryouDeals = deals.filter((d) => d.source === '資料送付');
  const shiryouCompleted = shiryouDeals.filter((d) => d.status === '請求書到着');
  const shiryouCvRate = shiryouDeals.length > 0
    ? Math.round((shiryouCompleted.length / shiryouDeals.length) * 100)
    : 0;

  // 全体CV率
  const totalCvRate = deals.length > 0
    ? Math.round((completedDeals.length / (completedDeals.length + lostDeals.length || 1)) * 100)
    : 0;

  // 停滞案件（7日以上更新なし）
  const now = new Date();

  // フォローアップ必要な案件（次回フォローアップ日が過ぎている or 未設定）
  const needsFollowUp = activeDeals.filter((deal) => {
    if (!deal.nextFollowUpDate) return true;
    return new Date(deal.nextFollowUpDate) <= now;
  });
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

  return (
    <>
      <Header />
      <main className="pb-8">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-gray-900">営業進捗管理</h1>
            <div className="flex gap-2">
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
                    <p className="text-2xl font-bold">{activeDeals.length}</p>
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
                    <p className="text-2xl font-bold">{completedDeals.length}</p>
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
                  <p className="text-3xl font-bold text-blue-600">{teleapoCvRate}%</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {teleapoCompleted.length} / {teleapoDeals.length} 件
                  </p>
                </div>
                <div className="text-center p-4 bg-white rounded-xl shadow-sm">
                  <div className="flex items-center justify-center mb-2">
                    <FileText className="w-6 h-6 text-gray-500 mr-2" />
                    <span className="text-sm font-medium text-gray-700">資料送付</span>
                  </div>
                  <p className="text-3xl font-bold text-gray-600">{shiryouCvRate}%</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {shiryouCompleted.length} / {shiryouDeals.length} 件
                  </p>
                </div>
                <div className="text-center p-4 bg-white rounded-xl shadow-sm">
                  <div className="flex items-center justify-center mb-2">
                    <TrendingUp className="w-6 h-6 text-green-500 mr-2" />
                    <span className="text-sm font-medium text-gray-700">全体</span>
                  </div>
                  <p className="text-3xl font-bold text-green-600">{totalCvRate}%</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {completedDeals.length} 件成約
                  </p>
                </div>
              </div>
              {teleapoCvRate > shiryouCvRate && teleapoDeals.length >= 3 && (
                <div className="mt-4 p-3 bg-blue-100 rounded-lg">
                  <p className="text-sm text-blue-800 font-medium flex items-center">
                    <Phone className="w-4 h-4 mr-2" />
                    テレアポは資料送付より成約率が{teleapoCvRate - shiryouCvRate}%高い！電話でのアプローチを強化しましょう。
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* パイプライン */}
          <Card className="mb-6">
            <CardContent>
              <h2 className="font-semibold text-gray-900 mb-4">パイプライン</h2>
              <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
                {SALES_DEAL_STATUSES.map((status) => {
                  const config = SALES_DEAL_STATUS_CONFIG[status];
                  const count = pipeline.find((p) => p.status === status)?.count || 0;
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
        </div>
      </main>
    </>
  );
}
