'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@/components/ui';
import {
  Ticket,
  Calendar,
  TrendingUp,
  Clock,
  ChevronRight,
  Download,
  Filter,
  Bot,
  User,
  Users,
  ExternalLink,
  Copy,
  Check,
  Zap,
} from 'lucide-react';
import {
  generateTickets,
  getTicketCountByPhase,
  exportToGitHubIssue,
  exportTicketsToMarkdown,
  TICKET_PHASES,
  EFFORT_CONFIG,
  type DevTicket,
  type TicketPhase,
} from '@/lib/generateTickets';

export default function TicketsPage() {
  const [selectedPhase, setSelectedPhase] = useState<TicketPhase | 'all'>('all');
  const [copiedTicketId, setCopiedTicketId] = useState<string | null>(null);

  // チケットを生成
  const allTickets = useMemo(() => generateTickets(), []);
  const phaseCounts = useMemo(() => getTicketCountByPhase(), []);

  // フィルター適用
  const filteredTickets = useMemo(() => {
    if (selectedPhase === 'all') return allTickets;
    return allTickets.filter((t) => t.phase === selectedPhase);
  }, [allTickets, selectedPhase]);

  // GitHub Issue形式でコピー
  const handleCopyTicket = async (ticket: DevTicket) => {
    const issueContent = exportToGitHubIssue(ticket);
    await navigator.clipboard.writeText(issueContent);
    setCopiedTicketId(ticket.id);
    setTimeout(() => setCopiedTicketId(null), 2000);
  };

  // 全チケットをMarkdownでダウンロード
  const handleDownloadAll = () => {
    const markdown = exportTicketsToMarkdown(allTickets);
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tickets-${new Date().toISOString().split('T')[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="pb-8">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-violet-500 to-purple-600 rounded-lg">
              <Ticket className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-zinc-900">開発チケット</h1>
              <p className="text-sm text-zinc-500">
                OSマップから自動生成（{allTickets.length}件）
              </p>
            </div>
          </div>
          <button
            onClick={handleDownloadAll}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            Markdown出力
          </button>
        </div>

        {/* 説明カード */}
        <Card className="mb-6 bg-violet-50 border-violet-200">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Zap className="w-5 h-5 text-violet-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-violet-800">
                <p className="font-medium mb-1">ロードマップ連動チケット</p>
                <p className="text-violet-700">
                  OSマップの経営優先度スコアに基づき、開発チケットを自動生成しています。
                  GitHub Issue / Backlog / Notion にそのまま転記可能です。
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* フェーズフィルター */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-sm text-zinc-600">
                <Filter className="w-4 h-4" />
                <span className="font-medium">フェーズ:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedPhase('all')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    selectedPhase === 'all'
                      ? 'bg-zinc-800 text-white'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  全て
                  <Badge className="bg-white/80 text-zinc-700 text-xs ml-1">
                    {allTickets.length}
                  </Badge>
                </button>
                {(['thisMonth', 'nextMonth', 'thisQuarter'] as const).map((phase) => {
                  const config = TICKET_PHASES[phase];
                  const count = phaseCounts[phase];
                  const isSelected = selectedPhase === phase;

                  return (
                    <button
                      key={phase}
                      onClick={() => setSelectedPhase(phase)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        isSelected
                          ? `${config.bgColor} ${config.color} ring-2 ring-offset-1`
                          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                      }`}
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      {config.name}
                      <Badge className="bg-white/80 text-zinc-700 text-xs ml-1">
                        {count}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* チケット一覧 */}
        <div className="space-y-4">
          {filteredTickets.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              onCopy={() => handleCopyTicket(ticket)}
              isCopied={copiedTicketId === ticket.id}
            />
          ))}
          {filteredTickets.length === 0 && (
            <div className="text-center py-12 text-zinc-500">
              該当するチケットがありません
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="mt-8 text-center space-y-2">
          <Link
            href="/dashboard/os-map"
            className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-700"
          >
            OSマップで全機能を確認
            <ExternalLink className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </main>
  );
}

/**
 * チケットカードコンポーネント
 */
function TicketCard({
  ticket,
  onCopy,
  isCopied,
}: {
  ticket: DevTicket;
  onCopy: () => void;
  isCopied: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const phaseConfig = TICKET_PHASES[ticket.phase];
  const effortConfig = EFFORT_CONFIG[ticket.estimatedEffort];

  return (
    <Card className="overflow-hidden hover:shadow-md transition-all">
      <CardContent className="p-0">
        {/* メインエリア */}
        <div className="p-4">
          <div className="flex items-start gap-4">
            {/* 左: スコアバッジ */}
            <div className="flex flex-col items-center gap-1">
              <div className="w-12 h-12 flex items-center justify-center bg-gradient-to-br from-orange-400 to-red-500 rounded-lg text-white font-bold text-lg">
                {ticket.compositeScore}
              </div>
              <span className="text-xs text-zinc-400">/15</span>
            </div>

            {/* 中央: メインコンテンツ */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <Badge className={`${phaseConfig.bgColor} ${phaseConfig.color} text-xs`}>
                  {phaseConfig.name}
                </Badge>
                <Badge className="bg-zinc-100 text-zinc-600 text-xs">
                  {ticket.categoryName}
                </Badge>
                <Badge className="bg-purple-100 text-purple-700 text-xs">
                  {effortConfig.name} ({effortConfig.days})
                </Badge>
                {ticket.assignee === 'AI' && (
                  <Badge className="bg-indigo-100 text-indigo-700 text-xs flex items-center gap-1">
                    <Bot className="w-3 h-3" />
                    AI担当
                  </Badge>
                )}
              </div>

              <h3 className="font-bold text-zinc-800 mb-1">{ticket.title}</h3>
              <p className="text-sm text-zinc-500 mb-2">{ticket.description}</p>

              <div className="flex items-center gap-4 text-xs text-zinc-400">
                <span className="flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5" />
                  優先度 {ticket.priority}/5
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  ROI {ticket.roi}/5
                </span>
                <span>リスク {ticket.risk}/5</span>
              </div>
            </div>

            {/* 右: アクション */}
            <div className="flex flex-col gap-2">
              <button
                onClick={onCopy}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  isCopied
                    ? 'bg-green-100 text-green-700'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}
              >
                {isCopied ? (
                  <>
                    <Check className="w-4 h-4" />
                    コピー済
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Issue形式
                  </>
                )}
              </button>
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-all"
              >
                <ChevronRight
                  className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                />
                詳細
              </button>
            </div>
          </div>
        </div>

        {/* 展開エリア */}
        {isExpanded && (
          <div className="border-t border-zinc-100 bg-zinc-50 p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 受け入れ基準 */}
              <div>
                <h4 className="text-sm font-medium text-zinc-700 mb-2">受け入れ基準</h4>
                <ul className="space-y-1">
                  {ticket.acceptanceCriteria.map((criteria, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-zinc-600">
                      <span className="w-4 h-4 flex items-center justify-center bg-zinc-200 rounded text-xs text-zinc-500 flex-shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      {criteria}
                    </li>
                  ))}
                </ul>
              </div>

              {/* メタ情報 */}
              <div>
                <h4 className="text-sm font-medium text-zinc-700 mb-2">メタ情報</h4>
                <dl className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <dt className="text-zinc-500">チケットID:</dt>
                    <dd className="font-mono text-zinc-700">{ticket.id}</dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <dt className="text-zinc-500">関連パス:</dt>
                    <dd className="font-mono text-zinc-700">
                      <Link
                        href={ticket.relatedPath}
                        className="text-blue-600 hover:underline"
                      >
                        {ticket.relatedPath}
                      </Link>
                    </dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <dt className="text-zinc-500">担当:</dt>
                    <dd className="flex items-center gap-1">
                      {ticket.assignee === 'AI' ? (
                        <>
                          <Bot className="w-4 h-4 text-indigo-600" />
                          <span className="text-indigo-700">AI</span>
                        </>
                      ) : ticket.assignee === 'human' ? (
                        <>
                          <User className="w-4 h-4 text-green-600" />
                          <span className="text-green-700">社内</span>
                        </>
                      ) : ticket.assignee === 'external' ? (
                        <>
                          <Users className="w-4 h-4 text-orange-600" />
                          <span className="text-orange-700">外注</span>
                        </>
                      ) : (
                        <span className="text-zinc-500">未割当</span>
                      )}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
