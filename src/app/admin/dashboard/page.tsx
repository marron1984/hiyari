'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart3,
  TrendingUp,
  Users,
  Lightbulb,
  FileText,
  AlertTriangle,
  Clock,
  Cake,
  ChevronRight,
  Settings,
} from 'lucide-react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { supabase } from '@/lib/supabase';
import { getOverdueCount, getPendingCountByRole } from '@/lib/repositories/approvals';
import { getBirthdayAlerts, getBirthdayAlertSettings } from '@/lib/repositories/birthday';
import { getPointsSummary } from '@/lib/repositories/points';
import { BirthdayAlert, BirthdayAlertSettings } from '@/types/database';
import { formatDateJP, getMonthKey } from '@/lib/utils';

interface DashboardStats {
  totalIdeas: number;
  adoptedIdeas: number;
  totalApprovals: number;
  pendingApprovals: number;
  overdueApprovals: number;
  totalIncidents: number;
  monthlyPoints: number;
}

function AdminDashboardContent() {
  const router = useRouter();
  const { profile, organization, facility, isManagerOrAbove, isHqOrAbove, isAdmin } = useSupabaseAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [birthdayAlerts, setBirthdayAlerts] = useState<BirthdayAlert[]>([]);
  const [birthdaySettings, setBirthdaySettings] = useState<BirthdayAlertSettings | null>(null);

  const fetchData = useCallback(async () => {
    if (!organization || !facility || !profile) return;

    setLoading(true);
    try {
      // 統計取得
      const currentMonth = getMonthKey();

      // アイデア統計
      const { count: totalIdeas } = await supabase
        .from('improvement_ideas')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organization.id);

      const { count: adoptedIdeas } = await supabase
        .from('improvement_ideas')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organization.id)
        .in('status', ['adopted', 'implemented']);

      // 稟議統計
      const { count: totalApprovals } = await supabase
        .from('approvals')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organization.id);

      const pendingApprovals = await getPendingCountByRole(
        facility.id,
        organization.id,
        profile.role
      );

      const overdueApprovals = await getOverdueCount(organization.id);

      // インシデント統計
      const { count: totalIncidents } = await supabase
        .from('incidents')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organization.id);

      // ポイントサマリー
      const pointsSummary = await getPointsSummary(organization.id, currentMonth);

      setStats({
        totalIdeas: totalIdeas || 0,
        adoptedIdeas: adoptedIdeas || 0,
        totalApprovals: totalApprovals || 0,
        pendingApprovals,
        overdueApprovals,
        totalIncidents: totalIncidents || 0,
        monthlyPoints: pointsSummary.totalPoints,
      });

      // 誕生日アラート
      const settings = await getBirthdayAlertSettings(organization.id);
      setBirthdaySettings(settings);

      if (settings?.enabled) {
        const alerts = await getBirthdayAlerts(
          organization.id,
          !isHqOrAbove ? facility.id : undefined,
          settings.days_before
        );
        setBirthdayAlerts(alerts);
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, [organization, facility, profile, isHqOrAbove]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (!isManagerOrAbove) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
            <p className="text-gray-500">この画面は管理職以上のみアクセス可能です</p>
            <Button className="mt-4" onClick={() => router.push('/dashboard')}>
              ダッシュボードに戻る
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">管理ダッシュボード</h1>
          <p className="text-sm text-gray-500 mt-1">
            組織全体のKPIと状況を確認できます
          </p>
        </div>
        {isAdmin && (
          <Button variant="outline" onClick={() => router.push('/admin/birthday-import')}>
            <Settings className="w-4 h-4 mr-2" />
            誕生日PDF取込
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <>
          {/* 誕生日アラート */}
          {birthdayAlerts.length > 0 && (
            <Card className="mb-6 border-pink-200 bg-pink-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-pink-800">
                  <Cake className="w-5 h-5" />
                  お誕生日
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {birthdayAlerts.slice(0, 6).map((alert) => (
                    <div
                      key={`${alert.type}-${alert.id}`}
                      className="flex items-center gap-3 p-3 bg-white rounded-lg"
                    >
                      <div className="p-2 bg-pink-100 rounded-full">
                        <Cake className="w-4 h-4 text-pink-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{alert.name}</p>
                        <p className="text-xs text-gray-500">
                          {alert.type === 'client' ? '利用者' : '職員'} • {alert.facility_name}
                        </p>
                      </div>
                      <Badge variant={alert.days_until === 0 ? 'danger' : 'info'}>
                        {alert.days_until === 0 ? '本日' : `${alert.days_until}日後`}
                      </Badge>
                    </div>
                  ))}
                </div>
                {birthdayAlerts.length > 6 && (
                  <p className="text-sm text-pink-600 mt-3 text-center">
                    他 {birthdayAlerts.length - 6}名
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* KPIカード */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="py-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <BarChart3 className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">ヒヤリハット</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {stats?.totalIncidents || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="py-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <Lightbulb className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">改善アイデア</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {stats?.totalIdeas || 0}
                      <span className="text-sm text-green-600 ml-1">
                        ({stats?.adoptedIdeas || 0}採用)
                      </span>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="py-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <FileText className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">稟議</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {stats?.totalApprovals || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="py-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-yellow-100 rounded-lg">
                    <TrendingUp className="w-5 h-5 text-yellow-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">今月のポイント</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {stats?.monthlyPoints?.toLocaleString() || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* アラートカード */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {/* 承認待ち */}
            {stats && stats.pendingApprovals > 0 && (
              <Card
                className="border-orange-200 bg-orange-50 cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => router.push('/approvals')}
              >
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-orange-200 rounded-lg">
                        <Clock className="w-5 h-5 text-orange-600" />
                      </div>
                      <div>
                        <p className="font-medium text-orange-800">承認待ちの稟議</p>
                        <p className="text-2xl font-bold text-orange-900">
                          {stats.pendingApprovals}件
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-orange-400" />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 滞留 */}
            {stats && stats.overdueApprovals > 0 && (
              <Card
                className="border-red-200 bg-red-50 cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => router.push('/approvals')}
              >
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-red-200 rounded-lg">
                        <AlertTriangle className="w-5 h-5 text-red-600" />
                      </div>
                      <div>
                        <p className="font-medium text-red-800">期限超過の稟議</p>
                        <p className="text-2xl font-bold text-red-900">
                          {stats.overdueApprovals}件
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-red-400" />
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* クイックリンク */}
          <Card>
            <CardHeader>
              <CardTitle>クイックアクセス</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Button
                  variant="outline"
                  className="h-auto py-4 flex-col"
                  onClick={() => router.push('/ideas')}
                >
                  <Lightbulb className="w-6 h-6 mb-2" />
                  <span>改善アイデア</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-auto py-4 flex-col"
                  onClick={() => router.push('/approvals')}
                >
                  <FileText className="w-6 h-6 mb-2" />
                  <span>稟議管理</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-auto py-4 flex-col"
                  onClick={() => router.push('/points')}
                >
                  <TrendingUp className="w-6 h-6 mb-2" />
                  <span>ポイント</span>
                </Button>
                {isAdmin && (
                  <Button
                    variant="outline"
                    className="h-auto py-4 flex-col"
                    onClick={() => router.push('/admin/birthday-import')}
                  >
                    <Cake className="w-6 h-6 mb-2" />
                    <span>誕生日取込</span>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 採用率 */}
          {stats && stats.totalIdeas > 0 && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>改善アイデア採用率</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-4 bg-green-500 rounded-full transition-all"
                        style={{
                          width: `${(stats.adoptedIdeas / stats.totalIdeas) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                  <span className="text-lg font-bold text-gray-900">
                    {Math.round((stats.adoptedIdeas / stats.totalIdeas) * 100)}%
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  {stats.totalIdeas}件中 {stats.adoptedIdeas}件が採用・実装済み
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export default function AdminDashboardPage() {
  return (
    <AuthGuard>
      <AdminDashboardContent />
    </AuthGuard>
  );
}
