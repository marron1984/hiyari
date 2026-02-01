'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@/components/ui';
import { getMockKPITimeSeries, getDefaultAlertConfigs, getAllKPIMetadata } from '@/lib/kpi/mock-data';
import { detectAllAnomalies, getSeverityColor, getAnomalyTypeLabel } from '@/lib/kpi/anomaly-detector';
import type { AnomalyDetectionResult } from '@/lib/kpi/types';
import {
  Bell,
  TrendingUp,
  TrendingDown,
  Minus,
  ExternalLink,
  RefreshCw,
  Settings,
  Slack,
  MessageSquare,
  CheckCircle,
  Activity,
  Filter,
} from 'lucide-react';

export default function AlertsPage() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'critical' | 'warning' | 'info'>('all');
  const [lastChecked, setLastChecked] = useState<Date>(new Date());

  // 異常検知を実行
  const anomalies = useMemo(() => {
    const timeSeries = getMockKPITimeSeries();
    const configs = getDefaultAlertConfigs();
    return detectAllAnomalies(timeSeries, configs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastChecked]);

  // フィルタリング
  const filteredAnomalies = useMemo(() => {
    if (filterSeverity === 'all') return anomalies;
    return anomalies.filter((a) => a.severity === filterSeverity);
  }, [anomalies, filterSeverity]);

  // 重要度別カウント
  const severityCounts = useMemo(() => ({
    critical: anomalies.filter((a) => a.severity === 'critical').length,
    warning: anomalies.filter((a) => a.severity === 'warning').length,
    info: anomalies.filter((a) => a.severity === 'info').length,
  }), [anomalies]);

  // 手動リフレッシュ
  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setLastChecked(new Date());
      setIsRefreshing(false);
    }, 500);
  };

  // KPIメタデータ
  const kpiMetadata = getAllKPIMetadata();

  return (
    <main className="pb-8">
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* ヘッダー */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-red-500 to-orange-600 rounded-lg">
              <Bell className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">KPIアラートセンター</h1>
              <p className="text-sm text-gray-500">
                異常検知・自動通知管理
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={`w-4 h-4 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
              更新
            </Button>
            <Link href="/admin/alert-settings">
              <Button variant="outline" size="sm">
                <Settings className="w-4 h-4 mr-1" />
                設定
              </Button>
            </Link>
          </div>
        </div>

        {/* サマリーカード */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <button
            onClick={() => setFilterSeverity(filterSeverity === 'critical' ? 'all' : 'critical')}
            className={`p-4 rounded-lg border-2 transition-all ${
              filterSeverity === 'critical'
                ? 'border-red-500 bg-red-50'
                : 'border-zinc-200 hover:border-red-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-2xl">🔴</span>
              <span className="text-3xl font-bold text-red-600">{severityCounts.critical}</span>
            </div>
            <p className="text-sm text-zinc-600 mt-1">重大</p>
          </button>
          <button
            onClick={() => setFilterSeverity(filterSeverity === 'warning' ? 'all' : 'warning')}
            className={`p-4 rounded-lg border-2 transition-all ${
              filterSeverity === 'warning'
                ? 'border-amber-500 bg-amber-50'
                : 'border-zinc-200 hover:border-amber-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-2xl">⚠️</span>
              <span className="text-3xl font-bold text-amber-600">{severityCounts.warning}</span>
            </div>
            <p className="text-sm text-zinc-600 mt-1">警告</p>
          </button>
          <button
            onClick={() => setFilterSeverity(filterSeverity === 'info' ? 'all' : 'info')}
            className={`p-4 rounded-lg border-2 transition-all ${
              filterSeverity === 'info'
                ? 'border-blue-500 bg-blue-50'
                : 'border-zinc-200 hover:border-blue-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-2xl">ℹ️</span>
              <span className="text-3xl font-bold text-blue-600">{severityCounts.info}</span>
            </div>
            <p className="text-sm text-zinc-600 mt-1">情報</p>
          </button>
        </div>

        {/* フィルター表示 */}
        {filterSeverity !== 'all' && (
          <div className="mb-4 flex items-center gap-2">
            <Filter className="w-4 h-4 text-zinc-400" />
            <span className="text-sm text-zinc-600">
              フィルター: {filterSeverity === 'critical' ? '重大' : filterSeverity === 'warning' ? '警告' : '情報'}
            </span>
            <button
              onClick={() => setFilterSeverity('all')}
              className="text-sm text-blue-500 hover:underline"
            >
              クリア
            </button>
          </div>
        )}

        {/* アラート一覧 */}
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="w-5 h-5 text-zinc-600" />
                検出されたアラート
              </CardTitle>
              <span className="text-sm text-zinc-500">
                最終確認: {lastChecked.toLocaleTimeString('ja-JP')}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {filteredAnomalies.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                <p className="text-lg font-medium text-green-700">
                  {filterSeverity === 'all'
                    ? '現在、異常は検出されていません'
                    : `${filterSeverity === 'critical' ? '重大' : filterSeverity === 'warning' ? '警告' : '情報'}レベルのアラートはありません`}
                </p>
                <p className="text-sm text-zinc-500 mt-2">
                  KPIは正常範囲内で推移しています
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredAnomalies.map((anomaly, index) => (
                  <AlertCard key={`${anomaly.kpiId}-${index}`} anomaly={anomaly} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 通知チャンネル状態 */}
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">通知チャンネル</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-4 bg-zinc-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white rounded-lg border">
                    <Slack className="w-5 h-5 text-[#4A154B]" />
                  </div>
                  <div>
                    <p className="font-medium">Slack</p>
                    <p className="text-xs text-zinc-500">Webhook通知</p>
                  </div>
                </div>
                <Badge className="bg-amber-100 text-amber-700 text-xs">
                  未設定
                </Badge>
              </div>
              <div className="flex items-center justify-between p-4 bg-zinc-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white rounded-lg border">
                    <MessageSquare className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-medium">LINE WORKS</p>
                    <p className="text-xs text-zinc-500">Incoming Webhook</p>
                  </div>
                </div>
                <Badge className="bg-amber-100 text-amber-700 text-xs">
                  未設定
                </Badge>
              </div>
            </div>
            <p className="text-xs text-zinc-500 mt-4">
              ※ Webhook URLは環境変数（SLACK_WEBHOOK_URL / LINEWORKS_WEBHOOK_URL）で設定してください
            </p>
          </CardContent>
        </Card>

        {/* KPI一覧 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">監視中のKPI</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {kpiMetadata.map((kpi) => {
                const hasAnomaly = anomalies.some((a) => a.kpiId === kpi.id);
                const anomaly = anomalies.find((a) => a.kpiId === kpi.id);

                return (
                  <Link
                    key={kpi.id}
                    href={kpi.dashboardPath || '#'}
                    className={`p-3 rounded-lg border transition-all hover:shadow-md ${
                      hasAnomaly
                        ? anomaly?.severity === 'critical'
                          ? 'bg-red-50 border-red-200'
                          : anomaly?.severity === 'warning'
                            ? 'bg-amber-50 border-amber-200'
                            : 'bg-blue-50 border-blue-200'
                        : 'bg-white border-zinc-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{kpi.name}</span>
                        <Badge className="text-xs bg-zinc-100 text-zinc-600">
                          {kpi.category}
                        </Badge>
                      </div>
                      {hasAnomaly && (
                        <span className="text-lg">
                          {anomaly?.severity === 'critical'
                            ? '🔴'
                            : anomaly?.severity === 'warning'
                              ? '⚠️'
                              : 'ℹ️'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">{kpi.description}</p>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* フッター */}
        <div className="mt-6 text-center">
          <div className="flex justify-center gap-4">
            <Link
              href="/dashboard/wbr"
              className="text-sm text-blue-500 hover:text-blue-700"
            >
              WBRを見る →
            </Link>
            <Link
              href="/dashboard/ai-vp"
              className="text-sm text-purple-500 hover:text-purple-700"
            >
              AI副社長ハブへ →
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

// アラートカードコンポーネント
function AlertCard({ anomaly }: { anomaly: AnomalyDetectionResult }) {
  const colors = getSeverityColor(anomaly.severity);

  const ChangeIcon = () => {
    if (anomaly.changePercent === null) return <Minus className="w-4 h-4 text-zinc-400" />;
    if (anomaly.changePercent > 0) return <TrendingUp className="w-4 h-4 text-green-600" />;
    return <TrendingDown className="w-4 h-4 text-red-600" />;
  };

  return (
    <div className={`p-4 rounded-lg border ${colors.bg} ${colors.border}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg">{colors.emoji}</span>
            <span className={`font-bold ${colors.text}`}>{anomaly.kpiName}</span>
            <Badge className={`text-xs ${colors.bg} ${colors.text}`}>
              {getAnomalyTypeLabel(anomaly.anomalyType)}
            </Badge>
          </div>
          <p className="text-sm text-zinc-700 mt-2">{anomaly.message}</p>
          <div className="flex items-center gap-4 mt-2 text-sm text-zinc-500">
            <div className="flex items-center gap-1">
              <span>現在値:</span>
              <span className="font-medium text-zinc-700">
                {anomaly.currentValue ?? 'N/A'}
              </span>
            </div>
            {anomaly.previousValue !== null && (
              <div className="flex items-center gap-1">
                <span>前日:</span>
                <span>{anomaly.previousValue}</span>
              </div>
            )}
            {anomaly.changePercent !== null && (
              <div className="flex items-center gap-1">
                <ChangeIcon />
                <span className={anomaly.changePercent >= 0 ? 'text-green-600' : 'text-red-600'}>
                  {anomaly.changePercent >= 0 ? '+' : ''}{anomaly.changePercent}%
                </span>
              </div>
            )}
          </div>
        </div>
        {anomaly.dashboardPath && (
          <Link
            href={anomaly.dashboardPath}
            className="p-2 hover:bg-white rounded-lg transition-colors"
          >
            <ExternalLink className="w-4 h-4 text-zinc-400" />
          </Link>
        )}
      </div>
    </div>
  );
}
