'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardContent, Button, Badge, Input } from '@/components/ui';
import { Loading } from '@/components/Loading';
import {
  Calculator,
  Play,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  Building2,
  Copy,
  Check,
  FileText,
  ChevronRight,
  ChevronDown,
  History,
  Shield,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { hasMinRole } from '@/lib/auth';
import {
  ScenarioType,
  SCENARIO_TYPE_LABELS,
  SimulationPlan,
  RiskItem,
  RISK_CATEGORY_LABELS,
  RISK_LEVEL_LABELS,
} from '@/types/if-simulation';
import { BRANCHES_SEED } from '@/data/employees';

interface Simulation {
  id: string;
  createdAt: string;
  createdBy: string;
  input: {
    scenarioType: ScenarioType;
    baseId: string;
    period: {
      startMonth: string;
      months: number;
    };
    optionalParams?: {
      changeRate?: number;
      initialInvestment?: number;
      customDescription?: string;
    };
  };
  baseName: string;
  referenceKpiPeriod: {
    from: string;
    to: string;
    months: number;
  };
  currentStatus: {
    averageOccupancyRate: number;
    averageRevenue: number;
    averageLaborCostRatio: number;
    averageProfitRate: number;
    latestStaffCount: number;
    latestResidentCount: number;
  };
  plans: [SimulationPlan, SimulationPlan, SimulationPlan];
  aiModel: string;
  promptVersion: string;
}

const PLAN_COLORS = {
  A: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', badge: 'bg-blue-100' },
  B: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', badge: 'bg-emerald-100' },
  C: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', badge: 'bg-purple-100' },
};

const RISK_IMPACT_COLORS = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-green-100 text-green-700',
};

export default function SimulationPage() {
  return (
    <AuthGuard>
      <SimulationContent />
    </AuthGuard>
  );
}

function SimulationContent() {
  const { user, firebaseUser } = useAuth();
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [history, setHistory] = useState<Simulation[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedPlan, setExpandedPlan] = useState<'A' | 'B' | 'C' | null>('A');
  const reportRef = useRef<HTMLDivElement>(null);

  // Form state
  const [scenarioType, setScenarioType] = useState<ScenarioType>('staff_reduction');
  const [baseId, setBaseId] = useState(BRANCHES_SEED[0]?.id || '');
  const [startMonth, setStartMonth] = useState(getCurrentMonth());
  const [months, setMonths] = useState(6);
  const [changeRate, setChangeRate] = useState<number | undefined>(undefined);
  const [initialInvestment, setInitialInvestment] = useState<number | undefined>(undefined);
  const [customDescription, setCustomDescription] = useState('');

  const isLeaderOrAbove = user && hasMinRole(user.role, 'leader');

  // Load history
  const loadHistory = useCallback(async () => {
    if (!firebaseUser) return;

    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/ai/simulation?limit=5', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setHistory(data.simulations || []);
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  }, [firebaseUser]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Generate simulation
  const handleGenerate = async () => {
    if (!firebaseUser) return;

    try {
      setGenerating(true);
      setError(null);

      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/ai/simulation', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scenarioType,
          baseId,
          period: { startMonth, months },
          optionalParams: {
            ...(changeRate !== undefined && { changeRate }),
            ...(initialInvestment !== undefined && { initialInvestment }),
            ...(customDescription && { customDescription }),
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'シミュレーション生成に失敗しました');
      }

      const data = await res.json();
      setSimulation(data.simulation);
      setExpandedPlan('A');
      await loadHistory();
    } catch (err) {
      console.error('Failed to generate simulation:', err);
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setGenerating(false);
    }
  };

  // Load from history
  const handleLoadFromHistory = async (id: string) => {
    if (!firebaseUser) return;

    try {
      setLoading(true);
      const token = await firebaseUser.getIdToken();
      const res = await fetch(`/api/ai/simulation?id=${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setSimulation(data.simulation);
        setShowHistory(false);
      }
    } catch (err) {
      console.error('Failed to load simulation:', err);
    } finally {
      setLoading(false);
    }
  };

  // Copy to clipboard
  const handleCopy = async () => {
    if (!simulation) return;

    const text = formatSimulationAsText(simulation);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Export to PDF (using print)
  const handleExportPDF = () => {
    window.print();
  };

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
      <main className="max-w-4xl mx-auto px-4 py-6 safe-bottom print:max-w-none print:px-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 print:hidden">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-xl">
              <Calculator className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-900">ifシミュレーション</h1>
              <p className="text-sm text-zinc-500">AI副社長による経営判断シミュレーション</p>
            </div>
          </div>
          <div className="flex gap-2">
            {history.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowHistory(!showHistory)}
              >
                <History className="w-4 h-4 mr-1" />
                履歴
              </Button>
            )}
          </div>
        </div>

        {/* History Panel */}
        {showHistory && history.length > 0 && (
          <Card className="mb-6 print:hidden">
            <CardContent className="p-4">
              <h3 className="font-semibold text-zinc-900 mb-3">過去のシミュレーション</h3>
              <div className="space-y-2">
                {history.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => handleLoadFromHistory(h.id)}
                    className="w-full p-3 text-left bg-zinc-50 hover:bg-zinc-100 rounded-xl transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium text-zinc-900">
                          {SCENARIO_TYPE_LABELS[h.input.scenarioType]}
                        </span>
                        <span className="text-sm text-zinc-500 ml-2">
                          {h.baseName}
                        </span>
                      </div>
                      <span className="text-xs text-zinc-400">
                        {new Date(h.createdAt).toLocaleDateString('ja-JP')}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {error && (
          <Card className="p-4 mb-6 bg-red-50 border-red-200 print:hidden">
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm">{error}</span>
            </div>
          </Card>
        )}

        {/* Input Form */}
        <Card className="mb-6 print:hidden">
          <CardContent className="p-6">
            <h2 className="font-semibold text-zinc-900 mb-4">シミュレーション設定</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {/* Scenario Type */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  シナリオタイプ
                </label>
                <select
                  value={scenarioType}
                  onChange={(e) => setScenarioType(e.target.value as ScenarioType)}
                  className="w-full p-2 border border-zinc-300 rounded-lg"
                >
                  {Object.entries(SCENARIO_TYPE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>

              {/* Base */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  対象拠点
                </label>
                <select
                  value={baseId}
                  onChange={(e) => setBaseId(e.target.value)}
                  className="w-full p-2 border border-zinc-300 rounded-lg"
                >
                  {BRANCHES_SEED.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              {/* Start Month */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  開始月
                </label>
                <Input
                  type="month"
                  value={startMonth}
                  onChange={(e) => setStartMonth(e.target.value)}
                />
              </div>

              {/* Months */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  期間（月数）
                </label>
                <Input
                  type="number"
                  min={1}
                  max={24}
                  value={months}
                  onChange={(e) => setMonths(parseInt(e.target.value, 10) || 6)}
                />
              </div>

              {/* Change Rate */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  変動率（%、任意）
                </label>
                <Input
                  type="number"
                  placeholder="例: 10"
                  value={changeRate ?? ''}
                  onChange={(e) => setChangeRate(e.target.value ? parseFloat(e.target.value) : undefined)}
                />
              </div>

              {/* Initial Investment */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  初期投資額（円、任意）
                </label>
                <Input
                  type="number"
                  placeholder="例: 1000000"
                  value={initialInvestment ?? ''}
                  onChange={(e) => setInitialInvestment(e.target.value ? parseInt(e.target.value, 10) : undefined)}
                />
              </div>
            </div>

            {/* Custom Description */}
            {scenarioType === 'custom' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  シナリオ説明
                </label>
                <textarea
                  value={customDescription}
                  onChange={(e) => setCustomDescription(e.target.value)}
                  placeholder="シナリオの詳細を入力..."
                  className="w-full p-2 border border-zinc-300 rounded-lg h-24"
                />
              </div>
            )}

            <Button
              onClick={handleGenerate}
              disabled={generating}
              className="w-full"
            >
              {generating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  シミュレーション生成中...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  シミュレーション実行
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Simulation Result */}
        {simulation && (
          <div ref={reportRef}>
            {/* Export Buttons */}
            <div className="flex gap-2 mb-4 print:hidden">
              <Button variant="outline" size="sm" onClick={handleCopy}>
                {copied ? (
                  <Check className="w-4 h-4 mr-1 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4 mr-1" />
                )}
                {copied ? 'コピー完了' : 'コピー'}
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportPDF}>
                <FileText className="w-4 h-4 mr-1" />
                PDF出力
              </Button>
            </div>

            {/* Print Header */}
            <div className="hidden print:block mb-6">
              <h1 className="text-2xl font-bold text-zinc-900">ifシミュレーション結果</h1>
              <p className="text-sm text-zinc-500">
                {SCENARIO_TYPE_LABELS[simulation.input.scenarioType]} - {simulation.baseName}
              </p>
              <p className="text-xs text-zinc-400">
                生成日時: {new Date(simulation.createdAt).toLocaleString('ja-JP')}
              </p>
            </div>

            {/* Summary Card */}
            <Card className="mb-6">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Badge className="bg-indigo-100 text-indigo-700">
                      {SCENARIO_TYPE_LABELS[simulation.input.scenarioType]}
                    </Badge>
                    <span className="text-sm text-zinc-500">
                      {simulation.baseName}
                    </span>
                  </div>
                  <span className="text-xs text-zinc-400 print:hidden">
                    {new Date(simulation.createdAt).toLocaleString('ja-JP')}
                  </span>
                </div>

                {/* Current Status */}
                <div className="p-4 bg-zinc-50 rounded-xl mb-4">
                  <h3 className="text-sm font-medium text-zinc-700 mb-3">現状データ（過去{simulation.referenceKpiPeriod.months}ヶ月平均）</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-zinc-500">入居率</p>
                      <p className="text-lg font-bold text-zinc-900">{simulation.currentStatus.averageOccupancyRate}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500">月間売上</p>
                      <p className="text-lg font-bold text-zinc-900">
                        {(simulation.currentStatus.averageRevenue / 10000).toFixed(0)}万円
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500">人件費率</p>
                      <p className="text-lg font-bold text-zinc-900">{simulation.currentStatus.averageLaborCostRatio}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500">利益率</p>
                      <p className="text-lg font-bold text-zinc-900">{simulation.currentStatus.averageProfitRate}%</p>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-zinc-400 text-center">
                  参照期間: {simulation.referenceKpiPeriod.from} 〜 {simulation.referenceKpiPeriod.to}
                </p>
              </CardContent>
            </Card>

            {/* Plans */}
            <div className="space-y-4">
              {simulation.plans.map((plan) => {
                const colors = PLAN_COLORS[plan.planId];
                const isExpanded = expandedPlan === plan.planId;

                return (
                  <Card key={plan.planId} className={cn(colors.border, 'overflow-hidden')}>
                    <button
                      onClick={() => setExpandedPlan(isExpanded ? null : plan.planId)}
                      className={cn(
                        'w-full p-4 flex items-center justify-between',
                        colors.bg,
                        'print:pointer-events-none'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Badge className={cn(colors.badge, colors.text, 'text-lg px-3 py-1')}>
                          {plan.planId}案
                        </Badge>
                        <div className="text-left">
                          <p className={cn('font-semibold', colors.text)}>{plan.planName}</p>
                          <p className="text-sm text-zinc-500">{plan.description}</p>
                        </div>
                      </div>
                      <ChevronDown
                        className={cn(
                          'w-5 h-5 text-zinc-400 transition-transform print:hidden',
                          isExpanded && 'rotate-180'
                        )}
                      />
                    </button>

                    {(isExpanded || true) && (
                      <CardContent className={cn('p-6', !isExpanded && 'hidden print:block')}>
                        {/* Summary Metrics */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                          <div className="p-3 bg-zinc-50 rounded-xl">
                            <div className="flex items-center gap-1 text-xs text-zinc-500 mb-1">
                              <DollarSign className="w-3 h-3" />
                              累計売上
                            </div>
                            <p className="text-lg font-bold text-zinc-900">
                              {(plan.summary.totalRevenue / 10000).toLocaleString()}万円
                            </p>
                            <div className={cn(
                              'flex items-center gap-1 text-xs mt-1',
                              plan.summary.revenueChange >= 0 ? 'text-emerald-600' : 'text-red-600'
                            )}>
                              {plan.summary.revenueChange >= 0 ? (
                                <TrendingUp className="w-3 h-3" />
                              ) : (
                                <TrendingDown className="w-3 h-3" />
                              )}
                              {plan.summary.revenueChange >= 0 ? '+' : ''}{plan.summary.revenueChange.toFixed(1)}%
                            </div>
                          </div>

                          <div className="p-3 bg-zinc-50 rounded-xl">
                            <div className="flex items-center gap-1 text-xs text-zinc-500 mb-1">
                              <DollarSign className="w-3 h-3" />
                              累計利益
                            </div>
                            <p className="text-lg font-bold text-zinc-900">
                              {(plan.summary.totalProfit / 10000).toLocaleString()}万円
                            </p>
                            <div className={cn(
                              'flex items-center gap-1 text-xs mt-1',
                              plan.summary.profitChange >= 0 ? 'text-emerald-600' : 'text-red-600'
                            )}>
                              {plan.summary.profitChange >= 0 ? (
                                <TrendingUp className="w-3 h-3" />
                              ) : (
                                <TrendingDown className="w-3 h-3" />
                              )}
                              {plan.summary.profitChange >= 0 ? '+' : ''}{plan.summary.profitChange.toFixed(1)}%
                            </div>
                          </div>

                          <div className="p-3 bg-zinc-50 rounded-xl">
                            <div className="flex items-center gap-1 text-xs text-zinc-500 mb-1">
                              <Users className="w-3 h-3" />
                              平均入居率
                            </div>
                            <p className="text-lg font-bold text-zinc-900">
                              {plan.summary.averageOccupancyRate.toFixed(1)}%
                            </p>
                          </div>
                        </div>

                        {/* Assumptions */}
                        {plan.assumptions.length > 0 && (
                          <div className="mb-6">
                            <h4 className="text-sm font-medium text-zinc-700 mb-2">前提条件</h4>
                            <ul className="space-y-1">
                              {plan.assumptions.map((a, idx) => (
                                <li key={idx} className="flex items-start gap-2 text-sm text-zinc-600">
                                  <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
                                  {a}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Risks */}
                        {plan.risks.length > 0 && (
                          <div className="mb-6">
                            <h4 className="text-sm font-medium text-zinc-700 mb-2 flex items-center gap-1">
                              <Shield className="w-4 h-4 text-zinc-500" />
                              リスク
                            </h4>
                            <div className="space-y-2">
                              {plan.risks.map((risk, idx) => (
                                <div
                                  key={idx}
                                  className="p-3 bg-zinc-50 rounded-xl border border-zinc-100"
                                >
                                  <div className="flex items-center gap-2 mb-1">
                                    <Badge className="text-xs bg-zinc-200 text-zinc-700">
                                      {RISK_CATEGORY_LABELS[risk.category]}
                                    </Badge>
                                    <Badge className={cn('text-xs', RISK_IMPACT_COLORS[risk.impact])}>
                                      影響: {RISK_LEVEL_LABELS[risk.impact]}
                                    </Badge>
                                    <Badge className={cn('text-xs', RISK_IMPACT_COLORS[risk.probability])}>
                                      確率: {RISK_LEVEL_LABELS[risk.probability]}
                                    </Badge>
                                  </div>
                                  <p className="text-sm text-zinc-700">{risk.description}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Calculations */}
                        {plan.calculations.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium text-zinc-700 mb-2">算出根拠</h4>
                            <ul className="space-y-1">
                              {plan.calculations.map((c, idx) => (
                                <li key={idx} className="flex items-start gap-2 text-sm text-zinc-600">
                                  <ArrowRight className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
                                  {c}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>

            {/* Disclaimer */}
            <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800">
                  <p className="font-medium mb-1">ご注意</p>
                  <p>
                    このシミュレーションはAIによる予測であり、実際の結果を保証するものではありません。
                    最終的な判断は経営者の責任において行ってください。
                    推奨・結論は含まれておらず、あくまで検討材料としてご活用ください。
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
        }
      `}</style>
    </div>
  );
}

// Helper functions
function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatSimulationAsText(simulation: Simulation): string {
  const lines: string[] = [];

  lines.push('=== ifシミュレーション結果 ===');
  lines.push('');
  lines.push(`シナリオ: ${SCENARIO_TYPE_LABELS[simulation.input.scenarioType]}`);
  lines.push(`対象拠点: ${simulation.baseName}`);
  lines.push(`期間: ${simulation.input.period.startMonth}から${simulation.input.period.months}ヶ月`);
  lines.push(`生成日時: ${new Date(simulation.createdAt).toLocaleString('ja-JP')}`);
  lines.push('');
  lines.push('--- 現状データ ---');
  lines.push(`入居率: ${simulation.currentStatus.averageOccupancyRate}%`);
  lines.push(`月間売上: ${(simulation.currentStatus.averageRevenue / 10000).toFixed(0)}万円`);
  lines.push(`人件費率: ${simulation.currentStatus.averageLaborCostRatio}%`);
  lines.push(`利益率: ${simulation.currentStatus.averageProfitRate}%`);
  lines.push('');

  simulation.plans.forEach((plan) => {
    lines.push(`--- ${plan.planId}案: ${plan.planName} ---`);
    lines.push(plan.description);
    lines.push('');
    lines.push(`累計売上: ${(plan.summary.totalRevenue / 10000).toLocaleString()}万円 (${plan.summary.revenueChange >= 0 ? '+' : ''}${plan.summary.revenueChange.toFixed(1)}%)`);
    lines.push(`累計利益: ${(plan.summary.totalProfit / 10000).toLocaleString()}万円 (${plan.summary.profitChange >= 0 ? '+' : ''}${plan.summary.profitChange.toFixed(1)}%)`);
    lines.push(`平均入居率: ${plan.summary.averageOccupancyRate.toFixed(1)}%`);
    lines.push('');

    if (plan.assumptions.length > 0) {
      lines.push('前提条件:');
      plan.assumptions.forEach((a) => lines.push(`  - ${a}`));
      lines.push('');
    }

    if (plan.risks.length > 0) {
      lines.push('リスク:');
      plan.risks.forEach((r) => {
        lines.push(`  - [${RISK_CATEGORY_LABELS[r.category]}] ${r.description}`);
        lines.push(`    影響: ${RISK_LEVEL_LABELS[r.impact]}, 確率: ${RISK_LEVEL_LABELS[r.probability]}`);
      });
      lines.push('');
    }
  });

  lines.push('---');
  lines.push('※ このシミュレーションはAIによる予測であり、実際の結果を保証するものではありません。');

  return lines.join('\n');
}
