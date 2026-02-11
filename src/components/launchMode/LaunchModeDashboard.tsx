'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  UserPlus,
  Building2,
  Clock,
  ClipboardCheck,
  ChevronRight,
  Bell,
  RefreshCw,
  TrendingUp,
  AlertCircle,
  FileText,
  Lightbulb,
  FolderOpen,
  Briefcase,
  Activity,
  Trophy,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useApiFetch } from '@/hooks/useApiFetch';
import { BuildInfo } from '@/components/BuildInfo';
import { cn } from '@/lib/utils';

// ── モジュールカード定義 ──

interface ModuleCardConfig {
  id: string;
  href: string;
  label: string;
  icon: React.ElementType;
  iconBg: string;
  accentBar: string;
  hoverBorder: string;
  getMetrics: (counts: DashboardCounts) => MetricItem[];
}

interface MetricItem {
  label: string;
  value: number | string;
  highlight?: boolean; // 赤ハイライト（要対応）
}

interface DashboardCounts {
  prospects: {
    total: number;
    newThisWeek: number;
    byStatus: Record<string, number>;
  };
  vacancies: {
    totalCapacity: number;
    totalVacant: number;
    occupancyRate: number;
    facilityCount: number;
  };
  attendance: {
    todayClockedIn: number;
    working: number;
    pendingOvertime: number;
  };
  approvals: {
    pending: number;
    todayNew: number;
    total: number;
  };
  incidents: {
    thisMonth: number;
    total: number;
    fraudFlagged: number;
  };
  improvements: {
    total: number;
    adopted: number;
    pendingReview: number;
  };
  documents: {
    total: number;
    missing: number;
    submitted: number;
  };
  sales: {
    activeDeals: number;
    staleDeals: number;
    totalAccounts: number;
  };
  os: {
    todayCheckins: number;
    yellowRisk: number;
    redRisk: number;
  };
  rankings: {
    participants: number;
    topPoints: number;
    totalPoints: number;
  };
}

const MODULE_CARDS: ModuleCardConfig[] = [
  {
    id: 'attendance',
    href: '/attendance',
    label: '打刻',
    icon: Clock,
    iconBg: 'bg-amber-500',
    accentBar: 'bg-amber-500',
    hoverBorder: 'hover:border-amber-300',
    getMetrics: (c) => [
      { label: '今日の出勤', value: c.attendance.todayClockedIn },
      { label: '勤務中', value: c.attendance.working },
      { label: '残業申請待ち', value: c.attendance.pendingOvertime, highlight: c.attendance.pendingOvertime > 0 },
    ],
  },
  {
    id: 'approvals',
    href: '/dashboard/approvals',
    label: '承認',
    icon: ClipboardCheck,
    iconBg: 'bg-violet-500',
    accentBar: 'bg-violet-500',
    hoverBorder: 'hover:border-violet-300',
    getMetrics: (c) => [
      { label: '承認待ち', value: c.approvals.pending, highlight: c.approvals.pending > 0 },
      { label: '今日の新規', value: c.approvals.todayNew },
      { label: '総件数', value: c.approvals.total },
    ],
  },
  {
    id: 'prospects',
    href: '/dashboard/prospects',
    label: '入居希望',
    icon: UserPlus,
    iconBg: 'bg-blue-500',
    accentBar: 'bg-blue-500',
    hoverBorder: 'hover:border-blue-300',
    getMetrics: (c) => [
      { label: '今週の新規', value: c.prospects.newThisWeek },
      { label: '総件数', value: c.prospects.total },
    ],
  },
  {
    id: 'vacancies',
    href: '/dashboard/vacancy',
    label: '空室',
    icon: Building2,
    iconBg: 'bg-emerald-500',
    accentBar: 'bg-emerald-500',
    hoverBorder: 'hover:border-emerald-300',
    getMetrics: (c) => [
      { label: '空室数', value: c.vacancies.totalVacant },
      { label: '入居率', value: `${c.vacancies.occupancyRate}%` },
      { label: '定員', value: c.vacancies.totalCapacity },
    ],
  },
  {
    id: 'incidents',
    href: '/submit',
    label: '報告',
    icon: FileText,
    iconBg: 'bg-rose-500',
    accentBar: 'bg-rose-500',
    hoverBorder: 'hover:border-rose-300',
    getMetrics: (c) => [
      { label: '今月の報告', value: c.incidents.thisMonth },
      { label: '総件数', value: c.incidents.total },
    ],
  },
  {
    id: 'improvements',
    href: '/improvements',
    label: '改善',
    icon: Lightbulb,
    iconBg: 'bg-yellow-500',
    accentBar: 'bg-yellow-500',
    hoverBorder: 'hover:border-yellow-300',
    getMetrics: (c) => [
      { label: '採用済み', value: c.improvements.adopted },
      { label: 'レビュー待ち', value: c.improvements.pendingReview, highlight: c.improvements.pendingReview > 0 },
      { label: '総件数', value: c.improvements.total },
    ],
  },
  {
    id: 'documents',
    href: '/dashboard/docs',
    label: 'ドキュメント',
    icon: FolderOpen,
    iconBg: 'bg-sky-500',
    accentBar: 'bg-sky-500',
    hoverBorder: 'hover:border-sky-300',
    getMetrics: (c) => [
      { label: '未提出', value: c.documents.missing, highlight: c.documents.missing > 0 },
      { label: '提出済み', value: c.documents.submitted },
      { label: '総件数', value: c.documents.total },
    ],
  },
  {
    id: 'sales',
    href: '/sales',
    label: '営業',
    icon: Briefcase,
    iconBg: 'bg-indigo-500',
    accentBar: 'bg-indigo-500',
    hoverBorder: 'hover:border-indigo-300',
    getMetrics: (c) => [
      { label: '進行中案件', value: c.sales.activeDeals },
      { label: '停滞案件', value: c.sales.staleDeals, highlight: c.sales.staleDeals > 0 },
      { label: '取引先', value: c.sales.totalAccounts },
    ],
  },
  {
    id: 'os',
    href: '/dashboard/os',
    label: '経営OS',
    icon: Activity,
    iconBg: 'bg-teal-500',
    accentBar: 'bg-teal-500',
    hoverBorder: 'hover:border-teal-300',
    getMetrics: (c) => [
      { label: '今日のチェックイン', value: c.os.todayCheckins },
      { label: '注意', value: c.os.yellowRisk, highlight: c.os.yellowRisk > 0 },
      { label: '要対応', value: c.os.redRisk, highlight: c.os.redRisk > 0 },
    ],
  },
  {
    id: 'rankings',
    href: '/rankings',
    label: 'ランキング',
    icon: Trophy,
    iconBg: 'bg-orange-500',
    accentBar: 'bg-orange-500',
    hoverBorder: 'hover:border-orange-300',
    getMetrics: (c) => [
      { label: '参加者', value: c.rankings.participants },
      { label: '最高pt', value: c.rankings.topPoints },
      { label: '合計pt', value: c.rankings.totalPoints },
    ],
  },
];

// ── ヘルパー ──

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return 'お疲れさまです';
  if (hour < 11) return 'おはようございます';
  if (hour < 14) return 'こんにちは';
  if (hour < 18) return 'お疲れさまです';
  return 'お疲れさまです';
}

function formatDate(): string {
  const now = new Date();
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const weekday = weekdays[now.getDay()];
  return `${month}月${day}日（${weekday}）`;
}

const EMPTY_COUNTS: DashboardCounts = {
  prospects: { total: 0, newThisWeek: 0, byStatus: {} },
  vacancies: { totalCapacity: 0, totalVacant: 0, occupancyRate: 0, facilityCount: 0 },
  attendance: { todayClockedIn: 0, working: 0, pendingOvertime: 0 },
  approvals: { pending: 0, todayNew: 0, total: 0 },
  incidents: { thisMonth: 0, total: 0, fraudFlagged: 0 },
  improvements: { total: 0, adopted: 0, pendingReview: 0 },
  documents: { total: 0, missing: 0, submitted: 0 },
  sales: { activeDeals: 0, staleDeals: 0, totalAccounts: 0 },
  os: { todayCheckins: 0, yellowRisk: 0, redRisk: 0 },
  rankings: { participants: 0, topPoints: 0, totalPoints: 0 },
};

/**
 * Launch Mode ダッシュボード
 *
 * 全モジュールのカードにライブカウントを表示
 */
export function LaunchModeDashboard() {
  const { user } = useAuth();
  const apiFetch = useApiFetch();
  const [counts, setCounts] = useState<DashboardCounts>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchCounts = useCallback(async (isRefresh = false) => {
    if (!user?.tenantId) return;
    if (isRefresh) setRefreshing(true);

    try {
      const res = await apiFetch(`/api/dashboard/counts?tenantId=${encodeURIComponent(user.tenantId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCounts(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'データ取得エラー');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.tenantId, apiFetch]);

  useEffect(() => {
    fetchCounts();
    // 60秒ごとに自動更新
    const interval = setInterval(() => fetchCounts(), 60_000);
    return () => clearInterval(interval);
  }, [fetchCounts]);

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900" />
          <p className="text-sm text-zinc-500">読み込み中...</p>
        </div>
      </div>
    );
  }

  const greeting = getGreeting();
  const dateStr = formatDate();
  const displayName = user.name || user.email?.split('@')[0];

  return (
    <div className="min-h-screen bg-zinc-50 pb-24 md:pb-8">
      {/* ヘッダーエリア */}
      <div className="bg-white border-b border-zinc-100">
        <div className="max-w-3xl mx-auto px-4 pt-6 pb-5">
          <p className="text-xs font-medium text-zinc-400 mb-1">{dateStr}</p>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-zinc-900">
                {greeting}、{displayName}さん
              </h1>
              <p className="text-sm text-zinc-500 mt-0.5">
                今日も一日よろしくお願いします
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* 更新ボタン */}
              <button
                onClick={() => fetchCounts(true)}
                disabled={refreshing}
                className="flex w-9 h-9 items-center justify-center rounded-full bg-zinc-100 hover:bg-zinc-200 transition-colors disabled:opacity-50"
                title="データを更新"
              >
                <RefreshCw className={cn('w-4 h-4 text-zinc-600', refreshing && 'animate-spin')} />
              </button>

              {/* 通知（デスクトップのみ） */}
              <Link
                href="/dashboard/notifications"
                className="hidden md:flex w-9 h-9 items-center justify-center rounded-full bg-zinc-100 hover:bg-zinc-200 transition-colors"
              >
                <Bell className="w-4 h-4 text-zinc-600" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="max-w-3xl mx-auto px-4 py-5">
        {/* エラー表示 */}
        {error && (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* モジュールカード */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {MODULE_CARDS.map((card) => {
            const Icon = card.icon;
            const metrics = card.getMetrics(counts);

            return (
              <Link
                key={card.id}
                href={card.href}
                className={cn(
                  'group relative block overflow-hidden rounded-2xl border border-zinc-200 bg-white',
                  'transition-all duration-200 hover:shadow-md active:scale-[0.98]',
                  card.hoverBorder
                )}
              >
                {/* 左アクセントバー */}
                <div className={cn('absolute left-0 top-0 bottom-0 w-1', card.accentBar)} />

                <div className="p-4 pl-5">
                  {/* ヘッダー行 */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm', card.iconBg)}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="text-base font-bold text-zinc-900 flex-1">
                      {card.label}
                    </h3>
                    <ChevronRight className="w-5 h-5 text-zinc-300 group-hover:text-zinc-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                  </div>

                  {/* メトリクス行 */}
                  <div className="flex items-center gap-4">
                    {loading ? (
                      <div className="flex items-center gap-2 text-xs text-zinc-400">
                        <div className="w-3 h-3 border border-zinc-300 border-t-transparent rounded-full animate-spin" />
                        読み込み中...
                      </div>
                    ) : (
                      metrics.map((metric) => (
                        <div key={metric.label} className="flex items-center gap-1">
                          {metric.highlight && (
                            <TrendingUp className="w-3 h-3 text-red-500" />
                          )}
                          <span className={cn(
                            'text-lg font-bold tabular-nums',
                            metric.highlight ? 'text-red-600' : 'text-zinc-900'
                          )}>
                            {metric.value}
                          </span>
                          <span className="text-[10px] text-zinc-500 font-medium">
                            {metric.label}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* お知らせエリア */}
        <div className="mt-5 bg-white rounded-2xl border border-zinc-200 p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-zinc-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Bell className="w-4 h-4 text-zinc-500" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-700">ご利用ガイド</h3>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                全機能をご利用いただけます。
                操作でお困りの際は管理者までお問い合わせください。
              </p>
            </div>
          </div>
        </div>

        {/* Build Info */}
        <BuildInfo />
      </div>
    </div>
  );
}
