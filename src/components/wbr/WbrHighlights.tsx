'use client';

import Link from 'next/link';
import { Card, CardContent, Badge } from '@/components/ui';
import { TrendingUp, TrendingDown, Minus, BookOpen, ExternalLink } from 'lucide-react';
import type { KPIHighlight } from '@/lib/wbr-generator';

interface WbrHighlightsProps {
  highlights: KPIHighlight[];
  maxItems?: number;
}

/**
 * WBR KPIハイライトセクション
 *
 * Implementation Ticket 047: 上振れ/下振れを2〜5件、direction + whyItMatters
 */
export function WbrHighlights({ highlights, maxItems = 5 }: WbrHighlightsProps) {
  // 影響度高いものを優先、変動大きいものを優先
  const sortedHighlights = [...highlights]
    .sort((a, b) => {
      const impactOrder = { high: 0, medium: 1, low: 2 };
      const impactDiff = impactOrder[a.impact] - impactOrder[b.impact];
      if (impactDiff !== 0) return impactDiff;
      return Math.abs(b.changePercent) - Math.abs(a.changePercent);
    })
    .slice(0, maxItems);

  if (sortedHighlights.length === 0) {
    return null;
  }

  return (
    <Card className="mb-4 print:break-inside-avoid">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-zinc-800 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            KPIハイライト
          </h3>
          <Link
            href="/dashboard/kpi-dictionary"
            className="text-xs text-emerald-600 hover:text-emerald-800 flex items-center gap-1 print:hidden"
          >
            <BookOpen className="w-3 h-3" />
            KPI辞書
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 print:grid-cols-3">
          {sortedHighlights.map((kpi, i) => (
            <KPIHighlightCard key={i} kpi={kpi} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function KPIHighlightCard({ kpi }: { kpi: KPIHighlight }) {
  const DirectionIcon = kpi.direction === 'up'
    ? TrendingUp
    : kpi.direction === 'down'
      ? TrendingDown
      : Minus;

  const directionColor = kpi.direction === 'up'
    ? 'text-green-600'
    : kpi.direction === 'down'
      ? 'text-red-600'
      : 'text-zinc-400';

  // direction + directionMeaning で「良い/悪い」を判定
  const isGood =
    (kpi.direction === 'up' && kpi.directionMeaning === 'higher_is_better') ||
    (kpi.direction === 'down' && kpi.directionMeaning === 'lower_is_better');

  const isBad =
    (kpi.direction === 'up' && kpi.directionMeaning === 'lower_is_better') ||
    (kpi.direction === 'down' && kpi.directionMeaning === 'higher_is_better');

  const statusColor = isGood
    ? 'bg-green-50 border-green-200'
    : isBad
      ? 'bg-red-50 border-red-200'
      : 'bg-zinc-50 border-zinc-200';

  return (
    <div className={`p-3 rounded-lg border ${statusColor} print:bg-white print:border-zinc-300`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-zinc-600 truncate">
          {kpi.name}
        </span>
        <Badge
          className={`text-[10px] px-1.5 py-0.5 ${
            kpi.impact === 'high'
              ? 'bg-red-100 text-red-700'
              : kpi.impact === 'medium'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-zinc-100 text-zinc-600'
          }`}
        >
          {kpi.impact === 'high' ? '高' : kpi.impact === 'medium' ? '中' : '低'}
        </Badge>
      </div>

      <div className="flex items-end gap-2 mb-1">
        <span className="text-xl font-bold text-zinc-800">
          {kpi.currentValue}
        </span>
        <div className="flex items-center gap-1 pb-0.5">
          <DirectionIcon className={`w-3.5 h-3.5 ${directionColor}`} />
          <span className="text-xs text-zinc-500">
            ({kpi.changePercent > 0 ? '+' : ''}{kpi.changePercent}%)
          </span>
        </div>
      </div>

      {/* whyItMatters（KPI辞書から） */}
      {kpi.whyItMatters && (
        <p className="text-[10px] text-zinc-500 leading-tight line-clamp-2">
          {kpi.whyItMatters}
        </p>
      )}

      {/* insight */}
      {!kpi.whyItMatters && kpi.insight && (
        <p className="text-[10px] text-zinc-500 leading-tight line-clamp-2">
          {kpi.insight}
        </p>
      )}
    </div>
  );
}
