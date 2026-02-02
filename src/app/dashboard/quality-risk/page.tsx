'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  AlertCircle,
  Clock,
  Shield,
  TrendingUp,
  GraduationCap,
  Wallet,
  Wrench,
  Package,
  FileText,
  Activity,
  ChevronRight,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';

interface QualityRiskSummary {
  generatedAt: string;
  alerts: {
    criticalOpen: number;
    warningOpen: number;
    url: string;
  };
  complaints: {
    highOpen: number;
    criticalOpen: number;
    overdue: number;
    url: string;
  };
  incidents: {
    thisWeek: number;
    severeThisWeek: number;
    url: string;
  };
  correctiveActions: {
    criticalOpen: number;
    overdue: number;
    doneThisWeek: number;
    url: string;
  };
  training: {
    overdue: number;
    sessionsDoneThisWeek: number;
    url: string;
  };
  licenses: {
    expired: number;
    expiring30: number;
    url: string;
  };
  repairs: {
    highRiskOpen: number;
    overdue: number;
    url: string;
  };
  inventory: {
    lowStock: number;
    url: string;
  };
  receivables: {
    overdueTotal: number;
    aging60Count: number;
    url: string;
  };
  collectionFlow: {
    overdueSteps: number;
    url: string;
  };
}

// 数値フォーマット（金額）
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0,
  }).format(amount);
}

// リスクレベル判定
type RiskLevel = 'critical' | 'warning' | 'normal';

function getRiskLevel(critical: number, warning: number): RiskLevel {
  if (critical > 0) return 'critical';
  if (warning > 0) return 'warning';
  return 'normal';
}

function getRiskColor(level: RiskLevel): string {
  switch (level) {
    case 'critical':
      return 'bg-red-50 border-red-200 text-red-700';
    case 'warning':
      return 'bg-amber-50 border-amber-200 text-amber-700';
    default:
      return 'bg-green-50 border-green-200 text-green-700';
  }
}

function getRiskBadge(level: RiskLevel): string {
  switch (level) {
    case 'critical':
      return 'bg-red-100 text-red-800';
    case 'warning':
      return 'bg-amber-100 text-amber-800';
    default:
      return 'bg-green-100 text-green-800';
  }
}

// セクションカードコンポーネント
interface SectionCardProps {
  title: string;
  icon: React.ReactNode;
  url: string;
  children: React.ReactNode;
  riskLevel?: RiskLevel;
  isPlanned?: boolean;
}

function SectionCard({
  title,
  icon,
  url,
  children,
  riskLevel = 'normal',
  isPlanned = false,
}: SectionCardProps) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        isPlanned ? 'bg-zinc-50 border-zinc-200 opacity-60' : getRiskColor(riskLevel)
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={isPlanned ? 'text-zinc-400' : ''}>{icon}</span>
          <h3 className={`font-semibold ${isPlanned ? 'text-zinc-500' : ''}`}>
            {title}
          </h3>
          {isPlanned && (
            <span className="px-2 py-0.5 text-xs bg-zinc-200 text-zinc-600 rounded">
              未実装
            </span>
          )}
        </div>
        <Link
          href={url}
          className={`text-sm flex items-center gap-1 hover:underline ${
            isPlanned ? 'text-zinc-400' : 'text-blue-600'
          }`}
        >
          詳細
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
      {children}
    </div>
  );
}

// メトリクス表示コンポーネント
interface MetricProps {
  label: string;
  value: number | string;
  variant?: 'critical' | 'warning' | 'success' | 'muted';
  suffix?: string;
}

function Metric({ label, value, variant = 'muted', suffix }: MetricProps) {
  const colorClass = {
    critical: 'text-red-600 font-bold',
    warning: 'text-amber-600 font-bold',
    success: 'text-green-600 font-bold',
    muted: 'text-zinc-700',
  }[variant];

  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-zinc-600">{label}</span>
      <span className={`text-lg ${colorClass}`}>
        {value}
        {suffix && <span className="text-sm ml-1">{suffix}</span>}
      </span>
    </div>
  );
}

export default function QualityRiskPage() {
  const [summary, setSummary] = useState<QualityRiskSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSummary();
  }, []);

  async function fetchSummary() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/quality-risk/summary');
      if (!res.ok) throw new Error('データ取得に失敗しました');
      const data = await res.json();
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラー');
    } finally {
      setLoading(false);
    }
  }

  // 全体のリスクスコア計算
  function calculateOverallRisk(): { level: RiskLevel; issues: string[] } {
    if (!summary) return { level: 'normal', issues: [] };

    const issues: string[] = [];

    // Critical issues
    if (summary.alerts.criticalOpen > 0) {
      issues.push(`${summary.alerts.criticalOpen}件の重大アラート`);
    }
    if (summary.complaints.criticalOpen > 0) {
      issues.push(`${summary.complaints.criticalOpen}件の重大クレーム`);
    }
    if (summary.complaints.overdue > 0) {
      issues.push(`${summary.complaints.overdue}件の期限超過クレーム`);
    }
    if (summary.training.overdue > 0) {
      issues.push(`${summary.training.overdue}件の研修未受講`);
    }
    if (summary.collectionFlow.overdueSteps > 0) {
      issues.push(`${summary.collectionFlow.overdueSteps}件の回収ステップ期限超過`);
    }
    if (summary.receivables.aging60Count > 0) {
      issues.push(`${summary.receivables.aging60Count}件の60日超滞留未収`);
    }

    const hasCritical =
      summary.alerts.criticalOpen > 0 ||
      summary.complaints.criticalOpen > 0 ||
      summary.receivables.aging60Count > 0;

    const hasWarning =
      summary.alerts.warningOpen > 0 ||
      summary.complaints.overdue > 0 ||
      summary.training.overdue > 0 ||
      summary.collectionFlow.overdueSteps > 0;

    const level: RiskLevel = hasCritical ? 'critical' : hasWarning ? 'warning' : 'normal';

    return { level, issues };
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-zinc-200 rounded w-64" />
          <div className="h-24 bg-zinc-200 rounded" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-40 bg-zinc-200 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">{error}</p>
          <button
            onClick={fetchSummary}
            className="mt-2 text-sm text-red-600 hover:underline"
          >
            再読み込み
          </button>
        </div>
      </div>
    );
  }

  if (!summary) return null;

  const overallRisk = calculateOverallRisk();

  return (
    <div className="p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">
            品質・リスク横断レポート
          </h1>
          <p className="text-zinc-600 mt-1">
            全ドメインの品質・リスク状況を一望
          </p>
        </div>
        <button
          onClick={fetchSummary}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-100 text-zinc-700 rounded-lg hover:bg-zinc-200"
        >
          <RefreshCw className="w-4 h-4" />
          更新
        </button>
      </div>

      {/* 全体サマリー */}
      <div
        className={`rounded-lg border-2 p-6 ${
          overallRisk.level === 'critical'
            ? 'bg-red-50 border-red-300'
            : overallRisk.level === 'warning'
            ? 'bg-amber-50 border-amber-300'
            : 'bg-green-50 border-green-300'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {overallRisk.level === 'critical' ? (
              <AlertTriangle className="w-8 h-8 text-red-600" />
            ) : overallRisk.level === 'warning' ? (
              <AlertCircle className="w-8 h-8 text-amber-600" />
            ) : (
              <Shield className="w-8 h-8 text-green-600" />
            )}
            <div>
              <h2
                className={`text-xl font-bold ${
                  overallRisk.level === 'critical'
                    ? 'text-red-700'
                    : overallRisk.level === 'warning'
                    ? 'text-amber-700'
                    : 'text-green-700'
                }`}
              >
                {overallRisk.level === 'critical'
                  ? '要対応'
                  : overallRisk.level === 'warning'
                  ? '注意'
                  : '良好'}
              </h2>
              <p className="text-sm text-zinc-600">
                最終更新: {new Date(summary.generatedAt).toLocaleString('ja-JP')}
              </p>
            </div>
          </div>
          <div
            className={`px-4 py-2 rounded-full text-sm font-semibold ${getRiskBadge(
              overallRisk.level
            )}`}
          >
            {overallRisk.issues.length > 0
              ? `${overallRisk.issues.length}件の要注意項目`
              : '問題なし'}
          </div>
        </div>

        {overallRisk.issues.length > 0 && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {overallRisk.issues.slice(0, 6).map((issue, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-sm bg-white/50 rounded px-3 py-2"
              >
                <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                <span className="text-zinc-700">{issue}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* メインカテゴリ（実装済み） */}
      <div>
        <h2 className="text-lg font-semibold text-zinc-800 mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5" />
          主要指標
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* アラート */}
          <SectionCard
            title="アラート"
            icon={<AlertTriangle className="w-5 h-5" />}
            url={summary.alerts.url}
            riskLevel={getRiskLevel(
              summary.alerts.criticalOpen,
              summary.alerts.warningOpen
            )}
          >
            <Metric
              label="Critical"
              value={summary.alerts.criticalOpen}
              variant={summary.alerts.criticalOpen > 0 ? 'critical' : 'muted'}
              suffix="件"
            />
            <Metric
              label="Warning"
              value={summary.alerts.warningOpen}
              variant={summary.alerts.warningOpen > 0 ? 'warning' : 'muted'}
              suffix="件"
            />
          </SectionCard>

          {/* クレーム */}
          <SectionCard
            title="クレーム"
            icon={<AlertCircle className="w-5 h-5" />}
            url={summary.complaints.url}
            riskLevel={getRiskLevel(
              summary.complaints.criticalOpen,
              summary.complaints.highOpen + summary.complaints.overdue
            )}
          >
            <Metric
              label="Critical未対応"
              value={summary.complaints.criticalOpen}
              variant={summary.complaints.criticalOpen > 0 ? 'critical' : 'muted'}
              suffix="件"
            />
            <Metric
              label="High未対応"
              value={summary.complaints.highOpen}
              variant={summary.complaints.highOpen > 0 ? 'warning' : 'muted'}
              suffix="件"
            />
            <Metric
              label="期限超過"
              value={summary.complaints.overdue}
              variant={summary.complaints.overdue > 0 ? 'warning' : 'muted'}
              suffix="件"
            />
          </SectionCard>

          {/* 研修 */}
          <SectionCard
            title="研修"
            icon={<GraduationCap className="w-5 h-5" />}
            url={summary.training.url}
            riskLevel={getRiskLevel(0, summary.training.overdue)}
          >
            <Metric
              label="未受講（期限超過）"
              value={summary.training.overdue}
              variant={summary.training.overdue > 0 ? 'warning' : 'muted'}
              suffix="件"
            />
            <Metric
              label="今週実施"
              value={summary.training.sessionsDoneThisWeek}
              variant={summary.training.sessionsDoneThisWeek > 0 ? 'success' : 'muted'}
              suffix="件"
            />
          </SectionCard>

          {/* 未収 */}
          <SectionCard
            title="未収管理"
            icon={<Wallet className="w-5 h-5" />}
            url={summary.receivables.url}
            riskLevel={getRiskLevel(
              summary.receivables.aging60Count,
              summary.receivables.overdueTotal > 0 ? 1 : 0
            )}
          >
            <Metric
              label="期限超過総額"
              value={formatCurrency(summary.receivables.overdueTotal)}
              variant={summary.receivables.overdueTotal > 0 ? 'warning' : 'muted'}
            />
            <Metric
              label="60日超滞留"
              value={summary.receivables.aging60Count}
              variant={summary.receivables.aging60Count > 0 ? 'critical' : 'muted'}
              suffix="件"
            />
          </SectionCard>

          {/* 回収フロー */}
          <SectionCard
            title="回収フロー"
            icon={<TrendingUp className="w-5 h-5" />}
            url={summary.collectionFlow.url}
            riskLevel={getRiskLevel(0, summary.collectionFlow.overdueSteps)}
          >
            <Metric
              label="ステップ期限超過"
              value={summary.collectionFlow.overdueSteps}
              variant={summary.collectionFlow.overdueSteps > 0 ? 'warning' : 'muted'}
              suffix="件"
            />
          </SectionCard>

          {/* 事故・ヒヤリ */}
          <SectionCard
            title="事故・ヒヤリ"
            icon={<Shield className="w-5 h-5" />}
            url={summary.incidents.url}
            riskLevel={getRiskLevel(
              summary.incidents.severeThisWeek,
              summary.incidents.thisWeek > 3 ? 1 : 0
            )}
          >
            <Metric
              label="今週報告"
              value={summary.incidents.thisWeek}
              variant="muted"
              suffix="件"
            />
            <Metric
              label="重大報告"
              value={summary.incidents.severeThisWeek}
              variant={summary.incidents.severeThisWeek > 0 ? 'critical' : 'muted'}
              suffix="件"
            />
          </SectionCard>
        </div>
      </div>

      {/* 未実装カテゴリ */}
      <div>
        <h2 className="text-lg font-semibold text-zinc-500 mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5" />
          開発予定
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 是正措置 */}
          <SectionCard
            title="是正措置"
            icon={<FileText className="w-5 h-5" />}
            url={summary.correctiveActions.url}
            isPlanned
          >
            <Metric label="Critical" value={summary.correctiveActions.criticalOpen} suffix="件" />
            <Metric label="期限超過" value={summary.correctiveActions.overdue} suffix="件" />
          </SectionCard>

          {/* 資格 */}
          <SectionCard
            title="資格管理"
            icon={<GraduationCap className="w-5 h-5" />}
            url={summary.licenses.url}
            isPlanned
          >
            <Metric label="期限切れ" value={summary.licenses.expired} suffix="件" />
            <Metric label="30日以内期限" value={summary.licenses.expiring30} suffix="件" />
          </SectionCard>

          {/* 修繕 */}
          <SectionCard
            title="修繕チケット"
            icon={<Wrench className="w-5 h-5" />}
            url={summary.repairs.url}
            isPlanned
          >
            <Metric label="高リスク" value={summary.repairs.highRiskOpen} suffix="件" />
            <Metric label="期限超過" value={summary.repairs.overdue} suffix="件" />
          </SectionCard>

          {/* 在庫 */}
          <SectionCard
            title="備品在庫"
            icon={<Package className="w-5 h-5" />}
            url={summary.inventory.url}
            isPlanned
          >
            <Metric label="低在庫" value={summary.inventory.lowStock} suffix="件" />
          </SectionCard>
        </div>
      </div>

      {/* フッター */}
      <div className="text-center text-sm text-zinc-500 pt-4 border-t border-zinc-200">
        各カードの「詳細」から個別画面へ移動できます
      </div>
    </div>
  );
}
