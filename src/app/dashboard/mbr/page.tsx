'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import type { Mbr } from '@/lib/mbr/types';

type ViewTab = 'summary' | 'funnel' | 'sales' | 'aiVp' | 'suggestions' | 'ops';

export default function MbrPage() {
  const { firebaseUser } = useAuth();
  const [mbr, setMbr] = useState<Mbr | null>(null);
  const [mbrList, setMbrList] = useState<Mbr[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ViewTab>('summary');

  const fetchMbrList = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/mbr?limit=12', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMbrList(data.mbrs || []);
        if (data.mbrs?.length > 0 && !mbr) {
          setMbr(data.mbrs[0]);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, mbr]);

  useEffect(() => {
    fetchMbrList();
  }, [fetchMbrList]);

  const handleGenerate = async (month?: string) => {
    if (!firebaseUser) return;
    setGenerating(true);
    setError(null);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/mbr', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(month ? { month } : {}),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate MBR');
      }
      const data = await res.json();
      setMbr(data.mbr);
      await fetchMbrList();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'MBR生成に失敗しました');
    } finally {
      setGenerating(false);
    }
  };

  const handleExportText = () => {
    if (!mbr) return;
    const lines: string[] = [];
    lines.push(`MBR ${mbr.month}`);
    lines.push(`生成日時: ${mbr.generatedAt}`);
    lines.push('');
    lines.push('== Executive Summary ==');
    mbr.sections.execSummary.forEach((l) => lines.push(`• ${l}`));
    lines.push('');
    lines.push('== 空室パイプライン ==');
    lines.push(`問い合わせ: ${mbr.sections.funnel.inquiries}件`);
    lines.push(`SLA超過率: ${mbr.sections.funnel.slaBreachRate}%`);
    lines.push(`平均クローズ日数: ${mbr.sections.funnel.avgDaysToClose}日`);
    lines.push('');
    lines.push('== 営業タスク ==');
    lines.push(`生成: ${mbr.sections.sales.generated}件, 完了: ${mbr.sections.sales.completed}件 (${mbr.sections.sales.completionRate}%)`);
    lines.push(`平均リードタイム: ${mbr.sections.sales.avgLeadTimeDays}日`);
    lines.push('');
    lines.push('== 来月のフォーカス ==');
    mbr.sections.nextMonthFocus.forEach((l) => lines.push(`• ${l}`));

    const blob = new Blob([lines.join('\n')], { type: 'text/plain; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MBR_${mbr.month}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportHTML = () => {
    if (!mbr) return;
    const html = `<!DOCTYPE html>
<html lang="ja"><head><meta charset="utf-8"><title>MBR ${mbr.month}</title>
<style>body{font-family:sans-serif;max-width:800px;margin:0 auto;padding:20px;font-size:14px}
h1{font-size:20px;border-bottom:2px solid #333;padding-bottom:8px}
h2{font-size:16px;color:#333;margin-top:24px}
.metric{display:inline-block;background:#f0f4ff;padding:8px 16px;border-radius:8px;margin:4px}
.metric .value{font-size:20px;font-weight:bold;color:#1e40af}
.metric .label{font-size:11px;color:#666}
ul{padding-left:20px}li{margin-bottom:4px}
table{border-collapse:collapse;width:100%;margin:8px 0}
th,td{border:1px solid #ddd;padding:6px 12px;text-align:left;font-size:13px}
th{background:#f5f5f5}</style></head><body>
<h1>MBR ${mbr.month}</h1>
<p style="color:#666;font-size:12px">生成: ${mbr.generatedAt}</p>
<h2>Executive Summary</h2>
<ul>${mbr.sections.execSummary.map((l) => `<li>${l}</li>`).join('')}</ul>
<h2>空室パイプライン</h2>
<div class="metric"><div class="value">${mbr.sections.funnel.inquiries}</div><div class="label">問い合わせ</div></div>
<div class="metric"><div class="value">${mbr.sections.funnel.slaBreachRate}%</div><div class="label">SLA超過率</div></div>
<div class="metric"><div class="value">${mbr.sections.funnel.avgDaysToClose}日</div><div class="label">平均クローズ</div></div>
<h2>営業タスク</h2>
<div class="metric"><div class="value">${mbr.sections.sales.generated}</div><div class="label">生成</div></div>
<div class="metric"><div class="value">${mbr.sections.sales.completed}</div><div class="label">完了</div></div>
<div class="metric"><div class="value">${mbr.sections.sales.completionRate}%</div><div class="label">完了率</div></div>
${mbr.sections.sales.resultDistribution.length > 0 ? `<table><tr><th>結果コード</th><th>件数</th><th>割合</th></tr>${mbr.sections.sales.resultDistribution.map((r) => `<tr><td>${r.code}</td><td>${r.count}</td><td>${r.percentage}%</td></tr>`).join('')}</table>` : ''}
<h2>AI VP 設定変更</h2>
<p>変更回数: ${mbr.sections.aiVpChanges.totalEvents}回</p>
<h2>改善提案</h2>
<p>未対応: ${mbr.sections.suggestions.openCount}, 採用: ${mbr.sections.suggestions.acceptedCount}, 却下: ${mbr.sections.suggestions.dismissedCount}</p>
<h2>運用</h2>
<p>実行回数: ${mbr.sections.ops.weeklyRunCount}, 失敗: ${mbr.sections.ops.failedRunCount}</p>
<h2>来月のフォーカス</h2>
<ul>${mbr.sections.nextMonthFocus.map((l) => `<li>${l}</li>`).join('')}</ul>
</body></html>`;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.onload = () => printWindow.print();
    }
  };

  const tabs: { key: ViewTab; label: string }[] = [
    { key: 'summary', label: 'サマリー' },
    { key: 'funnel', label: '空室' },
    { key: 'sales', label: '営業' },
    { key: 'aiVp', label: 'AI VP' },
    { key: 'suggestions', label: '提案' },
    { key: 'ops', label: '運用' },
  ];

  if (loading) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-8">
        <p className="text-zinc-500 text-sm">読み込み中...</p>
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-6 pb-8">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">月次改善レビュー (MBR)</h1>
          <p className="text-xs text-zinc-500 mt-1">Monthly Business Review</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => handleGenerate()}
            disabled={generating}
            className="text-xs"
          >
            {generating ? '生成中...' : '前月MBR生成'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          {error}
        </div>
      )}

      {/* MBR履歴 */}
      {mbrList.length > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto">
          {mbrList.map((m) => (
            <button
              key={m.id}
              onClick={() => setMbr(m)}
              className={`px-3 py-1.5 text-xs rounded-lg border whitespace-nowrap transition-colors ${
                mbr?.id === m.id
                  ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                  : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              {m.month}
            </button>
          ))}
        </div>
      )}

      {!mbr ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-zinc-500 text-sm mb-4">MBRがまだ生成されていません。</p>
            <Button onClick={() => handleGenerate()} disabled={generating}>
              {generating ? '生成中...' : '前月のMBRを生成する'}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* MBRメタ情報 */}
          <div className="mb-4 flex items-center gap-3">
            <Badge>{mbr.month}</Badge>
            <span className="text-xs text-zinc-400">
              生成: {new Date(mbr.generatedAt).toLocaleString('ja-JP')}
            </span>
            <div className="ml-auto flex gap-2 print:hidden">
              <button
                onClick={handleExportText}
                className="px-2 py-1 text-xs border border-zinc-200 rounded hover:bg-zinc-50"
              >
                テキスト出力
              </button>
              <button
                onClick={handleExportHTML}
                className="px-2 py-1 text-xs border border-zinc-200 rounded hover:bg-zinc-50"
              >
                PDF出力
              </button>
            </div>
          </div>

          {/* タブ */}
          <div className="flex gap-1 mb-4 border-b border-zinc-200">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-indigo-500 text-indigo-700'
                    : 'border-transparent text-zinc-500 hover:text-zinc-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* サマリータブ */}
          {activeTab === 'summary' && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm">Executive Summary</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <ul className="space-y-2">
                    {mbr.sections.execSummary.map((line, i) => (
                      <li key={i} className="text-xs text-zinc-700 flex items-start gap-2">
                        <span className="text-indigo-500 mt-0.5">•</span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm">来月のフォーカス</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <ul className="space-y-2">
                    {mbr.sections.nextMonthFocus.map((line, i) => (
                      <li key={i} className="text-xs text-zinc-700 flex items-start gap-2">
                        <span className="text-orange-500 mt-0.5">▶</span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {/* KPI概要 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricCard label="空室問い合わせ" value={mbr.sections.funnel.inquiries} unit="件" />
                <MetricCard label="SLA超過率" value={mbr.sections.funnel.slaBreachRate} unit="%" alert={mbr.sections.funnel.slaBreachRate > 20} />
                <MetricCard label="営業完了率" value={mbr.sections.sales.completionRate} unit="%" alert={mbr.sections.sales.completionRate < 60} />
                <MetricCard label="運用失敗" value={mbr.sections.ops.failedRunCount} unit="回" alert={mbr.sections.ops.failedRunCount > 0} />
              </div>
            </div>
          )}

          {/* 空室タブ */}
          {activeTab === 'funnel' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <MetricCard label="問い合わせ" value={mbr.sections.funnel.inquiries} unit="件" />
                <MetricCard label="SLA超過" value={mbr.sections.funnel.slaBreachCount} unit="件" />
                <MetricCard label="平均クローズ" value={mbr.sections.funnel.avgDaysToClose} unit="日" />
              </div>

              {Object.keys(mbr.sections.funnel.byStatus).length > 0 && (
                <Card>
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm">ステータス別</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(mbr.sections.funnel.byStatus).map(([status, count]) => (
                        <div key={status} className="px-3 py-1.5 bg-zinc-50 rounded text-xs">
                          <span className="text-zinc-500">{status}:</span>{' '}
                          <span className="font-medium">{count}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {mbr.sections.funnel.refTop.length > 0 && (
                <Card>
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm">紹介元Top5</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-1 text-zinc-500">紹介元</th>
                          <th className="text-right py-1 text-zinc-500">問い合わせ</th>
                          <th className="text-right py-1 text-zinc-500">成約</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mbr.sections.funnel.refTop.map((r) => (
                          <tr key={r.ref} className="border-b border-zinc-100">
                            <td className="py-1.5">{r.ref}</td>
                            <td className="text-right">{r.inquiries}</td>
                            <td className="text-right">{r.accepted}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* 営業タブ */}
          {activeTab === 'sales' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <MetricCard label="生成" value={mbr.sections.sales.generated} unit="件" />
                <MetricCard label="完了" value={mbr.sections.sales.completed} unit="件" />
                <MetricCard label="完了率" value={mbr.sections.sales.completionRate} unit="%" />
              </div>
              <MetricCard label="平均リードタイム" value={mbr.sections.sales.avgLeadTimeDays} unit="日" />

              {mbr.sections.sales.resultDistribution.length > 0 && (
                <Card>
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm">結果コード分布</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-1 text-zinc-500">コード</th>
                          <th className="text-right py-1 text-zinc-500">件数</th>
                          <th className="text-right py-1 text-zinc-500">割合</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mbr.sections.sales.resultDistribution.map((r) => (
                          <tr key={r.code} className="border-b border-zinc-100">
                            <td className="py-1.5">{r.code}</td>
                            <td className="text-right">{r.count}</td>
                            <td className="text-right">{r.percentage}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* AI VPタブ */}
          {activeTab === 'aiVp' && (
            <div className="space-y-4">
              <MetricCard label="設定変更回数" value={mbr.sections.aiVpChanges.totalEvents} unit="回" />

              {Object.keys(mbr.sections.aiVpChanges.byAction).length > 0 && (
                <Card>
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm">アクション別</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(mbr.sections.aiVpChanges.byAction).map(([action, count]) => (
                        <div key={action} className="px-3 py-1.5 bg-purple-50 rounded text-xs">
                          <span className="text-purple-600">{action}:</span>{' '}
                          <span className="font-medium">{count}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {mbr.sections.aiVpChanges.recentEvents.length > 0 && (
                <Card>
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm">最近のイベント</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-2">
                    {mbr.sections.aiVpChanges.recentEvents.map((e) => (
                      <div key={e.id} className="p-2 bg-zinc-50 rounded text-xs">
                        <div className="flex justify-between">
                          <Badge>{e.action}</Badge>
                          <span className="text-zinc-400">{new Date(e.createdAt).toLocaleDateString('ja-JP')}</span>
                        </div>
                        {e.note && <p className="mt-1 text-zinc-600">{e.note}</p>}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* 提案タブ */}
          {activeTab === 'suggestions' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <MetricCard label="未対応" value={mbr.sections.suggestions.openCount} unit="件" alert={mbr.sections.suggestions.openCount > 0} />
                <MetricCard label="採用" value={mbr.sections.suggestions.acceptedCount} unit="件" />
                <MetricCard label="却下" value={mbr.sections.suggestions.dismissedCount} unit="件" />
              </div>

              {mbr.sections.suggestions.acceptedKeys.length > 0 && (
                <Card>
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm">採用された改善キー</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="flex flex-wrap gap-2">
                      {mbr.sections.suggestions.acceptedKeys.map((key) => (
                        <Badge key={key}>{key}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* 運用タブ */}
          {activeTab === 'ops' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricCard label="実行回数" value={mbr.sections.ops.weeklyRunCount} unit="回" />
                <MetricCard label="失敗" value={mbr.sections.ops.failedRunCount} unit="回" alert={mbr.sections.ops.failedRunCount > 0} />
                <MetricCard label="処理アイテム" value={mbr.sections.ops.totalItemsProcessed} unit="件" />
                <MetricCard label="アラート生成" value={mbr.sections.ops.totalAlertsCreated} unit="件" />
              </div>

              {mbr.sections.ops.failedSteps.length > 0 && (
                <Card>
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm">失敗ステップ</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="flex flex-wrap gap-2">
                      {mbr.sections.ops.failedSteps.map((step) => (
                        <Badge key={step}>{step}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* フッター */}
          <div className="mt-8 text-center print:hidden">
            <div className="flex justify-center gap-4 text-sm text-zinc-400">
              <Link href="/dashboard/wbr" className="hover:text-zinc-600">WBR</Link>
              <span>・</span>
              <Link href="/dashboard/kpi" className="hover:text-zinc-600">KPI</Link>
              <span>・</span>
              <Link href="/dashboard/leads/suggestions" className="hover:text-zinc-600">leadScore提案</Link>
              <span>・</span>
              <Link href="/dashboard/ai-vp" className="hover:text-zinc-600">AI副社長</Link>
            </div>
          </div>
        </>
      )}
    </main>
  );
}

/** メトリクスカード */
function MetricCard({ label, value, unit, alert }: { label: string; value: number; unit: string; alert?: boolean }) {
  return (
    <Card className={alert ? 'border-red-200' : ''}>
      <CardContent className="p-3 text-center">
        <p className="text-xs text-zinc-500 mb-1">{label}</p>
        <p className={`text-xl font-bold ${alert ? 'text-red-600' : 'text-zinc-900'}`}>
          {value}
          <span className="text-xs font-normal text-zinc-400 ml-0.5">{unit}</span>
        </p>
      </CardContent>
    </Card>
  );
}
