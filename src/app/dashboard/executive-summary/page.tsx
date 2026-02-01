'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@/components/ui';
import {
  FileText,
  Download,
  Printer,
  TrendingUp,
  AlertTriangle,
  Calendar,
  Ticket,
  Brain,
  ChevronRight,
  RefreshCw,
  CheckCircle,
  Clock,
  Target,
} from 'lucide-react';
import {
  generateExecutiveSummary,
  exportSummaryToText,
  exportSummaryToHTML,
  type ExecutiveSummary,
} from '@/lib/executive-summary';

export default function ExecutiveSummaryPage() {
  const [isExporting, setIsExporting] = useState(false);

  // サマリーを生成
  const summary = useMemo(() => generateExecutiveSummary(), []);

  const formattedDate = summary.generatedAt.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Word形式でエクスポート（テキスト形式）
  const handleExportWord = () => {
    setIsExporting(true);
    const text = exportSummaryToText(summary);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `経営サマリー_${summary.generatedAt.toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setTimeout(() => setIsExporting(false), 1000);
  };

  // PDF形式でエクスポート（印刷ダイアログ経由）
  const handleExportPDF = () => {
    setIsExporting(true);
    const html = exportSummaryToHTML(summary);
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.print();
      };
    }
    setTimeout(() => setIsExporting(false), 1000);
  };

  return (
    <main className="pb-8">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-zinc-900">経営サマリー</h1>
              <p className="text-sm text-zinc-500">{formattedDate} 時点</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleExportWord}
              disabled={isExporting}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              テキスト出力
            </button>
            <button
              onClick={handleExportPDF}
              disabled={isExporting}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50"
            >
              <Printer className="w-4 h-4" />
              PDF出力
            </button>
          </div>
        </div>

        {/* セクション①：現在の全体像 */}
        <Card className="mb-6 border-2 border-indigo-200">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-indigo-500 rounded-lg">
                <TrendingUp className="w-4 h-4 text-white" />
              </div>
              <CardTitle className="text-lg text-indigo-800">1. 現在の全体像</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {/* 数値グリッド */}
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-3xl font-bold text-green-600">
                  {summary.overview.activeCount}
                </div>
                <div className="text-xs text-green-700">運用中</div>
              </div>
              <div className="text-center p-4 bg-yellow-50 rounded-lg">
                <div className="text-3xl font-bold text-yellow-600">
                  {summary.overview.developingCount}
                </div>
                <div className="text-xs text-yellow-700">開発中</div>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <div className="text-3xl font-bold text-red-600">
                  {summary.overview.plannedCount}
                </div>
                <div className="text-xs text-red-700">未着手</div>
              </div>
              <div className="text-center p-4 bg-indigo-50 rounded-lg">
                <div className="text-3xl font-bold text-indigo-600">
                  {summary.overview.progressPercent}%
                </div>
                <div className="text-xs text-indigo-700">進捗率</div>
              </div>
            </div>

            {/* プログレスバー */}
            <div className="mb-4">
              <div className="h-3 bg-zinc-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-500 to-indigo-500 rounded-full transition-all"
                  style={{ width: `${summary.overview.progressPercent}%` }}
                />
              </div>
            </div>

            {/* 総評 */}
            <div className="p-4 bg-amber-50 rounded-lg border-l-4 border-amber-400">
              <p className="text-amber-800 font-medium">{summary.overview.summary}</p>
            </div>
          </CardContent>
        </Card>

        {/* セクション②：今月の最重要事項 */}
        <Card className="mb-6 border-2 border-orange-200">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-orange-500 rounded-lg">
                <Target className="w-4 h-4 text-white" />
              </div>
              <CardTitle className="text-lg text-orange-800">2. 今月の最重要事項</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {summary.topPriority.items.map((item, index) => (
                <div
                  key={index}
                  className="p-4 bg-orange-50 rounded-lg border-l-4 border-orange-400"
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 flex items-center justify-center rounded-full font-bold text-sm flex-shrink-0 ${
                      index === 0 ? 'bg-yellow-400 text-yellow-900' :
                      index === 1 ? 'bg-zinc-300 text-zinc-700' :
                      'bg-orange-300 text-orange-800'
                    }`}>
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-zinc-800">{item.name}</h3>
                        <Badge className="bg-orange-100 text-orange-700 text-xs">
                          {item.score}/15
                        </Badge>
                      </div>
                      <p className="text-sm text-zinc-600 mb-2">
                        <strong>理由:</strong> {item.reason}
                      </p>
                      <p className="text-sm text-red-600">
                        <strong>放置時:</strong> {item.riskIfIgnored}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* セクション③：放置リスク警告 */}
        {summary.riskWarnings.items.length > 0 && (
          <Card className="mb-6 border-2 border-red-200">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-red-500 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-white" />
                </div>
                <CardTitle className="text-lg text-red-800">3. 放置リスク・注意領域</CardTitle>
                <Badge className="bg-red-100 text-red-700">
                  {summary.riskWarnings.items.length}件
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {summary.riskWarnings.items.map((item, index) => (
                  <div
                    key={index}
                    className="p-3 bg-red-50 rounded-lg border-l-4 border-red-400"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-zinc-800">{item.name}</span>
                      <Badge className="bg-red-100 text-red-600 text-xs">
                        {item.category}
                      </Badge>
                    </div>
                    <p className="text-sm text-red-700">{item.description}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* セクション④：ロードマップ要約 */}
        <Card className="mb-6 border-2 border-blue-200">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-blue-500 rounded-lg">
                <Calendar className="w-4 h-4 text-white" />
              </div>
              <CardTitle className="text-lg text-blue-800">4. ロードマップ要約</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-red-50 rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-red-600" />
                  <h4 className="font-bold text-red-800">今月</h4>
                </div>
                <ul className="space-y-1">
                  {summary.roadmap.thisMonth.map((item, i) => (
                    <li key={i} className="text-sm text-zinc-700 flex items-start gap-1">
                      <span className="text-red-400 mt-0.5">•</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="p-4 bg-orange-50 rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-orange-600" />
                  <h4 className="font-bold text-orange-800">来月</h4>
                </div>
                <ul className="space-y-1">
                  {summary.roadmap.nextMonth.map((item, i) => (
                    <li key={i} className="text-sm text-zinc-700 flex items-start gap-1">
                      <span className="text-orange-400 mt-0.5">•</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="p-4 bg-blue-50 rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-blue-600" />
                  <h4 className="font-bold text-blue-800">今四半期</h4>
                </div>
                <ul className="space-y-1">
                  {summary.roadmap.thisQuarter.map((item, i) => (
                    <li key={i} className="text-sm text-zinc-700 flex items-start gap-1">
                      <span className="text-blue-400 mt-0.5">•</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* セクション⑤：実行フェーズ */}
        <Card className="mb-6 border-2 border-violet-200">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-violet-500 rounded-lg">
                <Ticket className="w-4 h-4 text-white" />
              </div>
              <CardTitle className="text-lg text-violet-800">5. 実行フェーズ</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 mb-4">
              <div className="flex-1 p-4 bg-violet-50 rounded-lg text-center">
                <div className="text-2xl font-bold text-violet-600">
                  {summary.ticketStatus.totalCount}
                </div>
                <div className="text-xs text-violet-700">総チケット数</div>
              </div>
              <div className="flex-1 p-4 bg-red-50 rounded-lg text-center">
                <div className="text-2xl font-bold text-red-600">
                  {summary.ticketStatus.thisMonthCount}
                </div>
                <div className="text-xs text-red-700">今月対応予定</div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium text-zinc-600 mb-2">代表的なチケット</h4>
              <div className="space-y-2">
                {summary.ticketStatus.sampleTickets.map((ticket, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 bg-zinc-50 rounded-lg"
                  >
                    <span className="text-sm text-zinc-700">{ticket.title}</span>
                    <div className="flex gap-2">
                      <Badge className="bg-zinc-200 text-zinc-600 text-xs">
                        {ticket.category}
                      </Badge>
                      <Badge className="bg-violet-100 text-violet-600 text-xs">
                        {ticket.phase}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 text-right">
              <Link
                href="/dashboard/tickets"
                className="text-sm text-violet-600 hover:text-violet-800 inline-flex items-center gap-1"
              >
                全チケットを確認 <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* セクション⑥：AI副社長コメント */}
        <Card className="mb-6 border-2 border-purple-300 bg-gradient-to-r from-purple-50 to-indigo-50">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg">
                <Brain className="w-4 h-4 text-white" />
              </div>
              <CardTitle className="text-lg text-purple-800">6. AI副社長コメント</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="p-6 bg-white/60 rounded-xl border border-purple-200">
              <p className="text-lg text-purple-900 font-medium text-center leading-relaxed">
                {summary.aiComment}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* フッター */}
        <div className="flex justify-center gap-6 text-sm text-zinc-400">
          <Link
            href="/dashboard/ai-vp"
            className="hover:text-zinc-600 inline-flex items-center gap-1"
          >
            AI副社長 <ChevronRight className="w-4 h-4" />
          </Link>
          <Link
            href="/dashboard/os-map"
            className="hover:text-zinc-600 inline-flex items-center gap-1"
          >
            OSマップ <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </main>
  );
}
