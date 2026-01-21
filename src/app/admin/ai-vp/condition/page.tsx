'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardHeader, CardTitle, CardContent, Button } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { isAiVpOwner } from '@/lib/auth';
import type { ConditionScore, BehaviorMetrics } from '@/types/request-engine';
import {
  Brain,
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  User,
  Clock,
  MessageSquare,
  Activity,
  Moon,
  Heart,
  Bell,
  Loader2,
  ChevronRight,
  Users,
  CheckCircle,
} from 'lucide-react';

export default function ConditionManagementPage() {
  return (
    <AuthGuard>
      <ConditionManagementContent />
    </AuthGuard>
  );
}

function ConditionManagementContent() {
  const { user, firebaseUser } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [scores, setScores] = useState<ConditionScore[]>([]);
  const [summary, setSummary] = useState<{
    totalStaff: number;
    healthyCount: number;
    watchCount: number;
    warningCount: number;
    criticalCount: number;
    averageScore: number;
  } | null>(null);
  const [selectedScore, setSelectedScore] = useState<ConditionScore | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 権限チェック
  useEffect(() => {
    if (user && !isAiVpOwner(user.email)) {
      router.push('/dashboard');
    }
  }, [user, router]);

  const fetchData = useCallback(async () => {
    if (!firebaseUser) return;
    setLoading(true);
    try {
      const idToken = await firebaseUser.getIdToken();

      // サマリーを取得
      const summaryRes = await fetch('/api/condition?type=summary', {
        headers: { 'Authorization': `Bearer ${idToken}` },
      });
      if (summaryRes.ok) {
        const summaryData = await summaryRes.json();
        setSummary(summaryData.summary);
      }

      // スコア一覧を取得
      const scoresRes = await fetch('/api/condition?type=all', {
        headers: { 'Authorization': `Bearer ${idToken}` },
      });
      if (scoresRes.ok) {
        const scoresData = await scoresRes.json();
        setScores(scoresData.scores || []);
      }
    } catch (err) {
      console.error('Failed to fetch condition data:', err);
      setError('データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [firebaseUser]);

  useEffect(() => {
    if (user?.email && isAiVpOwner(user.email) && firebaseUser) {
      fetchData();
    }
  }, [user?.email, firebaseUser, fetchData]);

  const handleNotify = async (scoreId: string) => {
    if (!firebaseUser) return;
    setActionLoading(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      const response = await fetch('/api/condition', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'notify', scoreId }),
      });

      if (response.ok) {
        await fetchData();
        setSelectedScore(null);
      } else {
        const data = await response.json();
        setError(data.error || '通知に失敗しました');
      }
    } catch (err) {
      setError('通知に失敗しました');
    } finally {
      setActionLoading(false);
    }
  };

  const handleBatchCalculate = async () => {
    if (!firebaseUser) return;
    setActionLoading(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      const response = await fetch('/api/condition', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'batch_calculate' }),
      });

      if (response.ok) {
        const data = await response.json();
        await fetchData();
        alert(`${data.processedCount}名のスコアを計算しました`);
      } else {
        const data = await response.json();
        setError(data.error || '一括計算に失敗しました');
      }
    } catch (err) {
      setError('一括計算に失敗しました');
    } finally {
      setActionLoading(false);
    }
  };

  if (!user || !isAiVpOwner(user.email)) {
    return (
      <>
        <Header />
        <main className="pb-20 md:pb-8">
          <div className="max-w-4xl mx-auto px-4 py-16 text-center">
            <AlertCircle className="w-16 h-16 mx-auto mb-4 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">アクセス権限がありません</h1>
          </div>
        </main>
      </>
    );
  }

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
      <main className="pb-20 md:pb-8">
        <div className="max-w-6xl mx-auto px-4 py-6">
          {/* ヘッダー */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/admin/ai-vp')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg">
                  <Activity className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">コンディション管理</h1>
                  <p className="text-sm text-gray-500">スタッフの健康状態をモニタリング</p>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={fetchData}>
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Button onClick={handleBatchCalculate} disabled={actionLoading}>
                {actionLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                ) : (
                  <Activity className="w-4 h-4 mr-1" />
                )}
                一括計算
              </Button>
            </div>
          </div>

          {/* エラー表示 */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-5 h-5" />
              <span>{error}</span>
              <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">×</button>
            </div>
          )}

          {/* サマリーカード */}
          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Users className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{summary.totalStaff}</p>
                    <p className="text-xs text-gray-500">総人数</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{summary.healthyCount}</p>
                    <p className="text-xs text-gray-500">良好</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-yellow-100 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-yellow-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{summary.watchCount}</p>
                    <p className="text-xs text-gray-500">注意</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-100 rounded-lg">
                    <AlertTriangle className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{summary.warningCount}</p>
                    <p className="text-xs text-gray-500">警告</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <Heart className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{summary.criticalCount}</p>
                    <p className="text-xs text-gray-500">要対応</p>
                  </div>
                </div>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Activity className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{summary.averageScore}</p>
                    <p className="text-xs text-gray-500">平均</p>
                  </div>
                </div>
              </Card>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* スタッフ一覧 */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    スタッフコンディション
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {scores.length === 0 ? (
                    <div className="py-8 text-center text-gray-500">
                      <Activity className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                      <p>データがありません</p>
                      <p className="text-sm mt-1">「一括計算」でスコアを生成してください</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {scores.map((score) => (
                        <ScoreCard
                          key={score.id}
                          score={score}
                          isSelected={selectedScore?.id === score.id}
                          onSelect={() => setSelectedScore(score)}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* 詳細パネル */}
            <div>
              {selectedScore ? (
                <ScoreDetailPanel
                  score={selectedScore}
                  onNotify={() => handleNotify(selectedScore.id)}
                  onClose={() => setSelectedScore(null)}
                  actionLoading={actionLoading}
                />
              ) : (
                <Card className="p-6 text-center">
                  <User className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p className="text-gray-500">スタッフを選択してください</p>
                </Card>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

/**
 * スコアカード
 */
function ScoreCard({
  score,
  isSelected,
  onSelect,
}: {
  score: ConditionScore;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const alertConfig = {
    none: { color: 'bg-green-100 text-green-700', label: '良好' },
    watch: { color: 'bg-yellow-100 text-yellow-700', label: '注意' },
    warning: { color: 'bg-orange-100 text-orange-700', label: '警告' },
    critical: { color: 'bg-red-100 text-red-700', label: '要対応' },
  };

  const config = alertConfig[score.alertLevel];

  const TrendIcon = score.trend === 'up' ? TrendingUp :
                    score.trend === 'down' ? TrendingDown : Minus;
  const trendColor = score.trend === 'up' ? 'text-green-500' :
                     score.trend === 'down' ? 'text-red-500' : 'text-gray-400';

  return (
    <div
      className={`p-4 rounded-lg cursor-pointer transition-all ${
        isSelected ? 'ring-2 ring-purple-500 bg-purple-50' : 'bg-gray-50 hover:bg-gray-100'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-medium">
            {score.userName.charAt(0)}
          </div>
          <div>
            <p className="font-medium">{score.userName}</p>
            <div className="flex items-center gap-2 text-sm">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${config.color}`}>
                {config.label}
              </span>
              {score.yoshidaNotified && (
                <span className="text-xs text-gray-400">通知済</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="flex items-center gap-1">
              <span className={`text-2xl font-bold ${
                score.score >= 70 ? 'text-green-600' :
                score.score >= 50 ? 'text-yellow-600' : 'text-red-600'
              }`}>
                {score.score}
              </span>
              <span className="text-sm text-gray-400">点</span>
            </div>
            <div className={`flex items-center gap-1 text-xs ${trendColor}`}>
              <TrendIcon className="w-3 h-3" />
              <span>前回 {score.previousScore}点</span>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-400" />
        </div>
      </div>
    </div>
  );
}

/**
 * 詳細パネル
 */
function ScoreDetailPanel({
  score,
  onNotify,
  onClose,
  actionLoading,
}: {
  score: ConditionScore;
  onNotify: () => void;
  onClose: () => void;
  actionLoading: boolean;
}) {
  const metrics = score.metrics;

  const metricItems = [
    {
      icon: MessageSquare,
      label: '平均返信時間',
      value: `${metrics.avgResponseTimeMinutes.toFixed(0)}分`,
      color: metrics.avgResponseTimeMinutes <= 60 ? 'text-green-600' : 'text-red-600',
    },
    {
      icon: Clock,
      label: '平均既読時間',
      value: `${metrics.avgReadTimeMinutes.toFixed(0)}分`,
      color: metrics.avgReadTimeMinutes <= 30 ? 'text-green-600' : 'text-red-600',
    },
    {
      icon: Activity,
      label: '投稿頻度',
      value: `${metrics.postingFrequencyPerDay.toFixed(1)}回/日`,
      color: metrics.postingFrequencyPerDay >= 2 ? 'text-green-600' : 'text-red-600',
    },
    {
      icon: Moon,
      label: '夜間活動率',
      value: `${(metrics.nightActivityRatio * 100).toFixed(0)}%`,
      color: metrics.nightActivityRatio <= 0.1 ? 'text-green-600' : 'text-orange-600',
    },
    {
      icon: Heart,
      label: 'リアクション減少',
      value: `${(metrics.reactionDeclineRatio * 100).toFixed(0)}%`,
      color: metrics.reactionDeclineRatio <= 0.2 ? 'text-green-600' : 'text-red-600',
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <User className="w-5 h-5" />
            {score.userName}
          </span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">×</button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* スコア表示 */}
        <div className="text-center py-4">
          <div className={`text-5xl font-bold ${
            score.score >= 70 ? 'text-green-600' :
            score.score >= 50 ? 'text-yellow-600' : 'text-red-600'
          }`}>
            {score.score}
          </div>
          <p className="text-sm text-gray-500">コンディションスコア</p>
          <div className="mt-2 flex items-center justify-center gap-2">
            {score.trend === 'up' && <TrendingUp className="w-4 h-4 text-green-500" />}
            {score.trend === 'down' && <TrendingDown className="w-4 h-4 text-red-500" />}
            {score.trend === 'stable' && <Minus className="w-4 h-4 text-gray-400" />}
            <span className="text-sm text-gray-500">前回: {score.previousScore}点</span>
          </div>
        </div>

        {/* メトリクス */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-500">行動メトリクス</h4>
          {metricItems.map((item, i) => {
            const Icon = item.icon;
            return (
              <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </div>
                <span className={`font-medium ${item.color}`}>{item.value}</span>
              </div>
            );
          })}
        </div>

        {/* 計算日時 */}
        <div className="text-xs text-gray-400 text-center">
          計算日時: {new Date(score.calculatedAt).toLocaleString('ja-JP')}
        </div>

        {/* アクション */}
        {score.alertLevel !== 'none' && !score.yoshidaNotified && (
          <Button
            onClick={onNotify}
            disabled={actionLoading}
            className="w-full bg-orange-500 hover:bg-orange-600"
          >
            {actionLoading ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Bell className="w-4 h-4 mr-2" />
            )}
            LINE WORKSで通知
          </Button>
        )}
        {score.yoshidaNotified && (
          <div className="text-center text-sm text-green-600">
            <CheckCircle className="w-4 h-4 inline mr-1" />
            通知済み
          </div>
        )}
      </CardContent>
    </Card>
  );
}
