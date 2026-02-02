'use client';

import Link from 'next/link';
import { Card, CardContent, Badge } from '@/components/ui';
import { Zap, Bot, CheckCircle, Clock, ExternalLink } from 'lucide-react';

interface ProgressItem {
  name: string;
  status?: string;
  from?: string;
  to?: string;
  reason?: string;
}

interface GeneratedTicket {
  id: string;
  title: string;
  businessUnitName: string;
  createdAt: string;
}

interface WbrExecutionProps {
  /** 完了間近 */
  nearCompletion?: ProgressItem[];
  /** 新規着手 */
  newlyStarted?: ProgressItem[];
  /** 遅延・停滞 */
  stalled?: ProgressItem[];
  /** AI副社長が今週生成したチケット */
  generatedTickets?: GeneratedTicket[];
  /** 今週完了したチケット数 */
  completedThisWeek?: number;
  /** コンパクト表示 */
  compact?: boolean;
}

/**
 * WBR 実行状況セクション
 *
 * Implementation Ticket 047: AI副社長チケット数、完了チケット数
 */
export function WbrExecution({
  nearCompletion = [],
  newlyStarted = [],
  stalled = [],
  generatedTickets = [],
  completedThisWeek = 0,
  compact = false,
}: WbrExecutionProps) {
  if (compact) {
    return <WbrExecutionCompact
      generatedCount={generatedTickets.length}
      completedCount={completedThisWeek}
      stalledCount={stalled.length}
    />;
  }

  return (
    <Card className="mb-4 print:break-inside-avoid">
      <CardContent className="p-4">
        <h3 className="text-sm font-bold text-zinc-800 flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-violet-600" />
          実行状況
        </h3>

        {/* サマリー数値 */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="text-center p-2 bg-violet-50 rounded-lg print:bg-white print:border print:border-zinc-300">
            <div className="text-lg font-bold text-violet-600">
              {generatedTickets.length}
            </div>
            <div className="text-[10px] text-violet-700">AI生成チケット</div>
          </div>
          <div className="text-center p-2 bg-green-50 rounded-lg print:bg-white print:border print:border-zinc-300">
            <div className="text-lg font-bold text-green-600">
              {completedThisWeek}
            </div>
            <div className="text-[10px] text-green-700">今週完了</div>
          </div>
          <div className="text-center p-2 bg-amber-50 rounded-lg print:bg-white print:border print:border-zinc-300">
            <div className="text-lg font-bold text-amber-600">
              {stalled.length}
            </div>
            <div className="text-[10px] text-amber-700">遅延・停滞</div>
          </div>
        </div>

        {/* 完了間近 */}
        {nearCompletion.length > 0 && (
          <div className="mb-3">
            <h4 className="text-xs font-medium text-violet-700 mb-1.5 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" />
              完了間近
            </h4>
            <div className="space-y-1">
              {nearCompletion.slice(0, 3).map((item, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-2 bg-violet-50 rounded text-xs print:bg-white print:border print:border-zinc-200"
                >
                  <span className="font-medium text-zinc-700">{item.name}</span>
                  <Badge className="bg-violet-100 text-violet-700 text-[10px]">
                    {item.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI副社長生成チケット */}
        {generatedTickets.length > 0 && (
          <div className="mb-3">
            <h4 className="text-xs font-medium text-purple-700 mb-1.5 flex items-center gap-1">
              <Bot className="w-3 h-3" />
              AI副社長が生成したチケット
            </h4>
            <div className="space-y-1">
              {generatedTickets.slice(0, 3).map((ticket, i) => (
                <Link
                  key={i}
                  href={`/dashboard/tickets/${ticket.id}`}
                  className="flex items-center justify-between p-2 bg-purple-50 rounded text-xs hover:bg-purple-100 print:bg-white print:border print:border-zinc-200"
                >
                  <span className="font-medium text-zinc-700 truncate">
                    {ticket.title}
                  </span>
                  <div className="flex items-center gap-1">
                    <Badge className="bg-zinc-100 text-zinc-600 text-[10px]">
                      {ticket.businessUnitName}
                    </Badge>
                    <ExternalLink className="w-3 h-3 text-zinc-400 print:hidden" />
                  </div>
                </Link>
              ))}
            </div>
            {generatedTickets.length > 3 && (
              <Link
                href="/dashboard/tickets"
                className="block text-center text-xs text-purple-600 hover:text-purple-800 mt-2 print:hidden"
              >
                他 {generatedTickets.length - 3}件を見る →
              </Link>
            )}
          </div>
        )}

        {/* 遅延・停滞 */}
        {stalled.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-amber-700 mb-1.5 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              遅延・停滞
            </h4>
            <div className="space-y-1">
              {stalled.slice(0, 3).map((item, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-2 bg-amber-50 rounded text-xs print:bg-white print:border print:border-zinc-200"
                >
                  <span className="font-medium text-zinc-700">{item.name}</span>
                  <span className="text-amber-600 text-[10px]">{item.reason}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * コンパクト版（ファーストビュー用）
 */
function WbrExecutionCompact({
  generatedCount,
  completedCount,
  stalledCount,
}: {
  generatedCount: number;
  completedCount: number;
  stalledCount: number;
}) {
  return (
    <div className="flex gap-2 mb-4 text-xs">
      <div className="flex items-center gap-1 px-2 py-1 bg-violet-50 rounded border border-violet-200">
        <Bot className="w-3 h-3 text-violet-500" />
        <span className="text-violet-700">AI生成: {generatedCount}</span>
      </div>
      <div className="flex items-center gap-1 px-2 py-1 bg-green-50 rounded border border-green-200">
        <CheckCircle className="w-3 h-3 text-green-500" />
        <span className="text-green-700">完了: {completedCount}</span>
      </div>
      {stalledCount > 0 && (
        <div className="flex items-center gap-1 px-2 py-1 bg-amber-50 rounded border border-amber-200">
          <Clock className="w-3 h-3 text-amber-500" />
          <span className="text-amber-700">遅延: {stalledCount}</span>
        </div>
      )}
    </div>
  );
}
