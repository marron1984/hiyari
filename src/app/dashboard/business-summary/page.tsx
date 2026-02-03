'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  AlertCircle,
  Building,
  Building2,
  Briefcase,
  Home,
  Heart,
  MoreHorizontal,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Shield,
  GraduationCap,
  Wallet,
  FileText,
  Users,
  Activity,
  Info,
  Ticket,
  Wrench,
  ShieldAlert,
  Award,
  FileSignature,  // Task 049: 契約用アイコン
} from 'lucide-react';

// ========== 型定義 ==========

interface BusinessUnit {
  id: string;
  name: string;
  type: string;
  locationHint: string | null;
  isActive: boolean;
  ownerUserId: string | null;
  ownerName: string | null;
}

interface KpiHighlight {
  kpiId: string;
  name: string;
  displayValue: string;
  trend: 'up' | 'down' | 'flat' | null;
  trendText: string | null;
  url: string;
}

interface BusinessHighlights {
  kpi: { keyMetrics: KpiHighlight[] };
  alerts: { criticalOpen: number; warningOpen: number; url: string };
  tickets: { open: number; overdue: number; urgentOpen: number; url: string };
  repairs: { highRiskOpen: number; overdue: number; url: string };
  complaints: { highOpen: number; criticalOpen: number; overdue: number; url: string };
  correctiveActions: { open: number; criticalOpen: number; overdue: number; url: string };
  // Task 054: training に assignedOpen, sessionsDoneThisWeek 追加
  training: { overdue: number; assignedOpen: number; sessionsDoneThisWeek: number; url: string };
  licenses: { expired: number; expiring30: number; url: string };
  // Task 049: 財務系（canViewFinance=false時はnull）
  receivables: { overdueTotal: number; aging60Count: number; url: string } | null;
  collection: { overdueSteps: number; url: string } | null;
  contracts: { expiring: number; decisionOverdue: number; highRiskExpiring: number; url: string } | null;
  agreements: { expired: number; expiring30: number; url: string };
}

interface BusinessCommentary {
  summaryText: string;
  topRisks: string[];
  nextActions: string[];
}

interface BusinessSummary {
  businessUnit: BusinessUnit | null;
  range: string;
  generatedAt: string;
  highlights: BusinessHighlights;
  commentary: BusinessCommentary;
}

interface BusinessSummaryOverview {
  unit: BusinessUnit;
  riskLevel: 'critical' | 'warning' | 'normal';
  totalIssues: number;
  criticalIssues: number;
}

// ========== アイコンマップ ==========

const BUSINESS_TYPE_ICONS: Record<string, React.ReactNode> = {
  homecare: <Home className="w-5 h-5" />,
  nursing: <Heart className="w-5 h-5" />,
  housing: <Building className="w-5 h-5" />,
  facility: <Building2 className="w-5 h-5" />,
  corp: <Briefcase className="w-5 h-5" />,
  other: <MoreHorizontal className="w-5 h-5" />,
};

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  homecare: '訪問介護',
  nursing: '訪問看護',
  housing: 'サ高住',
  facility: '入所施設',
  corp: '法人本部',
  other: 'その他',
};

// ========== ユーティリティ ==========

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0,
  }).format(amount);
}

function getRiskColor(level: 'critical' | 'warning' | 'normal'): string {
  switch (level) {
    case 'critical':
      return 'bg-red-50 border-red-200';
    case 'warning':
      return 'bg-amber-50 border-amber-200';
    default:
      return 'bg-green-50 border-green-200';
  }
}

function getRiskBadgeClass(level: 'critical' | 'warning' | 'normal'): string {
  switch (level) {
    case 'critical':
      return 'bg-red-100 text-red-800';
    case 'warning':
      return 'bg-amber-100 text-amber-800';
    default:
      return 'bg-green-100 text-green-800';
  }
}

function getRiskLabelText(level: 'critical' | 'warning' | 'normal'): string {
  switch (level) {
    case 'critical':
      return '要対応';
    case 'warning':
      return '注意';
    default:
      return '良好';
  }
}

function TrendIcon({ trend }: { trend: 'up' | 'down' | 'flat' | null }) {
  if (trend === 'up') return <TrendingUp className="w-4 h-4 text-green-600" />;
  if (trend === 'down') return <TrendingDown className="w-4 h-4 text-red-600" />;
  return <Minus className="w-4 h-4 text-zinc-400" />;
}

// ========== コンポーネント ==========

interface OverviewCardProps {
  overview: BusinessSummaryOverview;
  isSelected: boolean;
  onClick: () => void;
}

function OverviewCard({ overview, isSelected, onClick }: OverviewCardProps) {
  const { unit, riskLevel, totalIssues, criticalIssues } = overview;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-lg border-2 p-4 transition-all ${
        isSelected
          ? 'border-blue-500 bg-blue-50 shadow-md'
          : `${getRiskColor(riskLevel)} border hover:shadow-sm`
      }`}
    >
      <div className="flex items-center gap-3">
        <span className={isSelected ? 'text-blue-600' : 'text-zinc-600'}>
          {BUSINESS_TYPE_ICONS[unit.type] || <MoreHorizontal className="w-5 h-5" />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-zinc-900 truncate">{unit.name}</div>
          <div className="text-xs text-zinc-500">
            {BUSINESS_TYPE_LABELS[unit.type] || unit.type}
            {unit.locationHint && ` / ${unit.locationHint}`}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className={`px-2 py-0.5 rounded text-xs font-semibold ${getRiskBadgeClass(riskLevel)}`}
          >
            {getRiskLabelText(riskLevel)}
          </span>
          {totalIssues > 0 && (
            <span className="text-xs text-zinc-500">
              {criticalIssues > 0 ? `${criticalIssues}件重大` : `${totalIssues}件注意`}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

interface SummaryDetailProps {
  summary: BusinessSummary;
}

function SummaryDetail({ summary }: SummaryDetailProps) {
  const { highlights, commentary } = summary;

  return (
    <div className="space-y-6">
      {/* コメンタリー */}
      <div className="bg-white border border-zinc-200 rounded-lg p-6">
        <div className="flex items-start gap-3">
          <Info className="w-6 h-6 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-lg text-zinc-800 font-medium">{commentary.summaryText}</p>

            {commentary.topRisks.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-semibold text-zinc-700 mb-2">注意すべき点</h4>
                <ul className="space-y-1">
                  {commentary.topRisks.map((risk, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-zinc-600">
                      <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      {risk}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {commentary.nextActions.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-semibold text-zinc-700 mb-2">推奨アクション</h4>
                <ul className="space-y-1">
                  {commentary.nextActions.map((action, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-zinc-600">
                      <ChevronRight className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      {action}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* KPI */}
      {highlights.kpi.keyMetrics.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-zinc-700 mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4" />
            主要KPI
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {highlights.kpi.keyMetrics.map((kpi) => (
              <Link
                key={kpi.kpiId}
                href={kpi.url}
                className="bg-white border border-zinc-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-600">{kpi.name}</span>
                  <TrendIcon trend={kpi.trend} />
                </div>
                <div className="mt-2 text-2xl font-bold text-zinc-900">{kpi.displayValue}</div>
                {kpi.trendText && (
                  <div className="mt-1 text-xs text-zinc-500">{kpi.trendText}</div>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ハイライト指標 */}
      <div>
        <h3 className="text-sm font-semibold text-zinc-700 mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          ドメイン別状況
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* アラート */}
          <HighlightCard
            title="アラート"
            icon={<AlertTriangle className="w-4 h-4" />}
            url={highlights.alerts.url}
            items={[
              { label: 'Critical', value: highlights.alerts.criticalOpen, critical: true },
              { label: 'Warning', value: highlights.alerts.warningOpen, warning: true },
            ]}
          />

          {/* Task 030: チケット */}
          <HighlightCard
            title="チケット"
            icon={<Ticket className="w-4 h-4" />}
            url={highlights.tickets.url}
            items={[
              { label: 'オープン', value: highlights.tickets.open, warning: true },
              { label: '緊急', value: highlights.tickets.urgentOpen, critical: true },
              { label: '期限超過', value: highlights.tickets.overdue, critical: true },
            ]}
          />

          {/* Task 030: 修繕 */}
          <HighlightCard
            title="修繕"
            icon={<Wrench className="w-4 h-4" />}
            url={highlights.repairs.url}
            items={[
              { label: '高リスク', value: highlights.repairs.highRiskOpen, critical: true },
              { label: '期限超過', value: highlights.repairs.overdue, warning: true },
            ]}
          />

          {/* Task 030: 是正措置 */}
          <HighlightCard
            title="是正措置"
            icon={<ShieldAlert className="w-4 h-4" />}
            url={highlights.correctiveActions.url}
            items={[
              { label: 'オープン', value: highlights.correctiveActions.open, warning: true },
              { label: '重大', value: highlights.correctiveActions.criticalOpen, critical: true },
              { label: '期限超過', value: highlights.correctiveActions.overdue, critical: true },
            ]}
          />

          {/* Task 030: 資格 */}
          <HighlightCard
            title="資格"
            icon={<Award className="w-4 h-4" />}
            url={highlights.licenses.url}
            items={[
              { label: '期限切れ', value: highlights.licenses.expired, critical: true },
              { label: '30日以内', value: highlights.licenses.expiring30, warning: true },
            ]}
          />

          {/* クレーム */}
          <HighlightCard
            title="クレーム"
            icon={<AlertCircle className="w-4 h-4" />}
            url={highlights.complaints.url}
            items={[
              { label: 'Critical', value: highlights.complaints.criticalOpen, critical: true },
              { label: 'High', value: highlights.complaints.highOpen, warning: true },
              { label: '期限超過', value: highlights.complaints.overdue, warning: true },
            ]}
          />

          {/* Task 054: 研修（assignedOpen, sessionsDoneThisWeek追加） */}
          <HighlightCard
            title="研修"
            icon={<GraduationCap className="w-4 h-4" />}
            url={highlights.training.url}
            items={[
              { label: '期限超過', value: highlights.training.overdue, critical: true },
              { label: '未受講', value: highlights.training.assignedOpen, warning: true },
              { label: '今週完了', value: highlights.training.sessionsDoneThisWeek },
            ]}
          />

          {/* Task 049: 未収（canViewFinance=falseの場合は非表示） */}
          {highlights.receivables && (
            <HighlightCard
              title="未収管理"
              icon={<Wallet className="w-4 h-4" />}
              url={highlights.receivables.url}
              items={[
                {
                  label: '期限超過',
                  value: formatCurrency(highlights.receivables.overdueTotal),
                  warning: highlights.receivables.overdueTotal > 0,
                },
                { label: '60日超', value: highlights.receivables.aging60Count, critical: true },
              ]}
            />
          )}

          {/* Task 049: 回収フロー（canViewFinance=falseの場合は非表示） */}
          {highlights.collection && (
            <HighlightCard
              title="回収フロー"
              icon={<TrendingUp className="w-4 h-4" />}
              url={highlights.collection.url}
              items={[{ label: 'ステップ期限超過', value: highlights.collection.overdueSteps, warning: true }]}
            />
          )}

          {/* Task 049: 契約（canViewFinance=falseの場合は非表示） */}
          {highlights.contracts && (
            <HighlightCard
              title="契約"
              icon={<FileSignature className="w-4 h-4" />}
              url={highlights.contracts.url}
              items={[
                { label: '期限間近', value: highlights.contracts.expiring, warning: true },
                { label: '判断期限超過', value: highlights.contracts.decisionOverdue, critical: true },
                { label: '高リスク期限間近', value: highlights.contracts.highRiskExpiring, critical: true },
              ]}
            />
          )}

          {/* 同意書 */}
          <HighlightCard
            title="同意書"
            icon={<FileText className="w-4 h-4" />}
            url={highlights.agreements.url}
            items={[
              { label: '期限切れ', value: highlights.agreements.expired, critical: true },
              { label: '30日以内期限', value: highlights.agreements.expiring30, warning: true },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

interface HighlightCardProps {
  title: string;
  icon: React.ReactNode;
  url: string;
  items: Array<{
    label: string;
    value: number | string;
    critical?: boolean;
    warning?: boolean;
  }>;
}

function HighlightCard({ title, icon, url, items }: HighlightCardProps) {
  const hasCritical = items.some((i) => i.critical && (typeof i.value === 'number' ? i.value > 0 : true));
  const hasWarning = items.some((i) => i.warning && (typeof i.value === 'number' ? i.value > 0 : true));

  const cardClass = hasCritical
    ? 'bg-red-50 border-red-200'
    : hasWarning
    ? 'bg-amber-50 border-amber-200'
    : 'bg-white border-zinc-200';

  return (
    <Link
      href={url}
      className={`block rounded-lg border p-4 hover:shadow-sm transition-shadow ${cardClass}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-zinc-600">{icon}</span>
          <span className="font-semibold text-zinc-800">{title}</span>
        </div>
        <ChevronRight className="w-4 h-4 text-zinc-400" />
      </div>
      <div className="space-y-1">
        {items.map((item, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="text-zinc-600">{item.label}</span>
            <span
              className={`font-semibold ${
                item.critical && (typeof item.value === 'number' ? item.value > 0 : true)
                  ? 'text-red-600'
                  : item.warning && (typeof item.value === 'number' ? item.value > 0 : true)
                  ? 'text-amber-600'
                  : 'text-zinc-700'
              }`}
            >
              {item.value}
              {typeof item.value === 'number' && '件'}
            </span>
          </div>
        ))}
      </div>
    </Link>
  );
}

// ========== メインページ ==========

export default function BusinessSummaryPage() {
  const [overviews, setOverviews] = useState<BusinessSummaryOverview[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [summary, setSummary] = useState<BusinessSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOverviews();
  }, []);

  useEffect(() => {
    if (selectedUnitId) {
      fetchSummary(selectedUnitId);
    } else {
      // 全体サマリーを取得
      fetchSummary(null);
    }
  }, [selectedUnitId]);

  async function fetchOverviews() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/business/overviews');
      if (!res.ok) throw new Error('データ取得に失敗しました');
      const data = await res.json();
      setOverviews(data.overviews || []);

      // 最初の事業を選択
      if (data.overviews && data.overviews.length > 0) {
        setSelectedUnitId(data.overviews[0].unit.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラー');
    } finally {
      setLoading(false);
    }
  }

  async function fetchSummary(businessUnitId: string | null) {
    setDetailLoading(true);
    try {
      const params = new URLSearchParams();
      if (businessUnitId) {
        params.set('businessUnitId', businessUnitId);
      }
      params.set('range', 'thisMonth');

      const res = await fetch(`/api/business/summary?${params.toString()}`);
      if (!res.ok) throw new Error('サマリー取得に失敗しました');
      const data = await res.json();
      setSummary(data.summary || null);
    } catch (err) {
      console.error('Summary fetch error:', err);
      setSummary(null);
    } finally {
      setDetailLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-zinc-200 rounded w-64" />
          <div className="h-24 bg-zinc-200 rounded" />
          <div className="grid grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-24 bg-zinc-200 rounded" />
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
            onClick={fetchOverviews}
            className="mt-2 text-sm text-red-600 hover:underline"
          >
            再読み込み
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">事業別サマリー</h1>
          <p className="text-zinc-600 mt-1">事業ごとの運営状況を一望</p>
        </div>
        <button
          onClick={() => {
            fetchOverviews();
            if (selectedUnitId) fetchSummary(selectedUnitId);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-100 text-zinc-700 rounded-lg hover:bg-zinc-200"
        >
          <RefreshCw className="w-4 h-4" />
          更新
        </button>
      </div>

      {/* 全体選択ボタン */}
      <button
        onClick={() => setSelectedUnitId(null)}
        className={`w-full text-left rounded-lg border-2 p-4 transition-all ${
          selectedUnitId === null
            ? 'border-blue-500 bg-blue-50 shadow-md'
            : 'border-zinc-200 bg-white hover:shadow-sm'
        }`}
      >
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-zinc-600" />
          <div className="flex-1">
            <div className="font-semibold text-zinc-900">全体サマリー</div>
            <div className="text-xs text-zinc-500">全事業の統合ビュー</div>
          </div>
          <ChevronDown
            className={`w-5 h-5 transition-transform ${
              selectedUnitId === null ? 'rotate-180 text-blue-600' : 'text-zinc-400'
            }`}
          />
        </div>
      </button>

      {/* 事業一覧 */}
      <div>
        <h2 className="text-sm font-semibold text-zinc-700 mb-3 flex items-center gap-2">
          <Building className="w-4 h-4" />
          事業別
          <span className="text-xs text-zinc-500 font-normal">（リスクレベル順）</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {overviews.map((overview) => (
            <OverviewCard
              key={overview.unit.id}
              overview={overview}
              isSelected={selectedUnitId === overview.unit.id}
              onClick={() => setSelectedUnitId(overview.unit.id)}
            />
          ))}
        </div>
      </div>

      {/* サマリー詳細 */}
      <div className="border-t border-zinc-200 pt-6">
        <h2 className="text-lg font-semibold text-zinc-800 mb-4">
          {selectedUnitId
            ? overviews.find((o) => o.unit.id === selectedUnitId)?.unit.name || '事業'
            : '全体'}
          のサマリー
        </h2>

        {detailLoading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-32 bg-zinc-200 rounded" />
            <div className="h-48 bg-zinc-200 rounded" />
          </div>
        ) : summary ? (
          <SummaryDetail summary={summary} />
        ) : (
          <div className="text-center text-zinc-500 py-8">
            サマリーを取得できませんでした
          </div>
        )}
      </div>

      {/* フッター */}
      <div className="text-center text-sm text-zinc-500 pt-4 border-t border-zinc-200">
        各指標カードから詳細画面へ移動できます
      </div>
    </div>
  );
}
