'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@/components/ui';
import type {
  Alert,
  AlertStats,
  AlertType,
  AlertStatus,
  AlertSeverity,
} from '@/lib/alerts/types';
import {
  ALERT_TYPE_LABELS,
  ALERT_STATUS_LABELS,
  ALERT_SEVERITY_CONFIG,
} from '@/lib/alerts/types';
import {
  Bell,
  RefreshCw,
  Settings,
  CheckCircle,
  Activity,
  Filter,
  Check,
  CheckCheck,
  Zap,
  AlertTriangle,
  Clock,
  FileWarning,
  Server,
  ExternalLink,
} from 'lucide-react';
import { useApiFetch } from '@/hooks/useApiFetch';

// タブ定義
const TABS: { id: AlertType | 'all'; label: string; icon: React.ReactNode }[] = [
  { id: 'all', label: 'すべて', icon: <Activity className="w-4 h-4" /> },
  { id: 'kpi_anomaly', label: 'KPI異常', icon: <AlertTriangle className="w-4 h-4" /> },
  { id: 'approval_backlog', label: '承認滞留', icon: <Clock className="w-4 h-4" /> },
  { id: 'deadline_overdue', label: '期限超過', icon: <FileWarning className="w-4 h-4" /> },
  { id: 'system_error', label: 'システム', icon: <Server className="w-4 h-4" /> },
];

export default function AlertCenterPage() {
  const apiFetch = useApiFetch();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [stats, setStats] = useState<AlertStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // フィルター状態
  const [selectedTab, setSelectedTab] = useState<AlertType | 'all'>('all');
  const [selectedStatus, setSelectedStatus] = useState<AlertStatus | 'all'>('open');
  const [selectedSeverity, setSelectedSeverity] = useState<AlertSeverity | 'all'>('all');

  // データ取得
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedStatus !== 'all') params.set('status', selectedStatus);
      if (selectedSeverity !== 'all') params.set('severity', selectedSeverity);
      if (selectedTab !== 'all') params.set('type', selectedTab);

      const [alertsRes, statsRes] = await Promise.all([
        apiFetch(`/api/alerts?${params.toString()}`),
        apiFetch('/api/alerts/stats'),
      ]);

      const alertsData = await alertsRes.json();
      const statsData = await statsRes.json();

      setAlerts(alertsData.alerts ?? []);
      setStats(statsData);
    } catch (err) {
      console.error('Failed to fetch alerts:', err);
      setError('アラートの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [selectedTab, selectedStatus, selectedSeverity, apiFetch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // スキャン実行
  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await apiFetch('/api/alerts/scan', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        // 再取得
        await fetchData();
      }
    } catch (error) {
      console.error('Scan failed:', error);
    } finally {
      setScanning(false);
    }
  };

  // ACK
  const handleAck = async (alertId: string) => {
    try {
      const res = await apiFetch(`/api/alerts/${alertId}/ack`, { method: 'POST' });
      if (res.ok) {
        await fetchData();
      }
    } catch (error) {
      console.error('ACK failed:', error);
    }
  };

  // RESOLVE
  const handleResolve = async (alertId: string) => {
    try {
      const res = await apiFetch(`/api/alerts/${alertId}/resolve`, { method: 'POST' });
      if (res.ok) {
        await fetchData();
      }
    } catch (error) {
      console.error('Resolve failed:', error);
    }
  };

  return (
    <main className="pb-8">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* ヘッダー */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-red-500 to-orange-600 rounded-lg">
              <Bell className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">アラートセンター</h1>
              <p className="text-sm text-gray-500">
                全アラートの一元管理・対応追跡
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="primary"
              size="sm"
              onClick={handleScan}
              disabled={scanning}
            >
              <Zap className={`w-4 h-4 mr-1 ${scanning ? 'animate-pulse' : ''}`} />
              {scanning ? 'スキャン中...' : '今すぐスキャン'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchData}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
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

        {/* エラーバナー */}
        {error && (
          <Card className="p-4 mb-6 bg-red-50 border-red-200">
            <div className="flex items-center justify-between">
              <p className="text-sm text-red-700">{error}</p>
              <Button variant="secondary" size="sm" onClick={fetchData} disabled={loading}>
                再試行
              </Button>
            </div>
          </Card>
        )}

        {/* サマリーカード */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card
              className={`cursor-pointer transition-all ${
                selectedStatus === 'open' ? 'ring-2 ring-red-500' : ''
              }`}
              onClick={() => setSelectedStatus(selectedStatus === 'open' ? 'all' : 'open')}
            >
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-2xl" role="img" aria-label="未対応">🔔</span>
                  <span className="text-3xl font-bold text-red-600">{stats.open}</span>
                </div>
                <p className="text-sm text-zinc-600 mt-1">未対応</p>
                {stats.criticalOpen > 0 && (
                  <p className="text-xs text-red-500 mt-1">
                    うち重大: {stats.criticalOpen}件
                  </p>
                )}
              </CardContent>
            </Card>
            <Card
              className={`cursor-pointer transition-all ${
                selectedStatus === 'acknowledged' ? 'ring-2 ring-amber-500' : ''
              }`}
              onClick={() => setSelectedStatus(selectedStatus === 'acknowledged' ? 'all' : 'acknowledged')}
            >
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-2xl" role="img" aria-label="確認済">👁️</span>
                  <span className="text-3xl font-bold text-amber-600">{stats.acknowledged}</span>
                </div>
                <p className="text-sm text-zinc-600 mt-1">確認済</p>
              </CardContent>
            </Card>
            <Card
              className={`cursor-pointer transition-all ${
                selectedStatus === 'resolved' ? 'ring-2 ring-green-500' : ''
              }`}
              onClick={() => setSelectedStatus(selectedStatus === 'resolved' ? 'all' : 'resolved')}
            >
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-2xl" role="img" aria-label="解決済">✅</span>
                  <span className="text-3xl font-bold text-green-600">{stats.resolved}</span>
                </div>
                <p className="text-sm text-zinc-600 mt-1">解決済</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-2xl" role="img" aria-label="合計">📊</span>
                  <span className="text-3xl font-bold text-zinc-700">
                    {stats.open + stats.acknowledged + stats.resolved}
                  </span>
                </div>
                <p className="text-sm text-zinc-600 mt-1">合計</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* タブ */}
        <div className="flex gap-2 flex-wrap mb-4 border-b pb-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
                selectedTab === tab.id
                  ? 'bg-zinc-800 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              {tab.icon}
              {tab.label}
              {stats && tab.id !== 'all' && stats.byType[tab.id] > 0 && (
                <Badge className="ml-1 bg-red-500 text-white text-xs">
                  {stats.byType[tab.id]}
                </Badge>
              )}
            </button>
          ))}
        </div>

        {/* 重要度フィルター */}
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-4 h-4 text-zinc-400" />
          <span className="text-sm text-zinc-600">重要度:</span>
          {(['all', 'critical', 'warning', 'info'] as const).map((sev) => (
            <button
              key={sev}
              onClick={() => setSelectedSeverity(sev)}
              className={`px-3 py-1 text-sm rounded-full transition-colors ${
                selectedSeverity === sev
                  ? sev === 'all'
                    ? 'bg-zinc-800 text-white'
                    : sev === 'critical'
                      ? 'bg-red-500 text-white'
                      : sev === 'warning'
                        ? 'bg-amber-500 text-white'
                        : 'bg-blue-500 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              {sev === 'all' ? 'すべて' : ALERT_SEVERITY_CONFIG[sev].label}
            </button>
          ))}
        </div>

        {/* アラート一覧 */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="w-5 h-5 text-zinc-600" />
                アラート一覧
              </CardTitle>
              <span className="text-sm text-zinc-500">
                {alerts.length}件
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-zinc-400" />
                <p className="text-zinc-500">読み込み中...</p>
              </div>
            ) : alerts.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                <p className="text-lg font-medium text-green-700">
                  該当するアラートはありません
                </p>
                <p className="text-sm text-zinc-500 mt-2">
                  「今すぐスキャン」でアラートを検出できます
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {alerts.map((alert) => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    onAck={handleAck}
                    onResolve={handleResolve}
                  />
                ))}
              </div>
            )}
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
              href="/dashboard/kpi"
              className="text-sm text-green-500 hover:text-green-700"
            >
              KPIダッシュボードへ →
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

// アラートカードコンポーネント
function AlertCard({
  alert,
  onAck,
  onResolve,
}: {
  alert: Alert;
  onAck: (id: string) => void;
  onResolve: (id: string) => void;
}) {
  const severityConfig = ALERT_SEVERITY_CONFIG[alert.severity];
  const dashboardPath = alert.meta?.dashboardPath as string | undefined;

  return (
    <div className={`p-4 rounded-lg border ${severityConfig.bg} ${severityConfig.border}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* ヘッダー */}
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="text-lg">{severityConfig.emoji}</span>
            <span className={`font-bold ${severityConfig.text}`}>{alert.title}</span>
            <Badge className="text-xs bg-zinc-100 text-zinc-600">
              {ALERT_TYPE_LABELS[alert.type]}
            </Badge>
            <Badge
              className={`text-xs ${
                alert.status === 'open'
                  ? 'bg-red-100 text-red-700'
                  : alert.status === 'acknowledged'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-green-100 text-green-700'
              }`}
            >
              {ALERT_STATUS_LABELS[alert.status]}
            </Badge>
          </div>

          {/* メッセージ */}
          <p className="text-sm text-zinc-700 mb-2">{alert.message}</p>

          {/* メタ情報 */}
          <div className="flex items-center gap-4 text-xs text-zinc-500">
            <span>作成: {new Date(alert.createdAt).toLocaleString('ja-JP')}</span>
            {alert.sourceId && <span>ID: {alert.sourceId}</span>}
          </div>
        </div>

        {/* アクションボタン */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {dashboardPath && (
            <Link
              href={dashboardPath}
              className="p-2 hover:bg-white rounded-lg transition-colors"
              title="詳細を見る"
            >
              <ExternalLink className="w-4 h-4 text-zinc-400" />
            </Link>
          )}
          {alert.status === 'open' && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onAck(alert.id)}
                title="確認済みにする"
              >
                <Check className="w-4 h-4" />
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => onResolve(alert.id)}
                title="解決済みにする"
              >
                <CheckCheck className="w-4 h-4" />
              </Button>
            </>
          )}
          {alert.status === 'acknowledged' && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => onResolve(alert.id)}
              title="解決済みにする"
            >
              <CheckCheck className="w-4 h-4 mr-1" />
              解決
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
