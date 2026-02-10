'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, Button } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { hasMinRole } from '@/lib/auth';
import { getAuth } from 'firebase/auth';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell,
  ComposedChart, Area,
} from 'recharts';
import {
  BarChart3,
  AlertTriangle,
  Users,
  TrendingUp,
  Download,
  ArrowLeft,
  AlertCircle,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

type ReportTab = 'incidents' | 'prospects' | 'staff';

const CHART_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899'];
const SEVERITY_COLORS: Record<string, string> = {
  '1': '#60a5fa', '2': '#34d399', '3': '#fbbf24', '4': '#fb923c', '5': '#f87171',
};

export default function ReportsPage() {
  return (
    <AuthGuard>
      <ReportsContent />
    </AuthGuard>
  );
}

function ReportsContent() {
  const { user } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<ReportTab>('incidents');
  const [months, setMonths] = useState(6);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  const getIdToken = useCallback(async () => {
    const auth = getAuth();
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('認証が必要です');
    return currentUser.getIdToken();
  }, []);

  const fetchReport = useCallback(async (reportType: ReportTab, monthCount: number) => {
    setLoading(true);
    setError(null);
    try {
      const idToken = await getIdToken();
      const response = await fetch(
        `/api/admin/reports?type=${reportType}&months=${monthCount}`,
        { headers: { Authorization: `Bearer ${idToken}` } }
      );
      if (!response.ok) throw new Error('レポートの取得に失敗しました');
      const result = await response.json();
      setData(result.data);
    } catch (err) {
      console.error('Report fetch error:', err);
      setError(err instanceof Error ? err.message : '取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    if (user) fetchReport(tab, months);
  }, [user, tab, months, fetchReport]);

  // CSV出力
  const handleExportCSV = () => {
    if (!data) return;
    let csv = '';

    if (tab === 'incidents') {
      const d = data as { monthlyTotals: Array<{ month: string; total: number }>; topCategories: Array<{ name: string; count: number; rate: number }> };
      csv = '\uFEFF月,合計件数\n';
      csv += d.monthlyTotals.map((r: { month: string; total: number }) => `${r.month},${r.total}`).join('\n');
      csv += '\n\nカテゴリ,件数,割合(%)\n';
      csv += d.topCategories.map((c: { name: string; count: number; rate: number }) => `${c.name},${c.count},${c.rate}`).join('\n');
    } else if (tab === 'prospects') {
      const d = data as { funnel: Array<{ status: string; count: number }>; monthlyTrend: Array<{ month: string; newCount: number; converted: number; closed: number }> };
      csv = '\uFEFFステータス,件数\n';
      csv += d.funnel.map((r: { status: string; count: number }) => `${r.status},${r.count}`).join('\n');
      csv += '\n\n月,新規,成約,見送り/クローズ\n';
      csv += d.monthlyTrend.map((r: { month: string; newCount: number; converted: number; closed: number }) => `${r.month},${r.newCount},${r.converted},${r.closed}`).join('\n');
    } else {
      const d = data as { staffSummary: Array<{ name: string; workDays: number; totalHours: number; overtimeHours: number; avgHoursPerDay: number; lateCount: number }> };
      csv = '\uFEFF氏名,出勤日数,総労働時間,残業時間,平均日勤時間,遅刻回数\n';
      csv += d.staffSummary.map((s: { name: string; workDays: number; totalHours: number; overtimeHours: number; avgHoursPerDay: number; lateCount: number }) =>
        `${s.name},${s.workDays},${s.totalHours},${s.overtimeHours},${s.avgHoursPerDay},${s.lateCount}`
      ).join('\n');
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report_${tab}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!user || !hasMinRole(user.role, 'leader')) {
    return (
      <>
        <Header />
        <main className="pb-20 md:pb-8">
          <div className="max-w-4xl mx-auto px-4 py-16 text-center">
            <AlertCircle className="w-16 h-16 mx-auto mb-4 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">アクセス権限がありません</h1>
            <p className="text-gray-500">リーダー以上の権限が必要です。</p>
          </div>
        </main>
      </>
    );
  }

  const TABS: { key: ReportTab; label: string; icon: React.ElementType }[] = [
    { key: 'incidents', label: 'インシデント傾向', icon: AlertTriangle },
    { key: 'prospects', label: 'コンバージョン分析', icon: TrendingUp },
    { key: 'staff', label: 'スタッフ稼働率', icon: Users },
  ];

  return (
    <>
      <Header />
      <main className="pb-20 md:pb-8">
        <div className="max-w-6xl mx-auto px-4 py-6">
          {/* ヘッダー */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.back()}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg">
                  <BarChart3 className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">レポート・分析</h1>
                  <p className="text-sm text-gray-500">傾向分析・コンバージョン・稼働率</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <select
                value={months}
                onChange={(e) => setMonths(Number(e.target.value))}
                className="h-10 px-3 border border-gray-200 rounded-lg text-sm"
              >
                <option value={3}>過去3ヶ月</option>
                <option value={6}>過去6ヶ月</option>
                <option value={12}>過去12ヶ月</option>
              </select>
              <Button variant="secondary" onClick={handleExportCSV} disabled={loading || !data}>
                <Download className="w-4 h-4 mr-2" />
                CSV
              </Button>
            </div>
          </div>

          {/* タブ */}
          <div className="flex border-b mb-6">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-6 py-3 border-b-2 font-medium text-sm transition-colors ${
                  tab === t.key
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <t.icon className="w-4 h-4" />
                {t.label}
              </button>
            ))}
          </div>

          {/* コンテンツ */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 mb-6">
              <AlertCircle className="w-5 h-5" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <Loading />
          ) : data ? (
            <>
              {tab === 'incidents' && <IncidentReport data={data} />}
              {tab === 'prospects' && <ProspectReport data={data} />}
              {tab === 'staff' && <StaffReport data={data} />}
            </>
          ) : null}
        </div>
      </main>
    </>
  );
}

// ========== インシデント傾向分析 ==========
function IncidentReport({ data }: { data: Record<string, unknown> }) {
  const d = data as {
    monthlyTotals: Array<Record<string, unknown>>;
    severityByMonth: Array<Record<string, unknown>>;
    topCategories: Array<{ name: string; count: number; rate: number }>;
    total: number;
  };

  return (
    <div className="space-y-6">
      {/* KPIカード */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="総件数" value={d.total} />
        <KPICard label="月平均" value={d.monthlyTotals.length > 0 ? Math.round(d.total / d.monthlyTotals.length) : 0} suffix="件/月" />
        <KPICard label="最多カテゴリ" value={d.topCategories[0]?.name || '-'} isText />
        <KPICard label="最多割合" value={d.topCategories[0]?.rate || 0} suffix="%" />
      </div>

      {/* 月別推移チャート */}
      <Card>
        <div className="p-5">
          <h3 className="font-semibold text-gray-900 mb-4">月別インシデント推移</h3>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={d.monthlyTotals}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Area type="monotone" dataKey="total" fill="#e0e7ff" stroke="#6366f1" name="合計" />
              <Line type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={2} dot name="合計" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* 重要度分布 */}
      <Card>
        <div className="p-5">
          <h3 className="font-semibold text-gray-900 mb-4">重要度別月次推移</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={d.severityByMonth}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Legend />
              {[1, 2, 3, 4, 5].map(s => (
                <Bar key={s} dataKey={String(s)} stackId="severity" fill={SEVERITY_COLORS[String(s)]} name={`Lv${s}`} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* カテゴリランキング */}
      <Card>
        <div className="p-5">
          <h3 className="font-semibold text-gray-900 mb-4">カテゴリ別割合</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={d.topCategories} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name }: { name?: string }) => name || ''}>
                  {d.topCategories.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-3">
              {d.topCategories.map((cat, i) => (
                <div key={cat.name} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <span className="flex-1 text-sm">{cat.name}</span>
                  <span className="text-sm font-medium">{cat.count}件</span>
                  <span className="text-sm text-gray-500">{cat.rate}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ========== コンバージョン分析 ==========
function ProspectReport({ data }: { data: Record<string, unknown> }) {
  const d = data as {
    funnel: Array<{ status: string; count: number }>;
    monthlyTrend: Array<{ month: string; newCount: number; converted: number; closed: number }>;
    conversionRate: number;
    totalProspects: number;
    topSources: Array<{ name: string; count: number; rate: number }>;
  };

  const activeFunnel = d.funnel.filter(f => f.count > 0 || ['新規受付', '見学設定済', '申込中', '入居決定', '見送り'].includes(f.status));

  return (
    <div className="space-y-6">
      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="総案件数" value={d.totalProspects} />
        <KPICard label="コンバージョン率" value={d.conversionRate} suffix="%" />
        <KPICard label="入居決定" value={d.funnel.find(f => f.status === '入居決定')?.count || 0} />
        <KPICard label="最多紹介元" value={d.topSources[0]?.name || '-'} isText />
      </div>

      {/* ステータスファネル */}
      <Card>
        <div className="p-5">
          <h3 className="font-semibold text-gray-900 mb-4">ステータスファネル</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={activeFunnel} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" fontSize={12} />
              <YAxis dataKey="status" type="category" fontSize={12} width={90} />
              <Tooltip />
              <Bar dataKey="count" name="件数" radius={[0, 4, 4, 0]}>
                {activeFunnel.map((entry, i) => (
                  <Cell key={i} fill={
                    entry.status === '入居決定' ? '#10b981' :
                    entry.status === '見送り' || entry.status === 'クローズ' ? '#9ca3af' :
                    CHART_COLORS[i % CHART_COLORS.length]
                  } />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* 月別推移 */}
      <Card>
        <div className="p-5">
          <h3 className="font-semibold text-gray-900 mb-4">月別新規・成約推移</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={d.monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Legend />
              <Bar dataKey="newCount" name="新規" fill="#6366f1" />
              <Bar dataKey="converted" name="成約" fill="#10b981" />
              <Bar dataKey="closed" name="見送り/クローズ" fill="#9ca3af" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* 紹介元ランキング */}
      <Card>
        <div className="p-5">
          <h3 className="font-semibold text-gray-900 mb-4">紹介元上位</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={d.topSources} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name }: { name?: string }) => name || ''}>
                  {d.topSources.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-3">
              {d.topSources.map((src, i) => (
                <div key={src.name} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <span className="flex-1 text-sm">{src.name}</span>
                  <span className="text-sm font-medium">{src.count}件</span>
                  <span className="text-sm text-gray-500">{src.rate}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ========== スタッフ稼働率 ==========
function StaffReport({ data }: { data: Record<string, unknown> }) {
  const d = data as {
    staffSummary: Array<{ userId: string; name: string; workDays: number; totalHours: number; overtimeHours: number; avgHoursPerDay: number; lateCount: number }>;
    monthlyTrend: Array<{ month: string; staffCount: number; totalHours: number; overtimeHours: number; avgHoursPerStaff: number; lateCount: number }>;
    totalStaff: number;
  };

  const totalOvertime = d.monthlyTrend.reduce((a, b) => a + b.overtimeHours, 0);
  const avgHours = d.monthlyTrend.length > 0
    ? Math.round(d.monthlyTrend.reduce((a, b) => a + b.avgHoursPerStaff, 0) / d.monthlyTrend.length * 10) / 10
    : 0;

  return (
    <div className="space-y-6">
      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="登録スタッフ" value={d.totalStaff} suffix="名" />
        <KPICard label="平均月間労働" value={avgHours} suffix="h/人" />
        <KPICard label="総残業時間" value={totalOvertime} suffix="h" />
        <KPICard label="遅刻合計" value={d.monthlyTrend.reduce((a, b) => a + b.lateCount, 0)} suffix="回" />
      </div>

      {/* 月別推移 */}
      <Card>
        <div className="p-5">
          <h3 className="font-semibold text-gray-900 mb-4">月別労働時間推移</h3>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={d.monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Legend />
              <Bar dataKey="totalHours" name="総労働時間" fill="#6366f1" />
              <Bar dataKey="overtimeHours" name="残業時間" fill="#f59e0b" />
              <Line type="monotone" dataKey="avgHoursPerStaff" name="平均(h/人)" stroke="#ef4444" strokeWidth={2} yAxisId={0} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* スタッフ別テーブル */}
      <Card>
        <div className="p-5">
          <h3 className="font-semibold text-gray-900 mb-4">スタッフ別稼働率</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 font-medium text-gray-500">氏名</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-500">出勤日数</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-500">総労働時間</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-500">残業時間</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-500">平均/日</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-500">遅刻</th>
                </tr>
              </thead>
              <tbody>
                {d.staffSummary.slice(0, 20).map((staff) => (
                  <tr key={staff.userId} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-3">{staff.name}</td>
                    <td className="py-2 px-3 text-right">{staff.workDays}日</td>
                    <td className="py-2 px-3 text-right">{staff.totalHours}h</td>
                    <td className="py-2 px-3 text-right">
                      <span className={staff.overtimeHours > 40 ? 'text-red-600 font-medium' : ''}>
                        {staff.overtimeHours}h
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right">{staff.avgHoursPerDay}h</td>
                    <td className="py-2 px-3 text-right">
                      <span className={staff.lateCount > 3 ? 'text-red-600 font-medium' : ''}>
                        {staff.lateCount}回
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {d.staffSummary.length > 20 && (
              <p className="text-sm text-gray-500 mt-2 text-center">上位20名を表示（全{d.staffSummary.length}名）</p>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

// ========== KPIカード ==========
function KPICard({ label, value, suffix, isText }: { label: string; value: number | string; suffix?: string; isText?: boolean }) {
  return (
    <Card>
      <div className="p-4">
        <p className="text-xs text-gray-500 mb-1">{label}</p>
        <p className={`font-bold ${isText ? 'text-lg' : 'text-2xl'}`}>
          {isText ? value : (typeof value === 'number' ? value.toLocaleString() : value)}
          {suffix && <span className="text-sm font-normal text-gray-500 ml-1">{suffix}</span>}
        </p>
      </div>
    </Card>
  );
}
