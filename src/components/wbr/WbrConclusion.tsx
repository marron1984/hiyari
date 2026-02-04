'use client';

import { Card, CardContent } from '@/components/ui';
import { CheckCircle, AlertTriangle, ArrowRight } from 'lucide-react';

interface WbrConclusionProps {
  overview: string;
  goodPoints: string[];
  issues: string[];
  nextActions?: string[];
}

/**
 * WBR 結論セクション（ファーストビュー用）
 *
 * Implementation Ticket 047: 会議でスクロールせずに結論が掴める
 */
export function WbrConclusion({
  overview,
  goodPoints,
  issues,
  nextActions,
}: WbrConclusionProps) {
  return (
    <Card className="mb-4 border-2 border-blue-200 bg-gradient-to-br from-blue-50 via-white to-indigo-50 print:border print:border-zinc-300 print:bg-white">
      <CardContent className="p-4">
        {/* 総評（3〜5行） */}
        <div className="mb-4 p-3 bg-white rounded-lg border border-blue-100 print:border-zinc-200">
          <p className="text-sm font-medium text-zinc-700 leading-relaxed">
            {overview}
          </p>
        </div>

        {/* Good / Bad / Next の3カラム */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 print:grid-cols-3">
          {/* Good */}
          <div className="p-3 bg-green-50 rounded-lg border border-green-200 print:bg-white print:border-zinc-300">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-xs font-bold text-green-700 uppercase tracking-wide">
                Good
              </span>
            </div>
            <ul className="space-y-1">
              {goodPoints.slice(0, 2).map((point, i) => (
                <li key={i} className="text-xs text-zinc-700 leading-relaxed">
                  {point}
                </li>
              ))}
            </ul>
          </div>

          {/* Bad */}
          <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 print:bg-white print:border-zinc-300">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-bold text-amber-700 uppercase tracking-wide">
                Bad
              </span>
            </div>
            <ul className="space-y-1">
              {issues.slice(0, 2).map((issue, i) => (
                <li key={i} className="text-xs text-zinc-700 leading-relaxed">
                  {issue}
                </li>
              ))}
            </ul>
          </div>

          {/* Next */}
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 print:bg-white print:border-zinc-300">
            <div className="flex items-center gap-2 mb-2">
              <ArrowRight className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-bold text-blue-700 uppercase tracking-wide">
                Next
              </span>
            </div>
            <ul className="space-y-1">
              {(nextActions ?? issues).slice(0, 2).map((action, i) => (
                <li key={i} className="text-xs text-zinc-700 leading-relaxed">
                  {action.includes('→') ? action.split('→')[1].trim() : `対応: ${action}`}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
