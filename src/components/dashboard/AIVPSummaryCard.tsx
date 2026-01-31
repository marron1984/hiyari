'use client';

import Link from 'next/link';
import { Bot, AlertCircle, ChevronRight, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui';
import type { AIVPSummary, DashboardRole } from '@/types/dashboard-kpi';

interface AIVPSummaryCardProps {
  summary: AIVPSummary | null;
  role: DashboardRole;
  loading?: boolean;
}

export function AIVPSummaryCard({ summary, role, loading }: AIVPSummaryCardProps) {
  if (loading) {
    return (
      <Card className="mb-8">
        <CardContent className="p-6">
          <div className="animate-pulse">
            <div className="h-6 bg-zinc-200 rounded w-1/3 mb-4" />
            <div className="h-4 bg-zinc-100 rounded w-2/3" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!summary) {
    return (
      <Card className="mb-8 border-zinc-200">
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center">
              <Bot className="w-5 h-5 text-zinc-400" />
            </div>
            <div>
              <p className="text-sm text-zinc-500">AI副社長からのサマリー</p>
              <p className="text-zinc-400 text-sm">データを取得中...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasAlerts = summary.alertCount > 0;
  const highPriorityActions = summary.priorityActions.filter(a => a.priority === 'high' || a.isAlert);

  return (
    <Card className={`mb-8 ${hasAlerts ? 'border-red-200 bg-red-50/30' : 'border-zinc-200'}`}>
      <CardContent className="p-6">
        {/* ヘッダー */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
              hasAlerts ? 'bg-red-100' : 'bg-zinc-100'
            }`}>
              {hasAlerts ? (
                <AlertCircle className="w-5 h-5 text-red-600" />
              ) : (
                <Sparkles className="w-5 h-5 text-zinc-600" />
              )}
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-0.5">AI副社長</p>
              <h2 className={`text-base font-medium ${hasAlerts ? 'text-red-800' : 'text-zinc-900'}`}>
                {summary.headline}
              </h2>
            </div>
          </div>
          {hasAlerts && (
            <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded">
              {summary.alertCount}件のアラート
            </span>
          )}
        </div>

        {/* 優先アクション */}
        {highPriorityActions.length > 0 && (
          <div className="space-y-2">
            {highPriorityActions.slice(0, 3).map((action) => (
              <Link
                key={action.id}
                href={action.href}
                className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                  action.isAlert
                    ? 'bg-red-100 hover:bg-red-200'
                    : 'bg-zinc-100 hover:bg-zinc-200'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${
                    action.isAlert ? 'text-red-800' : 'text-zinc-800'
                  }`}>
                    {action.title}
                  </p>
                  <p className={`text-xs truncate ${
                    action.isAlert ? 'text-red-600' : 'text-zinc-500'
                  }`}>
                    {action.description}
                  </p>
                </div>
                <ChevronRight className={`w-4 h-4 ml-2 flex-shrink-0 ${
                  action.isAlert ? 'text-red-400' : 'text-zinc-400'
                }`} />
              </Link>
            ))}
          </div>
        )}

        {/* アクションがない場合 */}
        {highPriorityActions.length === 0 && (
          <div className="text-center py-2">
            <p className="text-sm text-zinc-500">
              現在、優先対応が必要な項目はありません
            </p>
          </div>
        )}

        {/* フッター */}
        <div className="mt-4 pt-3 border-t border-zinc-200 flex items-center justify-between">
          <p className="text-xs text-zinc-400">
            {summary.updatedAt.toLocaleString('ja-JP', {
              month: 'numeric',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })} 更新
          </p>
          <Link
            href="/admin/ai-vp"
            className="text-xs text-zinc-500 hover:text-zinc-700 flex items-center"
          >
            詳細を見る
            <ChevronRight className="w-3 h-3 ml-0.5" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
