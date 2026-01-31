'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardContent, Button, Badge } from '@/components/ui';
import { Loading } from '@/components/Loading';
import {
  Heart,
  Users,
  MessageSquare,
  Moon,
  Clock,
  AlertTriangle,
  ChevronRight,
  RefreshCw,
  Building2,
  TrendingUp,
  Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { hasMinRole } from '@/lib/auth';

interface UserMetrics {
  userId: string;
  userName?: string;
  baseId: string;
  baseName?: string;
  messageCount: number;
  avgReplyTimeSec: number;
  nightMessageRate: number;
  alertLevel: 'normal' | 'attention' | 'warning';
  alertReasons: string[];
}

interface BaseMetrics {
  baseId: string;
  baseName: string;
  totalMessages: number;
  avgReplyTimeSec: number;
  nightMessageRate: number;
  activeUserCount: number;
  alertLevel: 'normal' | 'attention' | 'warning';
}

interface Report {
  id: string;
  period: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  overallLevel: 'normal' | 'attention' | 'warning';
  totalUsers: number;
  totalMessages: number;
  attentionUsers: UserMetrics[];
  baseMetrics: BaseMetrics[];
  aiReport: {
    summary: string;
    observations: string[];
    recommendations: string[];
  };
}

const LEVEL_CONFIG = {
  normal: { label: '正常', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  attention: { label: '注意', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
  warning: { label: '警戒', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
};

export default function OrganizationHealthPage() {
  return (
    <AuthGuard>
      <OrganizationHealthContent />
    </AuthGuard>
  );
}

function OrganizationHealthContent() {
  const { user, firebaseUser, isAdmin } = useAuth();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLeaderOrAbove = user && hasMinRole(user.role, 'leader');

  const loadReport = useCallback(async () => {
    if (!firebaseUser) return;

    try {
      setLoading(true);
      setError(null);

      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/ai/organization-health', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        if (res.status === 404) {
          setReport(null);
          return;
        }
        const data = await res.json();
        throw new Error(data.error || 'レポートの取得に失敗しました');
      }

      const data = await res.json();
      setReport(data.report);
    } catch (err) {
      console.error('Failed to load report:', err);
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [firebaseUser]);

  const handleRegenerate = async () => {
    if (!firebaseUser || !isAdmin) return;

    try {
      setRegenerating(true);
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/cron/weekly-organization-health', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '再生成に失敗しました');
      }

      await loadReport();
    } catch (err) {
      console.error('Failed to regenerate:', err);
      alert(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setRegenerating(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  if (!isLeaderOrAbove) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <Header />
        <main className="max-w-4xl mx-auto px-4 py-6">
          <div className="text-center py-12">
            <p className="text-zinc-600">このページはリーダー以上のみアクセスできます</p>
          </div>
        </main>
      </div>
    );
  }

  if (loading) {
    return <Loading />;
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-6 safe-bottom">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-pink-100 rounded-xl">
              <Heart className="w-6 h-6 text-pink-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-900">組織温度レポート</h1>
              <p className="text-sm text-zinc-500">AI副社長による週次分析</p>
            </div>
          </div>
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRegenerate}
              disabled={regenerating}
            >
              <RefreshCw className={cn('w-4 h-4 mr-1', regenerating && 'animate-spin')} />
              再生成
            </Button>
          )}
        </div>

        {error && (
          <Card className="p-4 mb-6 bg-red-50 border-red-200">
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm">{error}</span>
            </div>
          </Card>
        )}

        {!report ? (
          <Card className="p-12 text-center">
            <Heart className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
            <p className="text-zinc-500 mb-4">まだレポートがありません</p>
            {isAdmin && (
              <Button onClick={handleRegenerate} disabled={regenerating}>
                <RefreshCw className={cn('w-4 h-4 mr-2', regenerating && 'animate-spin')} />
                レポートを生成
              </Button>
            )}
          </Card>
        ) : (
          <>
            {/* Overall Status */}
            <Card className={cn('mb-6', LEVEL_CONFIG[report.overallLevel].border)}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Badge className={cn(LEVEL_CONFIG[report.overallLevel].bg, LEVEL_CONFIG[report.overallLevel].color)}>
                      {LEVEL_CONFIG[report.overallLevel].label}
                    </Badge>
                    <span className="text-sm text-zinc-500">{report.period}</span>
                  </div>
                  <span className="text-xs text-zinc-400">
                    {new Date(report.generatedAt).toLocaleString('ja-JP')}
                  </span>
                </div>

                {/* Summary Stats */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="text-center p-3 bg-zinc-50 rounded-xl">
                    <Users className="w-5 h-5 text-zinc-400 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-zinc-900">{report.totalUsers}</p>
                    <p className="text-xs text-zinc-500">アクティブユーザー</p>
                  </div>
                  <div className="text-center p-3 bg-zinc-50 rounded-xl">
                    <MessageSquare className="w-5 h-5 text-zinc-400 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-zinc-900">{report.totalMessages}</p>
                    <p className="text-xs text-zinc-500">メッセージ数</p>
                  </div>
                  <div className="text-center p-3 bg-zinc-50 rounded-xl">
                    <Eye className="w-5 h-5 text-zinc-400 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-zinc-900">{report.attentionUsers.length}</p>
                    <p className="text-xs text-zinc-500">要注意</p>
                  </div>
                </div>

                {/* AI Summary */}
                <div className="p-4 bg-pink-50 rounded-xl border border-pink-100">
                  <p className="text-sm text-zinc-700">{report.aiReport.summary}</p>
                </div>
              </CardContent>
            </Card>

            {/* Attention Users */}
            {report.attentionUsers.length > 0 && (
              <Card className="mb-6">
                <CardContent className="p-6">
                  <h2 className="font-semibold text-zinc-900 mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                    注意が必要なメンバー
                  </h2>
                  <div className="space-y-3">
                    {report.attentionUsers.map((user) => {
                      const config = LEVEL_CONFIG[user.alertLevel];
                      return (
                        <div
                          key={user.userId}
                          className={cn('p-4 rounded-xl border', config.border, config.bg)}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-zinc-900">
                                {user.userName || user.userId}
                              </span>
                              <span className="text-xs text-zinc-500">
                                {user.baseName || user.baseId}
                              </span>
                            </div>
                            <Badge className={cn(config.bg, config.color, 'text-xs')}>
                              {config.label}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {user.alertReasons.map((reason, idx) => (
                              <span
                                key={idx}
                                className="text-xs px-2 py-1 bg-white rounded-lg text-zinc-600"
                              >
                                {reason}
                              </span>
                            ))}
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-zinc-500">
                            <div className="flex items-center gap-1">
                              <MessageSquare className="w-3 h-3" />
                              {user.messageCount}件
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {Math.round(user.avgReplyTimeSec / 60)}分
                            </div>
                            <div className="flex items-center gap-1">
                              <Moon className="w-3 h-3" />
                              {Math.round(user.nightMessageRate * 100)}%
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Base Metrics */}
            <Card className="mb-6">
              <CardContent className="p-6">
                <h2 className="font-semibold text-zinc-900 mb-4 flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-zinc-500" />
                  拠点別サマリー
                </h2>
                <div className="space-y-3">
                  {report.baseMetrics.map((base) => (
                    <div
                      key={base.baseId}
                      className="p-4 bg-zinc-50 rounded-xl"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-zinc-900">{base.baseName}</span>
                        <span className="text-sm text-zinc-500">
                          {base.activeUserCount}名
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs text-zinc-500">
                        <div className="flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" />
                          {base.totalMessages}件
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          平均{Math.round(base.avgReplyTimeSec / 60)}分
                        </div>
                        <div className="flex items-center gap-1">
                          <Moon className="w-3 h-3" />
                          夜間{Math.round(base.nightMessageRate * 100)}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Observations & Recommendations */}
            {(report.aiReport.observations.length > 0 || report.aiReport.recommendations.length > 0) && (
              <Card>
                <CardContent className="p-6">
                  {report.aiReport.observations.length > 0 && (
                    <div className="mb-6">
                      <h3 className="font-semibold text-zinc-900 mb-3 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-blue-500" />
                        観察ポイント
                      </h3>
                      <ul className="space-y-2">
                        {report.aiReport.observations.map((obs, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm text-zinc-700">
                            <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
                            {obs}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {report.aiReport.recommendations.length > 0 && (
                    <div>
                      <h3 className="font-semibold text-zinc-900 mb-3 flex items-center gap-2">
                        <Eye className="w-4 h-4 text-purple-500" />
                        確認ポイント
                      </h3>
                      <ul className="space-y-2">
                        {report.aiReport.recommendations.map((rec, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm text-zinc-700">
                            <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
                            {rec}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  );
}
