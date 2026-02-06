'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, Badge } from '@/components/ui';
import {
  ShieldAlert,
  Plus,
  Filter,
  Search,
  User,
  Clock,
  AlertTriangle,
  ChevronRight,
  Calendar,
  Building2,
  CheckCircle,
} from 'lucide-react';
import type {
  CorrectiveAction,
  CorrectiveActionStatus,
  CorrectiveActionSeverity,
  SourceType,
  CorrectiveActionStats,
  BlockedReasonCode,
} from '@/lib/correctiveActions/types';
import {
  CA_STATUS_CONFIG,
  CA_SEVERITY_CONFIG,
  SOURCE_TYPE_CONFIG,
  BLOCKED_REASON_CONFIG,
} from '@/lib/correctiveActions/types';
import type { BusinessUnit } from '@/lib/business/types';

type TabType = 'all' | 'open' | 'critical' | 'overdue';

const TABS: { id: TabType; label: string; icon: React.ReactNode }[] = [
  { id: 'all', label: '全件', icon: <ShieldAlert className="w-4 h-4" /> },
  { id: 'open', label: 'オープン', icon: <Clock className="w-4 h-4" /> },
  { id: 'critical', label: '重大', icon: <AlertTriangle className="w-4 h-4" /> },
  { id: 'overdue', label: '期限超過', icon: <Calendar className="w-4 h-4" /> },
];

export default function CorrectiveActionsPage() {
  const searchParams = useSearchParams();

  // Task 030: URLパラメータから初期値を取得
  const initialBusinessUnitId = searchParams.get('businessUnitId') || '';
  const initialStatus = searchParams.get('status') as CorrectiveActionStatus | null;
  const initialOverdue = searchParams.get('overdue') === 'true';

  const [activeTab, setActiveTab] = useState<TabType>(
    initialOverdue ? 'overdue' : 'all'
  );
  const [items, setItems] = useState<CorrectiveAction[]>([]);
  const [stats, setStats] = useState<CorrectiveActionStats | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // フィルタ
  const [statusFilter, setStatusFilter] = useState<CorrectiveActionStatus | ''>(initialStatus || '');
  const [severityFilter, setSeverityFilter] = useState<CorrectiveActionSeverity | ''>('');
  const [sourceTypeFilter, setSourceTypeFilter] = useState<SourceType | ''>('');
  const [businessUnitFilter, setBusinessUnitFilter] = useState(initialBusinessUnitId);  // Task 030
  const [searchQuery, setSearchQuery] = useState('');

  // Task 030: 事業単位リスト
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();

      // タブによるフィルタ
      if (activeTab === 'overdue') {
        params.append('overdue', 'true');
      }
      if (activeTab === 'critical') {
        params.append('severity', 'critical');
      }

      // 追加フィルタ
      if (statusFilter) params.append('status', statusFilter);
      if (severityFilter && activeTab !== 'critical') params.append('severity', severityFilter);
      if (sourceTypeFilter) params.append('sourceType', sourceTypeFilter);
      if (businessUnitFilter) params.append('businessUnitId', businessUnitFilter);  // Task 030
      if (searchQuery) params.append('q', searchQuery);

      const res = await fetch(`/api/corrective-actions?${params.toString()}`);
      const data = await res.json();

      let records = data.items || [];

      // オープンタブの場合、ステータスでフィルタ
      if (activeTab === 'open' && !statusFilter) {
        records = records.filter((ca: CorrectiveAction) =>
          ['open', 'in_progress', 'blocked', 'pending_review'].includes(ca.status)
        );
      }

      setItems(records);
      setTotalCount(data.total || 0);
    } catch (error) {
      console.error('Failed to fetch corrective actions:', error);
    } finally {
      setLoading(false);
    }
  }, [activeTab, statusFilter, severityFilter, sourceTypeFilter, businessUnitFilter, searchQuery]);

  const fetchStats = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (businessUnitFilter) params.append('businessUnitId', businessUnitFilter);

      const res = await fetch(`/api/corrective-actions/stats?${params.toString()}`);
      const data = await res.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  }, [businessUnitFilter]);

  // Task 030: 事業単位リスト取得
  const fetchBusinessUnits = useCallback(async () => {
    try {
      const res = await fetch('/api/business/units');
      if (res.ok) {
        const data = await res.json();
        setBusinessUnits(data.units || []);
      }
    } catch (error) {
      console.error('Failed to fetch business units:', error);
    }
  }, []);

  useEffect(() => {
    fetchItems();
    fetchStats();
    fetchBusinessUnits();
  }, [fetchItems, fetchStats, fetchBusinessUnits]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ja-JP', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isOverdue = (ca: CorrectiveAction) => {
    if (!ca.dueAt) return false;
    if (['completed', 'closed', 'cancelled'].includes(ca.status)) return false;
    return new Date(ca.dueAt) < new Date();
  };

  return (
    <main className="pb-8">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg">
              <ShieldAlert className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-zinc-900">是正措置管理</h1>
              <p className="text-sm text-zinc-500">
                問題の根本原因分析と改善措置の追跡
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/corrective-actions/new"
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            新規作成
          </Link>
        </div>

        {/* 統計カード */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-blue-700">{stats.total}</div>
                <div className="text-xs text-blue-600">全件</div>
              </CardContent>
            </Card>
            <Card className="bg-purple-50 border-purple-200">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-purple-700">{stats.open}</div>
                <div className="text-xs text-purple-600">オープン</div>
              </CardContent>
            </Card>
            <Card className="bg-red-50 border-red-200">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-red-700">{stats.criticalOpen}</div>
                <div className="text-xs text-red-600">重大（オープン）</div>
              </CardContent>
            </Card>
            <Card className="bg-amber-50 border-amber-200">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-amber-700">{stats.overdue}</div>
                <div className="text-xs text-amber-600">期限超過</div>
              </CardContent>
            </Card>
            <Card className="bg-green-50 border-green-200">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-green-700">{stats.completedThisMonth}</div>
                <div className="text-xs text-green-600">今月完了</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* タブ */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-purple-600 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.id === 'critical' && stats && stats.criticalOpen > 0 && (
                <Badge className="bg-red-500 text-white text-xs ml-1">
                  {stats.criticalOpen}
                </Badge>
              )}
              {tab.id === 'overdue' && stats && stats.overdue > 0 && (
                <Badge className="bg-amber-500 text-white text-xs ml-1">
                  {stats.overdue}
                </Badge>
              )}
            </button>
          ))}
        </div>

        {/* フィルタ */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 text-sm text-zinc-600">
                <Filter className="w-4 h-4" />
                <span className="font-medium">フィルタ:</span>
              </div>

              {/* ステータス */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as CorrectiveActionStatus | '')}
                className="px-3 py-1.5 border border-zinc-200 rounded-lg text-sm"
              >
                <option value="">全ステータス</option>
                {Object.entries(CA_STATUS_CONFIG).map(([key, config]) => (
                  <option key={key} value={key}>{config.label}</option>
                ))}
              </select>

              {/* 重要度 */}
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value as CorrectiveActionSeverity | '')}
                className="px-3 py-1.5 border border-zinc-200 rounded-lg text-sm"
              >
                <option value="">全重要度</option>
                {Object.entries(CA_SEVERITY_CONFIG).map(([key, config]) => (
                  <option key={key} value={key}>{config.emoji} {config.label}</option>
                ))}
              </select>

              {/* ソースタイプ */}
              <select
                value={sourceTypeFilter}
                onChange={(e) => setSourceTypeFilter(e.target.value as SourceType | '')}
                className="px-3 py-1.5 border border-zinc-200 rounded-lg text-sm"
              >
                <option value="">全発生源</option>
                {Object.entries(SOURCE_TYPE_CONFIG).map(([key, config]) => (
                  <option key={key} value={key}>{config.icon} {config.label}</option>
                ))}
              </select>

              {/* Task 030: 事業単位 */}
              <select
                value={businessUnitFilter}
                onChange={(e) => setBusinessUnitFilter(e.target.value)}
                className="px-3 py-1.5 border border-zinc-200 rounded-lg text-sm"
              >
                <option value="">全事業</option>
                {businessUnits.map((bu) => (
                  <option key={bu.id} value={bu.id}>{bu.name}</option>
                ))}
              </select>

              {/* 検索 */}
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="件名・内容で検索..."
                    className="w-full pl-10 pr-4 py-1.5 border border-zinc-200 rounded-lg text-sm"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 是正措置一覧 */}
        {loading ? (
          <div className="text-center py-12 text-zinc-500">読み込み中...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-zinc-500">
            是正措置がありません
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((ca) => (
              <Link key={ca.id} href={`/dashboard/corrective-actions/${ca.id}`}>
              <Card
                className={`hover:shadow-md transition-all cursor-pointer ${
                  isOverdue(ca) ? 'border-red-300 bg-red-50/30' : ''
                } ${ca.severity === 'critical' ? 'border-l-4 border-l-red-500' : ''}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    {/* 重要度バッジ */}
                    <div className={`w-10 h-10 flex items-center justify-center rounded-lg text-lg ${
                      CA_SEVERITY_CONFIG[ca.severity].bg
                    }`}>
                      {CA_SEVERITY_CONFIG[ca.severity].emoji}
                    </div>

                    {/* メインコンテンツ */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge className={`text-xs ${
                          CA_STATUS_CONFIG[ca.status].bg
                        } ${CA_STATUS_CONFIG[ca.status].color}`}>
                          {CA_STATUS_CONFIG[ca.status].label}
                        </Badge>
                        <Badge className="bg-zinc-100 text-zinc-600 text-xs">
                          {SOURCE_TYPE_CONFIG[ca.sourceType].icon}{' '}
                          {SOURCE_TYPE_CONFIG[ca.sourceType].label}
                        </Badge>
                        {ca.status === 'blocked' && ca.meta && (
                          <Badge className="bg-red-100 text-red-700 text-xs">
                            {BLOCKED_REASON_CONFIG[(ca.meta as Record<string, unknown>).blockedReasonCode as BlockedReasonCode]?.icon}{' '}
                            {BLOCKED_REASON_CONFIG[(ca.meta as Record<string, unknown>).blockedReasonCode as BlockedReasonCode]?.label ?? 'ブロック中'}
                          </Badge>
                        )}
                        {isOverdue(ca) && (
                          <Badge className="bg-red-100 text-red-700 text-xs flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            期限超過
                          </Badge>
                        )}
                        {ca.verifiedAt && (
                          <Badge className="bg-green-100 text-green-700 text-xs flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            検証済
                          </Badge>
                        )}
                      </div>

                      <h3 className="font-medium text-zinc-800 mb-1 truncate">
                        {ca.title}
                      </h3>

                      <div className="flex items-center gap-4 text-xs text-zinc-500">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {ca.ownerUserName || '未割当'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDate(ca.updatedAt)}
                        </span>
                        {ca.dueAt && (
                          <span className={`flex items-center gap-1 ${
                            isOverdue(ca) ? 'text-red-600 font-medium' : ''
                          }`}>
                            <Calendar className="w-3 h-3" />
                            期限: {formatDate(ca.dueAt)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 矢印 */}
                    <ChevronRight className="w-5 h-5 text-zinc-400 flex-shrink-0" />
                  </div>
                </CardContent>
              </Card>
              </Link>
            ))}
          </div>
        )}

        {/* 件数表示 */}
        <div className="mt-4 text-center text-sm text-zinc-500">
          {totalCount}件中 {items.length}件表示
        </div>
      </div>
    </main>
  );
}
