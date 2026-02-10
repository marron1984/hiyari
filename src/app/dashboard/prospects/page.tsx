'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, Input, Select } from '@/components/ui';
import { Loading } from '@/components/Loading';
import {
  getProspects,
  getProspectStats,
  isProspectInFullScope,
  PROSPECTS_ACTIVE_FROM_DISPLAY,
} from '@/lib/prospect';
import { canEditProspects } from '@/lib/auth';
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
  FileSpreadsheet,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { LAUNCH_MODE } from '@/config/launchMode';

// デフォルトのスプレッドシートID（環境変数 or ハードコード）
const DEFAULT_SHEET_ID = '1y00PmqtKRCsyrvaH8ydO3QbzVbFXGEVA2dpKOUDJMaY';

export default function ProspectsPage() {
  const { user, firebaseUser } = useAuth();
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

  // スプレッドシート同期
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    success: boolean;
    imported: number;
    duplicates: number;
    archived: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  const canManage = canEditProspects(user?.role, user?.modulePermissions);

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

  // スプレッドシート同期
  const handleSync = async () => {
    if (!firebaseUser || syncing) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/google/sheets', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sheetId: DEFAULT_SHEET_ID,
          dryRun: false,
          yearFilter: 2026,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSyncResult({
          success: true,
          imported: data.imported || 0,
          duplicates: data.duplicates || 0,
          archived: data.archived || 0,
          skipped: data.skipped || 0,
          errors: data.errors || [],
        });
        // 同期後にデータ再取得
        fetchData();
      } else {
        setSyncResult({
          success: false,
          imported: 0,
          duplicates: 0,
          archived: 0,
          skipped: 0,
          errors: [data.error || '同期に失敗しました'],
        });
      }
    } catch (error) {
      setSyncResult({
        success: false,
        imported: 0,
        duplicates: 0,
        archived: 0,
        skipped: 0,
        errors: [error instanceof Error ? error.message : '同期に失敗しました'],
      });
    } finally {
      setSyncing(false);
    }
  };

  // スコープ外データの件数（時間スコープ外）
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
    return <Loading text="読み込み中..." />;
  }

  return (
    <main className="pb-20 md:pb-8">
        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* スコープ通知 */}
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2">
            <Filter className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <p className="text-sm text-blue-700">
              表示対象：{PROSPECTS_ACTIVE_FROM_DISPLAY} 以降の受信データ
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
                  <Button
                    variant="secondary"
                    onClick={handleSync}
                    disabled={syncing}
                  >
                    {syncing ? (
                      <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <FileSpreadsheet className="w-4 h-4 mr-1" />
                    )}
                    {syncing ? '同期中...' : 'シート同期'}
                  </Button>
                  {!LAUNCH_MODE && (
                    <Link href="/admin/prospects/import">
                      <Button variant="secondary">
                        <Upload className="w-4 h-4 mr-1" />
                        インポート
                      </Button>
                    </Link>
                  )}
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

          {/* 同期結果 */}
          {syncResult && (
            <div
              className={`mb-4 p-3 rounded-lg border flex items-start gap-2 ${
                syncResult.success
                  ? 'bg-green-50 border-green-200'
                  : 'bg-red-50 border-red-200'
              }`}
            >
              {syncResult.success ? (
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                {syncResult.success ? (
                  <p className="text-sm text-green-800">
                    同期完了：{syncResult.imported}件インポート
                    {syncResult.duplicates > 0 && `、${syncResult.duplicates}件重複スキップ`}
                    {syncResult.archived > 0 && `、${syncResult.archived}件アーカイブ`}
                  </p>
                ) : (
                  <p className="text-sm text-red-800">
                    同期エラー：{syncResult.errors[0] || '不明なエラー'}
                  </p>
                )}
              </div>
              <button
                onClick={() => setSyncResult(null)}
                className="text-zinc-400 hover:text-zinc-600 flex-shrink-0"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* 統計カード */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              <Card className="p-3 border-zinc-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center">
                    <Users className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold tabular-nums text-zinc-900">{stats.total}</p>
                    <p className="text-xs text-zinc-500">総件数</p>
                  </div>
                </div>
              </Card>
              <Card className="p-3 border-zinc-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold tabular-nums text-zinc-900">{stats.newThisWeek}</p>
                    <p className="text-xs text-zinc-500">今週の新規</p>
                  </div>
                </div>
              </Card>
              <Card className="p-3 border-zinc-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-violet-500 rounded-xl flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold tabular-nums text-zinc-900">{stats.newThisMonth}</p>
                    <p className="text-xs text-zinc-500">今月の新規</p>
                  </div>
                </div>
              </Card>
              <Card className="p-3 border-zinc-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center">
                    <Clock className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold tabular-nums text-zinc-900">{stats.avgDaysElapsed}</p>
                    <p className="text-xs text-zinc-500">平均滞留日数</p>
                  </div>
                </div>
              </Card>
              <Card className="p-3 border-zinc-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold tabular-nums text-zinc-900">{stats.byStatus['入居決定'] || 0}</p>
                    <p className="text-xs text-zinc-500">入居決定</p>
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
                  ※ KPIは{PROSPECTS_ACTIVE_FROM_DISPLAY}以降のデータのみ
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
                    <Card className="relative overflow-hidden hover:bg-zinc-50 transition-colors cursor-pointer border-zinc-200">
                      {/* 左アクセントバー */}
                      <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                        prospect.status === '新規受付' ? 'bg-blue-500' :
                        prospect.status === '折返し待ち' ? 'bg-amber-500' :
                        prospect.status === '面談設定済' ? 'bg-violet-500' :
                        prospect.status === '見学設定済' ? 'bg-violet-500' :
                        prospect.status === '申込中' ? 'bg-orange-500' :
                        prospect.status === '入居待ち' ? 'bg-emerald-500' :
                        prospect.status === '見送り' || prospect.status === 'クローズ' ? 'bg-zinc-300' :
                        'bg-zinc-300'
                      }`} />
                      <div className="p-4 pl-5">
                        <div className="flex items-start gap-3">
                          {/* ステータスバッジ */}
                          <div className="flex flex-col gap-1.5 shrink-0">
                            <span
                              className={`px-2 py-1 rounded-md text-xs font-medium ${statusConfig.bgColor} ${statusConfig.color}`}
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
                              <h3 className="font-semibold text-zinc-900 truncate">
                                {prospect.customerName || '名前未登録'}
                              </h3>
                              {prospect.age && (
                                <span className="text-sm text-zinc-500">
                                  {prospect.age}歳
                                </span>
                              )}
                              {prospect.gender && (
                                <span className="text-sm text-zinc-500">
                                  {prospect.gender}
                                </span>
                              )}
                              {prospect.careLevel && (
                                <Badge variant="default" className="text-xs">
                                  {prospect.careLevel}
                                </Badge>
                              )}
                            </div>

                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-600">
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

                            <div className="mt-2 text-xs text-zinc-400">
                              受信: {prospect.receivedAt.toLocaleDateString('ja-JP')}
                              {prospect.assigneeName && ` / 担当: ${prospect.assigneeName}`}
                              {daysElapsed > 7 && (
                                <span className="ml-2 text-orange-500 font-medium">
                                  滞留{daysElapsed}日
                                </span>
                              )}
                            </div>
                          </div>

                          {/* 詳細へ */}
                          <ArrowRight className="w-5 h-5 text-zinc-300" />
                        </div>
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
  );
}
