'use client';

import { Calendar, Download, FileText, History } from 'lucide-react';
import { Button } from '@/components/ui';

interface WbrHeaderProps {
  weekLabel: string;
  weekStart: string;
  generatedAt: Date;
  onExportText: () => void;
  onExportPDF: () => void;
  onShowHistory?: () => void;
  showHistoryButton?: boolean;
}

/**
 * WBR ヘッダーコンポーネント
 *
 * Implementation Ticket 047: 会議用フォーマット最適化
 */
export function WbrHeader({
  weekLabel,
  weekStart,
  generatedAt,
  onExportText,
  onExportPDF,
  onShowHistory,
  showHistoryButton = true,
}: WbrHeaderProps) {
  return (
    <div className="print:hidden">
      {/* タイトルバー */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl shadow-lg">
            <Calendar className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-900">
              WBR（週次ビジネスレビュー）
            </h1>
            <p className="text-sm text-zinc-500">
              {weekLabel} | 生成: {generatedAt.toLocaleDateString('ja-JP')}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {showHistoryButton && onShowHistory && (
            <Button variant="outline" size="sm" onClick={onShowHistory}>
              <History className="w-4 h-4 mr-1" />
              履歴
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onExportText}>
            <Download className="w-4 h-4 mr-1" />
            テキスト
          </Button>
          <Button size="sm" onClick={onExportPDF}>
            <FileText className="w-4 h-4 mr-1" />
            PDF
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * WBR 印刷用ヘッダー
 */
export function WbrPrintHeader({
  weekLabel,
  weekStart,
  generatedAt,
}: Pick<WbrHeaderProps, 'weekLabel' | 'weekStart' | 'generatedAt'>) {
  return (
    <div className="hidden print:block mb-6 pb-4 border-b-2 border-zinc-300">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">
            Weekly Business Review
          </h1>
          <p className="text-base text-zinc-600">{weekLabel}</p>
        </div>
        <div className="text-right text-sm text-zinc-500">
          <p>生成日時: {generatedAt.toLocaleString('ja-JP')}</p>
          <p>対象週: {weekStart}</p>
        </div>
      </div>
    </div>
  );
}
