'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui';
import {
  Eye,
  MousePointer,
  Send,
  TrendingUp,
  TrendingDown,
  Building2,
  Calendar,
  BarChart3,
  ArrowUpRight,
  Minus,
} from 'lucide-react';
import type { VacancyAnalyticsSummary } from '@/lib/vacancyAnalytics/types';

/**
 * 空室コンバージョン分析ダッシュボード
 *
 * Ticket 072: /vacancies CTA最適化
 */
export default function VacancyAnalyticsPage() {
  const [summary, setSummary] = useState<VacancyAnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d'>('30d');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const endDate = new Date().toISOString().split('T')[0];
        const startDateObj = new Date();
        if (dateRange === '7d') {
          startDateObj.setDate(startDateObj.getDate() - 7);
        } else if (dateRange === '30d') {
          startDateObj.setDate(startDateObj.getDate() - 30);
        } else {
          startDateObj.setDate(startDateObj.getDate() - 90);
        }
        const startDate = startDateObj.toISOString().split('T')[0];

        const res = await fetch(`/api/vacancy-analytics/summary?startDate=${startDate}&endDate=${endDate}`);
        const data = await res.json();
        setSummary(data);
      } catch (error) {
        console.error('Fetch error:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [dateRange]);

  if (loading) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-zinc-200 rounded w-1/3"></div>
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-zinc-200 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <Card className="p-8 text-center">
          <BarChart3 className="w-12 h-12 mx-auto mb-3 text-zinc-300" />
          <p className="text-zinc-500">データがありません</p>
        </Card>
      </div>
    );
  }

  const { totals, byBusinessUnit, daily } = summary;

  // 日次グラフの最大値
  const maxDaily = Math.max(
    ...daily.map((d) => Math.max(d.views, d.clicks * 5, d.submits * 10)),
    1
  );

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-blue-600" />
            空室コンバージョン分析
          </h1>
          <p className="text-zinc-500 mt-1">
            {summary.period.start} 〜 {summary.period.end}
          </p>
        </div>

        {/* 期間選択 */}
        <div className="flex items-center gap-2 bg-zinc-100 rounded-lg p-1">
          {(['7d', '30d', '90d'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setDateRange(range)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                dateRange === range
                  ? 'bg-white shadow text-zinc-900'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              {range === '7d' ? '7日間' : range === '30d' ? '30日間' : '90日間'}
            </button>
          ))}
        </div>
      </div>

      {/* KPIカード */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* 表示数 */}
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Eye className="w-5 h-5 text-blue-600" />
            </div>
            <span className="text-sm text-zinc-500">表示数</span>
          </div>
          <div className="text-3xl font-bold">{totals.views.toLocaleString()}</div>
        </Card>

        {/* クリック数 */}
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-amber-50 rounded-lg">
              <MousePointer className="w-5 h-5 text-amber-600" />
            </div>
            <span className="text-sm text-zinc-500">クリック数</span>
          </div>
          <div className="text-3xl font-bold">{totals.clicks.toLocaleString()}</div>
          <div className="flex items-center gap-1 text-sm mt-1">
            <span className={totals.clickRate >= 5 ? 'text-green-600' : 'text-zinc-500'}>
              {totals.clickRate}%
            </span>
            <span className="text-zinc-400">CTR</span>
          </div>
        </Card>

        {/* 送信数 */}
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-50 rounded-lg">
              <Send className="w-5 h-5 text-green-600" />
            </div>
            <span className="text-sm text-zinc-500">送信数</span>
          </div>
          <div className="text-3xl font-bold">{totals.submits.toLocaleString()}</div>
          <div className="flex items-center gap-1 text-sm mt-1">
            <span className={totals.submitRate >= 30 ? 'text-green-600' : 'text-zinc-500'}>
              {totals.submitRate}%
            </span>
            <span className="text-zinc-400">CVR（クリック→送信）</span>
          </div>
        </Card>

        {/* 総コンバージョン率 */}
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-purple-50 rounded-lg">
              <TrendingUp className="w-5 h-5 text-purple-600" />
            </div>
            <span className="text-sm text-zinc-500">総CVR</span>
          </div>
          <div className="text-3xl font-bold">{totals.conversionRate}%</div>
          <div className="text-xs text-zinc-400 mt-1">表示→送信</div>
        </Card>
      </div>

      {/* 日次推移グラフ */}
      <Card className="p-5">
        <h2 className="font-bold mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-zinc-400" />
          日次推移
        </h2>
        <div className="space-y-2">
          {/* 凡例 */}
          <div className="flex items-center gap-4 text-xs text-zinc-500 mb-3">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 bg-blue-400 rounded"></span>
              表示
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 bg-amber-400 rounded"></span>
              クリック
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 bg-green-500 rounded"></span>
              送信
            </span>
          </div>

          {/* 簡易バーグラフ */}
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {daily.slice(-14).map((d) => {
              const dateLabel = new Date(d.date).toLocaleDateString('ja-JP', {
                month: 'numeric',
                day: 'numeric',
              });
              return (
                <div key={d.date} className="flex items-center gap-2 text-sm">
                  <span className="w-12 text-zinc-500 text-xs">{dateLabel}</span>
                  <div className="flex-1 flex items-center gap-1 h-6">
                    <div
                      className="h-4 bg-blue-400 rounded"
                      style={{ width: `${(d.views / maxDaily) * 100}%`, minWidth: d.views > 0 ? '4px' : '0' }}
                      title={`表示: ${d.views}`}
                    />
                    <div
                      className="h-4 bg-amber-400 rounded"
                      style={{ width: `${(d.clicks * 5 / maxDaily) * 100}%`, minWidth: d.clicks > 0 ? '4px' : '0' }}
                      title={`クリック: ${d.clicks}`}
                    />
                    <div
                      className="h-4 bg-green-500 rounded"
                      style={{ width: `${(d.submits * 10 / maxDaily) * 100}%`, minWidth: d.submits > 0 ? '4px' : '0' }}
                      title={`送信: ${d.submits}`}
                    />
                  </div>
                  <span className="w-20 text-right text-xs text-zinc-400">
                    {d.views}/{d.clicks}/{d.submits}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* 事業単位別ランキング */}
      {byBusinessUnit.length > 0 && (
        <Card className="p-5">
          <h2 className="font-bold mb-4 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-zinc-400" />
            事業単位別ランキング
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-zinc-500 text-left">
                  <th className="pb-2 font-medium">#</th>
                  <th className="pb-2 font-medium">事業単位</th>
                  <th className="pb-2 font-medium text-right">表示</th>
                  <th className="pb-2 font-medium text-right">クリック</th>
                  <th className="pb-2 font-medium text-right">送信</th>
                  <th className="pb-2 font-medium text-right">CTR</th>
                  <th className="pb-2 font-medium text-right">CVR</th>
                </tr>
              </thead>
              <tbody>
                {byBusinessUnit.map((bu, index) => (
                  <tr key={bu.businessUnitId} className="border-b last:border-0 hover:bg-zinc-50">
                    <td className="py-3 text-zinc-400">{index + 1}</td>
                    <td className="py-3 font-medium">{bu.businessUnitName || bu.businessUnitId}</td>
                    <td className="py-3 text-right">{bu.views}</td>
                    <td className="py-3 text-right">{bu.clicks}</td>
                    <td className="py-3 text-right font-medium text-green-600">{bu.submits}</td>
                    <td className="py-3 text-right">
                      <span className={`flex items-center justify-end gap-1 ${bu.clickRate >= 5 ? 'text-green-600' : ''}`}>
                        {bu.clickRate >= 5 ? <ArrowUpRight className="w-3 h-3" /> : <Minus className="w-3 h-3 text-zinc-400" />}
                        {bu.clickRate}%
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <span className={`flex items-center justify-end gap-1 ${bu.submitRate >= 30 ? 'text-green-600' : ''}`}>
                        {bu.submitRate >= 30 ? <ArrowUpRight className="w-3 h-3" /> : <Minus className="w-3 h-3 text-zinc-400" />}
                        {bu.submitRate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {byBusinessUnit.length === 0 && (
            <div className="text-center py-8 text-zinc-400">
              データがありません
            </div>
          )}
        </Card>
      )}

      {/* 改善のヒント */}
      <Card className="p-5 bg-blue-50 border-blue-200">
        <h2 className="font-bold mb-3 flex items-center gap-2 text-blue-800">
          <TrendingUp className="w-5 h-5" />
          改善のヒント
        </h2>
        <ul className="space-y-2 text-sm text-blue-900">
          {totals.clickRate < 3 && (
            <li className="flex items-start gap-2">
              <TrendingDown className="w-4 h-4 mt-0.5 text-amber-500 shrink-0" />
              <span>
                <strong>CTR（{totals.clickRate}%）が低め</strong>：
                問い合わせボタンの視認性を改善するか、空室情報の魅力をアップしましょう
              </span>
            </li>
          )}
          {totals.submitRate < 20 && totals.clicks > 0 && (
            <li className="flex items-start gap-2">
              <TrendingDown className="w-4 h-4 mt-0.5 text-amber-500 shrink-0" />
              <span>
                <strong>送信完了率（{totals.submitRate}%）が低め</strong>：
                フォームが複雑な可能性があります。入力項目を減らしてみましょう
              </span>
            </li>
          )}
          {totals.conversionRate >= 1 && (
            <li className="flex items-start gap-2">
              <TrendingUp className="w-4 h-4 mt-0.5 text-green-500 shrink-0" />
              <span>
                <strong>総CVR（{totals.conversionRate}%）は良好</strong>：
                現在の導線は機能しています。継続的にモニタリングしましょう
              </span>
            </li>
          )}
          {totals.views === 0 && (
            <li className="flex items-start gap-2">
              <Eye className="w-4 h-4 mt-0.5 text-zinc-400 shrink-0" />
              <span>
                まだデータがありません。/vacancies ページへのアクセスを増やしましょう
              </span>
            </li>
          )}
        </ul>
      </Card>
    </div>
  );
}
