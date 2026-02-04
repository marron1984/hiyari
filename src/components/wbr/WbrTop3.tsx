'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, Badge } from '@/components/ui';
import { Target, ChevronDown, ChevronUp, Bot, ExternalLink } from 'lucide-react';

interface NextAction {
  title: string;
  purpose: string;
  completionCriteria: string;
}

interface BusinessTop3Item {
  businessUnitId: string;
  businessUnitName: string;
  topIssue: string;
  severity: 'critical' | 'warning' | 'info';
}

interface WbrTop3Props {
  /** 来週のアクションTop3 */
  top3: NextAction[];
  /** 事業別Top3（AI副社長 Task 042） */
  businessTop3?: BusinessTop3Item[];
  /** ファーストビューではTop1のみ表示 */
  compact?: boolean;
}

/**
 * WBR 来週のTop3セクション
 *
 * Implementation Ticket 047: AI副社長Top3を流用、事業別はTop1のみファーストビュー
 */
export function WbrTop3({ top3, businessTop3, compact = false }: WbrTop3Props) {
  const [expanded, setExpanded] = useState(!compact);

  if (top3.length === 0) {
    return null;
  }

  const displayItems = compact ? top3.slice(0, 1) : top3;

  return (
    <Card className="mb-4 border-2 border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50 print:border print:border-zinc-300 print:bg-white print:break-inside-avoid">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-orange-800 flex items-center gap-2">
            <Target className="w-4 h-4" />
            来週のアクション Top3
          </h3>
          {compact && top3.length > 1 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-orange-600 hover:text-orange-800 flex items-center gap-1 print:hidden"
            >
              {expanded ? (
                <>
                  <ChevronUp className="w-3 h-3" />
                  閉じる
                </>
              ) : (
                <>
                  残り{top3.length - 1}件
                  <ChevronDown className="w-3 h-3" />
                </>
              )}
            </button>
          )}
        </div>

        <div className="space-y-3">
          {(expanded ? top3 : displayItems).map((action, index) => (
            <ActionCard key={index} action={action} rank={index + 1} />
          ))}
        </div>

        {/* 事業別Top3（折りたたみ） */}
        {businessTop3 && businessTop3.length > 0 && (
          <BusinessTop3Section items={businessTop3} />
        )}
      </CardContent>
    </Card>
  );
}

function ActionCard({ action, rank }: { action: NextAction; rank: number }) {
  const rankColors = [
    'bg-yellow-400 text-yellow-900',
    'bg-zinc-300 text-zinc-700',
    'bg-orange-300 text-orange-800',
  ];

  return (
    <div className="p-3 bg-white border border-orange-200 rounded-lg print:border-zinc-300">
      <div className="flex items-start gap-3">
        <div
          className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold flex-shrink-0 ${
            rankColors[rank - 1] || 'bg-zinc-200 text-zinc-600'
          }`}
        >
          {rank}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-zinc-800 mb-1">{action.title}</h4>
          <div className="text-xs text-zinc-600 space-y-0.5">
            <p>
              <span className="text-zinc-400">目的:</span> {action.purpose}
            </p>
            <p>
              <span className="text-zinc-400">完了条件:</span>{' '}
              <span className="text-orange-700 font-medium">
                {action.completionCriteria}
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function BusinessTop3Section({ items }: { items: BusinessTop3Item[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-4 pt-3 border-t border-orange-200 print:border-zinc-300">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-xs text-zinc-600 hover:text-zinc-800 print:hidden"
      >
        <span className="flex items-center gap-1.5">
          <Bot className="w-3.5 h-3.5 text-purple-500" />
          事業別 Top Issue
        </span>
        {expanded ? (
          <ChevronUp className="w-3.5 h-3.5" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5" />
        )}
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {items.map((item, i) => (
            <div
              key={i}
              className={`p-2 rounded border ${
                item.severity === 'critical'
                  ? 'bg-red-50 border-red-200'
                  : item.severity === 'warning'
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-zinc-50 border-zinc-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-700">
                  {item.businessUnitName}
                </span>
                <Badge
                  className={`text-[10px] ${
                    item.severity === 'critical'
                      ? 'bg-red-100 text-red-700'
                      : item.severity === 'warning'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-zinc-100 text-zinc-600'
                  }`}
                >
                  {item.severity === 'critical' ? '重大' : item.severity === 'warning' ? '要注意' : ''}
                </Badge>
              </div>
              <p className="text-[10px] text-zinc-600 mt-1">{item.topIssue}</p>
            </div>
          ))}
          <Link
            href="/dashboard/ai-vp"
            className="block text-center text-xs text-purple-600 hover:text-purple-800 mt-2"
          >
            AI副社長で詳細を見る →
          </Link>
        </div>
      )}

      {/* 印刷時は常に表示 */}
      <div className="hidden print:block mt-2 space-y-2">
        {items.slice(0, 3).map((item, i) => (
          <div key={i} className="p-2 bg-white rounded border border-zinc-300">
            <span className="text-xs font-medium">{item.businessUnitName}:</span>
            <span className="text-[10px] text-zinc-600 ml-1">{item.topIssue}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
