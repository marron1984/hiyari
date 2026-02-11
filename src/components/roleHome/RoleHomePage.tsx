'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, Button } from '@/components/ui';
import { RoleHomeWidget } from './RoleHomeWidget';
import type { RoleHomeData } from '@/lib/roleHome/types';
import type { AppRole } from '@/config/appRoles';
import {
  RefreshCw,
  AlertTriangle,
  Shield,
  User,
  ChevronDown,
} from 'lucide-react';
import { useApiFetch } from '@/hooks/useApiFetch';

interface RoleHomePageProps {
  /** 現在のユーザー役職 */
  userRole: AppRole;
  /** ユーザーID */
  userId: string;
  /** プレビュー用の役職（admin only） */
  previewRole?: AppRole;
}

/**
 * 役職別ホームページ
 *
 * Implementation Ticket 046-final: /dashboard のメインコンテンツ
 */
export function RoleHomePage({ userRole, userId, previewRole }: RoleHomePageProps) {
  const router = useRouter();
  const apiFetch = useApiFetch();
  const [data, setData] = useState<RoleHomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPreviewRole, setSelectedPreviewRole] = useState<AppRole | undefined>(previewRole);
  const [showRoleSelector, setShowRoleSelector] = useState(false);

  const isAdmin = userRole === 'admin';
  const effectiveRole = selectedPreviewRole ?? userRole;

  // データ取得
  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const params = new URLSearchParams();
      if (isAdmin && selectedPreviewRole) {
        params.set('asRole', selectedPreviewRole);
      }

      const response = await apiFetch(`/api/home/summary?${params.toString()}`, {
        headers: {
          'x-user-id': userId,
          'x-user-role': userRole,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status}`);
      }

      const result: RoleHomeData = await response.json();
      setData(result);
    } catch (err) {
      console.error('[RoleHomePage] Failed to fetch data:', err);
      setError('データの取得に失敗しました');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, userRole, isAdmin, selectedPreviewRole, apiFetch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // リフレッシュ
  const handleRefresh = () => {
    fetchData(true);
  };

  // プレビュー役職変更
  const handlePreviewRoleChange = (role: AppRole | undefined) => {
    setSelectedPreviewRole(role);
    setShowRoleSelector(false);
  };

  // 日次オペ実行
  const handleRunDailyOps = async () => {
    if (!confirm('日次オペレーションを実行しますか？')) return;

    try {
      const response = await apiFetch('/api/cron/daily-ops', {
        method: 'POST',
        headers: {
          'x-user-id': userId,
          'x-user-role': userRole,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to run daily ops');
      }

      alert('日次オペレーションを開始しました');
      fetchData(true);
    } catch (err) {
      console.error('[RoleHomePage] Failed to run daily ops:', err);
      alert('日次オペレーションの実行に失敗しました');
    }
  };

  // 週次オペ実行（WBR生成）
  const handleRunWeeklyOps = () => {
    router.push('/dashboard/wbr');
  };

  // ローディング
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900" />
          <p className="text-sm text-zinc-500">読み込み中...</p>
        </div>
      </div>
    );
  }

  const roles: AppRole[] = ['staff', 'leader', 'manager', 'executive', 'admin', 'auditor'];

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-lg font-semibold text-zinc-900">
              ホーム
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <User className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-sm text-zinc-500">
                {data?.roleName ?? effectiveRole}ビュー
              </span>
              {selectedPreviewRole && (
                <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                  プレビュー
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Admin用役職切り替え */}
          {isAdmin && (
            <div className="relative">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowRoleSelector(!showRoleSelector)}
                className="gap-1"
              >
                <Shield className="w-4 h-4" />
                {selectedPreviewRole ? `${selectedPreviewRole}プレビュー` : '役職切替'}
                <ChevronDown className="w-3 h-3" />
              </Button>

              {showRoleSelector && (
                <div className="absolute right-0 mt-1 w-48 bg-white border border-zinc-200 rounded-lg shadow-lg z-10">
                  <div className="p-1">
                    <button
                      onClick={() => handlePreviewRoleChange(undefined)}
                      className={`w-full text-left px-3 py-2 text-sm rounded hover:bg-zinc-50 ${
                        !selectedPreviewRole ? 'bg-zinc-100 font-medium' : ''
                      }`}
                    >
                      自分のビュー（admin）
                    </button>
                    {roles.filter(r => r !== 'admin').map(role => (
                      <button
                        key={role}
                        onClick={() => handlePreviewRoleChange(role)}
                        className={`w-full text-left px-3 py-2 text-sm rounded hover:bg-zinc-50 ${
                          selectedPreviewRole === role ? 'bg-zinc-100 font-medium' : ''
                        }`}
                      >
                        {role}としてプレビュー
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* リフレッシュ */}
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
      </div>

      {/* エラーバナー */}
      {error && (
        <Card className="bg-red-50 border-red-200">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-800">{error}</p>
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

      {/* ウィジェットグリッド */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.widgets.map((widget, index) => (
            <RoleHomeWidget
              key={`${widget.type}-${index}`}
              widget={widget}
              role={effectiveRole}
              onRunDailyOps={handleRunDailyOps}
              onRunWeeklyOps={handleRunWeeklyOps}
            />
          ))}
        </div>
      )}

      {/* データなし */}
      {data && data.widgets.length === 0 && (
        <Card className="bg-zinc-50 border-zinc-200">
          <CardContent className="p-8 text-center">
            <p className="text-sm text-zinc-500">
              表示するウィジェットがありません
            </p>
          </CardContent>
        </Card>
      )}

      {/* フッター */}
      <div className="pt-4 border-t border-zinc-200">
        <p className="text-xs text-zinc-400 text-center">
          最終更新: {data?.fetchedAt ? new Date(data.fetchedAt).toLocaleString('ja-JP') : '-'}
        </p>
      </div>
    </div>
  );
}
