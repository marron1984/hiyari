'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, Badge } from '@/components/ui';
import {
  Lightbulb,
  TrendingUp,
  Check,
  X,
  Eye,
  RefreshCw,
  BarChart3,
  ArrowRight,
} from 'lucide-react';
import type { LeadScoreSuggestion, LeadScoreSuggestionItem, SuggestionStatus } from '@/lib/sales/types';
import type { AiVpConfig } from '@/lib/aiVp/defaultConfig';
import { WEIGHT_LABELS } from '@/lib/aiVp/defaultConfig';
import { useAuth } from '@/contexts/AuthContext';

const STATUS_CONFIG: Record<SuggestionStatus, { label: string; color: string; bg: string }> = {
  open: { label: '未対応', color: 'text-blue-700', bg: 'bg-blue-50' },
  accepted: { label: '適用済', color: 'text-green-700', bg: 'bg-green-50' },
  dismissed: { label: '却下', color: 'text-zinc-500', bg: 'bg-zinc-50' },
};

const CONFIDENCE_CONFIG: Record<string, { label: string; color: string }> = {
  high: { label: '高', color: 'text-green-700' },
  medium: { label: '中', color: 'text-yellow-700' },
  low: { label: '低', color: 'text-zinc-500' },
};

interface PreviewData {
  current: AiVpConfig;
  preview: AiVpConfig;
}

export default function LeadScoreSuggestionsPage() {
  const { firebaseUser } = useAuth();
  const [suggestions, setSuggestions] = useState<LeadScoreSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const fetchSuggestions = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      setLoading(true);
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/lead-score-suggestions', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions || []);
      }
    } catch (error) {
      console.error('Failed to fetch suggestions:', error);
    } finally {
      setLoading(false);
    }
  }, [firebaseUser]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  const handleStatusChange = async (id: string, status: SuggestionStatus) => {
    if (!firebaseUser) return;
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/lead-score-suggestions', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id, status }),
      });
      if (res.ok) {
        await fetchSuggestions();
      }
    } catch (error) {
      console.error('Failed to update suggestion:', error);
    }
  };

  const handlePreview = async (suggestionId: string) => {
    if (!firebaseUser) return;
    if (selectedId === suggestionId) {
      setSelectedId(null);
      setPreviewData(null);
      return;
    }

    try {
      setPreviewLoading(true);
      setSelectedId(suggestionId);
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/lead-score-suggestions/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ suggestionId }),
      });
      if (res.ok) {
        const data = await res.json();
        setPreviewData(data);
      }
    } catch (error) {
      console.error('Failed to fetch preview:', error);
    } finally {
      setPreviewLoading(false);
    }
  };

  const openSuggestions = suggestions.filter((s) => s.status === 'open');
  const pastSuggestions = suggestions.filter((s) => s.status !== 'open');

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Lightbulb className="w-6 h-6 text-yellow-500" />
            leadScore 改善提案
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            営業タスクの結果データに基づく、AI VP設定の重み調整提案
          </p>
        </div>
        <button
          onClick={fetchSuggestions}
          className="flex items-center gap-1 px-3 py-2 text-sm border rounded-lg hover:bg-zinc-50"
        >
          <RefreshCw className="w-4 h-4" />
          更新
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-zinc-400">読み込み中...</div>
      ) : suggestions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-zinc-400">
            <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>提案はまだ生成されていません</p>
            <p className="text-sm mt-1">
              週次のCronジョブで自動生成されます
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 未対応の提案 */}
          {openSuggestions.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-500" />
                未対応の提案 ({openSuggestions.length})
              </h2>
              <div className="space-y-4">
                {openSuggestions.map((suggestion) => (
                  <SuggestionCard
                    key={suggestion.id}
                    suggestion={suggestion}
                    isExpanded={selectedId === suggestion.id}
                    previewData={selectedId === suggestion.id ? previewData : null}
                    previewLoading={selectedId === suggestion.id && previewLoading}
                    onPreview={() => handlePreview(suggestion.id)}
                    onAccept={() => handleStatusChange(suggestion.id, 'accepted')}
                    onDismiss={() => handleStatusChange(suggestion.id, 'dismissed')}
                  />
                ))}
              </div>
            </section>
          )}

          {/* 過去の提案 */}
          {pastSuggestions.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-3 text-zinc-500">
                過去の提案 ({pastSuggestions.length})
              </h2>
              <div className="space-y-3">
                {pastSuggestions.map((suggestion) => (
                  <SuggestionCard
                    key={suggestion.id}
                    suggestion={suggestion}
                    isExpanded={false}
                    previewData={null}
                    previewLoading={false}
                    onPreview={() => {}}
                    onAccept={() => {}}
                    onDismiss={() => {}}
                    readonly
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

// ======== 提案カード ========

function SuggestionCard({
  suggestion,
  isExpanded,
  previewData,
  previewLoading,
  onPreview,
  onAccept,
  onDismiss,
  readonly = false,
}: {
  suggestion: LeadScoreSuggestion;
  isExpanded: boolean;
  previewData: PreviewData | null;
  previewLoading: boolean;
  onPreview: () => void;
  onAccept: () => void;
  onDismiss: () => void;
  readonly?: boolean;
}) {
  const statusConfig = STATUS_CONFIG[suggestion.status];
  const date = new Date(suggestion.generatedAt);

  return (
    <Card className={readonly ? 'opacity-70' : ''}>
      <CardContent className="p-4">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Badge className={`${statusConfig.bg} ${statusConfig.color} text-xs`}>
              {statusConfig.label}
            </Badge>
            <span className="text-xs text-zinc-400">
              {date.toLocaleDateString('ja-JP')} {date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className="text-xs text-zinc-400">
              直近{suggestion.rangeDays}日 / {suggestion.metrics.totalTickets}件
            </span>
          </div>
          {!readonly && (
            <div className="flex items-center gap-2">
              <button
                onClick={onPreview}
                className="flex items-center gap-1 px-2 py-1 text-xs border rounded hover:bg-zinc-50"
              >
                <Eye className="w-3 h-3" />
                {isExpanded ? '閉じる' : 'プレビュー'}
              </button>
              <button
                onClick={onAccept}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100"
              >
                <Check className="w-3 h-3" />
                参考適用
              </button>
              <button
                onClick={onDismiss}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-zinc-50 text-zinc-600 border rounded hover:bg-zinc-100"
              >
                <X className="w-3 h-3" />
                却下
              </button>
            </div>
          )}
        </div>

        {/* 提案項目 */}
        {suggestion.suggestions.length === 0 ? (
          <p className="text-sm text-zinc-400">現在の結果データでは提案なし</p>
        ) : (
          <div className="space-y-2">
            {suggestion.suggestions.map((item) => (
              <SuggestionItemRow key={item.key} item={item} />
            ))}
          </div>
        )}

        {/* メトリクスサマリー */}
        <div className="mt-3 pt-3 border-t">
          <MetricsSummary suggestion={suggestion} />
        </div>

        {/* プレビュー */}
        {isExpanded && (
          <div className="mt-4 pt-4 border-t">
            {previewLoading ? (
              <div className="text-center py-4 text-zinc-400 text-sm">プレビュー読み込み中...</div>
            ) : previewData ? (
              <ConfigPreview current={previewData.current} preview={previewData.preview} />
            ) : (
              <div className="text-center py-4 text-zinc-400 text-sm">プレビューを取得できませんでした</div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SuggestionItemRow({ item }: { item: LeadScoreSuggestionItem }) {
  const confConfig = CONFIDENCE_CONFIG[item.confidence];
  return (
    <div className="flex items-start gap-3 p-2 bg-zinc-50 rounded-lg">
      <Lightbulb className="w-4 h-4 mt-0.5 text-yellow-500 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{item.title}</span>
          <span className={`text-xs ${confConfig.color}`}>
            [{confConfig.label}]
          </span>
        </div>
        <p className="text-xs text-zinc-500 mt-0.5">{item.rationale}</p>
      </div>
    </div>
  );
}

function MetricsSummary({ suggestion }: { suggestion: LeadScoreSuggestion }) {
  const { metrics } = suggestion;
  const topResults = metrics.resultDistribution
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  return (
    <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
      <div>
        <span className="font-medium">結果分布: </span>
        {topResults.map((r) => (
          <span key={r.code} className="mr-2">
            {r.code}({r.percentage}%)
          </span>
        ))}
      </div>
      {metrics.slaBreachRate > 0 && (
        <div>
          <span className="font-medium">SLA超過: </span>
          {metrics.slaBreachRate}%
        </div>
      )}
    </div>
  );
}

// ======== 設定プレビュー比較 ========

function ConfigPreview({ current, preview }: { current: AiVpConfig; preview: AiVpConfig }) {
  const weightKeys = Object.keys(current.weights) as (keyof typeof current.weights)[];
  const changedWeights = weightKeys.filter(
    (key) => current.weights[key] !== preview.weights[key]
  );

  if (changedWeights.length === 0) {
    return <p className="text-sm text-zinc-400">設定変更なし</p>;
  }

  return (
    <div>
      <h4 className="text-sm font-semibold mb-2">重み変更プレビュー</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-zinc-500">
              <th className="py-1 pr-4">項目</th>
              <th className="py-1 pr-4 text-right">現在</th>
              <th className="py-1 pr-4 text-center"></th>
              <th className="py-1 pr-4 text-right">提案後</th>
              <th className="py-1 text-right">差分</th>
            </tr>
          </thead>
          <tbody>
            {changedWeights.map((key) => {
              const curr = current.weights[key] ?? 0;
              const prev = preview.weights[key] ?? 0;
              const diff = prev - curr;
              return (
                <tr key={key} className="border-b border-zinc-100">
                  <td className="py-1.5 pr-4">
                    {WEIGHT_LABELS[key]?.label || key}
                  </td>
                  <td className="py-1.5 pr-4 text-right font-mono">{curr}</td>
                  <td className="py-1.5 pr-4 text-center">
                    <ArrowRight className="w-3 h-3 text-zinc-400 inline" />
                  </td>
                  <td className="py-1.5 pr-4 text-right font-mono font-semibold">{prev}</td>
                  <td className={`py-1.5 text-right font-mono ${diff > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {diff > 0 ? '+' : ''}{diff}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-400 mt-2">
        ※ この変更は自動適用されません。「参考適用」後、AI VP設定画面で確認・保存してください。
      </p>
    </div>
  );
}
