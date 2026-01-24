'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { PreviewBadge } from '@/components/PreviewBadge';
import { getProspects } from '@/lib/prospect';
import { DEFAULT_TENANT_ID } from '@/lib/firebase';
import { Prospect } from '@/types/prospect';
import { ProbabilityRank } from '@/types/chaos';
import {
  calculateMoveInProbability,
  calculateBatchMoveInProbability,
  aggregateByRank,
  calculateExpectedMoveIns,
  MoveInProbabilityResult,
} from '@/lib/scoring';
import {
  ArrowLeft,
  TrendingUp,
  Target,
  Users,
  Calculator,
  ChevronRight,
  BarChart2,
  RefreshCw,
} from 'lucide-react';

export default function SalesPipelinePage() {
  return (
    <AuthGuard>
      <SalesPipelineContent />
    </AuthGuard>
  );
}

function SalesPipelineContent() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [scoringResults, setScoringResults] = useState<Map<string, MoveInProbabilityResult>>(new Map());
  const [rankDistribution, setRankDistribution] = useState<Record<ProbabilityRank, number>>({ A: 0, B: 0, C: 0, D: 0 });
  const [expectedMoveIns, setExpectedMoveIns] = useState(0);
  const [selectedRank, setSelectedRank] = useState<ProbabilityRank | 'all'>('all');

  const runScoring = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const prospectsData = await getProspects(DEFAULT_TENANT_ID);
      // アクティブな案件のみ（見送り・クローズを除く）
      const activeProspects = prospectsData.filter(
        p => p.status !== '見送り' && p.status !== 'クローズ' && p.status !== '入居決定'
      );
      setProspects(activeProspects);

      // バッチスコアリング実行
      const results = calculateBatchMoveInProbability(activeProspects);
      setScoringResults(results);

      // ランク分布計算
      const distribution = aggregateByRank(results);
      setRankDistribution(distribution);

      // 期待入居数計算
      const expected = calculateExpectedMoveIns(results);
      setExpectedMoveIns(expected);
    } catch (error) {
      console.error('Failed to run scoring:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runScoring();
  }, [user]);

  const getFilteredProspects = () => {
    if (selectedRank === 'all') return prospects;
    return prospects.filter(p => {
      const result = scoringResults.get(p.id);
      return result?.rank === selectedRank;
    });
  };

  const getRankColor = (rank: ProbabilityRank) => {
    switch (rank) {
      case 'A': return 'bg-green-100 text-green-800 border-green-200';
      case 'B': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'C': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'D': return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getRankBgColor = (rank: ProbabilityRank) => {
    switch (rank) {
      case 'A': return 'bg-green-50';
      case 'B': return 'bg-blue-50';
      case 'C': return 'bg-yellow-50';
      case 'D': return 'bg-gray-50';
    }
  };

  if (loading) {
    return (
      <>
        <Header />
        <Loading text="スコアリング実行中..." />
      </>
    );
  }

  const totalProspects = prospects.length;
  const filteredProspects = getFilteredProspects();

  return (
    <>
      <Header />
      <PreviewBadge />
      <main className="pb-8">
        <div className="max-w-6xl mx-auto px-4 py-6">
          {/* ヘッダー */}
          <div className="flex items-center mb-6">
            <Link href="/dashboard/os" className="p-2 -ml-2 rounded-lg hover:bg-gray-100">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <div className="ml-2 flex-1">
              <h1 className="text-xl font-bold text-gray-900 flex items-center">
                <BarChart2 className="w-5 h-5 mr-2 text-green-600" />
                営業パイプライン（入居確率スコアリング）
              </h1>
              <p className="text-sm text-gray-500">
                入居希望者の入居確率をスコアリング・ランク分類
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={runScoring}>
              <RefreshCw className="w-4 h-4 mr-1" />
              再スコアリング
            </Button>
          </div>

          {/* サマリーカード */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">アクティブ案件</p>
                    <p className="text-2xl font-bold text-gray-900">{totalProspects}</p>
                  </div>
                  <Users className="w-8 h-8 text-blue-400" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">期待入居数</p>
                    <p className="text-2xl font-bold text-green-600">{expectedMoveIns}</p>
                  </div>
                  <Target className="w-8 h-8 text-green-400" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">Aランク</p>
                    <p className="text-2xl font-bold text-green-700">{rankDistribution.A}</p>
                  </div>
                  <TrendingUp className="w-8 h-8 text-green-400" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500">平均確率</p>
                    <p className="text-2xl font-bold text-purple-600">
                      {totalProspects > 0
                        ? Math.round((expectedMoveIns / totalProspects) * 100)
                        : 0}%
                    </p>
                  </div>
                  <Calculator className="w-8 h-8 text-purple-400" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ランク分布 */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base">入居確率ランク分布</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-2">
                <button
                  onClick={() => setSelectedRank('all')}
                  className={`p-3 rounded-lg text-center transition-all ${
                    selectedRank === 'all' ? 'ring-2 ring-indigo-500 bg-indigo-50' : 'bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  <p className="text-lg font-bold">{totalProspects}</p>
                  <p className="text-xs text-gray-600">全て</p>
                </button>
                {(['A', 'B', 'C', 'D'] as ProbabilityRank[]).map((rank) => (
                  <button
                    key={rank}
                    onClick={() => setSelectedRank(rank)}
                    className={`p-3 rounded-lg text-center transition-all ${
                      selectedRank === rank ? 'ring-2 ring-indigo-500' : ''
                    } ${getRankBgColor(rank)} hover:opacity-80`}
                  >
                    <p className="text-lg font-bold">{rankDistribution[rank]}</p>
                    <p className="text-xs">ランク{rank}</p>
                  </button>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-4 gap-2 text-xs text-gray-500">
                <div className="p-2 bg-green-50 rounded">A: 75%以上 - 最優先</div>
                <div className="p-2 bg-blue-50 rounded">B: 55-74% - 積極対応</div>
                <div className="p-2 bg-yellow-50 rounded">C: 35-54% - 通常対応</div>
                <div className="p-2 bg-gray-50 rounded">D: 35%未満 - 優先度低</div>
              </div>
            </CardContent>
          </Card>

          {/* 案件一覧 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {selectedRank === 'all' ? '全案件' : `ランク${selectedRank}の案件`}
                ({filteredProspects.length}件)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {filteredProspects.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  該当する案件がありません
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredProspects.map((prospect) => {
                    const result = scoringResults.get(prospect.id);
                    if (!result) return null;

                    return (
                      <Link
                        key={prospect.id}
                        href={`/dashboard/prospects/${prospect.id}`}
                        className="block"
                      >
                        <div className={`p-4 rounded-lg border hover:shadow-md transition-shadow ${getRankBgColor(result.rank)}`}>
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-gray-900">
                                  {prospect.customerName || '名前未設定'}
                                </span>
                                <Badge className={getRankColor(result.rank)}>
                                  ランク{result.rank}
                                </Badge>
                                <Badge className="bg-gray-100 text-gray-700">
                                  {prospect.status}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-4 text-sm text-gray-500">
                                <span>
                                  {prospect.age ? `${prospect.age}歳` : '年齢不明'}
                                </span>
                                <span>
                                  {prospect.careLevel || '介護度不明'}
                                </span>
                                <span>
                                  入居確率: <strong className="text-gray-900">{result.probability}%</strong>
                                </span>
                              </div>
                            </div>
                            <ChevronRight className="w-5 h-5 text-gray-400" />
                          </div>

                          {/* スコア内訳 */}
                          <div className="mt-3 pt-3 border-t border-gray-200">
                            <p className="text-xs text-gray-500 mb-2">スコア内訳:</p>
                            <div className="flex flex-wrap gap-2">
                              {result.reasons.slice(0, 5).map((reason, idx) => (
                                <span
                                  key={idx}
                                  className={`text-xs px-2 py-1 rounded ${
                                    reason.score > 0 ? 'bg-green-100 text-green-700' :
                                    reason.score < 0 ? 'bg-red-100 text-red-700' :
                                    'bg-gray-100 text-gray-600'
                                  }`}
                                >
                                  {reason.description}
                                  {reason.score !== 0 && ` (${reason.score > 0 ? '+' : ''}${reason.score})`}
                                </span>
                              ))}
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                              推奨: {result.recommendedAction}
                            </p>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
