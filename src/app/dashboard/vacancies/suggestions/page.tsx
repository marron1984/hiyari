'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, Badge, Button } from '@/components/ui';
import {
  AlertCircle,
  CheckCircle,
  XCircle,
  RefreshCw,
  ArrowDown,
  ArrowUp,
  Calendar,
  Pause,
  FileText,
  Building2,
  ExternalLink,
} from 'lucide-react';
import type {
  VacancyUpdateSuggestion,
  VacancySuggestionType,
  VacancySuggestionStatus,
} from '@/lib/vacancySuggestions/types';
import {
  SUGGESTION_TYPE_CONFIG,
  SUGGESTION_STATUS_CONFIG,
} from '@/lib/vacancySuggestions/types';

// タイプアイコン
const TYPE_ICONS: Record<VacancySuggestionType, React.ReactNode> = {
  decrease_available: <ArrowDown className="w-4 h-4 text-red-500" />,
  increase_available: <ArrowUp className="w-4 h-4 text-green-500" />,
  change_availableFrom: <Calendar className="w-4 h-4 text-blue-500" />,
  pause: <Pause className="w-4 h-4 text-yellow-500" />,
  other: <FileText className="w-4 h-4 text-gray-500" />,
};

// ステータスアイコン
const STATUS_ICONS: Record<VacancySuggestionStatus, React.ReactNode> = {
  open: <AlertCircle className="w-4 h-4" />,
  applied: <CheckCircle className="w-4 h-4" />,
  dismissed: <XCircle className="w-4 h-4" />,
};

export default function VacancySuggestionsPage() {
  const [suggestions, setSuggestions] = useState<VacancyUpdateSuggestion[]>([]);
  const [stats, setStats] = useState<{ open: number; applied: number; dismissed: number }>({
    open: 0,
    applied: 0,
    dismissed: 0,
  });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<VacancySuggestionStatus | ''>('open');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [dismissReason, setDismissReason] = useState('');
  const [showDismissModal, setShowDismissModal] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);

      const res = await fetch(`/api/vacancy-suggestions?${params.toString()}`);
      const data = await res.json();
      setSuggestions(data.items || []);
      setStats(data.stats || { open: 0, applied: 0, dismissed: 0 });
    } catch (error) {
      console.error('Failed to fetch suggestions:', error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 適用
  const handleApply = async (id: string) => {
    if (processingId) return;
    setProcessingId(id);

    try {
      const res = await fetch(`/api/vacancy-suggestions/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'apply' }),
      });

      if (res.ok) {
        fetchData();
      } else {
        const data = await res.json();
        alert(data.error || '適用に失敗しました');
      }
    } catch (error) {
      console.error('Failed to apply suggestion:', error);
    } finally {
      setProcessingId(null);
    }
  };

  // 却下
  const handleDismiss = async (id: string) => {
    if (processingId) return;
    setProcessingId(id);

    try {
      const res = await fetch(`/api/vacancy-suggestions/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss', reason: dismissReason }),
      });

      if (res.ok) {
        setShowDismissModal(null);
        setDismissReason('');
        fetchData();
      } else {
        const data = await res.json();
        alert(data.error || '却下に失敗しました');
      }
    } catch (error) {
      console.error('Failed to dismiss suggestion:', error);
    } finally {
      setProcessingId(null);
    }
  };

  // 日時フォーマット
  const formatDateTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  // パッチ内容を表示用に整形
  const formatPatch = (patch: VacancyUpdateSuggestion['suggestedPatchJson']): string => {
    const parts: string[] = [];
    if (patch.availableCount !== undefined) {
      parts.push(`空室数: ${patch.availableCount}`);
    }
    if (patch.availableFrom !== undefined) {
      parts.push(`入居可: ${patch.availableFrom || '未定'}`);
    }
    if (patch.status !== undefined) {
      parts.push(`ステータス: ${patch.status === 'paused' ? '一時停止' : '公開'}`);
    }
    return parts.join(', ');
  };

  return (
    <div className="p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertCircle className="w-6 h-6 text-yellow-600" />
            空室更新提案
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            成約に基づく空室情報の自動更新提案
          </p>
        </div>
        <button
          onClick={fetchData}
          className="p-2 rounded-lg hover:bg-gray-100"
          title="更新"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* 統計カード */}
      <div className="grid grid-cols-3 gap-4">
        <Card
          className={`p-4 cursor-pointer ${statusFilter === 'open' ? 'ring-2 ring-yellow-500' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'open' ? '' : 'open')}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-100">
              <AlertCircle className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{stats.open}</div>
              <div className="text-xs text-gray-500">未対応</div>
            </div>
          </div>
        </Card>

        <Card
          className={`p-4 cursor-pointer ${statusFilter === 'applied' ? 'ring-2 ring-green-500' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'applied' ? '' : 'applied')}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{stats.applied}</div>
              <div className="text-xs text-gray-500">適用済</div>
            </div>
          </div>
        </Card>

        <Card
          className={`p-4 cursor-pointer ${statusFilter === 'dismissed' ? 'ring-2 ring-gray-500' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'dismissed' ? '' : 'dismissed')}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gray-100">
              <XCircle className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{stats.dismissed}</div>
              <div className="text-xs text-gray-500">却下</div>
            </div>
          </div>
        </Card>
      </div>

      {/* 一覧 */}
      {loading ? (
        <div className="flex justify-center py-12">
          <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : suggestions.length === 0 ? (
        <Card className="p-12 text-center">
          <AlertCircle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500">
            {statusFilter === 'open'
              ? '未対応の提案はありません'
              : '該当する提案がありません'}
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {suggestions.map((suggestion) => {
            const typeConfig = SUGGESTION_TYPE_CONFIG[suggestion.suggestionType];
            const statusConfig = SUGGESTION_STATUS_CONFIG[suggestion.status];

            return (
              <Card key={suggestion.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    {/* タイプ＆ステータス */}
                    <div className="flex items-center gap-2 mb-2">
                      {TYPE_ICONS[suggestion.suggestionType]}
                      <span className="font-medium">{typeConfig.label}</span>
                      <Badge
                        className={`text-xs ${statusConfig.bg} ${statusConfig.color}`}
                      >
                        {STATUS_ICONS[suggestion.status]}
                        <span className="ml-1">{statusConfig.label}</span>
                      </Badge>
                    </div>

                    {/* 理由 */}
                    <p className="text-sm text-gray-700 mb-2">{suggestion.reason}</p>

                    {/* 変更内容 */}
                    <div className="bg-gray-50 rounded p-2 text-sm mb-2">
                      <span className="text-gray-500">変更内容: </span>
                      <span className="font-mono">
                        {formatPatch(suggestion.suggestedPatchJson)}
                      </span>
                    </div>

                    {/* メタ情報 */}
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Building2 className="w-3 h-3" />
                        {suggestion.businessUnitId}
                      </span>
                      <span>{formatDateTime(suggestion.createdAt)}</span>
                      {suggestion.sourceType === 'vacancy_inquiry' && (
                        <a
                          href={`/dashboard/tickets/${suggestion.sourceId}`}
                          className="flex items-center gap-1 text-blue-600 hover:underline"
                        >
                          <ExternalLink className="w-3 h-3" />
                          チケット
                        </a>
                      )}
                    </div>

                    {/* 適用/却下情報 */}
                    {suggestion.status === 'applied' && suggestion.appliedAt && (
                      <div className="text-xs text-green-600 mt-2">
                        適用: {formatDateTime(suggestion.appliedAt)}
                      </div>
                    )}
                    {suggestion.status === 'dismissed' && suggestion.dismissedAt && (
                      <div className="text-xs text-gray-500 mt-2">
                        却下: {formatDateTime(suggestion.dismissedAt)}
                        {suggestion.dismissedReason && ` - ${suggestion.dismissedReason}`}
                      </div>
                    )}
                  </div>

                  {/* アクションボタン */}
                  {suggestion.status === 'open' && (
                    <div className="flex flex-col gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleApply(suggestion.id)}
                        disabled={processingId === suggestion.id}
                      >
                        <CheckCircle className="w-4 h-4 mr-1" />
                        適用
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowDismissModal(suggestion.id)}
                        disabled={processingId === suggestion.id}
                      >
                        <XCircle className="w-4 h-4 mr-1" />
                        却下
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* 却下モーダル */}
      {showDismissModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold mb-4">提案を却下</h2>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">却下理由（任意）</label>
              <textarea
                value={dismissReason}
                onChange={(e) => setDismissReason(e.target.value)}
                placeholder="例: 仮予約のため保留"
                className="w-full px-3 py-2 border rounded-lg h-20 resize-none"
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowDismissModal(null);
                  setDismissReason('');
                }}
              >
                キャンセル
              </Button>
              <Button
                className="flex-1"
                onClick={() => handleDismiss(showDismissModal)}
                disabled={processingId === showDismissModal}
              >
                {processingId === showDismissModal ? '処理中...' : '却下する'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
