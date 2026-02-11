'use client';

import { useState, useEffect } from 'react';
import type { WBRReport } from '@/lib/wbr-generator';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@/components/ui';
import {
  generateWBRHistory,
  exportWBRToText,
  exportWBRToHTML,
} from '@/lib/wbr-generator';
import {
  WbrHeader,
  WbrPrintHeader,
  WbrConclusion,
  WbrHighlights,
  WbrRisks,
  WbrTop3,
  WbrExecution,
} from '@/components/wbr';
import {
  Calendar,
  Brain,
  ChevronRight,
} from 'lucide-react';

/**
 * WBR表示モード
 * - executive: 経営向け（数字多め、意思決定寄り）
 * - manager: 運用向け（滞留/期限超過/未分類の解消）
 * - compact: リーダー/スタッフ向け（ノイズ削減）
 */
type WbrMode = 'executive' | 'manager' | 'compact';

/**
 * WBRページ
 *
 * Implementation Ticket 047: 会議でそのまま投影・配布できる見た目
 */
export default function WbrPage() {
  const searchParams = useSearchParams();
  const modeParam = searchParams.get('mode') as WbrMode | null;

  const [selectedReportIndex, setSelectedReportIndex] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [mode, setMode] = useState<WbrMode>(modeParam ?? 'executive');
  const [wbrHistory, setWbrHistory] = useState<WBRReport[]>([]);

  // WBRを生成
  useEffect(() => {
    setWbrHistory(generateWBRHistory(8));
  }, []);
  const currentReport = wbrHistory[selectedReportIndex];

  if (!currentReport) {
    return <main className="pb-8"><div className="max-w-4xl mx-auto px-4 py-6">読み込み中...</div></main>;
  }

  // テキスト出力
  const handleExportText = () => {
    const text = exportWBRToText(currentReport);
    const blob = new Blob([text], { type: 'text/plain; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `WBR_${currentReport.weekStart}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // PDF出力（印刷ダイアログ）
  const handleExportPDF = () => {
    const html = exportWBRToHTML(currentReport);
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  };

  // 事業別Top3をWBR用に変換
  const businessTop3Items = currentReport.businessTop3?.topBusinessRisks.map(r => ({
    businessUnitId: r.name,
    businessUnitName: r.name,
    topIssue: r.topAction ?? '対応中',
    severity: (r.riskLevel === 'critical' ? 'critical' : r.riskLevel === 'warning' ? 'warning' : 'info') as 'critical' | 'warning' | 'info',
  })) ?? [];

  // AI生成チケットを変換
  const generatedTickets = currentReport.generatedTickets?.tickets.map(t => ({
    id: t.id,
    title: t.title,
    businessUnitName: t.businessUnitId ?? '未分類',
    createdAt: new Date().toISOString(),
  })) ?? [];

  return (
    <main className="pb-8">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* 印刷用ヘッダー */}
        <WbrPrintHeader
          weekLabel={currentReport.weekLabel}
          weekStart={currentReport.weekStart}
          generatedAt={currentReport.generatedAt}
        />

        {/* 画面用ヘッダー */}
        <WbrHeader
          weekLabel={currentReport.weekLabel}
          weekStart={currentReport.weekStart}
          generatedAt={currentReport.generatedAt}
          onExportText={handleExportText}
          onExportPDF={handleExportPDF}
          onShowHistory={() => setShowHistory(!showHistory)}
          showHistoryButton={true}
        />

        {/* モード切替（役職別） */}
        <div className="flex gap-2 mb-4 print:hidden">
          <button
            onClick={() => setMode('executive')}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
              mode === 'executive'
                ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
            }`}
          >
            経営向け
          </button>
          <button
            onClick={() => setMode('manager')}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
              mode === 'manager'
                ? 'bg-blue-100 border-blue-300 text-blue-700'
                : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
            }`}
          >
            管理者向け
          </button>
          <button
            onClick={() => setMode('compact')}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
              mode === 'compact'
                ? 'bg-green-100 border-green-300 text-green-700'
                : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
            }`}
          >
            コンパクト
          </button>
        </div>

        {/* 過去のWBR履歴 */}
        {showHistory && (
          <Card className="mb-4 print:hidden">
            <CardHeader className="py-2 px-4">
              <CardTitle className="text-sm">過去のWBR</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="grid grid-cols-4 gap-2">
                {wbrHistory.map((report, index) => (
                  <button
                    key={report.id}
                    onClick={() => {
                      setSelectedReportIndex(index);
                      setShowHistory(false);
                    }}
                    className={`p-2 text-left rounded-lg border transition-all text-xs ${
                      index === selectedReportIndex
                        ? 'bg-blue-50 border-blue-300'
                        : 'hover:bg-zinc-50 border-zinc-200'
                    }`}
                  >
                    <p className="font-medium">{report.weekStart}〜</p>
                    <p className="text-zinc-500">
                      {index === 0 ? '今週' : `${index}週前`}
                    </p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ===== ファーストビュー（1ページ目） ===== */}
        <section className="print:break-after-page">
          {/* 1. 結論（Good/Bad/Next） */}
          <WbrConclusion
            overview={currentReport.executiveSummary.overview}
            goodPoints={currentReport.executiveSummary.goodPoints}
            issues={currentReport.executiveSummary.issues}
            nextActions={currentReport.nextActions.top3.map(a => a.title)}
          />

          {/* 2. リスク（コンパクト版） */}
          <WbrRisks
            persistentRisks={currentReport.riskAlerts.persistentRisks}
            newRisks={currentReport.riskAlerts.newRisks}
            alertSummary={currentReport.riskAlerts.alertSummary}
            unclassifiedCounts={currentReport.riskAlerts.unclassifiedCounts}
            compact={mode === 'compact'}
          />

          {/* 3. 来週Top3（コンパクトモードではTop1のみ） */}
          <WbrTop3
            top3={currentReport.nextActions.top3}
            businessTop3={businessTop3Items}
            compact={mode === 'compact'}
          />

          {/* 4. 実行状況（コンパクト版） */}
          <WbrExecution
            nearCompletion={currentReport.progressReview.nearCompletion}
            stalled={currentReport.progressReview.stalled}
            generatedTickets={generatedTickets}
            completedThisWeek={currentReport.progressReview.nearCompletion.length}
            compact={mode === 'compact'}
          />
        </section>

        {/* ===== 詳細（2ページ目以降） ===== */}
        {mode !== 'compact' && (
          <section>
            {/* KPIハイライト */}
            <WbrHighlights
              highlights={currentReport.kpiHighlights.highlights}
              maxItems={mode === 'executive' ? 6 : 4}
            />

            {/* 進捗レビュー（詳細） */}
            {mode === 'executive' && (
              <Card className="mb-4 print:break-inside-avoid">
                <CardContent className="p-4">
                  <h3 className="text-sm font-bold text-zinc-800 mb-3 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-violet-600" />
                    進捗レビュー（詳細）
                  </h3>

                  {currentReport.progressReview.newlyStarted.length > 0 && (
                    <div className="mb-3">
                      <h4 className="text-xs font-medium text-blue-700 mb-1.5">
                        今週着手
                      </h4>
                      <div className="space-y-1">
                        {currentReport.progressReview.newlyStarted.map((item, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between p-2 bg-blue-50 rounded text-xs print:bg-white print:border print:border-zinc-200"
                          >
                            <span className="font-medium text-zinc-700">{item.name}</span>
                            <div className="flex items-center gap-1 text-zinc-500">
                              <span>{item.from}</span>
                              <ChevronRight className="w-3 h-3" />
                              <span className="text-blue-600">{item.to}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* AI副社長コメント */}
            <Card className="mb-4 border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-violet-50 print:border print:border-zinc-300 print:bg-white print:break-inside-avoid">
              <CardContent className="p-4">
                <h3 className="text-sm font-bold text-purple-800 mb-3 flex items-center gap-2">
                  <Brain className="w-4 h-4" />
                  AI副社長コメント
                </h3>
                <div className="space-y-3">
                  <div className="p-3 bg-white rounded-lg border border-purple-200 print:border-zinc-300">
                    <h4 className="text-xs font-medium text-purple-700 mb-1">
                      今週の判断総括
                    </h4>
                    <p className="text-xs text-zinc-700 leading-relaxed">
                      {currentReport.aiComment.judgmentSummary}
                    </p>
                  </div>
                  <div className="p-3 bg-purple-100 rounded-lg border border-purple-300 print:bg-white print:border-zinc-300">
                    <h4 className="text-xs font-medium text-purple-800 mb-1">
                      来週への示唆
                    </h4>
                    <p className="text-xs text-purple-900 font-medium leading-relaxed">
                      {currentReport.aiComment.nextWeekInsight}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        {/* フッター */}
        <div className="mt-6 text-center print:hidden">
          <p className="text-xs text-zinc-400 mb-4">
            Generated: {currentReport.generatedAt.toLocaleString('ja-JP')}
          </p>
          <div className="flex justify-center gap-4 text-sm text-zinc-400">
            <Link href="/dashboard/kpi" className="hover:text-zinc-600">
              KPIダッシュボード
            </Link>
            <span>・</span>
            <Link href="/dashboard/kpi-dictionary" className="hover:text-zinc-600">
              KPI辞書
            </Link>
            <span>・</span>
            <Link href="/dashboard/executive-summary" className="hover:text-zinc-600">
              経営サマリー
            </Link>
            <span>・</span>
            <Link href="/dashboard/ai-vp" className="hover:text-zinc-600">
              AI副社長
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
