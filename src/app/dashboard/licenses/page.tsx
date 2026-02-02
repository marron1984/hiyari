'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, Badge } from '@/components/ui';
import {
  Award,
  Filter,
  Search,
  User,
  Clock,
  AlertTriangle,
  Calendar,
  Building,
} from 'lucide-react';
import type {
  LicenseListItem,
  LicenseStats,
  LicenseCategoryType,
  UserLicenseStatus,
} from '@/lib/licenses/types';
import {
  LICENSE_CATEGORY_CONFIG,
  LICENSE_STATUS_CONFIG,
} from '@/lib/licenses/types';

type TabType = 'all' | 'expiring' | 'expired';

const TABS: { id: TabType; label: string; icon: React.ReactNode }[] = [
  { id: 'all', label: '全件', icon: <Award className="w-4 h-4" /> },
  { id: 'expiring', label: '期限間近', icon: <Clock className="w-4 h-4" /> },
  { id: 'expired', label: '期限切れ', icon: <AlertTriangle className="w-4 h-4" /> },
];

// デモ用組織リスト（本番ではAPIから取得）
const ORG_UNITS = [
  { id: 'org_nishi', name: '西部事業所' },
  { id: 'org_higashi', name: '東部事業所' },
  { id: 'org_sakura', name: 'さくら訪問看護' },
];

export default function LicensesPage() {
  const searchParams = useSearchParams();

  // Task 030: URLパラメータから初期値を取得
  const initialOrgUnitId = searchParams.get('orgUnitId') || '';
  const initialExpiringWithinDays = searchParams.get('expiringWithinDays');

  const [activeTab, setActiveTab] = useState<TabType>(
    initialExpiringWithinDays ? 'expiring' : 'all'
  );
  const [items, setItems] = useState<LicenseListItem[]>([]);
  const [stats, setStats] = useState<LicenseStats | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // フィルタ
  const [statusFilter, setStatusFilter] = useState<UserLicenseStatus | ''>('');
  const [categoryFilter, setCategoryFilter] = useState<LicenseCategoryType | ''>('');
  const [orgUnitFilter, setOrgUnitFilter] = useState(initialOrgUnitId);  // Task 030
  const [searchQuery, setSearchQuery] = useState('');

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();

      // タブによるフィルタ
      if (activeTab === 'expiring') {
        params.append('expiringWithinDays', '90');
      }
      if (activeTab === 'expired') {
        params.append('expired', 'true');
      }

      // 追加フィルタ
      if (statusFilter) params.append('status', statusFilter);
      if (categoryFilter) params.append('category', categoryFilter);
      if (orgUnitFilter) params.append('orgUnitId', orgUnitFilter);  // Task 030
      if (searchQuery) params.append('q', searchQuery);

      const res = await fetch(`/api/licenses?${params.toString()}`);
      const data = await res.json();

      setItems(data.items || []);
      setTotalCount(data.total || 0);
    } catch (error) {
      console.error('Failed to fetch licenses:', error);
    } finally {
      setLoading(false);
    }
  }, [activeTab, statusFilter, categoryFilter, orgUnitFilter, searchQuery]);

  const fetchStats = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (orgUnitFilter) params.append('orgUnitId', orgUnitFilter);

      const res = await fetch(`/api/licenses/stats?${params.toString()}`);
      const data = await res.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  }, [orgUnitFilter]);

  useEffect(() => {
    fetchItems();
    fetchStats();
  }, [fetchItems, fetchStats]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '無期限';
    return new Date(dateStr).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getDaysUntilExpiry = (expiresAt: string | null): number | null => {
    if (!expiresAt) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expDate = new Date(expiresAt);
    return Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  const getExpiryBadge = (item: LicenseListItem) => {
    const days = getDaysUntilExpiry(item.userLicense.expiresAt);
    if (days === null) return null;
    if (days < 0) {
      return (
        <Badge className="bg-red-100 text-red-700 text-xs flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          期限切れ
        </Badge>
      );
    }
    if (days <= 30) {
      return (
        <Badge className="bg-orange-100 text-orange-700 text-xs">
          残り{days}日
        </Badge>
      );
    }
    if (days <= 90) {
      return (
        <Badge className="bg-amber-100 text-amber-700 text-xs">
          残り{days}日
        </Badge>
      );
    }
    return null;
  };

  return (
    <main className="pb-8">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-lg">
              <Award className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-zinc-900">資格管理</h1>
              <p className="text-sm text-zinc-500">
                スタッフの資格・免許の管理
              </p>
            </div>
          </div>
        </div>

        {/* 統計カード */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card className="bg-green-50 border-green-200">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-green-700">{stats.totalActive}</div>
                <div className="text-xs text-green-600">有効な資格</div>
              </CardContent>
            </Card>
            <Card className="bg-red-50 border-red-200">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-red-700">{stats.expired}</div>
                <div className="text-xs text-red-600">期限切れ</div>
              </CardContent>
            </Card>
            <Card className="bg-orange-50 border-orange-200">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-orange-700">{stats.expiring30}</div>
                <div className="text-xs text-orange-600">30日以内に期限</div>
              </CardContent>
            </Card>
            <Card className="bg-amber-50 border-amber-200">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-amber-700">{stats.expiring90}</div>
                <div className="text-xs text-amber-600">90日以内に期限</div>
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
                  ? 'bg-teal-600 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.id === 'expired' && stats && stats.expired > 0 && (
                <Badge className="bg-red-500 text-white text-xs ml-1">
                  {stats.expired}
                </Badge>
              )}
              {tab.id === 'expiring' && stats && stats.expiring30 > 0 && (
                <Badge className="bg-orange-500 text-white text-xs ml-1">
                  {stats.expiring30}
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
                onChange={(e) => setStatusFilter(e.target.value as UserLicenseStatus | '')}
                className="px-3 py-1.5 border border-zinc-200 rounded-lg text-sm"
              >
                <option value="">全ステータス</option>
                {Object.entries(LICENSE_STATUS_CONFIG).map(([key, config]) => (
                  <option key={key} value={key}>{config.emoji} {config.label}</option>
                ))}
              </select>

              {/* カテゴリ */}
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as LicenseCategoryType | '')}
                className="px-3 py-1.5 border border-zinc-200 rounded-lg text-sm"
              >
                <option value="">全カテゴリ</option>
                {Object.entries(LICENSE_CATEGORY_CONFIG).map(([key, config]) => (
                  <option key={key} value={key}>{config.icon} {config.label}</option>
                ))}
              </select>

              {/* Task 030: 組織 */}
              <select
                value={orgUnitFilter}
                onChange={(e) => setOrgUnitFilter(e.target.value)}
                className="px-3 py-1.5 border border-zinc-200 rounded-lg text-sm"
              >
                <option value="">全組織</option>
                {ORG_UNITS.map((org) => (
                  <option key={org.id} value={org.id}>{org.name}</option>
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
                    placeholder="氏名・資格名で検索..."
                    className="w-full pl-10 pr-4 py-1.5 border border-zinc-200 rounded-lg text-sm"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 資格一覧 */}
        {loading ? (
          <div className="text-center py-12 text-zinc-500">読み込み中...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-zinc-500">
            資格データがありません
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <Card
                key={item.userLicense.id}
                className={`hover:shadow-md transition-all ${
                  item.userLicense.status === 'expired' ? 'border-red-300 bg-red-50/30' : ''
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    {/* カテゴリアイコン */}
                    <div className={`w-10 h-10 flex items-center justify-center rounded-lg text-lg ${
                      LICENSE_CATEGORY_CONFIG[item.licenseType.category].bg
                    }`}>
                      {LICENSE_CATEGORY_CONFIG[item.licenseType.category].icon}
                    </div>

                    {/* メインコンテンツ */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge className={`text-xs ${
                          LICENSE_STATUS_CONFIG[item.userLicense.status].bg
                        } ${LICENSE_STATUS_CONFIG[item.userLicense.status].color}`}>
                          {LICENSE_STATUS_CONFIG[item.userLicense.status].label}
                        </Badge>
                        <Badge className="bg-zinc-100 text-zinc-600 text-xs">
                          {LICENSE_CATEGORY_CONFIG[item.licenseType.category].label}
                        </Badge>
                        {getExpiryBadge(item)}
                      </div>

                      <h3 className="font-medium text-zinc-800 mb-1">
                        {item.licenseType.name}
                      </h3>

                      <div className="flex items-center gap-4 text-xs text-zinc-500">
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {item.user.name || '不明'}
                        </span>
                        {item.userLicense.licenseNumber && (
                          <span className="flex items-center gap-1">
                            <Award className="w-3 h-3" />
                            {item.userLicense.licenseNumber}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          期限: {formatDate(item.userLicense.expiresAt)}
                        </span>
                        {item.user.orgUnitId && (
                          <span className="flex items-center gap-1">
                            <Building className="w-3 h-3" />
                            {ORG_UNITS.find(o => o.id === item.user.orgUnitId)?.name || item.user.orgUnitId}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
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
