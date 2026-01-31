'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardContent, Button, Badge, Textarea } from '@/components/ui';
import { Loading } from '@/components/Loading';
import {
  Brain,
  Search,
  AlertTriangle,
  CheckCircle,
  XCircle,
  TrendingUp,
  FileText,
  Users,
  Briefcase,
  ChevronRight,
  ChevronDown,
  Clock,
  Shield,
  Target,
  Zap,
  History,
  BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { hasMinRole } from '@/lib/auth';
import {
  DecisionLogType,
  DECISION_LOG_TYPE_LABELS,
  SIMILARITY_THRESHOLDS,
} from '@/types/yoshida-learning';

interface DecisionLog {
  id: string;
  createdAt: string;
  logType: DecisionLogType;
  targetTitle: string;
  targetDescription: string;
  decisionContext: {
    protectedValue: string;
    avoidedRisk: string;
    hasAlternative: boolean;
    alternativeDescription?: string;
  };
  finalDecision: string;
  decisionReason?: string;
  decidedAt: string;
}

interface SimilarityAnalysis {
  id: string;
  createdAt: string;
  input: {
    currentCase: {
      title: string;
      description: string;
    };
  };
  similarityScore: number;
  mostSimilarDecision?: {
    id: string;
    title: string;
    finalDecision: string;
    decidedAt: string;
  };
  matchingPoints: string[];
  differences: string[];
  cautions: string[];
  referencedDecisionCount: number;
}

interface Stats {
  total: number;
  byType: Record<DecisionLogType, number>;
  recentCount: number;
}

const LOG_TYPE_ICONS: Record<DecisionLogType, React.ReactNode> = {
  approval: <FileText className="w-4 h-4" />,
  hr_decision: <Users className="w-4 h-4" />,
  management_decision: <Briefcase className="w-4 h-4" />,
};

const LOG_TYPE_COLORS: Record<DecisionLogType, { bg: string; text: string; border: string }> = {
  approval: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  hr_decision: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  management_decision: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
};

function getSimilarityColor(score: number): { bg: string; text: string } {
  if (score >= SIMILARITY_THRESHOLDS.high) {
    return { bg: 'bg-emerald-100', text: 'text-emerald-700' };
  } else if (score >= SIMILARITY_THRESHOLDS.medium) {
    return { bg: 'bg-amber-100', text: 'text-amber-700' };
  } else if (score >= SIMILARITY_THRESHOLDS.low) {
    return { bg: 'bg-orange-100', text: 'text-orange-700' };
  }
  return { bg: 'bg-zinc-100', text: 'text-zinc-700' };
}

export default function YoshidaLearningPage() {
  return (
    <AuthGuard>
      <YoshidaLearningContent />
    </AuthGuard>
  );
}

function YoshidaLearningContent() {
  const { user, firebaseUser } = useAuth();
  const [decisionLogs, setDecisionLogs] = useState<DecisionLog[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [analysis, setAnalysis] = useState<SimilarityAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedLogType, setSelectedLogType] = useState<DecisionLogType | 'all'>('all');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'logs' | 'analyze'>('logs');

  // Analysis form state
  const [analysisTitle, setAnalysisTitle] = useState('');
  const [analysisDescription, setAnalysisDescription] = useState('');
  const [analysisLogType, setAnalysisLogType] = useState<DecisionLogType | ''>('');

  const isExecutive = user && hasMinRole(user.role, 'leader');

  // Load data
  const loadData = useCallback(async () => {
    if (!firebaseUser) return;

    try {
      setLoading(true);
      setError(null);

      const token = await firebaseUser.getIdToken();

      // Load stats and logs in parallel
      const [statsRes, logsRes] = await Promise.all([
        fetch('/api/ai/yoshida-learning?action=stats', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/ai/yoshida-learning?limit=50${selectedLogType !== 'all' ? `&logType=${selectedLogType}` : ''}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData.stats);
      }

      if (logsRes.ok) {
        const logsData = await logsRes.json();
        setDecisionLogs(logsData.decisionLogs || []);
      } else if (logsRes.status === 403) {
        setError('このページは幹部のみアクセスできます');
      }
    } catch (err) {
      console.error('Failed to load data:', err);
      setError(err instanceof Error ? err.message : 'データの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, selectedLogType]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Run similarity analysis
  const handleAnalyze = async () => {
    if (!firebaseUser || !analysisTitle.trim() || !analysisDescription.trim()) {
      setError('タイトルと内容を入力してください');
      return;
    }

    try {
      setAnalyzing(true);
      setError(null);
      setAnalysis(null);

      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/ai/yoshida-learning?action=analyze', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: analysisTitle.trim(),
          description: analysisDescription.trim(),
          logType: analysisLogType || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '分析に失敗しました');
      }

      const data = await res.json();
      setAnalysis(data.analysis);
    } catch (err) {
      console.error('Failed to analyze:', err);
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setAnalyzing(false);
    }
  };

  if (!isExecutive) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <Header />
        <main className="max-w-4xl mx-auto px-4 py-6">
          <div className="text-center py-12">
            <Shield className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
            <p className="text-zinc-600">このページは幹部のみアクセスできます</p>
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
            <div className="p-2 bg-indigo-100 rounded-xl">
              <Brain className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-900">吉田判断ログ学習</h1>
              <p className="text-sm text-zinc-500">AI副社長による判断パターン分析</p>
            </div>
          </div>
          <Badge className="bg-amber-100 text-amber-700">
            <Shield className="w-3 h-3 mr-1" />
            幹部専用
          </Badge>
        </div>

        {error && (
          <Card className="p-4 mb-6 bg-red-50 border-red-200">
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm">{error}</span>
            </div>
          </Card>
        )}

        {/* Stats */}
        {stats && (
          <Card className="mb-6">
            <CardContent className="p-6">
              <h2 className="font-semibold text-zinc-900 mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-zinc-500" />
                学習データ統計
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 bg-zinc-50 rounded-xl text-center">
                  <p className="text-2xl font-bold text-zinc-900">{stats.total}</p>
                  <p className="text-xs text-zinc-500">総判断数</p>
                </div>
                <div className="p-3 bg-blue-50 rounded-xl text-center">
                  <p className="text-2xl font-bold text-blue-700">{stats.byType.approval}</p>
                  <p className="text-xs text-blue-600">承認判断</p>
                </div>
                <div className="p-3 bg-purple-50 rounded-xl text-center">
                  <p className="text-2xl font-bold text-purple-700">{stats.byType.hr_decision}</p>
                  <p className="text-xs text-purple-600">人事判断</p>
                </div>
                <div className="p-3 bg-amber-50 rounded-xl text-center">
                  <p className="text-2xl font-bold text-amber-700">{stats.byType.management_decision}</p>
                  <p className="text-xs text-amber-600">経営判断</p>
                </div>
              </div>
              <p className="text-xs text-zinc-400 mt-4 text-center">
                過去30日: {stats.recentCount}件
              </p>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <Button
            variant={activeTab === 'logs' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('logs')}
          >
            <History className="w-4 h-4 mr-1" />
            判断ログ
          </Button>
          <Button
            variant={activeTab === 'analyze' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('analyze')}
          >
            <Search className="w-4 h-4 mr-1" />
            類似度分析
          </Button>
        </div>

        {activeTab === 'logs' && (
          <>
            {/* Filter */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
              <Button
                variant={selectedLogType === 'all' ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setSelectedLogType('all')}
              >
                すべて
              </Button>
              {(['approval', 'hr_decision', 'management_decision'] as DecisionLogType[]).map((type) => {
                const colors = LOG_TYPE_COLORS[type];
                return (
                  <Button
                    key={type}
                    variant={selectedLogType === type ? 'primary' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedLogType(type)}
                    className={selectedLogType === type ? '' : cn(colors.text)}
                  >
                    {LOG_TYPE_ICONS[type]}
                    <span className="ml-1">{DECISION_LOG_TYPE_LABELS[type]}</span>
                  </Button>
                );
              })}
            </div>

            {/* Decision Logs */}
            {decisionLogs.length === 0 ? (
              <Card className="p-12 text-center">
                <Brain className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
                <p className="text-zinc-500">判断ログがまだありません</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {decisionLogs.map((log) => {
                  const colors = LOG_TYPE_COLORS[log.logType];
                  const isExpanded = expandedLogId === log.id;

                  return (
                    <Card key={log.id} className={cn(colors.border)}>
                      <button
                        onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                        className={cn('w-full p-4 text-left', colors.bg)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={cn('p-2 rounded-lg', colors.bg, colors.text)}>
                              {LOG_TYPE_ICONS[log.logType]}
                            </div>
                            <div>
                              <p className="font-medium text-zinc-900">{log.targetTitle}</p>
                              <p className="text-xs text-zinc-500">
                                {DECISION_LOG_TYPE_LABELS[log.logType]} ・{' '}
                                {new Date(log.decidedAt).toLocaleDateString('ja-JP')}
                              </p>
                            </div>
                          </div>
                          <ChevronDown
                            className={cn(
                              'w-5 h-5 text-zinc-400 transition-transform',
                              isExpanded && 'rotate-180'
                            )}
                          />
                        </div>
                      </button>

                      {isExpanded && (
                        <CardContent className="p-4 border-t">
                          {/* Description */}
                          <div className="mb-4">
                            <p className="text-sm text-zinc-700">{log.targetDescription}</p>
                          </div>

                          {/* Decision Context */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                            <div className="p-3 bg-emerald-50 rounded-xl">
                              <div className="flex items-center gap-1 text-xs text-emerald-600 mb-1">
                                <Target className="w-3 h-3" />
                                守りたい軸
                              </div>
                              <p className="text-sm text-zinc-700">{log.decisionContext.protectedValue}</p>
                            </div>
                            <div className="p-3 bg-red-50 rounded-xl">
                              <div className="flex items-center gap-1 text-xs text-red-600 mb-1">
                                <Shield className="w-3 h-3" />
                                嫌ったリスク
                              </div>
                              <p className="text-sm text-zinc-700">{log.decisionContext.avoidedRisk}</p>
                            </div>
                            <div className="p-3 bg-blue-50 rounded-xl">
                              <div className="flex items-center gap-1 text-xs text-blue-600 mb-1">
                                <Zap className="w-3 h-3" />
                                代替案
                              </div>
                              <p className="text-sm text-zinc-700">
                                {log.decisionContext.hasAlternative
                                  ? log.decisionContext.alternativeDescription || 'あり'
                                  : 'なし'}
                              </p>
                            </div>
                          </div>

                          {/* Final Decision */}
                          <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                            <p className="text-xs text-indigo-600 mb-1 font-medium">最終判断</p>
                            <p className="text-zinc-900 font-medium">{log.finalDecision}</p>
                            {log.decisionReason && (
                              <p className="text-sm text-zinc-600 mt-2">{log.decisionReason}</p>
                            )}
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}

        {activeTab === 'analyze' && (
          <>
            {/* Analysis Form */}
            <Card className="mb-6">
              <CardContent className="p-6">
                <h2 className="font-semibold text-zinc-900 mb-4 flex items-center gap-2">
                  <Search className="w-5 h-5 text-zinc-500" />
                  類似度分析
                </h2>
                <p className="text-sm text-zinc-500 mb-4">
                  現在のケースと吉田社長の過去の判断パターンとの類似度を分析します。
                  ※AIは判断を代行しません
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">
                      タイトル <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={analysisTitle}
                      onChange={(e) => setAnalysisTitle(e.target.value)}
                      placeholder="例: 新規施設開設の承認"
                      className="w-full p-2 border border-zinc-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">
                      内容 <span className="text-red-500">*</span>
                    </label>
                    <Textarea
                      value={analysisDescription}
                      onChange={(e) => setAnalysisDescription(e.target.value)}
                      placeholder="判断が必要な案件の詳細を記載..."
                      className="h-32"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">
                      判断種別（任意）
                    </label>
                    <select
                      value={analysisLogType}
                      onChange={(e) => setAnalysisLogType(e.target.value as DecisionLogType | '')}
                      className="w-full p-2 border border-zinc-300 rounded-lg"
                    >
                      <option value="">すべての種別から検索</option>
                      {(['approval', 'hr_decision', 'management_decision'] as DecisionLogType[]).map((type) => (
                        <option key={type} value={type}>
                          {DECISION_LOG_TYPE_LABELS[type]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <Button
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  className="w-full mt-6"
                >
                  {analyzing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      分析中...
                    </>
                  ) : (
                    <>
                      <Brain className="w-4 h-4 mr-2" />
                      類似度を分析
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Analysis Result */}
            {analysis && (
              <Card>
                <CardContent className="p-6">
                  <h3 className="font-semibold text-zinc-900 mb-4">分析結果</h3>

                  {/* Similarity Score */}
                  <div className="flex items-center justify-center mb-6">
                    <div className={cn(
                      'w-32 h-32 rounded-full flex flex-col items-center justify-center',
                      getSimilarityColor(analysis.similarityScore).bg
                    )}>
                      <p className={cn(
                        'text-4xl font-bold',
                        getSimilarityColor(analysis.similarityScore).text
                      )}>
                        {analysis.similarityScore}%
                      </p>
                      <p className="text-sm text-zinc-500">類似度</p>
                    </div>
                  </div>

                  {/* Most Similar Decision */}
                  {analysis.mostSimilarDecision && (
                    <div className="mb-6 p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                      <p className="text-xs text-indigo-600 mb-2 font-medium">最も類似した過去の判断</p>
                      <p className="font-medium text-zinc-900">{analysis.mostSimilarDecision.title}</p>
                      <p className="text-sm text-zinc-600 mt-1">
                        判断: {analysis.mostSimilarDecision.finalDecision}
                      </p>
                      <p className="text-xs text-zinc-400 mt-1">
                        {new Date(analysis.mostSimilarDecision.decidedAt).toLocaleDateString('ja-JP')}
                      </p>
                    </div>
                  )}

                  {/* Matching Points */}
                  {analysis.matchingPoints.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-zinc-700 mb-2 flex items-center gap-1">
                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                        一致点
                      </h4>
                      <ul className="space-y-1">
                        {analysis.matchingPoints.map((point, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm text-zinc-600">
                            <ChevronRight className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                            {point}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Differences */}
                  {analysis.differences.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-zinc-700 mb-2 flex items-center gap-1">
                        <XCircle className="w-4 h-4 text-amber-500" />
                        相違点
                      </h4>
                      <ul className="space-y-1">
                        {analysis.differences.map((diff, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm text-zinc-600">
                            <ChevronRight className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                            {diff}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Cautions */}
                  {analysis.cautions.length > 0 && (
                    <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
                      <h4 className="text-sm font-medium text-amber-700 mb-2 flex items-center gap-1">
                        <AlertTriangle className="w-4 h-4" />
                        注意点
                      </h4>
                      <ul className="space-y-1">
                        {analysis.cautions.map((caution, idx) => (
                          <li key={idx} className="text-sm text-amber-800">
                            {caution}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <p className="text-xs text-zinc-400 mt-4 text-center">
                    参照した判断ログ: {analysis.referencedDecisionCount}件
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Disclaimer */}
            <div className="mt-6 p-4 bg-zinc-100 border border-zinc-200 rounded-xl">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-zinc-500 shrink-0 mt-0.5" />
                <div className="text-sm text-zinc-600">
                  <p className="font-medium mb-1">AIは判断を代行しません</p>
                  <p>
                    この分析結果は過去の判断パターンとの類似度を示すものであり、
                    推奨や結論を提示するものではありません。
                    最終判断は吉田社長ご自身で行ってください。
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
