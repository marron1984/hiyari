'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@/components/ui';
import {
  generateWBR,
  generateWBRHistory,
  exportWBRToText,
  exportWBRToHTML,
  type WBRReport,
} from '@/lib/wbr-generator';
import {
  Calendar,
  FileText,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle,
  Target,
  Brain,
  ChevronRight,
  ChevronDown,
  Download,
  History,
  Zap,
  Clock,
  Shield,
  BookOpen,
} from 'lucide-react';

export default function WbrPage() {
  const [selectedReportIndex, setSelectedReportIndex] = useState(0);
  const [showHistory, setShowHistory] = useState(false);

  // WBRを生成
  const wbrHistory = useMemo(() => generateWBRHistory(8), []);
  const currentReport = wbrHistory[selectedReportIndex];

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

  // 方向アイコン
  const DirectionIcon = ({ direction }: { direction: 'up' | 'down' | 'stable' }) => {
    if (direction === 'up') return <TrendingUp className="w-4 h-4 text-green-600" />;
    if (direction === 'down') return <TrendingDown className="w-4 h-4 text-red-600" />;
    return <Minus className="w-4 h-4 text-zinc-400" />;
  };

  return (
    <main className="pb-8">
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* ヘッダー */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg">
              <Calendar className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Weekly Business Review</h1>
              <p className="text-sm text-gray-500">{currentReport.weekLabel}</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowHistory(!showHistory)}
            >
              <History className="w-4 h-4 mr-1" />
              過去のWBR
              {showHistory ? (
                <ChevronDown className="w-4 h-4 ml-1" />
              ) : (
                <ChevronRight className="w-4 h-4 ml-1" />
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportText}>
              <Download className="w-4 h-4 mr-1" />
              テキスト
            </Button>
            <Button size="sm" onClick={handleExportPDF}>
              <FileText className="w-4 h-4 mr-1" />
              PDF出力
            </Button>
          </div>
        </div>

        {/* 過去のWBR履歴 */}
        {showHistory && (
          <Card className="mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">過去のWBR</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {wbrHistory.map((report, index) => (
                  <button
                    key={report.id}
                    onClick={() => {
                      setSelectedReportIndex(index);
                      setShowHistory(false);
                    }}
                    className={`p-3 text-left rounded-lg border transition-all ${
                      index === selectedReportIndex
                        ? 'bg-blue-50 border-blue-300'
                        : 'hover:bg-zinc-50 border-zinc-200'
                    }`}
                  >
                    <p className="font-medium text-sm">
                      {report.weekStart}〜
                    </p>
                    <p className="text-xs text-zinc-500">
                      {index === 0 ? '今週' : `${index}週前`}
                    </p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ===== ① 週次サマリー ===== */}
        <Card className="mb-6 border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-blue-500 rounded-lg">
                <FileText className="w-4 h-4 text-white" />
              </div>
              <CardTitle className="text-lg text-blue-800">
                1. Executive Summary
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="bg-white p-4 rounded-lg border border-blue-100 mb-4">
              <p className="text-zinc-700 leading-relaxed">
                {currentReport.executiveSummary.overview}
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-semibold text-green-700 mb-2 flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" />
                  良かった点
                </h4>
                <div className="space-y-2">
                  {currentReport.executiveSummary.goodPoints.map((point, i) => (
                    <div
                      key={i}
                      className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm"
                    >
                      {point}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-amber-700 mb-2 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" />
                  課題点
                </h4>
                <div className="space-y-2">
                  {currentReport.executiveSummary.issues.map((issue, i) => (
                    <div
                      key={i}
                      className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm"
                    >
                      {issue}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ===== ② KPIハイライト ===== */}
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-emerald-500 rounded-lg">
                  <TrendingUp className="w-4 h-4 text-white" />
                </div>
                <CardTitle className="text-lg">2. KPIハイライト</CardTitle>
              </div>
              <Link href="/dashboard/kpi-dictionary" className="text-xs text-emerald-600 hover:text-emerald-800 flex items-center gap-1">
                <BookOpen className="w-3 h-3" />
                KPI辞書
              </Link>
            </div>
            <p className="text-sm text-zinc-500 mt-1">
              今週変動があった重要指標
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {currentReport.kpiHighlights.highlights.map((kpi, i) => (
                <div
                  key={i}
                  className="p-4 border rounded-lg bg-zinc-50 hover:bg-white transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-zinc-600">
                      {kpi.name}
                    </span>
                    <Badge
                      className={`text-xs ${
                        kpi.impact === 'high'
                          ? 'bg-red-100 text-red-700'
                          : kpi.impact === 'medium'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-zinc-100 text-zinc-700'
                      }`}
                    >
                      影響度: {kpi.impact === 'high' ? '高' : kpi.impact === 'medium' ? '中' : '低'}
                    </Badge>
                  </div>
                  <div className="flex items-end gap-2 mb-2">
                    <span className="text-3xl font-bold text-zinc-800">
                      {kpi.currentValue}
                    </span>
                    <div className="flex items-center gap-1 mb-1">
                      <DirectionIcon direction={kpi.direction} />
                      <span className="text-sm text-zinc-500">
                        前週: {kpi.previousValue}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-600">{kpi.insight}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ===== ③ 進捗レビュー ===== */}
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-violet-500 rounded-lg">
                <Zap className="w-4 h-4 text-white" />
              </div>
              <CardTitle className="text-lg">3. 進捗レビュー</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {currentReport.progressReview.nearCompletion.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-violet-700 mb-2">
                    🏁 完了間近
                  </h4>
                  <div className="space-y-2">
                    {currentReport.progressReview.nearCompletion.map((item, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-3 bg-violet-50 border border-violet-200 rounded-lg"
                      >
                        <span className="font-medium">{item.name}</span>
                        <Badge className="bg-violet-100 text-violet-700">
                          {item.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {currentReport.progressReview.newlyStarted.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-blue-700 mb-2">
                    🚀 今週着手
                  </h4>
                  <div className="space-y-2">
                    {currentReport.progressReview.newlyStarted.map((item, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg"
                      >
                        <span className="font-medium">{item.name}</span>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-zinc-500">{item.from}</span>
                          <ChevronRight className="w-4 h-4 text-blue-400" />
                          <span className="text-blue-600 font-medium">{item.to}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {currentReport.progressReview.stalled.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-amber-700 mb-2">
                    ⚠️ 遅延・停滞
                  </h4>
                  <div className="space-y-2">
                    {currentReport.progressReview.stalled.map((item, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg"
                      >
                        <span className="font-medium">{item.name}</span>
                        <span className="text-sm text-amber-600">{item.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ===== ④ リスク・アラート ===== */}
        <Card className="mb-6 border border-red-200">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-red-500 rounded-lg">
                <Shield className="w-4 h-4 text-white" />
              </div>
              <CardTitle className="text-lg text-red-800">
                4. リスク・アラート
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {currentReport.riskAlerts.persistentRisks.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-red-700 mb-2">
                  放置リスク
                </h4>
                <div className="space-y-2">
                  {currentReport.riskAlerts.persistentRisks.map((risk, i) => (
                    <div
                      key={i}
                      className={`p-4 rounded-lg border ${
                        risk.riskLevel === 'critical'
                          ? 'bg-red-50 border-red-300'
                          : 'bg-orange-50 border-orange-300'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg">
                              {risk.riskLevel === 'critical' ? '🔴' : '🟠'}
                            </span>
                            <span className="font-bold">{risk.name}</span>
                            <Badge className="text-xs bg-zinc-100 text-zinc-600">
                              {risk.category}
                            </Badge>
                          </div>
                          <p className="text-sm text-zinc-600">{risk.description}</p>
                        </div>
                        <Badge
                          className={`text-xs ${
                            risk.daysIgnored >= 14
                              ? 'bg-red-100 text-red-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          <Clock className="w-3 h-3 mr-1" />
                          {risk.daysIgnored}日経過
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {currentReport.riskAlerts.newRisks.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-blue-700 mb-2">
                  🆕 新規リスク
                </h4>
                <div className="space-y-2">
                  {currentReport.riskAlerts.newRisks.map((risk, i) => (
                    <div
                      key={i}
                      className="p-4 bg-blue-50 border border-blue-200 rounded-lg"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold">{risk.name}</span>
                        <Badge className="text-xs bg-zinc-100 text-zinc-600">
                          {risk.category}
                        </Badge>
                      </div>
                      <p className="text-sm text-zinc-600">{risk.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {currentReport.riskAlerts.persistentRisks.length === 0 &&
              currentReport.riskAlerts.newRisks.length === 0 && (
                <div className="text-center py-6 text-zinc-500">
                  現在、警告すべきリスクはありません
                </div>
              )}
          </CardContent>
        </Card>

        {/* ===== ⑤ 来週のアクション ===== */}
        <Card className="mb-6 border-2 border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-orange-500 rounded-lg">
                <Target className="w-4 h-4 text-white" />
              </div>
              <CardTitle className="text-lg text-orange-800">
                5. 来週のアクション（Top 3）
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {currentReport.nextActions.top3.map((action, index) => (
                <div
                  key={index}
                  className="p-4 bg-white border border-orange-200 rounded-lg"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-8 h-8 flex items-center justify-center rounded-full font-bold text-sm flex-shrink-0 ${
                        index === 0
                          ? 'bg-yellow-400 text-yellow-900'
                          : index === 1
                            ? 'bg-zinc-300 text-zinc-700'
                            : 'bg-orange-300 text-orange-800'
                      }`}
                    >
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-zinc-800 mb-2">
                        {action.title}
                      </h4>
                      <div className="space-y-1 text-sm">
                        <p>
                          <span className="text-zinc-500">目的：</span>
                          <span className="text-zinc-700">{action.purpose}</span>
                        </p>
                        <p>
                          <span className="text-zinc-500">完了条件：</span>
                          <span className="text-orange-700 font-medium">
                            {action.completionCriteria}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ===== ⑥ AI副社長コメント ===== */}
        <Card className="border-2 border-purple-200 bg-gradient-to-r from-purple-50 to-violet-50">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg">
                <Brain className="w-4 h-4 text-white" />
              </div>
              <CardTitle className="text-lg text-purple-800">
                6. AI副社長コメント
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-4 bg-white border border-purple-200 rounded-lg">
                <h4 className="text-sm font-semibold text-purple-700 mb-2">
                  今週の判断総括
                </h4>
                <p className="text-zinc-700 leading-relaxed">
                  {currentReport.aiComment.judgmentSummary}
                </p>
              </div>
              <div className="p-4 bg-gradient-to-r from-purple-100 to-violet-100 border border-purple-300 rounded-lg">
                <h4 className="text-sm font-semibold text-purple-800 mb-2">
                  来週への示唆
                </h4>
                <p className="text-purple-900 font-medium leading-relaxed">
                  {currentReport.aiComment.nextWeekInsight}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* フッター */}
        <div className="mt-6 text-center">
          <p className="text-xs text-zinc-400">
            Generated: {currentReport.generatedAt.toLocaleString('ja-JP')}
          </p>
          <div className="mt-4 flex justify-center gap-4">
            <Link
              href="/dashboard/kpi"
              className="text-sm text-emerald-500 hover:text-emerald-700"
            >
              KPIダッシュボード →
            </Link>
            <Link
              href="/dashboard/kpi-dictionary"
              className="text-sm text-teal-500 hover:text-teal-700"
            >
              KPI辞書 →
            </Link>
            <Link
              href="/dashboard/executive-summary"
              className="text-sm text-indigo-500 hover:text-indigo-700"
            >
              経営サマリー →
            </Link>
            <Link
              href="/dashboard/ai-vp"
              className="text-sm text-purple-500 hover:text-purple-700"
            >
              AI副社長ハブ →
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
