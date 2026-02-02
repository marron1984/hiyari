'use client';

import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/Header';
import { Card, Button } from '@/components/ui';
import { Select } from '@/components/ui/Select';
import { Loading } from '@/components/Loading';
import { useRole } from '@/contexts/RoleContext';
import Link from 'next/link';
import {
  BookOpen,
  Search,
  Filter,
  TrendingUp,
  TrendingDown,
  Minus,
  ExternalLink,
  Tag,
  RefreshCw,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import type { KPIDictionaryEntry } from '@/lib/kpiDictionary/types';

// カテゴリ設定
const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  sales: { label: '営業', color: 'bg-blue-100 text-blue-700' },
  operation: { label: '業務', color: 'bg-green-100 text-green-700' },
  people: { label: '人・組織', color: 'bg-purple-100 text-purple-700' },
  finance: { label: '財務', color: 'bg-amber-100 text-amber-700' },
  risk: { label: 'リスク', color: 'bg-red-100 text-red-700' },
  quality: { label: '品質', color: 'bg-cyan-100 text-cyan-700' },
};

const CATEGORY_OPTIONS = [
  { value: '', label: 'すべてのカテゴリ' },
  { value: 'sales', label: '営業' },
  { value: 'operation', label: '業務' },
  { value: 'people', label: '人・組織' },
  { value: 'finance', label: '財務' },
  { value: 'risk', label: 'リスク' },
  { value: 'quality', label: '品質' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'すべてのステータス' },
  { value: 'active', label: 'アクティブ' },
  { value: 'deprecated', label: '廃止' },
];

export default function KpiDictionaryPage() {
  const { currentRole } = useRole();
  const isAdmin = currentRole === 'admin';

  const [entries, setEntries] = useState<KPIDictionaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('active');
  const [filterTag, setFilterTag] = useState<string>('');
  const [allTags, setAllTags] = useState<string[]>([]);
  const [total, setTotal] = useState(0);

  // データ取得
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.set('q', searchTerm);
      if (filterCategory) params.set('category', filterCategory);
      if (filterStatus) params.set('status', filterStatus);
      if (filterTag) params.set('tag', filterTag);

      const res = await fetch(`/api/kpi/dictionary?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries);
        setTotal(data.total);
        setAllTags(data.tags || []);
      }
    } catch (err) {
      console.error('Failed to fetch KPI dictionary:', err);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, filterCategory, filterStatus, filterTag]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 方向性アイコン
  const DirectionIcon = ({ direction }: { direction: string }) => {
    if (direction === 'higher_is_better') {
      return <span title="↑が良い"><TrendingUp className="w-4 h-4 text-green-600" /></span>;
    }
    if (direction === 'lower_is_better') {
      return <span title="↓が良い"><TrendingDown className="w-4 h-4 text-red-600" /></span>;
    }
    return <span title="中立"><Minus className="w-4 h-4 text-zinc-400" /></span>;
  };

  if (loading) {
    return <Loading />;
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <Header />

      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <BookOpen className="w-6 h-6 text-zinc-700" />
            <h1 className="text-xl font-bold">KPI辞書</h1>
            <span className="text-sm text-zinc-500">（{total}件）</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="w-4 h-4 mr-1" />
              更新
            </Button>
            {isAdmin && (
              <Button variant="primary" size="sm">
                KPI追加
              </Button>
            )}
          </div>
        </div>

        {/* フィルタ */}
        <Card className="mb-6">
          <div className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              {/* 検索 */}
              <div className="flex items-center gap-2 flex-1 min-w-64">
                <Search className="w-4 h-4 text-zinc-400" />
                <input
                  type="text"
                  placeholder="KPI名・ID・定義で検索"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="flex-1 px-3 py-2 border border-zinc-300 rounded-lg text-sm"
                />
              </div>

              {/* カテゴリ */}
              <Select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                options={CATEGORY_OPTIONS}
              />

              {/* ステータス */}
              <Select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                options={STATUS_OPTIONS}
              />

              {/* タグ */}
              {allTags.length > 0 && (
                <Select
                  value={filterTag}
                  onChange={(e) => setFilterTag(e.target.value)}
                  options={[
                    { value: '', label: 'すべてのタグ' },
                    ...allTags.map((tag) => ({ value: tag, label: tag })),
                  ]}
                />
              )}
            </div>
          </div>
        </Card>

        {/* KPI一覧 */}
        {entries.length === 0 ? (
          <Card>
            <div className="p-8 text-center text-zinc-500">
              条件に一致するKPIがありません
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <Link
                key={entry.id}
                href={`/dashboard/kpi-dictionary/${entry.id}`}
                className="block"
              >
                <Card className={`hover:shadow-md transition-shadow ${entry.status === 'deprecated' ? 'opacity-60' : ''}`}>
                  <div className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          {/* ステータス */}
                          {entry.status === 'deprecated' ? (
                            <span className="px-1.5 py-0.5 bg-zinc-200 text-zinc-600 text-xs rounded">
                              廃止
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs rounded">
                              稼働中
                            </span>
                          )}

                          {/* カテゴリ */}
                          <span
                            className={`px-1.5 py-0.5 text-xs rounded ${CATEGORY_CONFIG[entry.category]?.color || 'bg-zinc-100'}`}
                          >
                            {CATEGORY_CONFIG[entry.category]?.label || entry.category}
                          </span>

                          {/* 方向性 */}
                          <DirectionIcon direction={entry.direction} />

                          {/* 外部公開 */}
                          {entry.isExternalAllowed && (
                            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                              <ExternalLink className="w-3 h-3" />
                              外部公開可
                            </span>
                          )}
                        </div>

                        <h3 className="font-semibold text-lg">{entry.name}</h3>
                        <p className="text-sm text-zinc-500 mt-1">
                          ID: {entry.id} / 単位: {entry.unit} / 頻度: {entry.frequency}
                        </p>

                        {entry.description && (
                          <p className="text-sm text-zinc-600 mt-2 line-clamp-2">
                            {entry.description}
                          </p>
                        )}

                        {/* タグ */}
                        {entry.tags.length > 0 && (
                          <div className="flex items-center gap-1 mt-2">
                            <Tag className="w-3 h-3 text-zinc-400" />
                            {entry.tags.slice(0, 5).map((tag) => (
                              <span
                                key={tag}
                                className="px-1.5 py-0.5 bg-zinc-100 text-zinc-600 text-xs rounded"
                              >
                                {tag}
                              </span>
                            ))}
                            {entry.tags.length > 5 && (
                              <span className="text-xs text-zinc-400">
                                +{entry.tags.length - 5}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 ml-4">
                        {/* オーナー */}
                        {entry.ownerRole && (
                          <span className="text-xs text-zinc-500">
                            責任: {entry.ownerRole}
                          </span>
                        )}
                        <ChevronRight className="w-5 h-5 text-zinc-400" />
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
