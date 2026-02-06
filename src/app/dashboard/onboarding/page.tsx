'use client';

/**
 * オンボーディング統計ダッシュボード
 *
 * Ticket 097: 署名完了率ダッシュボード
 *
 * - 全体完了率
 * - 文書別署名率
 * - 組織別完了率
 * - 滞留バケット
 * - 未完了ユーザー一覧
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@/components/ui';
import {
  FileCheck,
  RefreshCw,
  Users,
  Building2,
  FileText,
  Clock,
  AlertTriangle,
  TrendingUp,
  Send,
} from 'lucide-react';

// 型定義
interface OnboardingStats {
  generatedAt: string;
  overall: {
    totalUsers: number;
    completedUsers: number;
    pendingUsers: number;
    completionRate: number;
  };
  byDoc: Array<{
    documentVersionId: string;
    documentId: string;
    title: string;
    signedCount: number;
    pendingCount: number;
    totalCount: number;
    signRate: number;
  }>;
  byOrgUnit: Array<{
    orgUnitId: string;
    orgUnitName: string;
    totalUsers: number;
    completedUsers: number;
    pendingUsers: number;
    completionRate: number;
    topPendingDocs: Array<{ documentVersionId: string; title: string; count: number }>;
  }>;
  agingBuckets: {
    oneDay: number;
    threeDays: number;
    sevenDays: number;
  };
  topPendingUsers: Array<{
    userId: string;
    name: string | null;
    role: string | null;
    orgUnitId: string | null;
    orgUnitName: string | null;
    pendingCount: number;
    oldestDays: number;
  }>;
  scope: string;
}

export default function OnboardingStatsPage() {
  const [stats, setStats] = useState<OnboardingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sendingReminder, setSendingReminder] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/onboarding/stats');
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'データの取得に失敗しました');
      }
      const data = await res.json();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラー');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // リマインド送信
  const handleSendReminder = async () => {
    if (!confirm('未完了ユーザーにリマインド通知を送信しますか？')) {
      return;
    }
    setSendingReminder(true);
    try {
      const res = await fetch('/api/cron/onboarding-reminder');
      const data = await res.json();
      if (data.success) {
        alert(`リマインドを送信しました。\n・本人通知: ${data.reminder?.userNotificationsCreated ?? 0}件\n・管理者ダイジェスト: ${data.reminder?.managerDigestsCreated ?? 0}件`);
      } else {
        throw new Error(data.error || 'リマインド送信に失敗しました');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '不明なエラー');
    } finally {
      setSendingReminder(false);
    }
  };

  // 完了率に応じた色
  const getRateColor = (rate: number) => {
    if (rate >= 90) return 'text-green-600';
    if (rate >= 70) return 'text-amber-600';
    return 'text-red-600';
  };

  const getRateBg = (rate: number) => {
    if (rate >= 90) return 'bg-green-100';
    if (rate >= 70) return 'bg-amber-100';
    return 'bg-red-100';
  };

  if (loading) {
    return (
      <main className="pb-8">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="text-center py-12">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-zinc-400" />
            <p className="text-zinc-500">読み込み中...</p>
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="pb-8">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="text-center py-12">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <p className="text-lg font-medium text-red-700">{error}</p>
            <Button variant="outline" className="mt-4" onClick={fetchStats}>
              再試行
            </Button>
          </div>
        </div>
      </main>
    );
  }

  if (!stats) return null;

  return (
    <main className="pb-8">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* ヘッダー */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg">
              <FileCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">オンボーディング統計</h1>
              <p className="text-sm text-gray-500">
                署名完了率と滞留状況の把握
                {stats.scope === 'manager' && (
                  <Badge className="ml-2 text-xs">管理組織のみ</Badge>
                )}
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="primary"
              size="sm"
              onClick={handleSendReminder}
              disabled={sendingReminder || stats.overall.pendingUsers === 0}
            >
              <Send className={`w-4 h-4 mr-1 ${sendingReminder ? 'animate-pulse' : ''}`} />
              {sendingReminder ? '送信中...' : 'リマインド送信'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchStats}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              更新
            </Button>
          </div>
        </div>

        {/* KPIカード */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <TrendingUp className="w-8 h-8 text-blue-500" />
                <span className={`text-3xl font-bold ${getRateColor(stats.overall.completionRate)}`}>
                  {stats.overall.completionRate}%
                </span>
              </div>
              <p className="text-sm text-zinc-600 mt-1">完了率</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <Users className="w-8 h-8 text-zinc-400" />
                <span className="text-3xl font-bold text-zinc-700">
                  {stats.overall.totalUsers}
                </span>
              </div>
              <p className="text-sm text-zinc-600 mt-1">対象者数</p>
            </CardContent>
          </Card>
          <Card className={stats.overall.pendingUsers > 0 ? 'border-amber-300' : ''}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <Clock className="w-8 h-8 text-amber-500" />
                <span className="text-3xl font-bold text-amber-600">
                  {stats.overall.pendingUsers}
                </span>
              </div>
              <p className="text-sm text-zinc-600 mt-1">未完了</p>
            </CardContent>
          </Card>
          <Card className="bg-green-50">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <FileCheck className="w-8 h-8 text-green-500" />
                <span className="text-3xl font-bold text-green-600">
                  {stats.overall.completedUsers}
                </span>
              </div>
              <p className="text-sm text-zinc-600 mt-1">完了</p>
            </CardContent>
          </Card>
        </div>

        {/* 滞留バケット */}
        {stats.overall.pendingUsers > 0 && (
          <Card className="mb-6 border-amber-200 bg-amber-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                滞留状況
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 bg-white rounded-lg">
                  <p className="text-2xl font-bold text-amber-600">{stats.agingBuckets.oneDay}</p>
                  <p className="text-sm text-zinc-600">1日以上</p>
                </div>
                <div className="text-center p-4 bg-white rounded-lg">
                  <p className="text-2xl font-bold text-orange-600">{stats.agingBuckets.threeDays}</p>
                  <p className="text-sm text-zinc-600">3日以上</p>
                </div>
                <div className="text-center p-4 bg-white rounded-lg">
                  <p className="text-2xl font-bold text-red-600">{stats.agingBuckets.sevenDays}</p>
                  <p className="text-sm text-zinc-600">7日以上</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {/* 文書別署名率 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="w-5 h-5 text-zinc-600" />
                文書別署名率
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats.byDoc.length === 0 ? (
                <p className="text-sm text-zinc-500 text-center py-4">データなし</p>
              ) : (
                <div className="space-y-3">
                  {stats.byDoc.map((doc) => (
                    <div key={doc.documentVersionId} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{doc.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-2 bg-zinc-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${getRateBg(doc.signRate)} transition-all`}
                              style={{ width: `${doc.signRate}%` }}
                            />
                          </div>
                          <span className={`text-sm font-medium ${getRateColor(doc.signRate)}`}>
                            {doc.signRate}%
                          </span>
                        </div>
                      </div>
                      <div className="text-right text-xs text-zinc-500">
                        <p>{doc.signedCount}/{doc.totalCount}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 組織別完了率 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Building2 className="w-5 h-5 text-zinc-600" />
                組織別完了率
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats.byOrgUnit.length === 0 ? (
                <p className="text-sm text-zinc-500 text-center py-4">データなし</p>
              ) : (
                <div className="space-y-3">
                  {stats.byOrgUnit.slice(0, 5).map((org) => (
                    <div key={org.orgUnitId} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{org.orgUnitName}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-2 bg-zinc-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${getRateBg(org.completionRate)} transition-all`}
                              style={{ width: `${org.completionRate}%` }}
                            />
                          </div>
                          <span className={`text-sm font-medium ${getRateColor(org.completionRate)}`}>
                            {org.completionRate}%
                          </span>
                        </div>
                        {org.topPendingDocs.length > 0 && (
                          <p className="text-xs text-zinc-400 mt-1">
                            未: {org.topPendingDocs.map(d => d.title).join(', ')}
                          </p>
                        )}
                      </div>
                      <div className="text-right text-xs text-zinc-500">
                        <p>{org.completedUsers}/{org.totalUsers}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 未完了ユーザー一覧 */}
        {stats.topPendingUsers.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="w-5 h-5 text-zinc-600" />
                未完了ユーザー（上位{stats.topPendingUsers.length}件）
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2">ユーザー</th>
                      <th className="text-left py-2 px-2">組織</th>
                      <th className="text-center py-2 px-2">ロール</th>
                      <th className="text-center py-2 px-2">未署名</th>
                      <th className="text-center py-2 px-2">経過日数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.topPendingUsers.map((user) => (
                      <tr key={user.userId} className="border-b last:border-b-0 hover:bg-zinc-50">
                        <td className="py-2 px-2">
                          {user.name || user.userId}
                        </td>
                        <td className="py-2 px-2 text-zinc-500">
                          {user.orgUnitName || '-'}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <Badge className="text-xs">
                            {user.role || '-'}
                          </Badge>
                        </td>
                        <td className="py-2 px-2 text-center">
                          <Badge className="bg-amber-100 text-amber-700 text-xs">
                            {user.pendingCount}件
                          </Badge>
                        </td>
                        <td className="py-2 px-2 text-center">
                          <span className={user.oldestDays >= 7 ? 'text-red-600 font-medium' : user.oldestDays >= 3 ? 'text-amber-600' : ''}>
                            {user.oldestDays}日
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* フッター */}
        <div className="mt-6 text-center text-xs text-zinc-400">
          最終更新: {new Date(stats.generatedAt).toLocaleString('ja-JP')}
        </div>
      </div>
    </main>
  );
}
