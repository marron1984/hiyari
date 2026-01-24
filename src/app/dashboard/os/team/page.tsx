'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { PreviewBadge } from '@/components/PreviewBadge';
import { getChaosDashboardMetrics, getInterventions } from '@/lib/chaos';
import { DEFAULT_TENANT_ID } from '@/lib/firebase';
import { Intervention, METER_LABELS, METER_COLORS, MeterColor } from '@/types/chaos';
import { getChaosViewLevel, canViewTeamChaosData, ChaosViewLevel } from '@/lib/auth';
import {
  ArrowLeft,
  Users,
  AlertTriangle,
  Shield,
  Activity,
  TrendingUp,
  CheckCircle,
  Clock,
} from 'lucide-react';

// ダミーデータ（赤黄のみ表示用）
const DUMMY_TEAM_DATA = [
  { userId: '1', userName: '山田 太郎', score: 72, level: 'red' as const, lastCheckin: '2026-01-22', trend: 'up' as const },
  { userId: '2', userName: '佐藤 花子', score: 58, level: 'yellow' as const, lastCheckin: '2026-01-23', trend: 'stable' as const },
  { userId: '3', userName: '鈴木 一郎', score: 45, level: 'yellow' as const, lastCheckin: '2026-01-23', trend: 'down' as const },
  { userId: '4', userName: '田中 美咲', score: 32, level: 'green' as const, lastCheckin: '2026-01-23', trend: 'stable' as const },
  { userId: '5', userName: '高橋 健太', score: 28, level: 'green' as const, lastCheckin: '2026-01-21', trend: 'stable' as const },
];

export default function OSTeamPage() {
  return (
    <AuthGuard>
      <OSTeamContent />
    </AuthGuard>
  );
}

function OSTeamContent() {
  const { user, isLeaderOrAbove } = useAuth();
  const [loading, setLoading] = useState(true);
  const [teamData, setTeamData] = useState<{
    userId: string;
    userName: string;
    score: number;
    level: 'red' | 'yellow' | 'green';
    lastCheckin: string;
    trend: 'up' | 'down' | 'stable';
  }[]>([]);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [filter, setFilter] = useState<'all' | 'alert'>('all');

  // 権限レベルを取得
  const viewLevel: ChaosViewLevel = user ? getChaosViewLevel(user.role, user.email) : 'self';
  const canViewTeam = user ? canViewTeamChaosData(user.role, user.email) : false;

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;

      // 権限チェック
      if (!canViewTeamChaosData(user.role, user.email)) {
        setTeamData([]);
        setLoading(false);
        return;
      }

      try {
        const [chaosData, interventionsData] = await Promise.all([
          getChaosDashboardMetrics(DEFAULT_TENANT_ID),
          getInterventions('open', 20),
        ]);

        // 実データがあればそれを使う、なければダミーデータ
        if (chaosData.organization.burnoutRiskHeatmap.length > 0) {
          setTeamData(chaosData.organization.burnoutRiskHeatmap.map(item => ({
            ...item,
            level: item.level as 'red' | 'yellow' | 'green',
            lastCheckin: new Date().toISOString().split('T')[0],
            trend: 'stable' as const,
          })));
        } else {
          // ダミーデータを権限に応じて表示
          setTeamData(DUMMY_TEAM_DATA);
        }

        setInterventions(interventionsData);
      } catch (error) {
        console.error('Failed to fetch team data:', error);
        setTeamData(DUMMY_TEAM_DATA);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  const filteredTeam = filter === 'alert'
    ? teamData.filter(m => m.level === 'red' || m.level === 'yellow')
    : teamData;

  const alertCount = teamData.filter(m => m.level === 'red' || m.level === 'yellow').length;
  const redCount = teamData.filter(m => m.level === 'red').length;
  const yellowCount = teamData.filter(m => m.level === 'yellow').length;

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
      <main className="pb-8">
        <div className="max-w-4xl mx-auto px-4 py-6">
          {/* ヘッダー */}
          <div className="flex items-center mb-6">
            <Link href="/dashboard/os" className="p-2 -ml-2 rounded-lg hover:bg-gray-100">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <div className="ml-2 flex-1">
              <h1 className="text-xl font-bold text-gray-900 flex items-center">
                <Users className="w-5 h-5 mr-2 text-indigo-600" />
                チームコンディション
              </h1>
              <p className="text-sm text-gray-500">
                {viewLevel === 'all' ? '全社メンバーの状態一覧' :
                 viewLevel === 'team' ? '配下メンバーの状態一覧' :
                 '自分の状態のみ表示'}
              </p>
            </div>
          </div>

          {/* 支援目的の注意文 */}
          <Card className="mb-6 bg-blue-50 border-blue-200">
            <CardContent className="p-4 flex items-start gap-3">
              <Shield className="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-800">
                  これは支援のための指標です。評価や査定のためではありません。
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  アラートは罰則ではなく、支援のトリガーとして機能します。
                  1on1は評価や指導ではなく、あなたを支えるための安全装置です。
                </p>
              </div>
            </CardContent>
          </Card>

          {/* 権限がない場合のメッセージ */}
          {!canViewTeam && (
            <Card className="mb-6">
              <CardContent className="p-8 text-center">
                <Shield className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600 font-medium">チームデータの閲覧権限がありません</p>
                <p className="text-sm text-gray-500 mt-2">
                  チームのコンディションを確認するには、リーダー以上の権限が必要です。
                </p>
                <Link href="/dashboard/os/checkin" className="mt-4 inline-block">
                  <Button size="sm">自分のチェックインへ</Button>
                </Link>
              </CardContent>
            </Card>
          )}

          {/* サマリー（権限がある場合のみ表示） */}
          {canViewTeam && (
            <>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">メンバー数</p>
                  <p className="text-2xl font-bold text-gray-900">{teamData.length}</p>
                </div>
                <Users className="w-8 h-8 text-gray-300" />
              </div>
            </Card>
            <Card className={`p-4 ${redCount > 0 ? 'bg-red-50 border-red-200' : ''}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">サポートが必要</p>
                  <p className={`text-2xl font-bold ${redCount > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    {redCount}
                  </p>
                </div>
                <AlertTriangle className={`w-8 h-8 ${redCount > 0 ? 'text-red-400' : 'text-gray-300'}`} />
              </div>
            </Card>
            <Card className={`p-4 ${yellowCount > 0 ? 'bg-yellow-50 border-yellow-200' : ''}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">余裕少なめ</p>
                  <p className={`text-2xl font-bold ${yellowCount > 0 ? 'text-yellow-600' : 'text-gray-900'}`}>
                    {yellowCount}
                  </p>
                </div>
                <Activity className={`w-8 h-8 ${yellowCount > 0 ? 'text-yellow-400' : 'text-gray-300'}`} />
              </div>
            </Card>
          </div>

          {/* フィルター */}
          <div className="flex gap-2 mb-4">
            <Button
              variant={filter === 'all' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setFilter('all')}
            >
              全員 ({teamData.length})
            </Button>
            <Button
              variant={filter === 'alert' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setFilter('alert')}
              className={filter === 'alert' ? '' : alertCount > 0 ? 'border-red-300 text-red-700' : ''}
            >
              要確認のみ ({alertCount})
            </Button>
          </div>

          {/* メンバー一覧 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">メンバー一覧</CardTitle>
            </CardHeader>
            <CardContent>
              {filteredTeam.length > 0 ? (
                <div className="space-y-3">
                  {filteredTeam.map((member) => (
                    <div
                      key={member.userId}
                      className={`p-4 rounded-lg border ${
                        member.level === 'red' ? 'bg-red-50 border-red-200' :
                        member.level === 'yellow' ? 'bg-yellow-50 border-yellow-200' :
                        'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-medium ${
                            member.level === 'red' ? 'bg-red-500' :
                            member.level === 'yellow' ? 'bg-yellow-500' :
                            'bg-green-500'
                          }`}>
                            {member.userName.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{member.userName}</p>
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <Clock className="w-3 h-3" />
                              <span>最終: {member.lastCheckin}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="flex items-center gap-1">
                              {member.trend === 'up' && <TrendingUp className="w-3 h-3 text-red-500" />}
                              {member.trend === 'down' && <TrendingUp className="w-3 h-3 text-green-500 rotate-180" />}
                              <Badge
                                className={METER_COLORS[member.level as MeterColor].bg + ' ' + METER_COLORS[member.level as MeterColor].text}
                              >
                                {METER_LABELS[member.level as MeterColor]}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                      {(member.level === 'red' || member.level === 'yellow') && (
                        <div className="mt-3 pt-3 border-t border-gray-200 flex justify-end gap-2">
                          <Button size="sm" variant="outline">
                            履歴を見る
                          </Button>
                          <Button size="sm">
                            1on1を設定
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                  <p className="text-gray-500">要確認のメンバーはいません</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 要対応タスク */}
          {interventions.length > 0 && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-base">要対応タスク（支援）</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {interventions.slice(0, 5).map((item) => (
                    <div
                      key={item.id}
                      className={`p-3 rounded-lg border ${
                        item.severity === 'red' ? 'border-red-200 bg-red-50' :
                        item.severity === 'yellow' ? 'border-yellow-200 bg-yellow-50' :
                        'border-gray-200'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-medium">{item.title}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {item.createdAt.toLocaleDateString('ja-JP')}
                          </p>
                        </div>
                        <Badge
                          className={
                            item.severity === 'red' ? 'bg-red-100 text-red-700' :
                            item.severity === 'yellow' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-gray-100 text-gray-700'
                          }
                        >
                          {item.severity}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          </>
          )}

          {/* 権限レベル表示 */}
          <p className="text-xs text-gray-400 text-center mt-6">
            閲覧権限: {viewLevel === 'all' ? '全社' : viewLevel === 'team' ? 'チーム' : '自分のみ'}
          </p>
        </div>
      </main>
    </>
  );
}
