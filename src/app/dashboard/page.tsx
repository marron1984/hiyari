'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_TENANT_ID } from '@/lib/firebase';
import { getCheckinHistory, getChaosDashboardMetrics, getInterventions } from '@/lib/chaos';
import { getSalesDeals, getSalesAccounts } from '@/lib/sales';
import { getProspects } from '@/lib/prospect';
import { getFacilitiesWithVacancy } from '@/lib/vacancy';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { PreviewBadge } from '@/components/PreviewBadge';
import {
  StaffCheckin,
  Intervention,
  METER_LABELS,
  METER_COLORS,
  getMeterColor,
  MeterColor,
  SUPPORT_PURPOSE_TEXT,
  ONEONONE_PURPOSE_TEXT,
} from '@/types/chaos';
import {
  calculateBatchMoveInProbability,
  aggregateByRank,
  calculateExpectedMoveIns,
} from '@/lib/scoring';
import { getChaosViewLevel } from '@/lib/auth';
import {
  Heart,
  Shield,
  MessageCircle,
  Bell,
  Sparkles,
  Users,
  AlertTriangle,
  Target,
  TrendingUp,
  Calendar,
  CheckCircle,
  Clock,
  Building2,
  Briefcase,
  BarChart2,
  ArrowRight,
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

  // 共通データ
  const [checkinHistory, setCheckinHistory] = useState<StaffCheckin[]>([]);
  const [interventions, setInterventions] = useState<Intervention[]>([]);

  // Manager/Exec用データ
  const [teamData, setTeamData] = useState<{
    userId: string;
    userName: string;
    score: number;
    level: MeterColor;
  }[]>([]);
  const [orgMetrics, setOrgMetrics] = useState<{
    avgFatigue: number;
    avgMentalLoad: number;
    alertCount: { yellow: number; red: number };
    burnoutRiskHeatmap: { userId: string; userName: string; score: number; level: string }[];
  } | null>(null);

  // Exec用データ
  const [salesMetrics, setSalesMetrics] = useState({
    accounts: 0,
    activeDeals: 0,
    completedDeals: 0,
    cvRate: 0,
    expectedMoveIns: 0,
    rankA: 0,
    rankB: 0,
    rankC: 0,
    rankD: 0,
  });
  const [occupancyRate, setOccupancyRate] = useState(0);

  // 役割判定
  const viewLevel = user ? getChaosViewLevel(user.role, user.email) : 'self';
  const isStaff = viewLevel === 'self';
  const isManager = viewLevel === 'team';
  const isExec = viewLevel === 'all';

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;

      try {
        // 全員：自分のチェックイン履歴
        const history = await getCheckinHistory(user.id, 7);
        setCheckinHistory(history);

        // Manager以上：チーム・組織データ
        if (!isStaff) {
          const [chaosData, interventionsData] = await Promise.all([
            getChaosDashboardMetrics(DEFAULT_TENANT_ID),
            getInterventions('open', 20),
          ]);
          setOrgMetrics(chaosData.organization);
          setInterventions(interventionsData);

          // チームデータをセット
          const team = chaosData.organization.burnoutRiskHeatmap.map(m => ({
            userId: m.userId,
            userName: m.userName,
            score: m.score,
            level: getMeterColor(m.score),
          }));
          setTeamData(team);
        }

        // Exec：営業・経営データ
        if (isExec) {
          const [dealsData, accountsData, prospectsData, facilitiesData] = await Promise.all([
            getSalesDeals(DEFAULT_TENANT_ID),
            getSalesAccounts(DEFAULT_TENANT_ID),
            getProspects(DEFAULT_TENANT_ID),
            getFacilitiesWithVacancy(DEFAULT_TENANT_ID),
          ]);

          const activeDeals = dealsData.filter(d => !['請求書到着', '失注'].includes(d.status));
          const completedDeals = dealsData.filter(d => d.status === '請求書到着');
          const cvRate = dealsData.length > 0
            ? Math.round((completedDeals.length / dealsData.length) * 100)
            : 0;

          // 入居確率スコアリング
          const activeProspects = prospectsData.filter(
            p => p.status !== '見送り' && p.status !== 'クローズ' && p.status !== '入居決定'
          );
          const scoringResults = calculateBatchMoveInProbability(activeProspects);
          const rankDistribution = aggregateByRank(scoringResults);
          const expectedMoveIns = calculateExpectedMoveIns(scoringResults);

          setSalesMetrics({
            accounts: accountsData.length,
            activeDeals: activeDeals.length,
            completedDeals: completedDeals.length,
            cvRate,
            expectedMoveIns,
            rankA: rankDistribution.A,
            rankB: rankDistribution.B,
            rankC: rankDistribution.C,
            rankD: rankDistribution.D,
          });

          // 稼働率
          const totalCapacity = facilitiesData.reduce((sum, f) => sum + (f.facility.capacity || 0), 0);
          const totalVacant = facilitiesData.reduce((sum, f) => sum + (f.vacancy?.vacantCount ?? 0), 0);
          const rate = totalCapacity > 0 ? Math.round(((totalCapacity - totalVacant) / totalCapacity) * 100) : 0;
          setOccupancyRate(rate);
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, isStaff, isExec]);

  if (loading) {
    return (
      <>
        <Header />
        <Loading text="読み込み中..." />
      </>
    );
  }

  // 今日の余裕メーター計算
  const todayCheckin = checkinHistory[0];
  let todayMeterColor: MeterColor = 'green';
  if (todayCheckin) {
    const avgScore = Math.round(
      ((todayCheckin.physicalFatigue + todayCheckin.mentalFatigue + todayCheckin.anxiety +
        todayCheckin.decisionLoad + (4 - todayCheckin.sleep) + (4 - todayCheckin.consulted)) / 6) * 25
    );
    todayMeterColor = getMeterColor(avgScore);
  }

  return (
    <>
      <Header />
      <PreviewBadge />
      <main className="pb-20 md:pb-8">
        <div className="max-w-6xl mx-auto px-4 py-6">
          {/* 支援目的の注意文（全画面共通） */}
          <Card className="mb-6 bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-800">
                    これは支援のための仕組みです。評価や査定のためではありません。
                  </p>
                  <p className="text-xs text-blue-600 mt-1">
                    {ONEONONE_PURPOSE_TEXT}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 役割別コンテンツ */}
          {isStaff && <StaffDashboard
            todayCheckin={todayCheckin}
            todayMeterColor={todayMeterColor}
            checkinHistory={checkinHistory}
          />}

          {isManager && <ManagerDashboard
            teamData={teamData}
            interventions={interventions}
            orgMetrics={orgMetrics}
          />}

          {isExec && <ExecDashboard
            teamData={teamData}
            interventions={interventions}
            orgMetrics={orgMetrics}
            salesMetrics={salesMetrics}
            occupancyRate={occupancyRate}
          />}
        </div>
      </main>
    </>
  );
}

// ========== スタッフ用ダッシュボード ==========
function StaffDashboard({
  todayCheckin,
  todayMeterColor,
  checkinHistory,
}: {
  todayCheckin: StaffCheckin | undefined;
  todayMeterColor: MeterColor;
  checkinHistory: StaffCheckin[];
}) {
  return (
    <div className="space-y-6">
      {/* 1. 今日の余裕メーター */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center">
            <Heart className="w-5 h-5 mr-2 text-red-500" />
            今日の余裕メーター
          </CardTitle>
        </CardHeader>
        <CardContent>
          {todayCheckin ? (
            <div className="text-center">
              <div className={`inline-flex items-center justify-center w-24 h-24 rounded-full ${METER_COLORS[todayMeterColor].bg} ${METER_COLORS[todayMeterColor].border} border-4 mb-4`}>
                <span className={`text-lg font-bold ${METER_COLORS[todayMeterColor].text}`}>
                  {METER_LABELS[todayMeterColor]}
                </span>
              </div>

              {/* 7日推移（色の丸7個） */}
              <div className="flex justify-center gap-2 mt-4">
                {checkinHistory.slice(0, 7).map((checkin, idx) => {
                  const avgScore = Math.round(
                    ((checkin.physicalFatigue + checkin.mentalFatigue + checkin.anxiety +
                      checkin.decisionLoad + (4 - checkin.sleep) + (4 - checkin.consulted)) / 6) * 25
                  );
                  const color = getMeterColor(avgScore);
                  return (
                    <div
                      key={checkin.id || idx}
                      className={`w-8 h-8 rounded-full ${METER_COLORS[color].bg} ${METER_COLORS[color].border} border-2`}
                      title={`${checkin.date}: ${METER_LABELS[color]}`}
                    />
                  );
                })}
              </div>
              <p className="text-xs text-gray-500 mt-2">過去7日間の推移</p>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500 mb-4">今日のチェックインがまだです</p>
              <Link href="/dashboard/os/checkin">
                <Button>
                  <Heart className="w-4 h-4 mr-1" />
                  チェックインする
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. 今日の自分タスク（期限が近いもの） */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center">
            <CheckCircle className="w-5 h-5 mr-2 text-green-600" />
            今日のタスク
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-gray-500">
            <Clock className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">期限が近いタスクはありません</p>
          </div>
        </CardContent>
      </Card>

      {/* 3. サポート相談ボタン（固定） */}
      <Card className="bg-gradient-to-r from-indigo-50 to-blue-50 border-indigo-200">
        <CardContent className="p-6 text-center">
          <MessageCircle className="w-10 h-10 mx-auto mb-3 text-indigo-600" />
          <p className="text-sm text-gray-600 mb-4">
            困っていることや相談したいことはありますか？
          </p>
          <Button className="bg-indigo-600 hover:bg-indigo-700">
            <MessageCircle className="w-4 h-4 mr-2" />
            サポート相談
          </Button>
        </CardContent>
      </Card>

      {/* 4. 重要連絡（管理者から） */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center">
            <Bell className="w-5 h-5 mr-2 text-orange-500" />
            重要連絡
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-gray-500">
            <p className="text-sm">新しい連絡はありません</p>
          </div>
        </CardContent>
      </Card>

      {/* 5. 小さな成長（承認ワンポイント） */}
      <Card className="bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-200">
        <CardHeader>
          <CardTitle className="text-base flex items-center">
            <Sparkles className="w-5 h-5 mr-2 text-yellow-600" />
            小さな成長
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-700">
            今週もチェックインを続けています！自分のコンディションを把握することは大切な一歩です。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ========== 管理者用ダッシュボード ==========
function ManagerDashboard({
  teamData,
  interventions,
  orgMetrics,
}: {
  teamData: { userId: string; userName: string; score: number; level: MeterColor }[];
  interventions: Intervention[];
  orgMetrics: {
    avgFatigue: number;
    avgMentalLoad: number;
    alertCount: { yellow: number; red: number };
    burnoutRiskHeatmap: { userId: string; userName: string; score: number; level: string }[];
  } | null;
}) {
  const redCount = teamData.filter(m => m.level === 'red').length;
  const yellowCount = teamData.filter(m => m.level === 'yellow').length;
  const pendingInterventions = interventions.filter(i => i.status === 'open');

  return (
    <div className="space-y-6">
      {/* 上段2カラム */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 左：チーム余裕ヒートマップ */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center">
              <Users className="w-5 h-5 mr-2 text-blue-600" />
              チーム余裕ヒートマップ
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* サマリー */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className={`p-3 rounded-lg text-center ${redCount > 0 ? 'bg-red-100' : 'bg-gray-50'}`}>
                <p className={`text-2xl font-bold ${redCount > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                  {redCount}
                </p>
                <p className="text-xs text-gray-600">サポートが必要</p>
              </div>
              <div className={`p-3 rounded-lg text-center ${yellowCount > 0 ? 'bg-yellow-100' : 'bg-gray-50'}`}>
                <p className={`text-2xl font-bold ${yellowCount > 0 ? 'text-yellow-600' : 'text-gray-400'}`}>
                  {yellowCount}
                </p>
                <p className="text-xs text-gray-600">余裕少なめ</p>
              </div>
              <div className="p-3 rounded-lg text-center bg-green-50">
                <p className="text-2xl font-bold text-green-600">
                  {teamData.length - redCount - yellowCount}
                </p>
                <p className="text-xs text-gray-600">余裕あり</p>
              </div>
            </div>

            {/* メンバー一覧 */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {teamData.map((member) => (
                <div
                  key={member.userId}
                  className={`flex items-center justify-between p-2 rounded-lg ${METER_COLORS[member.level].bg}`}
                >
                  <span className="text-sm font-medium">{member.userName}</span>
                  <Badge className={`${METER_COLORS[member.level].bg} ${METER_COLORS[member.level].text}`}>
                    {METER_LABELS[member.level]}
                  </Badge>
                </div>
              ))}
              {teamData.length === 0 && (
                <p className="text-center text-gray-500 py-4">チームデータがありません</p>
              )}
            </div>
            <Link href="/dashboard/os/team" className="text-sm text-blue-600 hover:underline flex items-center mt-3">
              詳細を見る <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </CardContent>
        </Card>

        {/* 右：サポート待ちリスト */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center">
              <AlertTriangle className="w-5 h-5 mr-2 text-orange-500" />
              サポート待ちリスト
              {pendingInterventions.length > 0 && (
                <Badge className="ml-2 bg-red-100 text-red-700">{pendingInterventions.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pendingInterventions.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {pendingInterventions.map((item) => (
                  <div
                    key={item.id}
                    className={`p-3 rounded-lg border ${
                      item.severity === 'red' ? 'bg-red-50 border-red-200' :
                      item.severity === 'yellow' ? 'bg-yellow-50 border-yellow-200' :
                      'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{item.targetName || item.title}</span>
                      <Badge className={
                        item.severity === 'red' ? 'bg-red-100 text-red-700' :
                        item.severity === 'yellow' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-700'
                      }>
                        {item.severity === 'red' ? 'サポートが必要' : item.severity === 'yellow' ? '余裕少なめ' : '確認'}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{item.title}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-2" />
                <p className="text-sm text-gray-500">未対応のサポートはありません</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 下段 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 現場ボトルネック */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">現場ボトルネック</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500 text-center py-4">
              特に問題なし
            </p>
          </CardContent>
        </Card>

        {/* 承認の見える化 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">承認の見える化</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500 text-center py-4">
              支援のための行動ログ
            </p>
          </CardContent>
        </Card>

        {/* WBR宿題 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center">
              <Calendar className="w-4 h-4 mr-2" />
              WBR宿題
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/wbr" className="text-sm text-blue-600 hover:underline flex items-center">
              WBRを確認する <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ========== 吉田用（Exec）ダッシュボード ==========
function ExecDashboard({
  teamData,
  interventions,
  orgMetrics,
  salesMetrics,
  occupancyRate,
}: {
  teamData: { userId: string; userName: string; score: number; level: MeterColor }[];
  interventions: Intervention[];
  orgMetrics: {
    avgFatigue: number;
    avgMentalLoad: number;
    alertCount: { yellow: number; red: number };
    burnoutRiskHeatmap: { userId: string; userName: string; score: number; level: string }[];
  } | null;
  salesMetrics: {
    accounts: number;
    activeDeals: number;
    completedDeals: number;
    cvRate: number;
    expectedMoveIns: number;
    rankA: number;
    rankB: number;
    rankC: number;
    rankD: number;
  };
  occupancyRate: number;
}) {
  const redCount = teamData.filter(m => m.level === 'red').length;
  const yellowCount = teamData.filter(m => m.level === 'yellow').length;
  const interventionRate = interventions.length > 0
    ? Math.round((interventions.filter(i => i.status === 'done').length / interventions.length) * 100)
    : 100;

  return (
    <div className="space-y-6">
      {/* 経営KPIサマリー */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">稼働率</p>
              <p className="text-2xl font-bold text-blue-600">{occupancyRate}%</p>
            </div>
            <Building2 className="w-8 h-8 text-blue-300" />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">入居見込み</p>
              <p className="text-2xl font-bold text-green-600">{salesMetrics.expectedMoveIns}</p>
            </div>
            <Target className="w-8 h-8 text-green-300" />
          </div>
        </Card>
        <Card className={`p-4 ${redCount > 0 ? 'bg-red-50' : yellowCount > 0 ? 'bg-yellow-50' : ''}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">赤/黄率</p>
              <p className={`text-2xl font-bold ${redCount > 0 ? 'text-red-600' : yellowCount > 0 ? 'text-yellow-600' : 'text-green-600'}`}>
                {redCount}/{yellowCount}
              </p>
            </div>
            <AlertTriangle className={`w-8 h-8 ${redCount > 0 ? 'text-red-300' : 'text-gray-300'}`} />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">介入実施率</p>
              <p className="text-2xl font-bold text-purple-600">{interventionRate}%</p>
            </div>
            <CheckCircle className="w-8 h-8 text-purple-300" />
          </div>
        </Card>
      </div>

      {/* 営業OSカード */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center">
            <Briefcase className="w-5 h-5 mr-2 text-blue-600" />
            営業OS
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <p className="text-2xl font-bold text-blue-600">{salesMetrics.accounts}</p>
              <p className="text-xs text-gray-600">LD（営業先）</p>
            </div>
            <div className="text-center p-3 bg-purple-50 rounded-lg">
              <p className="text-2xl font-bold text-purple-600">{salesMetrics.activeDeals}</p>
              <p className="text-xs text-gray-600">V（進行中）</p>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <p className="text-2xl font-bold text-green-600">{salesMetrics.completedDeals}</p>
              <p className="text-xs text-gray-600">M（成約）</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-gray-600">{salesMetrics.cvRate}%</p>
              <p className="text-xs text-gray-600">CV率</p>
            </div>
          </div>

          {/* 入居確率分布 */}
          <div className="flex gap-2 mb-4">
            <span className="px-3 py-1 bg-green-100 text-green-800 text-sm rounded">A: {salesMetrics.rankA}</span>
            <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded">B: {salesMetrics.rankB}</span>
            <span className="px-3 py-1 bg-yellow-100 text-yellow-800 text-sm rounded">C: {salesMetrics.rankC}</span>
            <span className="px-3 py-1 bg-gray-100 text-gray-800 text-sm rounded">D: {salesMetrics.rankD}</span>
          </div>

          <Link href="/dashboard/sales/pipeline" className="text-sm text-blue-600 hover:underline flex items-center">
            パイプライン詳細 <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </CardContent>
      </Card>

      {/* 経営数字（吉田のみ） */}
      <Card className="border-indigo-200 bg-indigo-50">
        <CardHeader>
          <CardTitle className="text-base flex items-center">
            <BarChart2 className="w-5 h-5 mr-2 text-indigo-600" />
            経営数字
            <Badge className="ml-2 bg-indigo-100 text-indigo-700">吉田専用</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 bg-white rounded-lg">
              <p className="text-xl font-bold text-indigo-600">-</p>
              <p className="text-xs text-gray-600">期待粗利</p>
            </div>
            <div className="text-center p-3 bg-white rounded-lg">
              <p className="text-xl font-bold text-indigo-600">-</p>
              <p className="text-xs text-gray-600">回収月数</p>
            </div>
            <div className="text-center p-3 bg-white rounded-lg">
              <p className="text-xl font-bold text-indigo-600">-</p>
              <p className="text-xs text-gray-600">CAC上限</p>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-3">※ 経営数字は今後のPRで実装予定</p>
        </CardContent>
      </Card>

      {/* 組織コンディション */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center">
            <Heart className="w-5 h-5 mr-2 text-red-500" />
            組織コンディション
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className={`p-3 rounded-lg text-center ${redCount > 0 ? 'bg-red-100' : 'bg-gray-50'}`}>
              <p className={`text-2xl font-bold ${redCount > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                {redCount}
              </p>
              <p className="text-xs text-gray-600">サポートが必要</p>
            </div>
            <div className={`p-3 rounded-lg text-center ${yellowCount > 0 ? 'bg-yellow-100' : 'bg-gray-50'}`}>
              <p className={`text-2xl font-bold ${yellowCount > 0 ? 'text-yellow-600' : 'text-gray-400'}`}>
                {yellowCount}
              </p>
              <p className="text-xs text-gray-600">余裕少なめ</p>
            </div>
            <div className="p-3 rounded-lg text-center bg-green-50">
              <p className="text-2xl font-bold text-green-600">
                {teamData.length - redCount - yellowCount}
              </p>
              <p className="text-xs text-gray-600">余裕あり</p>
            </div>
          </div>
          <Link href="/dashboard/os/team" className="text-sm text-blue-600 hover:underline flex items-center">
            チーム詳細 <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </CardContent>
      </Card>

      {/* WBRサマリ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center">
            <Calendar className="w-5 h-5 mr-2 text-gray-600" />
            WBRサマリ
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Link href="/dashboard/wbr" className="text-sm text-blue-600 hover:underline flex items-center">
            今週のWBRを確認する <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
