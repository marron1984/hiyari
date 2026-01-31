'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, Input } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { PreviewBadge } from '@/components/PreviewBadge';
import {
  getOrCreateCurrentWeekWbr,
  getWbrReports,
  updateWbrReport,
  finalizeWbrReport,
  parseActionItems,
  parseWbrMetrics,
  getChaosDashboardMetrics,
  getWeekRange,
} from '@/lib/chaos';
import { getSalesDeals, getPipelineSummary } from '@/lib/sales';
import { getProspects } from '@/lib/prospect';
import { DEFAULT_TENANT_ID } from '@/lib/firebase';
import { WbrReport, WbrActionItem } from '@/types/chaos';
import {
  calculateBatchMoveInProbability,
  aggregateByRank,
  calculateExpectedMoveIns,
} from '@/lib/scoring';
import {
  ArrowLeft,
  Calendar,
  FileText,
  CheckCircle,
  Circle,
  Plus,
  Save,
  Lock,
  TrendingUp,
  Users,
  Target,
  Heart,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';

export default function WbrPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentReport, setCurrentReport] = useState<WbrReport | null>(null);
  const [pastReports, setPastReports] = useState<WbrReport[]>([]);
  const [narrative, setNarrative] = useState('');
  const [actionItems, setActionItems] = useState<WbrActionItem[]>([]);
  const [newActionTitle, setNewActionTitle] = useState('');

  // メトリクス
  const [metrics, setMetrics] = useState({
    // 営業
    activeDeals: 0,
    completedDeals: 0,
    cvRate: 0,
    expectedMoveIns: 0,
    rankA: 0,
    rankB: 0,
    rankC: 0,
    rankD: 0,
    // 組織
    avgFatigue: 0,
    avgMentalLoad: 0,
    alertYellow: 0,
    alertRed: 0,
    teamSize: 0,
  });

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;

      try {
        // 今週のWBRレポートを取得または作成
        const report = await getOrCreateCurrentWeekWbr('company', 'all');
        setCurrentReport(report);
        setNarrative(report.narrativeMd || '');
        setActionItems(parseActionItems(report.actionItemsJson));

        // 過去のレポート一覧
        const reports = await getWbrReports('company', 'all', 8);
        setPastReports(reports.filter(r => r.id !== report.id));

        // メトリクスを収集
        const [chaosData, salesDeals, prospectsData] = await Promise.all([
          getChaosDashboardMetrics(DEFAULT_TENANT_ID),
          getSalesDeals(DEFAULT_TENANT_ID),
          getProspects(DEFAULT_TENANT_ID),
        ]);

        // 営業メトリクス
        const activeDeals = salesDeals.filter(d => !['請求書到着', '失注'].includes(d.status));
        const completedDeals = salesDeals.filter(d => d.status === '請求書到着');
        const cvRate = salesDeals.length > 0
          ? Math.round((completedDeals.length / salesDeals.length) * 100)
          : 0;

        // 入居確率スコアリング
        const activeProspects = prospectsData.filter(
          p => p.status !== '見送り' && p.status !== 'クローズ' && p.status !== '入居決定'
        );
        const scoringResults = calculateBatchMoveInProbability(activeProspects);
        const rankDistribution = aggregateByRank(scoringResults);
        const expectedMoveIns = calculateExpectedMoveIns(scoringResults);

        setMetrics({
          activeDeals: activeDeals.length,
          completedDeals: completedDeals.length,
          cvRate,
          expectedMoveIns,
          rankA: rankDistribution.A,
          rankB: rankDistribution.B,
          rankC: rankDistribution.C,
          rankD: rankDistribution.D,
          avgFatigue: chaosData.organization.avgFatigue,
          avgMentalLoad: chaosData.organization.avgMentalLoad,
          alertYellow: chaosData.organization.alertCount.yellow,
          alertRed: chaosData.organization.alertCount.red,
          teamSize: chaosData.organization.burnoutRiskHeatmap.length,
        });
      } catch (error) {
        console.error('Failed to fetch WBR data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  const handleSave = async () => {
    if (!currentReport) return;

    setSaving(true);
    try {
      await updateWbrReport(currentReport.id, {
        narrativeMd: narrative,
        actionItemsJson: JSON.stringify(actionItems),
        metricsJson: JSON.stringify(metrics),
      });
      setCurrentReport({ ...currentReport, narrativeMd: narrative });
    } catch (error) {
      console.error('Failed to save:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleFinalize = async () => {
    if (!currentReport || currentReport.status === 'finalized') return;

    if (!confirm('WBRを確定しますか？確定後は編集できなくなります。')) return;

    try {
      await finalizeWbrReport(currentReport.id);
      setCurrentReport({ ...currentReport, status: 'finalized' });
    } catch (error) {
      console.error('Failed to finalize:', error);
    }
  };

  const addActionItem = () => {
    if (!newActionTitle.trim()) return;

    const newItem: WbrActionItem = {
      id: `action_${Date.now()}`,
      title: newActionTitle.trim(),
      status: 'open',
    };

    setActionItems([...actionItems, newItem]);
    setNewActionTitle('');
  };

  const toggleActionStatus = (id: string) => {
    setActionItems(actionItems.map(item =>
      item.id === id
        ? { ...item, status: item.status === 'done' ? 'open' : 'done' }
        : item
    ));
  };

  const removeActionItem = (id: string) => {
    setActionItems(actionItems.filter(item => item.id !== id));
  };

  if (loading) {
    return <Loading text="WBRデータを読み込み中..." />;
  }

  const isFinalized = currentReport?.status === 'finalized';
  const { weekStart, weekEnd } = getWeekRange();

  return (
    <>
      <PreviewBadge />
      <main className="pb-8">
        <div className="max-w-5xl mx-auto px-4 py-6">
          {/* ヘッダー */}
          <div className="flex items-center mb-6">
            <Link href="/dashboard/os" className="p-2 -ml-2 rounded-lg hover:bg-gray-100">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <div className="ml-2 flex-1">
              <h1 className="text-xl font-bold text-gray-900 flex items-center">
                <Calendar className="w-5 h-5 mr-2 text-indigo-600" />
                WBR（Weekly Business Review）
              </h1>
              <p className="text-sm text-gray-500">
                {weekStart} 〜 {weekEnd}
              </p>
            </div>
            <div className="flex gap-2">
              {!isFinalized && (
                <>
                  <Button variant="outline" size="sm" onClick={handleSave} disabled={saving}>
                    <Save className="w-4 h-4 mr-1" />
                    {saving ? '保存中...' : '下書き保存'}
                  </Button>
                  <Button size="sm" onClick={handleFinalize}>
                    <Lock className="w-4 h-4 mr-1" />
                    確定
                  </Button>
                </>
              )}
              {isFinalized && (
                <Badge className="bg-green-100 text-green-700">
                  <CheckCircle className="w-4 h-4 mr-1" />
                  確定済み
                </Badge>
              )}
            </div>
          </div>

          {/* メトリクスサマリー */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* 営業メトリクス */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center">
                  <TrendingUp className="w-4 h-4 mr-2 text-green-600" />
                  営業KPI
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-4 mb-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-blue-600">{metrics.activeDeals}</p>
                    <p className="text-xs text-gray-500">進行中</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-600">{metrics.completedDeals}</p>
                    <p className="text-xs text-gray-500">成約</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-purple-600">{metrics.cvRate}%</p>
                    <p className="text-xs text-gray-500">CV率</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-orange-600">{metrics.expectedMoveIns}</p>
                    <p className="text-xs text-gray-500">期待入居数</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">A: {metrics.rankA}</span>
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">B: {metrics.rankB}</span>
                  <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded">C: {metrics.rankC}</span>
                  <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded">D: {metrics.rankD}</span>
                </div>
              </CardContent>
            </Card>

            {/* 組織メトリクス */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center">
                  <Heart className="w-4 h-4 mr-2 text-red-500" />
                  組織コンディション
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-4 mb-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-600">{metrics.teamSize}</p>
                    <p className="text-xs text-gray-500">メンバー</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-orange-600">{metrics.avgFatigue}</p>
                    <p className="text-xs text-gray-500">平均疲労</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-purple-600">{metrics.avgMentalLoad}</p>
                    <p className="text-xs text-gray-500">メンタル負荷</p>
                  </div>
                  <div className="text-center">
                    <p className={`text-2xl font-bold ${metrics.alertRed > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {metrics.alertRed + metrics.alertYellow}
                    </p>
                    <p className="text-xs text-gray-500">要確認</p>
                  </div>
                </div>
                {(metrics.alertRed > 0 || metrics.alertYellow > 0) && (
                  <div className="flex items-center gap-2 text-sm">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                    <span className="text-red-700">レッド: {metrics.alertRed}</span>
                    <span className="text-yellow-700">イエロー: {metrics.alertYellow}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ナラティブ（コメント） */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base flex items-center">
                <FileText className="w-4 h-4 mr-2" />
                週次レビューコメント
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isFinalized ? (
                <div className="prose prose-sm max-w-none">
                  {narrative || <span className="text-gray-400">コメントなし</span>}
                </div>
              ) : (
                <textarea
                  className="w-full h-40 p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="今週の振り返り、課題、来週の方針などを記入してください..."
                  value={narrative}
                  onChange={(e) => setNarrative(e.target.value)}
                />
              )}
            </CardContent>
          </Card>

          {/* アクションアイテム */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base flex items-center">
                <Target className="w-4 h-4 mr-2" />
                アクションアイテム
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* 新規追加 */}
              {!isFinalized && (
                <div className="flex gap-2 mb-4">
                  <Input
                    placeholder="新しいアクションアイテムを入力..."
                    value={newActionTitle}
                    onChange={(e) => setNewActionTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addActionItem()}
                  />
                  <Button onClick={addActionItem}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              )}

              {/* 一覧 */}
              {actionItems.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">
                  アクションアイテムがありません
                </p>
              ) : (
                <div className="space-y-2">
                  {actionItems.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border ${
                        item.status === 'done' ? 'bg-green-50 border-green-200' : 'bg-gray-50'
                      }`}
                    >
                      <button
                        onClick={() => !isFinalized && toggleActionStatus(item.id)}
                        disabled={isFinalized}
                        className={isFinalized ? '' : 'cursor-pointer'}
                      >
                        {item.status === 'done' ? (
                          <CheckCircle className="w-5 h-5 text-green-600" />
                        ) : (
                          <Circle className="w-5 h-5 text-gray-400" />
                        )}
                      </button>
                      <span className={`flex-1 ${item.status === 'done' ? 'line-through text-gray-500' : ''}`}>
                        {item.title}
                      </span>
                      {item.assigneeName && (
                        <Badge className="bg-gray-100 text-gray-700">
                          {item.assigneeName}
                        </Badge>
                      )}
                      {!isFinalized && (
                        <button
                          onClick={() => removeActionItem(item.id)}
                          className="text-gray-400 hover:text-red-500"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 過去のWBR */}
          {pastReports.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">過去のWBR</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {pastReports.map((report) => (
                    <div
                      key={report.id}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50"
                    >
                      <div>
                        <p className="font-medium text-sm">
                          {report.weekStart} 〜 {report.weekEnd}
                        </p>
                        <p className="text-xs text-gray-500">
                          {report.status === 'finalized' ? '確定済み' : '下書き'}
                        </p>
                      </div>
                      <Badge className={report.status === 'finalized' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}>
                        {report.status === 'finalized' ? '確定' : '下書き'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </>
  );
}
