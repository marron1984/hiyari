'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, Input, Select } from '@/components/ui';
import { Loading } from '@/components/Loading';
import {
  getProspects,
  getProspectStats,
  isProspectKpiTarget,
  isProspectInFullScope,
  KPI_MIN_INTERNAL_NO,
  PROSPECTS_ACTIVE_FROM_DISPLAY,
} from '@/lib/prospect';
import { hasMinRole } from '@/lib/auth';
import {
  Prospect,
  ProspectStatus,
  PROSPECT_STATUSES,
  PROSPECT_STATUS_CONFIG,
  calculateDaysElapsed,
} from '@/types/prospect';
import {
  Users,
  Search,
  Filter,
  RefreshCw,
  Plus,
  AlertTriangle,
  ArrowRight,
  Building2,
  Calendar,
  Clock,
  TrendingUp,
  Upload,
} from 'lucide-react';

export default function ProspectsPage() {
  return (
    <AuthGuard>
      <ProspectsContent />
    </AuthGuard>
  );
}

function ProspectsContent() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [stats, setStats] = useState<{
    total: number;
    byStatus: Record<ProspectStatus, number>;
    newThisWeek: number;
    newThisMonth: number;
    avgDaysElapsed: number;
  } | null>(null);

  // フィルター
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProspectStatus | ''>('');
  const [facilityFilter, setFacilityFilter] = useState('');
  const [sortBy, setSortBy] = useState<'receivedAt' | 'daysElapsed' | 'interviewDateTime'>('receivedAt');
  // 過去データ表示（スコープ外）- デフォルト非表示
  const [showLegacyData, setShowLegacyData] = useState(false);

  const canManage = hasMinRole(user?.role, 'leader');

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [prospectsData, statsData] = await Promise.all([
        getProspects(user.tenantId),
        getProspectStats(user.tenantId),
      ]);
      setProspects(prospectsData);
      setStats(statsData);
    } catch (error) {
      console.error('Failed to fetch prospects:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // スコープ外データの件数（時間スコープ外 または internal_no < 251）
  const legacyCount = prospects.filter((p) => !isProspectInFullScope(p)).length;

  // フィルタリングとソート
  const filteredProspects = prospects
    .filter((p) => {
      // スコープフィルター（デフォルト: 完全スコープ内のみ表示）
      if (!showLegacyData && !isProspectInFullScope(p)) {
        return false;
      }
      // 検索
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (
          !p.customerName?.toLowerCase().includes(q) &&
          !p.salesCompanyName?.toLowerCase().includes(q) &&
          !p.salesRepName?.toLowerCase().includes(q) &&
          !p.desiredFacility?.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      // ステータス
      if (statusFilter && p.status !== statusFilter) {
        return false;
      }
      // 施設
      if (facilityFilter && p.desiredFacility !== facilityFilter) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'daysElapsed':
          return calculateDaysElapsed(b.receivedAt) - calculateDaysElapsed(a.receivedAt);
        case 'interviewDateTime':
          if (!a.interviewDateTime && !b.interviewDateTime) return 0;
          if (!a.interviewDateTime) return 1;
          if (!b.interviewDateTime) return -1;
          return a.interviewDateTime.localeCompare(b.interviewDateTime);
        case 'receivedAt':
        default:
          return b.receivedAt.getTime() - a.receivedAt.getTime();
      }
    });

  // ユニークな施設リスト
  const facilities = [...new Set(prospects.map((p) => p.desiredFacility).filter(Boolean))];

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
        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* スコープ通知 */}
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2">
            <Filter className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <p className="text-sm text-blue-700">
              表示対象：{PROSPECTS_ACTIVE_FROM_DISPLAY} 以降の受信データ（internal_no &gt;= {KPI_MIN_INTERNAL_NO}）
            </p>
          </div>

          {/* ヘッダー */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Users className="w-6 h-6" />
                入居希望者
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                入居希望者の管理・進捗追跡
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={fetchData}>
                <RefreshCw className="w-4 h-4" />
              </Button>
              {canManage && (
                <>
                  <Link href="/admin/prospects/import">
                    <Button variant="secondary">
                      <Upload className="w-4 h-4 mr-1" />
                      インポート
                    </Button>
                  </Link>
                  <Link href="/dashboard/prospects/new">
                    <Button>
                      <Plus className="w-4 h-4 mr-1" />
                      新規登録
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* 統計カード */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Users className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.total}</p>
                    <p className="text-xs text-gray-500">総件数</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <TrendingUp className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.newThisWeek}</p>
                    <p className="text-xs text-gray-500">今週の新規</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Calendar className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.newThisMonth}</p>
                    <p className="text-xs text-gray-500">今月の新規</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-100 rounded-lg">
                    <Clock className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.avgDaysElapsed}</p>
                    <p className="text-xs text-gray-500">平均滞留日数</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <Building2 className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.byStatus['入居決定'] || 0}</p>
                    <p className="text-xs text-gray-500">入居決定</p>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* フィルター */}
          <Card className="p-4 mb-6">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="顧客名、営業会社、施設で検索..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="w-40">
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as ProspectStatus | '')}
                  options={[
                    { value: '', label: '全ステータス' },
                    ...PROSPECT_STATUSES.map((s) => ({ value: s, label: s })),
                  ]}
                />
              </div>
              <div className="w-40">
                <Select
                  value={facilityFilter}
                  onChange={(e) => setFacilityFilter(e.target.value)}
                  options={[
                    { value: '', label: '全施設' },
                    ...facilities.map((f) => ({ value: f!, label: f! })),
                  ]}
                />
              </div>
              <div className="w-40">
                <Select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  options={[
                    { value: 'receivedAt', label: '受信日時順' },
                    { value: 'daysElapsed', label: '滞留日数順' },
                    { value: 'interviewDateTime', label: '面談日時順' },
                  ]}
                />
              </div>
            </div>
            {/* 管理者向け: 過去データ表示トグル */}
            {canManage && legacyCount > 0 && (
              <div className="mt-3 pt-3 border-t flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showLegacyData}
                      onChange={(e) => setShowLegacyData(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-600">
                      スコープ外データを表示
                    </span>
                  </label>
                  <Badge variant="default" className="text-xs">
                    {legacyCount}件
                  </Badge>
                </div>
                <p className="text-xs text-gray-400">
                  ※ KPIは{PROSPECTS_ACTIVE_FROM_DISPLAY}以降・No.{KPI_MIN_INTERNAL_NO}以上のみ
                </p>
              </div>
            )}
          </Card>

          {/* 一覧 */}
          <div className="space-y-3">
            {filteredProspects.length === 0 ? (
              <Card className="p-8 text-center text-gray-500">
                <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>入居希望者がありません</p>
              </Card>
            ) : (
              filteredProspects.map((prospect) => {
                const statusConfig = PROSPECT_STATUS_CONFIG[prospect.status];
                const daysElapsed = calculateDaysElapsed(prospect.receivedAt);
                const isNew = daysElapsed <= 1;
                const hasDuplicates = prospect.duplicateCandidates && prospect.duplicateCandidates.length > 0;

                return (
                  <Link key={prospect.id} href={`/dashboard/prospects/${prospect.id}`}>
                    <Card className="p-4 hover:bg-gray-50 transition-colors cursor-pointer">
                      <div className="flex items-start gap-4">
                        {/* ステータスバッジ */}
                        <div className="flex flex-col gap-2">
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${statusConfig.bgColor} ${statusConfig.color}`}
                          >
                            {prospect.status}
                          </span>
                          {isNew && (
                            <Badge variant="info" className="text-xs">
                              NEW
                            </Badge>
                          )}
                          {hasDuplicates && (
                            <Badge variant="warning" className="text-xs flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              重複?
                            </Badge>
                          )}
                        </div>

                        {/* 顧客情報 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-gray-900 truncate">
                              {prospect.customerName || '名前未登録'}
                            </h3>
                            {prospect.age && (
                              <span className="text-sm text-gray-500">
                                {prospect.age}歳
                              </span>
                            )}
                            {prospect.gender && (
                              <span className="text-sm text-gray-500">
                                {prospect.gender}
                              </span>
                            )}
                            {prospect.careLevel && (
                              <Badge variant="default" className="text-xs">
                                {prospect.careLevel}
                              </Badge>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                            {prospect.desiredFacility && (
                              <span className="flex items-center gap-1">
                                <Building2 className="w-3 h-3" />
                                {prospect.desiredFacility}
                              </span>
                            )}
                            {prospect.salesCompanyName && (
                              <span>営業: {prospect.salesCompanyName}</span>
                            )}
                            {prospect.interviewDateTime && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                面談: {prospect.interviewDateTime}
                              </span>
                            )}
                          </div>

                          <div className="mt-2 text-xs text-gray-400">
                            受信: {prospect.receivedAt.toLocaleDateString('ja-JP')}
                            {prospect.assigneeName && ` / 担当: ${prospect.assigneeName}`}
                            {daysElapsed > 7 && (
                              <span className="ml-2 text-orange-500">
                                滞留{daysElapsed}日
                              </span>
                            )}
                          </div>
                        </div>

                        {/* 詳細へ */}
                        <ArrowRight className="w-5 h-5 text-gray-400" />
                      </div>
                    </Card>
                  </Link>
                );
              })
            )}
          </div>

          {/* 件数表示 */}
          {filteredProspects.length > 0 && (
            <p className="text-sm text-gray-500 mt-4 text-center">
              {filteredProspects.length}件表示
              {filteredProspects.length !== prospects.length && ` / 全${prospects.length}件`}
            </p>
          )}
        </div>
      </main>
    </>
  );
}
