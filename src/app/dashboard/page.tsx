'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_TENANT_ID } from '@/lib/firebase';
import { getCheckinHistory, getChaosDashboardMetrics, getInterventions } from '@/lib/chaos';
import { getSalesDeals, getSalesAccounts } from '@/lib/sales';
import { getProspects, applyProspectKpiScope } from '@/lib/prospect';
import { getFacilitiesWithVacancy } from '@/lib/vacancy';
import { getRingisByUser, getPendingRingis } from '@/lib/ringi';
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
  safeRate,
  formatPercent,
  calcOccupancyRate,
  calcInterventionRate,
  toDashboardError,
  DashboardError,
} from '@/lib/dashboard/calc';
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
  ClipboardList,
  Plus,
  RotateCcw,
  FileText,
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
  const [error, setError] = useState<DashboardError | null>(null);

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

  // 稟議データ（全員共通）
  const [approvalStats, setApprovalStats] = useState<{
    draft: number;
    submitted: number;
    returned: number;
    pendingApproval: number; // 承認待ち（リーダー以上用）
  }>({ draft: 0, submitted: 0, returned: 0, pendingApproval: 0 });

  // Exec用データ
  const [salesMetrics, setSalesMetrics] = useState<{
    accounts: number;
    activeDeals: number;
    completedDeals: number;
    totalDeals: number;
    cvRate: number | null;
    expectedMoveIns: number;
    rankA: number;
    rankB: number;
    rankC: number;
    rankD: number;
  }>({
    accounts: 0,
    activeDeals: 0,
    completedDeals: 0,
    totalDeals: 0,
    cvRate: null,
    expectedMoveIns: 0,
    rankA: 0,
    rankB: 0,
    rankC: 0,
    rankD: 0,
  });
  const [occupancyRate, setOccupancyRate] = useState<number | null>(null);

  // 役割判定
  const viewLevel = user ? getChaosViewLevel(user.role, user.email) : 'self';
  const isStaff = viewLevel === 'self';
  const isManager = viewLevel === 'team';
  const isExec = viewLevel === 'all';

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;

      const errors: DashboardError[] = [];

      // 全員：自分のチェックイン履歴
      try {
        const history = await getCheckinHistory(user.id, 7);
        setCheckinHistory(history);
      } catch (err) {
        console.error('[dashboard:checkinHistory] Failed:', err);
        errors.push(toDashboardError(err));
      }

      // 全員：稟議データ
      try {
        const myRingis = await getRingisByUser(user.id, user.tenantId);
        const draft = myRingis.filter(r => r.status === 'draft').length;
        const submitted = myRingis.filter(r => r.status === 'submitted').length;
        const returned = myRingis.filter(r => r.status === 'returned').length;

        // リーダー以上：承認待ち件数
        let pendingApproval = 0;
        if (!isStaff) {
          try {
            const pending = await getPendingRingis(user.tenantId, user.branchId);
            pendingApproval = pending.length;
          } catch (e) {
            console.error('[dashboard:pendingRingis] Failed:', e);
          }
        }

        setApprovalStats({ draft, submitted, returned, pendingApproval });
      } catch (err) {
        console.error('[dashboard:approvalStats] Failed:', err);
      }

      // Manager以上：チーム・組織データ
      if (!isStaff) {
        // CHAOS組織データ
        try {
          const chaosData = await getChaosDashboardMetrics(DEFAULT_TENANT_ID);
          setOrgMetrics(chaosData.organization);

          const team = chaosData.organization.burnoutRiskHeatmap.map(m => ({
            userId: m.userId,
            userName: m.userName,
            score: m.score,
            level: getMeterColor(m.score),
          }));
          setTeamData(team);
        } catch (err) {
          console.error('[dashboard:chaosMetrics] Failed:', err);
          errors.push(toDashboardError(err));
        }

        // 介入データ
        try {
          const interventionsData = await getInterventions('open', 20);
          setInterventions(interventionsData);
        } catch (err) {
          console.error('[dashboard:interventions] Failed:', err);
          errors.push(toDashboardError(err));
        }
      }

      // Exec：営業・経営データ
      if (isExec) {
        // 営業データ（案件・営業先）
        try {
          const [dealsData, accountsData] = await Promise.all([
            getSalesDeals(DEFAULT_TENANT_ID),
            getSalesAccounts(DEFAULT_TENANT_ID),
          ]);

          const activeDeals = dealsData.filter(d => !['請求書到着', '失注'].includes(d.status));
          const completedDeals = dealsData.filter(d => d.status === '請求書到着');
          const cvRate = safeRate(completedDeals.length, dealsData.length);

          setSalesMetrics(prev => ({
            ...prev,
            accounts: accountsData.length,
            activeDeals: activeDeals.length,
            completedDeals: completedDeals.length,
            totalDeals: dealsData.length,
            cvRate,
          }));
        } catch (err) {
          console.error('[dashboard:salesData] Failed:', err);
          errors.push(toDashboardError(err));
        }

        // 入居希望データ（スコアリング）- KPI対象はinternal_no >= 252のみ
        try {
          const prospectsData = await getProspects(DEFAULT_TENANT_ID);
          // KPIスコープ適用: internal_no >= 252 のみ
          const kpiTargetProspects = applyProspectKpiScope(prospectsData);
          const activeProspects = kpiTargetProspects.filter(
            p => p.status !== '見送り' && p.status !== 'クローズ' && p.status !== '入居決定'
          );
          const scoringResults = calculateBatchMoveInProbability(activeProspects);
          const rankDistribution = aggregateByRank(scoringResults);
          const expectedMoveIns = calculateExpectedMoveIns(scoringResults);

          setSalesMetrics(prev => ({
            ...prev,
            expectedMoveIns,
            rankA: rankDistribution.A,
            rankB: rankDistribution.B,
            rankC: rankDistribution.C,
            rankD: rankDistribution.D,
          }));
        } catch (err) {
          console.error('[dashboard:prospects] Failed:', err);
          errors.push(toDashboardError(err));
        }

        // 稼働率データ
        try {
          const facilitiesData = await getFacilitiesWithVacancy(DEFAULT_TENANT_ID);
          const totalCapacity = facilitiesData.reduce((sum, f) => sum + (f.facility.capacity || 0), 0);
          const totalVacant = facilitiesData.reduce((sum, f) => sum + (f.vacancy?.vacantCount ?? 0), 0);
          const rate = calcOccupancyRate(totalCapacity, totalVacant);
          setOccupancyRate(rate);
        } catch (err) {
          console.error('[dashboard:occupancy] Failed:', err);
          errors.push(toDashboardError(err));
        }
      }

      // インデックスエラーがあれば最初のものを表示
      const indexError = errors.find(e => e.code === 'INDEX_REQUIRED');
      if (indexError) {
        setError(indexError);
      } else if (errors.length > 0) {
        setError(errors[0]);
      }

      setLoading(false);
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

  // エラー表示
  const retryFetch = () => {
    setLoading(true);
    setError(null);
    // Re-trigger useEffect
    window.location.reload();
  };

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

          {/* エラーバナー */}
          {error && (
            <Card className="mb-6 bg-red-50 border-red-200">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-red-800">
                        データの取得に失敗しました
                      </p>
                      <p className="text-xs text-red-600 mt-1">
                        {error.message}
                      </p>
                      {error.createIndexUrl && isExec && (
                        <p className="text-xs text-red-500 mt-2">
                          管理者向け: インデックス作成が必要です
                        </p>
                      )}
                    </div>
                  </div>
                  <Button variant="secondary" onClick={retryFetch} className="text-sm">
                    再試行
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 役割別コンテンツ */}
          {isStaff && <StaffDashboard
            todayCheckin={todayCheckin}
            todayMeterColor={todayMeterColor}
            checkinHistory={checkinHistory}
            approvalStats={approvalStats}
          />}

          {isManager && <ManagerDashboard
            teamData={teamData}
            interventions={interventions}
            orgMetrics={orgMetrics}
            approvalStats={approvalStats}
          />}

          {isExec && <ExecDashboard
            teamData={teamData}
            interventions={interventions}
            orgMetrics={orgMetrics}
            salesMetrics={salesMetrics}
            occupancyRate={occupancyRate}
            approvalStats={approvalStats}
          />}
        </div>
      </main>
    </>
  );
}

// ========== 稟議カード（共通） ==========
function ApprovalCard({
  approvalStats,
  isLeader = false,
}: {
  approvalStats: { draft: number; submitted: number; returned: number; pendingApproval: number };
  isLeader?: boolean;
}) {
  const hasReturned = approvalStats.returned > 0;
  const hasPending = approvalStats.pendingApproval > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center">
            <ClipboardList className="w-5 h-5 mr-2 text-blue-600" />
            稟議
          </span>
          <Link href="/dashboard/approvals/new">
            <Button size="sm" variant="secondary">
              <Plus className="w-4 h-4" />
              新規
            </Button>
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* 差戻しアラート */}
        {hasReturned && (
          <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-orange-600" />
            <div>
              <p className="text-sm font-medium text-orange-700">
                {approvalStats.returned}件の差戻しがあります
              </p>
            </div>
          </div>
        )}

        {/* 承認待ちアラート（リーダー以上） */}
        {isLeader && hasPending && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-600" />
            <div>
              <p className="text-sm font-medium text-amber-700">
                {approvalStats.pendingApproval}件の承認待ちがあります
              </p>
            </div>
          </div>
        )}

        {/* 件数サマリー */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="p-3 rounded-lg text-center bg-zinc-50">
            <p className="text-2xl font-bold text-zinc-900">{approvalStats.draft}</p>
            <p className="text-xs text-zinc-500">下書き</p>
          </div>
          <div className="p-3 rounded-lg text-center bg-amber-50">
            <p className="text-2xl font-bold text-amber-600">{approvalStats.submitted}</p>
            <p className="text-xs text-zinc-500">申請中</p>
          </div>
          {hasReturned ? (
            <div className="p-3 rounded-lg text-center bg-orange-50">
              <p className="text-2xl font-bold text-orange-600">{approvalStats.returned}</p>
              <p className="text-xs text-orange-600">差戻し</p>
            </div>
          ) : (
            <div className="p-3 rounded-lg text-center bg-zinc-50">
              <p className="text-2xl font-bold text-zinc-400">-</p>
              <p className="text-xs text-zinc-400">差戻し</p>
            </div>
          )}
        </div>

        {/* アクションボタン */}
        <div className="flex gap-2">
          <Link href="/dashboard/approvals" className="flex-1">
            <Button variant="secondary" className="w-full">
              <FileText className="w-4 h-4 mr-1" />
              一覧を見る
            </Button>
          </Link>
          {isLeader && (
            <Link href="/admin/ringi" className="flex-1">
              <Button variant="secondary" className="w-full">
                <CheckCircle className="w-4 h-4 mr-1" />
                承認する
              </Button>
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ========== スタッフ用ダッシュボード ==========
function StaffDashboard({
  todayCheckin,
  todayMeterColor,
  checkinHistory,
  approvalStats,
}: {
  todayCheckin: StaffCheckin | undefined;
  todayMeterColor: MeterColor;
  checkinHistory: StaffCheckin[];
  approvalStats: { draft: number; submitted: number; returned: number; pendingApproval: number };
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

      {/* 5. 稟議カード */}
      <ApprovalCard approvalStats={approvalStats} />

      {/* 6. 小さな成長（承認ワンポイント） */}
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
  approvalStats,
}: {
  teamData: { userId: string; userName: string; score: number; level: MeterColor }[];
  interventions: Intervention[];
  orgMetrics: {
    avgFatigue: number;
    avgMentalLoad: number;
    alertCount: { yellow: number; red: number };
    burnoutRiskHeatmap: { userId: string; userName: string; score: number; level: string }[];
  } | null;
  approvalStats: { draft: number; submitted: number; returned: number; pendingApproval: number };
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

      {/* 稟議カード */}
      <ApprovalCard approvalStats={approvalStats} isLeader />

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
  approvalStats,
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
    totalDeals: number;
    cvRate: number | null;
    expectedMoveIns: number;
    rankA: number;
    rankB: number;
    rankC: number;
    rankD: number;
  };
  occupancyRate: number | null;
  approvalStats: { draft: number; submitted: number; returned: number; pendingApproval: number };
}) {
  const redCount = teamData.filter(m => m.level === 'red').length;
  const yellowCount = teamData.filter(m => m.level === 'yellow').length;
  // 安全な介入実施率計算（総介入数0の場合はnull、100%ではない）
  const doneCount = interventions.filter(i => i.status === 'done').length;
  const interventionRate = calcInterventionRate(doneCount, interventions.length);

  return (
    <div className="space-y-6">
      {/* 経営KPIサマリー */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">稼働率</p>
              <p className="text-2xl font-bold text-blue-600">
                {formatPercent(occupancyRate)}
              </p>
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
              <p className="text-sm text-gray-500">赤/黄</p>
              <p className={`text-2xl font-bold ${redCount > 0 ? 'text-red-600' : yellowCount > 0 ? 'text-yellow-600' : 'text-green-600'}`}>
                {teamData.length > 0 ? `${redCount}/${yellowCount}` : '--'}
              </p>
            </div>
            <AlertTriangle className={`w-8 h-8 ${redCount > 0 ? 'text-red-300' : 'text-gray-300'}`} />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">介入実施率</p>
              <p className="text-2xl font-bold text-purple-600">
                {formatPercent(interventionRate)}
              </p>
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
              <p className="text-2xl font-bold text-gray-600">{formatPercent(salesMetrics.cvRate)}</p>
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

      {/* 稟議カード */}
      <ApprovalCard approvalStats={approvalStats} isLeader />

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
