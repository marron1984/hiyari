'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { getChaosViewLevel } from '@/lib/auth';
import { fetchKPIData, type KPIFetchResult } from '@/lib/dashboard/kpi-fetcher';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Loading } from '@/components/Loading';
import { PreviewBadge } from '@/components/PreviewBadge';
import { AIVPSummaryCard } from '@/components/dashboard/AIVPSummaryCard';
import { KPIGrid } from '@/components/dashboard/KPICard';
import { Card, CardContent, Button } from '@/components/ui';
import {
  type DashboardRole,
  KPI_DEFINITIONS,
  getRoleLabel,
} from '@/types/dashboard-kpi';
import {
  Shield,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}

function DashboardContent() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<KPIFetchResult | null>(null);

  // 役割判定
  const viewLevel = user ? getChaosViewLevel(user.role, user.email) : 'self';
  const role: DashboardRole = viewLevel === 'all' ? 'exec' : viewLevel === 'team' ? 'manager' : 'staff';

  // データ取得
  const fetchData = useCallback(async (isRefresh = false) => {
    if (!user) return;

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const result = await fetchKPIData(user, role);
      setData(result);

      if (result.errors.length > 0) {
        console.warn('[Dashboard] Some data failed to load:', result.errors);
      }
    } catch (err) {
      console.error('[Dashboard] Failed to fetch data:', err);
      setError('データの取得に失敗しました');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, role]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // リフレッシュハンドラ
  const handleRefresh = () => {
    fetchData(true);
  };

  if (loading) {
    return (
      <>
        <Header />
        <Loading text="読み込み中..." />
      </>
    );
  }

  return (
    <>
      <Header />
      <PreviewBadge />
      <main className="pb-20 md:pb-8">
        <div className="max-w-4xl mx-auto px-4 py-6">
          {/* 支援目的の注意文 */}
          <Card className="mb-6 bg-zinc-50 border-zinc-200">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-zinc-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-zinc-600">
                  これは支援のための仕組みです。評価や査定のためではありません。
                </p>
              </div>
            </CardContent>
          </Card>

          {/* エラーバナー */}
          {error && (
            <Card className="mb-6 bg-red-50 border-red-200">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-red-800">
                        {error}
                      </p>
                      <p className="text-xs text-red-600 mt-1">
                        一部のデータが取得できませんでした
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleRefresh}
                    disabled={refreshing}
                  >
                    {refreshing ? '更新中...' : '再試行'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ヘッダー（役割表示 + リフレッシュ） */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-lg font-semibold text-zinc-900">ダッシュボード</h1>
              <p className="text-sm text-zinc-500">{getRoleLabel(role)}ビュー</p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="gap-1.5"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              更新
            </Button>
          </div>

          {/* AI副社長サマリー（最上段） */}
          <AIVPSummaryCard
            summary={data?.aiSummary ?? null}
            role={role}
            loading={loading}
          />

          {/* KPIグリッド（最大6つ） */}
          <KPIGrid
            kpis={data?.kpis ?? []}
            definitions={KPI_DEFINITIONS}
            loading={loading}
            maxItems={6}
          />

          {/* フッター */}
          <div className="mt-8 pt-6 border-t border-zinc-200">
            <div className="flex items-center justify-center gap-4 text-sm text-zinc-400">
              <Link href="/dashboard/os/checkin" className="hover:text-zinc-600">
                チェックイン
              </Link>
              <span>・</span>
              <Link href="/dashboard/approvals" className="hover:text-zinc-600">
                稟議
              </Link>
              <span>・</span>
              <Link href="/dashboard/os/team" className="hover:text-zinc-600">
                チーム
              </Link>
              {role === 'exec' && (
                <>
                  <span>・</span>
                  <Link href="/admin/ai-vp" className="hover:text-zinc-600">
                    AI副社長
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
