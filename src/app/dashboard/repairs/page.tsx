'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, Badge } from '@/components/ui';
import {
  Wrench,
  Plus,
  Filter,
  Search,
  User,
  Clock,
  AlertTriangle,
  MapPin,
  ChevronRight,
  Calendar,
  Building2,
} from 'lucide-react';
import type {
  RepairRecord,
  RepairStatus,
  RepairCategory,
  SafetyRisk,
  RepairStats,
} from '@/lib/repairs/types';
import {
  REPAIR_STATUS_CONFIG,
  REPAIR_CATEGORY_CONFIG,
  SAFETY_RISK_CONFIG,
} from '@/lib/repairs/types';
import type { BusinessUnit } from '@/lib/business/types';

type TabType = 'all' | 'open' | 'high_risk' | 'overdue';

const TABS: { id: TabType; label: string; icon: React.ReactNode }[] = [
  { id: 'all', label: '全件', icon: <Wrench className="w-4 h-4" /> },
  { id: 'open', label: 'オープン', icon: <Clock className="w-4 h-4" /> },
  { id: 'high_risk', label: '高リスク', icon: <AlertTriangle className="w-4 h-4" /> },
  { id: 'overdue', label: '期限超過', icon: <Calendar className="w-4 h-4" /> },
];

export default function RepairsPage() {
  const searchParams = useSearchParams();

  // Task 030: URLパラメータから初期値を取得
  const initialBusinessUnitId = searchParams.get('businessUnitId') || '';
  const initialStatus = searchParams.get('status') as RepairStatus | null;
  const initialSafetyRisk = searchParams.get('safetyRisk') as SafetyRisk | null;

  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [repairs, setRepairs] = useState<RepairRecord[]>([]);
  const [stats, setStats] = useState<RepairStats | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // フィルタ
  const [statusFilter, setStatusFilter] = useState<RepairStatus | ''>(initialStatus || '');
  const [categoryFilter, setCategoryFilter] = useState<RepairCategory | ''>('');
  const [safetyRiskFilter, setSafetyRiskFilter] = useState<SafetyRisk | ''>(initialSafetyRisk || '');
  const [businessUnitFilter, setBusinessUnitFilter] = useState(initialBusinessUnitId);  // Task 030
  const [searchQuery, setSearchQuery] = useState('');

  // Task 030: 事業単位リスト
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);

  const fetchRepairs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();

      // タブによるフィルタ
      if (activeTab === 'overdue') {
        params.append('overdue', 'true');
      }
      if (activeTab === 'high_risk') {
        params.append('safetyRisk', 'high');
      }

      // 追加フィルタ
      if (statusFilter) params.append('status', statusFilter);
      if (categoryFilter) params.append('category', categoryFilter);
      if (safetyRiskFilter && activeTab !== 'high_risk') params.append('safetyRisk', safetyRiskFilter);
      if (businessUnitFilter) params.append('businessUnitId', businessUnitFilter);  // Task 030
      if (searchQuery) params.append('q', searchQuery);

      const res = await fetch(`/api/repairs?${params.toString()}`);
      const data = await res.json();

      let items = data.repairs || [];

      // オープンタブの場合、ステータスでフィルタ
      if (activeTab === 'open' && !statusFilter) {
        items = items.filter((r: RepairRecord) =>
          ['reported', 'assessing', 'scheduled', 'in_progress'].includes(r.status)
        );
      }

      setRepairs(items);
      setTotalCount(data.total || 0);
    } catch (error) {
      console.error('Failed to fetch repairs:', error);
    } finally {
      setLoading(false);
    }
  }, [activeTab, statusFilter, categoryFilter, safetyRiskFilter, businessUnitFilter, searchQuery]);

  const fetchStats = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (businessUnitFilter) params.append('businessUnitId', businessUnitFilter);

      const res = await fetch(`/api/repairs/stats?${params.toString()}`);
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
    fetchRepairs();
    fetchStats();
    fetchBusinessUnits();
  }, [fetchRepairs, fetchStats, fetchBusinessUnits]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ja-JP', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isOverdue = (repair: RepairRecord) => {
    if (!repair.dueAt) return false;
    if (['completed', 'cancelled'].includes(repair.status)) return false;
    return new Date(repair.dueAt) < new Date();
  };

  return (
    <main className="pb-8">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg">
              <Wrench className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-zinc-900">修繕管理</h1>
              <p className="text-sm text-zinc-500">
                設備故障・修繕依頼の管理
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/repairs/new"
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
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
            <Card className="bg-orange-50 border-orange-200">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-orange-700">{stats.open}</div>
                <div className="text-xs text-orange-600">オープン</div>
              </CardContent>
            </Card>
            <Card className="bg-red-50 border-red-200">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-red-700">{stats.highRiskOpen}</div>
                <div className="text-xs text-red-600">高リスク</div>
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
                  ? 'bg-orange-600 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.id === 'high_risk' && stats && stats.highRiskOpen > 0 && (
                <Badge className="bg-red-500 text-white text-xs ml-1">
                  {stats.highRiskOpen}
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
                onChange={(e) => setStatusFilter(e.target.value as RepairStatus | '')}
                className="px-3 py-1.5 border border-zinc-200 rounded-lg text-sm"
              >
                <option value="">全ステータス</option>
                {Object.entries(REPAIR_STATUS_CONFIG).map(([key, config]) => (
                  <option key={key} value={key}>{config.label}</option>
                ))}
              </select>

              {/* カテゴリ */}
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as RepairCategory | '')}
                className="px-3 py-1.5 border border-zinc-200 rounded-lg text-sm"
              >
                <option value="">全カテゴリ</option>
                {Object.entries(REPAIR_CATEGORY_CONFIG).map(([key, config]) => (
                  <option key={key} value={key}>{config.icon} {config.label}</option>
                ))}
              </select>

              {/* 安全リスク */}
              <select
                value={safetyRiskFilter}
                onChange={(e) => setSafetyRiskFilter(e.target.value as SafetyRisk | '')}
                className="px-3 py-1.5 border border-zinc-200 rounded-lg text-sm"
              >
                <option value="">全リスク</option>
                {Object.entries(SAFETY_RISK_CONFIG).map(([key, config]) => (
                  <option key={key} value={key}>{config.emoji} {config.label}</option>
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

        {/* 修繕一覧 */}
        {loading ? (
          <div className="text-center py-12 text-zinc-500">読み込み中...</div>
        ) : repairs.length === 0 ? (
          <div className="text-center py-12 text-zinc-500">
            修繕記録がありません
          </div>
        ) : (
          <div className="space-y-3">
            {repairs.map((repair) => (
              <Card
                key={repair.id}
                className={`hover:shadow-md transition-all ${
                  isOverdue(repair) ? 'border-red-300 bg-red-50/30' : ''
                } ${repair.safetyRisk === 'high' ? 'border-l-4 border-l-red-500' : ''}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    {/* リスクバッジ */}
                    <div className={`w-10 h-10 flex items-center justify-center rounded-lg text-lg ${
                      SAFETY_RISK_CONFIG[repair.safetyRisk].bg
                    }`}>
                      {SAFETY_RISK_CONFIG[repair.safetyRisk].emoji}
                    </div>

                    {/* メインコンテンツ */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge className={`text-xs ${
                          REPAIR_STATUS_CONFIG[repair.status].bg
                        } ${REPAIR_STATUS_CONFIG[repair.status].color}`}>
                          {REPAIR_STATUS_CONFIG[repair.status].label}
                        </Badge>
                        <Badge className="bg-zinc-100 text-zinc-600 text-xs">
                          {REPAIR_CATEGORY_CONFIG[repair.category].icon}{' '}
                          {REPAIR_CATEGORY_CONFIG[repair.category].label}
                        </Badge>
                        {isOverdue(repair) && (
                          <Badge className="bg-red-100 text-red-700 text-xs flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            期限超過
                          </Badge>
                        )}
                      </div>

                      <h3 className="font-medium text-zinc-800 mb-1 truncate">
                        {repair.title}
                      </h3>

                      <div className="flex items-center gap-4 text-xs text-zinc-500">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {repair.reportedByUserName || '不明'}
                        </span>
                        {repair.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {repair.location}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDate(repair.updatedAt)}
                        </span>
                        {repair.dueAt && (
                          <span className={`flex items-center gap-1 ${
                            isOverdue(repair) ? 'text-red-600 font-medium' : ''
                          }`}>
                            <Calendar className="w-3 h-3" />
                            期限: {formatDate(repair.dueAt)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 矢印 */}
                    <ChevronRight className="w-5 h-5 text-zinc-400 flex-shrink-0" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* 件数表示 */}
        <div className="mt-4 text-center text-sm text-zinc-500">
          {totalCount}件中 {repairs.length}件表示
        </div>
      </div>
    </main>
  );
}
