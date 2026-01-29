'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, Button, Badge } from '@/components/ui';
import {
  Plus,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  Edit,
  RotateCcw,
  AlertTriangle,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { getRingisByUser } from '@/lib/ringi';
import { Ringi, RingiStatus, RINGI_STATUS_LABELS, RINGI_STATUS_COLORS } from '@/types';

// 自動更新間隔
const AUTO_REFRESH_INTERVAL = 60000; // 60秒

export default function ApprovalsListPage() {
  return (
    <AuthGuard>
      <ApprovalsListContent />
    </AuthGuard>
  );
}

function ApprovalsListContent() {
  const { user } = useAuth();
  const [ringis, setRingis] = useState<Ringi[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [filter, setFilter] = useState<'all' | RingiStatus>('all');

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // データ取得
  const loadRingis = useCallback(async (showLoadingState = true) => {
    if (!user) return;

    if (showLoadingState) {
      setRefreshing(true);
    }
    setError(null);

    try {
      const data = await getRingisByUser(user.id, user.tenantId);
      setRingis(data);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to load ringis:', err);
      setError(err instanceof Error ? err.message : 'データの取得に失敗しました');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  // 初回ロード
  useEffect(() => {
    loadRingis();
  }, [loadRingis]);

  // 自動更新
  useEffect(() => {
    timerRef.current = setInterval(() => {
      loadRingis(false);
    }, AUTO_REFRESH_INTERVAL);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [loadRingis]);

  // 手動更新
  const handleRefresh = () => {
    loadRingis(true);
  };

  const filteredRingis = filter === 'all'
    ? ringis
    : ringis.filter((r) => r.status === filter);

  const statusIcon = (status: RingiStatus) => {
    switch (status) {
      case 'draft':
        return <Edit className="w-4 h-4" />;
      case 'submitted':
        return <Clock className="w-4 h-4" />;
      case 'approved':
        return <CheckCircle className="w-4 h-4" />;
      case 'rejected':
        return <XCircle className="w-4 h-4" />;
      case 'returned':
        return <RotateCcw className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('ja-JP', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleString('ja-JP', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 件数表示（エラー時は--）
  const displayCount = (count: number | null): string => {
    if (error || count === null) return '--';
    return count.toString();
  };

  // 件数集計
  const draftCount = error ? null : ringis.filter((r) => r.status === 'draft').length;
  const submittedCount = error ? null : ringis.filter((r) => r.status === 'submitted').length;
  const returnedCount = error ? null : ringis.filter((r) => r.status === 'returned').length;
  const approvedCount = error ? null : ringis.filter((r) => r.status === 'approved').length;

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <Header />
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900" />
            <p className="text-sm text-zinc-500">読み込み中...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6 safe-bottom">
        {/* Page Title & Actions */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-zinc-900">稟議</h1>
            {lastUpdated && (
              <p className="text-xs text-zinc-400 mt-1 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                最終更新: {formatTime(lastUpdated)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
            <Link href="/dashboard/approvals/new">
              <Button size="sm">
                <Plus className="w-4 h-4" />
                新規稟議
              </Button>
            </Link>
          </div>
        </div>

        {/* エラーバナー */}
        {error && (
          <Card className="p-4 mb-6 bg-red-50 border border-red-200">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-red-800">データ取得エラー</p>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRefresh}
              >
                再試行
              </Button>
            </div>
          </Card>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <Card className="p-3 text-center">
            <p className={`text-2xl font-bold ${error ? 'text-zinc-400' : 'text-zinc-900'}`}>
              {displayCount(draftCount)}
            </p>
            <p className="text-xs text-zinc-500">下書き</p>
          </Card>
          <Card className={`p-3 text-center ${submittedCount && submittedCount > 0 ? 'bg-amber-50 border-amber-200' : ''}`}>
            <p className={`text-2xl font-bold ${error ? 'text-zinc-400' : 'text-amber-600'}`}>
              {displayCount(submittedCount)}
            </p>
            <p className="text-xs text-zinc-500">申請中</p>
          </Card>
          {returnedCount && returnedCount > 0 ? (
            <Card className="p-3 text-center bg-orange-50 border-orange-200">
              <p className="text-2xl font-bold text-orange-600">
                {displayCount(returnedCount)}
              </p>
              <p className="text-xs text-orange-600">差戻し</p>
            </Card>
          ) : (
            <Card className="p-3 text-center">
              <p className={`text-2xl font-bold ${error ? 'text-zinc-400' : 'text-emerald-600'}`}>
                {displayCount(approvedCount)}
              </p>
              <p className="text-xs text-zinc-500">承認済</p>
            </Card>
          )}
        </div>

        {/* 差戻しアラート */}
        {returnedCount && returnedCount > 0 && !error && (
          <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-xl flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0" />
            <div>
              <p className="text-sm font-medium text-orange-700">
                {returnedCount}件の稟議が差戻されています
              </p>
              <p className="text-xs text-orange-600">修正して再申請してください</p>
            </div>
          </div>
        )}

        {/* Filter */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
          {(
            ['all', 'draft', 'submitted', 'approved', 'rejected', 'returned'] as const
          ).map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                filter === status
                  ? 'bg-zinc-900 text-white'
                  : 'bg-white text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              {status === 'all' ? 'すべて' : RINGI_STATUS_LABELS[status]}
              {status !== 'all' && !error && (
                <span className="ml-1.5 text-xs opacity-70">
                  {ringis.filter((r) => r.status === status).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="space-y-3">
          {error ? (
            <Card className="p-8 text-center">
              <AlertCircle className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
              <p className="text-zinc-500">データを取得できませんでした</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRefresh}
                className="mt-4"
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                再試行
              </Button>
            </Card>
          ) : filteredRingis.length === 0 ? (
            <Card className="p-8 text-center">
              <FileText className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
              <p className="text-zinc-500">
                {filter === 'all'
                  ? '稟議がありません'
                  : `${RINGI_STATUS_LABELS[filter]}の稟議がありません`}
              </p>
              <Link href="/dashboard/approvals/new" className="mt-4 inline-block">
                <Button variant="secondary" size="sm">
                  <Plus className="w-4 h-4" />
                  新規稟議を作成
                </Button>
              </Link>
            </Card>
          ) : (
            filteredRingis.map((ringi) => {
              const colors = RINGI_STATUS_COLORS[ringi.status];
              return (
                <Link key={ringi.id} href={`/ringi/${ringi.id}`}>
                  <Card className="p-4 hover:bg-zinc-50 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={`${colors.bg} ${colors.text}`}>
                            {statusIcon(ringi.status)}
                            <span className="ml-1">{RINGI_STATUS_LABELS[ringi.status]}</span>
                          </Badge>
                          <span className="text-xs text-zinc-400">{ringi.category}</span>
                          {ringi.urgency === '至急' && (
                            <Badge className="bg-red-100 text-red-700 text-xs">至急</Badge>
                          )}
                        </div>
                        <h3 className="font-medium text-zinc-900 truncate">{ringi.title}</h3>
                        {ringi.description && (
                          <p className="text-sm text-zinc-500 line-clamp-1 mt-1">
                            {ringi.description}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        {ringi.amount && (
                          <p className="text-sm font-medium text-zinc-900">
                            ¥{ringi.amount.toLocaleString()}
                          </p>
                        )}
                        <p className="text-xs text-zinc-400 mt-1">
                          {formatDate(ringi.createdAt)}
                        </p>
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })
          )}
        </div>

        {/* フッター情報 */}
        <div className="mt-6 text-center text-xs text-zinc-400">
          <p>自動更新: 60秒ごと</p>
        </div>
      </div>
    </div>
  );
}
