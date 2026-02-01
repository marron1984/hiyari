'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@/components/ui';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  ArrowLeft,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Info,
  ExternalLink,
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

type KPIDetail = {
  id: string;
  name: string;
  description: string;
  unit: string;
  category: string;
  direction: 'higher_is_better' | 'lower_is_better';
  frequency: 'daily' | 'weekly';
  isExternalAllowed: boolean;
  thresholds?: {
    warning?: number;
    critical?: number;
  };
  dashboardPath?: string;
  currentValue: number | null;
  previousValue: number | null;
  changePercent: number | null;
};

type TimeSeriesPoint = {
  date: string;
  value: number | null;
};

type KPIResponse = {
  success: boolean;
  kpi: KPIDetail;
  timeSeries: {
    kpiId: string;
    points: TimeSeriesPoint[];
    count: number;
  };
};

export default function KpiDetailPage({
  params,
}: {
  params: Promise<{ kpiId: string }>;
}) {
  const resolvedParams = use(params);
  const kpiId = resolvedParams.kpiId;

  const [data, setData] = useState<KPIResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // データ取得
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/kpi/${kpiId}?limit=30`);
      const json = await res.json();
      if (!json.success) {
        setError(json.error || 'データの取得に失敗しました');
      } else {
        setData(json);
      }
    } catch (err) {
      setError('データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [kpiId]);

  // トレンドアイコン
  const TrendIcon = ({ direction }: { direction: 'higher_is_better' | 'lower_is_better' }) => {
    if (direction === 'higher_is_better') {
      return (
        <div className="flex items-center gap-1 text-green-600">
          <TrendingUp className="w-4 h-4" />
          <span className="text-xs">高いほど良い</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1 text-blue-600">
        <TrendingDown className="w-4 h-4" />
        <span className="text-xs">低いほど良い</span>
      </div>
    );
  };

  // ステータス判定
  const getStatus = (value: number | null, kpi: KPIDetail): 'good' | 'warning' | 'critical' | 'neutral' => {
    if (value === null || !kpi.thresholds) return 'neutral';

    const { warning, critical } = kpi.thresholds;

    if (kpi.direction === 'higher_is_better') {
      if (critical !== undefined && value < critical) return 'critical';
      if (warning !== undefined && value < warning) return 'warning';
      return 'good';
    } else {
      if (critical !== undefined && value > critical) return 'critical';
      if (warning !== undefined && value > warning) return 'warning';
      return 'good';
    }
  };

  // ミニチャート（簡易SVG）
  const MiniChart = ({ points }: { points: TimeSeriesPoint[] }) => {
    const validPoints = points.filter((p) => p.value !== null);
    if (validPoints.length < 2) {
      return <div className="h-32 flex items-center justify-center text-zinc-400">データ不足</div>;
    }

    const values = validPoints.map((p) => p.value as number);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal || 1;

    const width = 100;
    const height = 100;
    const padding = 10;

    const chartPoints = validPoints.map((p, i) => {
      const x = padding + (i / (validPoints.length - 1)) * (width - 2 * padding);
      const y = height - padding - ((p.value as number - minVal) / range) * (height - 2 * padding);
      return { x, y, date: p.date, value: p.value };
    });

    const pathD = chartPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

    return (
      <div className="relative">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-32">
          {/* グリッド線 */}
          <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#e5e7eb" strokeWidth="1" />
          <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#e5e7eb" strokeWidth="1" />

          {/* 閾値線（あれば） */}
          {data?.kpi.thresholds?.warning && (
            <line
              x1={padding}
              y1={height - padding - ((data.kpi.thresholds.warning - minVal) / range) * (height - 2 * padding)}
              x2={width - padding}
              y2={height - padding - ((data.kpi.thresholds.warning - minVal) / range) * (height - 2 * padding)}
              stroke="#f59e0b"
              strokeWidth="1"
              strokeDasharray="4 2"
            />
          )}
          {data?.kpi.thresholds?.critical && (
            <line
              x1={padding}
              y1={height - padding - ((data.kpi.thresholds.critical - minVal) / range) * (height - 2 * padding)}
              x2={width - padding}
              y2={height - padding - ((data.kpi.thresholds.critical - minVal) / range) * (height - 2 * padding)}
              stroke="#ef4444"
              strokeWidth="1"
              strokeDasharray="4 2"
            />
          )}

          {/* ライン */}
          <path d={pathD} fill="none" stroke="#3b82f6" strokeWidth="2" />

          {/* ポイント */}
          {chartPoints.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="3" fill="#3b82f6" />
          ))}
        </svg>

        {/* 凡例 */}
        <div className="flex justify-between text-xs text-zinc-500 px-2">
          <span>{validPoints[0]?.date}</span>
          <span>{validPoints[validPoints.length - 1]?.date}</span>
        </div>
      </div>
    );
  };

  // ローディング
  if (loading) {
    return (
      <main className="pb-8">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="text-center py-12">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-zinc-400" />
            <p className="text-zinc-500">読み込み中...</p>
          </div>
        </div>
      </main>
    );
  }

  // エラー
  if (error || !data) {
    return (
      <main className="pb-8">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <Link href="/dashboard/kpi" className="inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-800 mb-4">
            <ArrowLeft className="w-4 h-4" />
            KPI一覧に戻る
          </Link>
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-red-500">
                <AlertTriangle className="w-12 h-12 mx-auto mb-4" />
                <p>{error || 'KPIが見つかりません'}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  const { kpi, timeSeries } = data;
  const status = getStatus(kpi.currentValue, kpi);

  return (
    <main className="pb-8">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* パンくず */}
        <Link href="/dashboard/kpi" className="inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-800 mb-4">
          <ArrowLeft className="w-4 h-4" />
          KPI一覧に戻る
        </Link>

        {/* ヘッダー */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge className="text-xs bg-zinc-100 text-zinc-700">
                  {CATEGORY_LABELS[kpi.category] ?? kpi.category}
                </Badge>
                <Badge className="text-xs bg-blue-100 text-blue-700">
                  {kpi.frequency === 'daily' ? '日次' : '週次'}
                </Badge>
                {kpi.isExternalAllowed && (
                  <Badge className="text-xs bg-green-100 text-green-700">外部共有可</Badge>
                )}
              </div>
              <h1 className="text-2xl font-bold">{kpi.name}</h1>
              <p className="text-sm text-gray-500 mt-1">{kpi.description}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="w-4 h-4 mr-1" />
              更新
            </Button>
            {kpi.dashboardPath && (
              <Link href={kpi.dashboardPath}>
                <Button variant="outline" size="sm">
                  <ExternalLink className="w-4 h-4 mr-1" />
                  詳細画面
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* 現在値カード */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card
            className={`col-span-1 md:col-span-2 ${
              status === 'critical'
                ? 'border-red-300 bg-red-50'
                : status === 'warning'
                  ? 'border-amber-300 bg-amber-50'
                  : status === 'good'
                    ? 'border-green-300 bg-green-50'
                    : ''
            }`}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-zinc-600">現在値</span>
                <div className="flex items-center gap-2">
                  {status === 'good' && <CheckCircle className="w-5 h-5 text-green-600" />}
                  {status === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-600" />}
                  {status === 'critical' && <AlertTriangle className="w-5 h-5 text-red-600" />}
                  <Badge
                    className={`text-xs ${
                      status === 'critical'
                        ? 'bg-red-100 text-red-700'
                        : status === 'warning'
                          ? 'bg-amber-100 text-amber-700'
                          : status === 'good'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-zinc-100 text-zinc-600'
                    }`}
                  >
                    {status === 'good' ? '良好' : status === 'warning' ? '警告' : status === 'critical' ? '要注意' : '-'}
                  </Badge>
                </div>
              </div>
              <div className="flex items-end gap-3">
                <span className="text-5xl font-bold">{kpi.currentValue ?? '-'}</span>
                <span className="text-xl text-zinc-500 mb-2">{kpi.unit}</span>
              </div>
              {kpi.changePercent !== null && (
                <div className="mt-2 flex items-center gap-2">
                  {kpi.changePercent > 0 ? (
                    <TrendingUp className="w-4 h-4 text-green-600" />
                  ) : kpi.changePercent < 0 ? (
                    <TrendingDown className="w-4 h-4 text-red-600" />
                  ) : (
                    <Minus className="w-4 h-4 text-zinc-400" />
                  )}
                  <span
                    className={`text-sm ${
                      kpi.changePercent > 0 ? 'text-green-600' : kpi.changePercent < 0 ? 'text-red-600' : 'text-zinc-500'
                    }`}
                  >
                    {kpi.changePercent > 0 ? '+' : ''}
                    {kpi.changePercent}% (前回: {kpi.previousValue ?? '-'}
                    {kpi.unit})
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="space-y-3">
                <div>
                  <span className="text-xs text-zinc-500">方向性</span>
                  <TrendIcon direction={kpi.direction} />
                </div>
                {kpi.thresholds && (
                  <>
                    {kpi.thresholds.warning !== undefined && (
                      <div>
                        <span className="text-xs text-zinc-500">警告閾値</span>
                        <p className="text-amber-600 font-semibold">
                          {kpi.direction === 'higher_is_better' ? '< ' : '> '}
                          {kpi.thresholds.warning}
                          {kpi.unit}
                        </p>
                      </div>
                    )}
                    {kpi.thresholds.critical !== undefined && (
                      <div>
                        <span className="text-xs text-zinc-500">危険閾値</span>
                        <p className="text-red-600 font-semibold">
                          {kpi.direction === 'higher_is_better' ? '< ' : '> '}
                          {kpi.thresholds.critical}
                          {kpi.unit}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* チャート */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              推移グラフ（直近{timeSeries.count}件）
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MiniChart points={timeSeries.points} />
          </CardContent>
        </Card>

        {/* データテーブル */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">データ履歴</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3">日付</th>
                    <th className="text-right py-2 px-3">値</th>
                    <th className="text-center py-2 px-3">ステータス</th>
                  </tr>
                </thead>
                <tbody>
                  {[...timeSeries.points].reverse().slice(0, 10).map((point, i) => {
                    const pointStatus = getStatus(point.value, kpi);
                    return (
                      <tr key={i} className="border-b last:border-0 hover:bg-zinc-50">
                        <td className="py-2 px-3">{point.date}</td>
                        <td className="text-right py-2 px-3 font-mono">
                          {point.value !== null ? `${point.value}${kpi.unit}` : '-'}
                        </td>
                        <td className="text-center py-2 px-3">
                          {point.value !== null && (
                            <Badge
                              className={`text-xs ${
                                pointStatus === 'critical'
                                  ? 'bg-red-100 text-red-700'
                                  : pointStatus === 'warning'
                                    ? 'bg-amber-100 text-amber-700'
                                    : pointStatus === 'good'
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-zinc-100 text-zinc-600'
                              }`}
                            >
                              {pointStatus === 'good'
                                ? '良好'
                                : pointStatus === 'warning'
                                  ? '警告'
                                  : pointStatus === 'critical'
                                    ? '要注意'
                                    : '-'}
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* フッター */}
        <div className="mt-6 text-center">
          <div className="flex justify-center gap-4 text-sm">
            <Link href="/dashboard/kpi" className="text-blue-500 hover:text-blue-700">
              ← KPI一覧
            </Link>
            <Link href="/dashboard/alerts" className="text-red-500 hover:text-red-700">
              アラート設定 →
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
