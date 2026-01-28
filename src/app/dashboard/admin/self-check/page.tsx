'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from '@/components/ui';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Activity,
  Database,
  Shield,
  Send,
  Flag,
  Link as LinkIcon,
  Clock,
  ExternalLink,
} from 'lucide-react';

// /api/healthのレスポンス型
interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  time: string;
  app_env: string;
  commit_sha: string | null;
  auth_health: {
    status: 'OK' | 'NG';
    reason?: string;
  };
  db_health: {
    status: 'OK' | 'NG';
    reason?: string;
    latency_ms?: number;
  };
  external_integrations: {
    lineworks: { status: string; configured: boolean };
    freee: { status: string; configured: boolean };
    google_sheets: { status: string; configured: boolean };
  };
  feature_flags: {
    FEATURE_APPROVALS_V2: { enabled: boolean };
    FEATURE_AI_VP: { enabled: boolean };
    FEATURE_DOCS: { enabled: boolean };
    FEATURE_NYUKYO_LOCK: { enabled: boolean };
  };
  env_missing: string[];
  checks: {
    firebase_config: boolean;
    server_time: boolean;
  };
}

// 主要ページのリンクと説明
const MAIN_PAGES = [
  { href: '/dashboard', label: 'ダッシュボード', description: 'メイン画面' },
  { href: '/dashboard/approvals', label: '稟議一覧', description: '稟議管理' },
  { href: '/dashboard/approvals/new', label: '新規稟議', description: 'ステップ式フォーム' },
  { href: '/dashboard/prospects', label: '入居希望', description: '入居希望者管理' },
  { href: '/dashboard/os', label: '余裕メーター', description: 'CHAOS経営OS' },
  { href: '/dashboard/docs', label: '書類管理', description: 'テンプレート・未回収' },
  { href: '/dashboard/ai', label: 'AI副社長', description: 'LINE WORKS連携' },
  { href: '/dashboard/vacancy', label: '空室管理', description: '施設空室状況' },
];

export default function SelfCheckPage() {
  return (
    <AuthGuard requireAdmin>
      <SelfCheckContent />
    </AuthGuard>
  );
}

function SelfCheckContent() {
  const { user } = useAuth();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // メトリクステスト結果
  const [metricsTest, setMetricsTest] = useState<{
    loading: boolean;
    success: boolean;
    error: string | null;
    indexUrl: string | null;
  }>({ loading: false, success: false, error: null, indexUrl: null });

  const fetchHealth = async () => {
    try {
      setHealthLoading(true);
      setHealthError(null);
      const res = await fetch('/api/health');
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      setHealth(data);
    } catch (error) {
      setHealthError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setHealthLoading(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    await fetchHealth();
    setRefreshing(false);
  };

  // ダッシュボードメトリクステスト（Firestore index問題検出）
  const testDashboardMetrics = async () => {
    setMetricsTest({ loading: true, success: false, error: null, indexUrl: null });
    try {
      // ダッシュボードのAPIを叩いてFirestoreクエリをテスト
      const res = await fetch('/api/os/team');
      if (!res.ok) {
        const text = await res.text();
        // index URLを抽出
        const urlMatch = text.match(/(https:\/\/console\.firebase\.google\.com\/[^\s"]+)/);
        setMetricsTest({
          loading: false,
          success: false,
          error: `API error: ${res.status}`,
          indexUrl: urlMatch ? urlMatch[1] : null,
        });
        return;
      }
      setMetricsTest({ loading: false, success: true, error: null, indexUrl: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const urlMatch = message.match(/(https:\/\/console\.firebase\.google\.com\/[^\s"]+)/);
      setMetricsTest({
        loading: false,
        success: false,
        error: message,
        indexUrl: urlMatch ? urlMatch[1] : null,
      });
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const StatusIcon = ({ ok }: { ok: boolean }) =>
    ok ? (
      <CheckCircle className="w-5 h-5 text-green-500" />
    ) : (
      <XCircle className="w-5 h-5 text-red-500" />
    );

  const IntegrationBadge = ({ status }: { status: string }) => {
    const colors: Record<string, string> = {
      enabled: 'bg-green-100 text-green-800',
      'dry-run': 'bg-yellow-100 text-yellow-800',
      disabled: 'bg-zinc-100 text-zinc-600',
    };
    return (
      <Badge className={colors[status] || 'bg-zinc-100 text-zinc-600'}>
        {status}
      </Badge>
    );
  };

  return (
    <div className="min-h-screen bg-zinc-50">
      <Header />
      <div className="max-w-4xl mx-auto px-4 py-6 safe-bottom">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-zinc-900">Self Check</h1>
            <p className="text-sm text-zinc-500">本番適用前のシステム自己診断</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={refresh}
            disabled={refreshing}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            更新
          </Button>
        </div>

        {/* Health Check */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              /api/health
            </CardTitle>
          </CardHeader>
          <CardContent>
            {healthLoading ? (
              <div className="flex items-center gap-2 text-zinc-500">
                <RefreshCw className="w-4 h-4 animate-spin" />
                読み込み中...
              </div>
            ) : healthError ? (
              <div className="flex items-center gap-2 text-red-600">
                <XCircle className="w-5 h-5" />
                エラー: {healthError}
              </div>
            ) : health ? (
              <div className="space-y-4">
                {/* Overall Status */}
                <div className="flex items-center gap-3 pb-4 border-b">
                  {health.status === 'healthy' && <CheckCircle className="w-8 h-8 text-green-500" />}
                  {health.status === 'degraded' && <AlertTriangle className="w-8 h-8 text-yellow-500" />}
                  {health.status === 'unhealthy' && <XCircle className="w-8 h-8 text-red-500" />}
                  <div>
                    <p className="font-semibold text-lg">
                      {health.status === 'healthy' && 'システム正常'}
                      {health.status === 'degraded' && '一部制限あり'}
                      {health.status === 'unhealthy' && 'システム異常'}
                    </p>
                    <p className="text-sm text-zinc-500">
                      環境: {health.app_env} | 時刻: {new Date(health.time).toLocaleString('ja-JP')}
                    </p>
                    {health.commit_sha && (
                      <p className="text-xs text-zinc-400 font-mono">
                        commit: {health.commit_sha.substring(0, 7)}
                      </p>
                    )}
                  </div>
                </div>

                {/* Auth & DB */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-zinc-400" />
                    <span className="text-sm">認証:</span>
                    <StatusIcon ok={health.auth_health.status === 'OK'} />
                    {health.auth_health.reason && (
                      <span className="text-xs text-red-500">{health.auth_health.reason}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-zinc-400" />
                    <span className="text-sm">DB:</span>
                    <StatusIcon ok={health.db_health.status === 'OK'} />
                    {health.db_health.latency_ms && (
                      <span className="text-xs text-zinc-400">{health.db_health.latency_ms}ms</span>
                    )}
                  </div>
                </div>

                {/* External Integrations */}
                <div className="pt-4 border-t">
                  <div className="flex items-center gap-2 mb-2">
                    <Send className="w-4 h-4 text-zinc-400" />
                    <span className="font-medium">外部連携</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="flex items-center justify-between p-2 bg-zinc-50 rounded">
                      <span className="text-sm">LINE WORKS</span>
                      <IntegrationBadge status={health.external_integrations.lineworks.status} />
                    </div>
                    <div className="flex items-center justify-between p-2 bg-zinc-50 rounded">
                      <span className="text-sm">freee</span>
                      <IntegrationBadge status={health.external_integrations.freee.status} />
                    </div>
                    <div className="flex items-center justify-between p-2 bg-zinc-50 rounded">
                      <span className="text-sm">Sheets</span>
                      <IntegrationBadge status={health.external_integrations.google_sheets.status} />
                    </div>
                  </div>
                </div>

                {/* Feature Flags */}
                <div className="pt-4 border-t">
                  <div className="flex items-center gap-2 mb-2">
                    <Flag className="w-4 h-4 text-zinc-400" />
                    <span className="font-medium">Feature Flags</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(health.feature_flags).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between p-2 bg-zinc-50 rounded">
                        <span className="text-xs font-mono">{key.replace('FEATURE_', '')}</span>
                        <Badge className={value.enabled ? 'bg-green-100 text-green-800' : 'bg-zinc-100 text-zinc-600'}>
                          {value.enabled ? 'ON' : 'OFF'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Missing Env Vars */}
                {health.env_missing.length > 0 && (
                  <div className="pt-4 border-t">
                    <div className="flex items-center gap-2 mb-2 text-yellow-600">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="font-medium">未設定の環境変数</span>
                    </div>
                    <div className="text-xs font-mono text-yellow-700 bg-yellow-50 p-2 rounded">
                      {health.env_missing.join(', ')}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Dashboard Metrics Test */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              ダッシュボードメトリクステスト
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-zinc-500 mb-4">
              Firestoreクエリのindex不足を検出します
            </p>
            <div className="flex items-center gap-4">
              <Button
                size="sm"
                onClick={testDashboardMetrics}
                disabled={metricsTest.loading}
              >
                {metricsTest.loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    テスト中...
                  </>
                ) : (
                  <>
                    <Activity className="w-4 h-4 mr-2" />
                    メトリクス取得テスト
                  </>
                )}
              </Button>
              {metricsTest.success && (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="w-5 h-5" />
                  <span className="text-sm">OK</span>
                </div>
              )}
              {metricsTest.error && (
                <div className="text-red-600">
                  <div className="flex items-center gap-2">
                    <XCircle className="w-5 h-5" />
                    <span className="text-sm">{metricsTest.error}</span>
                  </div>
                  {metricsTest.indexUrl && (
                    <a
                      href={metricsTest.indexUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 text-xs text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      インデックスを作成
                    </a>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Main Pages Links */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LinkIcon className="w-5 h-5" />
              主要ページリンク
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {MAIN_PAGES.map((page) => (
                <a
                  key={page.href}
                  href={page.href}
                  className="flex items-center justify-between p-3 bg-zinc-50 rounded-lg hover:bg-zinc-100 transition-colors"
                >
                  <div>
                    <p className="font-medium text-sm">{page.label}</p>
                    <p className="text-xs text-zinc-500">{page.description}</p>
                  </div>
                  <ExternalLink className="w-4 h-4 text-zinc-400" />
                </a>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Checklist */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              本番適用前チェックリスト
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" />
                <span>/api/health が 200 を返している</span>
              </li>
              <li className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" />
                <span>認証・DB接続が OK</span>
              </li>
              <li className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" />
                <span>ダッシュボードメトリクステストが OK</span>
              </li>
              <li className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" />
                <span>主要ページが表示できる</span>
              </li>
              <li className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" />
                <span>LINE WORKS が Preview では dry-run になっている</span>
              </li>
              <li className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" />
                <span>CI（lint/typecheck/build/e2e）が通過している</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="mt-6 text-center text-xs text-zinc-400">
          <p>ログインユーザー: {user?.email}</p>
          <p className="flex items-center justify-center gap-1 mt-1">
            <Clock className="w-3 h-3" />
            {new Date().toLocaleString('ja-JP')}
          </p>
        </div>
      </div>
    </div>
  );
}
