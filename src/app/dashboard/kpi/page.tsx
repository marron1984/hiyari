'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@/components/ui';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  Filter,
  BarChart3,
  RefreshCw,
} from 'lucide-react';

// カテゴリ表示名
const CATEGORY_LABELS: Record<string, string> = {
  sales: '営業',
  operation: '業務',
  people: '人・組織',
  finance: '財務',
  risk: 'リスク',
  quality: '品質',
};

// カテゴリ色
const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  sales: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  operation: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  people: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  finance: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  risk: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  quality: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
};

// ステータス色
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  good: { bg: 'bg-green-100', text: 'text-green-700' },
  warning: { bg: 'bg-amber-100', text: 'text-amber-700' },
  critical: { bg: 'bg-red-100', text: 'text-red-700' },
  neutral: { bg: 'bg-zinc-100', text: 'text-zinc-600' },
};

type KPIHighlight = {
  kpiId: string;
  name: string;
  currentValue: number | null;
  previousValue: number | null;
  unit: string;
  changePercent: number | null;
  trend: 'up' | 'down' | 'flat';
  status: 'good' | 'warning' | 'critical' | 'neutral';
  category: string;
  dashboardPath?: string;
};

type HighlightsResponse = {
  success: boolean;
  highlights: KPIHighlight[];
  byCategory: Record<string, KPIHighlight[]>;
  statusCounts: {
    good: number;
    warning: number;
    critical: number;
    neutral: number;
  };
  total: number;
};

export default function KpiDashboardPage() {
  const [data, setData] = useState<HighlightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showExternalOnly, setShowExternalOnly] = useState(false);

  // データ取得
  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedCategory) params.set('category', selectedCategory);
      if (showExternalOnly) params.set('externalOnly', 'true');

      const res = await fetch(`/api/kpi/highlights?${params.toString()}`);
      const json = await res.json();
      setData(json);
    } catch (error) {
      console.error('Failed to fetch KPI data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedCategory, showExternalOnly]);

  // トレンドアイコン
  const TrendIcon = ({ trend }: { trend: 'up' | 'down' | 'flat' }) => {
    if (trend === 'up') return <TrendingUp className="w-4 h-4" />;
    if (trend === 'down') return <TrendingDown className="w-4 h-4" />;
    return <Minus className="w-4 h-4" />;
  };

  // 表示するハイライト
  const displayHighlights = data?.highlights ?? [];

  return (
    <main className="pb-8">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* ヘッダー */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">KPIダッシュボード</h1>
              <p className="text-sm text-gray-500">主要指標の一覧と推移</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowExternalOnly(!showExternalOnly)}
              className={showExternalOnly ? 'bg-blue-50 border-blue-300' : ''}
            >
              <Filter className="w-4 h-4 mr-1" />
              外部共有可のみ
            </Button>
            <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              更新
            </Button>
          </div>
        </div>

        {/* サマリーカード */}
        {data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-1">
                  <BarChart3 className="w-4 h-4 text-zinc-500" />
                  <span className="text-sm text-zinc-600">全KPI</span>
                </div>
                <p className="text-2xl font-bold">{data.total}</p>
              </CardContent>
            </Card>
            <Card className="border-green-200 bg-green-50/50">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span className="text-sm text-green-700">良好</span>
                </div>
                <p className="text-2xl font-bold text-green-700">{data.statusCounts.good}</p>
              </CardContent>
            </Card>
            <Card className="border-amber-200 bg-amber-50/50">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span className="text-sm text-amber-700">警告</span>
                </div>
                <p className="text-2xl font-bold text-amber-700">{data.statusCounts.warning}</p>
              </CardContent>
            </Card>
            <Card className="border-red-200 bg-red-50/50">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  <span className="text-sm text-red-700">要注意</span>
                </div>
                <p className="text-2xl font-bold text-red-700">{data.statusCounts.critical}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* カテゴリフィルター */}
        <div className="flex gap-2 flex-wrap mb-6">
          <Button
            variant={selectedCategory === null ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setSelectedCategory(null)}
          >
            すべて
          </Button>
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <Button
              key={key}
              variant={selectedCategory === key ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory(key)}
            >
              {label}
            </Button>
          ))}
        </div>

        {/* ローディング */}
        {loading && (
          <div className="text-center py-12">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-zinc-400" />
            <p className="text-zinc-500">読み込み中...</p>
          </div>
        )}

        {/* KPIカード一覧 */}
        {!loading && displayHighlights.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayHighlights.map((kpi) => {
              const catColor = CATEGORY_COLORS[kpi.category] ?? CATEGORY_COLORS.quality;
              const statColor = STATUS_COLORS[kpi.status];

              return (
                <Link
                  key={kpi.kpiId}
                  href={`/dashboard/kpi/${kpi.kpiId}`}
                  className="block"
                >
                  <Card className={`${catColor.border} hover:shadow-md transition-shadow cursor-pointer h-full`}>
                    <CardContent className="pt-4">
                      {/* ヘッダー部分 */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge className={`text-xs ${catColor.bg} ${catColor.text}`}>
                              {CATEGORY_LABELS[kpi.category] ?? kpi.category}
                            </Badge>
                            <Badge className={`text-xs ${statColor.bg} ${statColor.text}`}>
                              {kpi.status === 'good'
                                ? '良好'
                                : kpi.status === 'warning'
                                  ? '警告'
                                  : kpi.status === 'critical'
                                    ? '要注意'
                                    : '-'}
                            </Badge>
                          </div>
                          <h3 className="font-semibold text-zinc-800">{kpi.name}</h3>
                        </div>
                        <ChevronRight className="w-5 h-5 text-zinc-400" />
                      </div>

                      {/* 値とトレンド */}
                      <div className="flex items-end justify-between">
                        <div>
                          <span className="text-3xl font-bold text-zinc-800">
                            {kpi.currentValue !== null ? kpi.currentValue : '-'}
                          </span>
                          <span className="text-sm text-zinc-500 ml-1">{kpi.unit}</span>
                        </div>
                        {kpi.changePercent !== null && (
                          <div
                            className={`flex items-center gap-1 text-sm ${
                              kpi.trend === 'up'
                                ? 'text-green-600'
                                : kpi.trend === 'down'
                                  ? 'text-red-600'
                                  : 'text-zinc-500'
                            }`}
                          >
                            <TrendIcon trend={kpi.trend} />
                            <span>
                              {kpi.changePercent > 0 ? '+' : ''}
                              {kpi.changePercent}%
                            </span>
                          </div>
                        )}
                      </div>

                      {/* 前回値 */}
                      {kpi.previousValue !== null && (
                        <p className="text-xs text-zinc-500 mt-2">
                          前回: {kpi.previousValue}
                          {kpi.unit}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}

        {/* 空状態 */}
        {!loading && displayHighlights.length === 0 && (
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-zinc-500">
                <Activity className="w-12 h-12 mx-auto mb-4 text-zinc-300" />
                <p>該当するKPIがありません</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* フッター */}
        <div className="mt-8 text-center">
          <div className="flex justify-center gap-4">
            <Link
              href="/dashboard/wbr"
              className="text-sm text-blue-500 hover:text-blue-700"
            >
              週次レビュー（WBR）を見る →
            </Link>
            <Link
              href="/dashboard/alerts"
              className="text-sm text-red-500 hover:text-red-700"
            >
              アラート一覧を見る →
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
