'use client';

/**
 * 監査ビューページ
 *
 * Ticket 064-final: 横断監査ビュー
 *
 * /dashboard/audit - 監査ログの横断検索・表示
 */

import { useState, useEffect, useCallback } from 'react';
import {
  AUDIT_SOURCE_LABELS,
  AUDIT_SEVERITY_CONFIG,
  type AuditSource,
  type AuditSeverity,
  type AuditEntry,
} from '@/lib/audit/types';
import { useApiFetch } from '@/hooks/useApiFetch';

// ========== 型定義 ==========

interface AuditQueryResult {
  items: AuditEntry[];
  total: number;
}

interface FilterState {
  from: string;
  to: string;
  source: AuditSource | '';
  severity: AuditSeverity | '';
  actorUserId: string;
  q: string;
}

// ========== ヘルパー関数 ==========

function getDefaultDates() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 7);
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  };
}

function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// ========== コンポーネント ==========

export default function AuditDashboardPage() {
  const apiFetch = useApiFetch();
  const defaultDates = getDefaultDates();

  const [filters, setFilters] = useState<FilterState>({
    from: defaultDates.from,
    to: defaultDates.to,
    source: '',
    severity: '',
    actorUserId: '',
    q: '',
  });

  const [result, setResult] = useState<AuditQueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);

  const limit = 50;

  const fetchAuditLogs = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      if (filters.source) params.set('source', filters.source);
      if (filters.severity) params.set('severity', filters.severity);
      if (filters.actorUserId) params.set('actorUserId', filters.actorUserId);
      if (filters.q) params.set('q', filters.q);
      params.set('limit', String(limit));
      params.set('offset', String(page * limit));

      const response = await apiFetch(`/api/audit-log?${params}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || '取得に失敗しました');
      }

      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '予期せぬエラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [filters, page, apiFetch]);

  useEffect(() => {
    fetchAuditLogs();
  }, [fetchAuditLogs]);

  const handleFilterChange = (key: keyof FilterState, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(0); // フィルタ変更時はページをリセット
  };

  const handleSearch = () => {
    setPage(0);
    fetchAuditLogs();
  };

  const handleExportCsv = () => {
    const params = new URLSearchParams();
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    if (filters.source) params.set('source', filters.source);
    if (filters.severity) params.set('severity', filters.severity);
    if (filters.actorUserId) params.set('actorUserId', filters.actorUserId);
    if (filters.q) params.set('q', filters.q);

    window.location.href = `/api/audit-log/export.csv?${params}`;
  };

  const totalPages = result ? Math.ceil(result.total / limit) : 0;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-zinc-800">監査ビュー</h1>
        <button
          onClick={handleExportCsv}
          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm"
        >
          CSV出力
        </button>
      </div>

      {/* フィルタ */}
      <div className="bg-white border border-zinc-200 rounded-lg p-4 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">開始日</label>
            <input
              type="date"
              value={filters.from}
              onChange={(e) => handleFilterChange('from', e.target.value)}
              className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">終了日</label>
            <input
              type="date"
              value={filters.to}
              onChange={(e) => handleFilterChange('to', e.target.value)}
              className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">ソース</label>
            <select
              value={filters.source}
              onChange={(e) => handleFilterChange('source', e.target.value)}
              className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm"
            >
              <option value="">すべて</option>
              {Object.entries(AUDIT_SOURCE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">重要度</label>
            <select
              value={filters.severity}
              onChange={(e) => handleFilterChange('severity', e.target.value)}
              className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm"
            >
              <option value="">すべて</option>
              {Object.entries(AUDIT_SEVERITY_CONFIG).map(([key, config]) => (
                <option key={key} value={key}>
                  {config.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">アクターID</label>
            <input
              type="text"
              value={filters.actorUserId}
              onChange={(e) => handleFilterChange('actorUserId', e.target.value)}
              placeholder="user_xxx"
              className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">検索</label>
            <input
              type="text"
              value={filters.q}
              onChange={(e) => handleFilterChange('q', e.target.value)}
              placeholder="キーワード"
              className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm disabled:opacity-50"
          >
            {loading ? '検索中...' : '検索'}
          </button>
        </div>
      </div>

      {/* エラー */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md mb-6">
          {error}
        </div>
      )}

      {/* 結果 */}
      {result && (
        <>
          <div className="text-sm text-zinc-500 mb-2">
            {result.total}件中 {page * limit + 1} - {Math.min((page + 1) * limit, result.total)}件を表示
          </div>

          <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 border-b border-zinc-200">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">発生日時</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">ソース</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">アクション</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">重要度</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">アクター</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">サマリー</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">対象</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {result.items.map((entry) => {
                  const severityConfig = AUDIT_SEVERITY_CONFIG[entry.severity];
                  return (
                    <tr
                      key={entry.id}
                      className="hover:bg-zinc-50 cursor-pointer"
                      onClick={() => setSelectedEntry(entry)}
                    >
                      <td className="px-4 py-3 text-zinc-600 whitespace-nowrap">
                        {formatDateTime(entry.occurredAt)}
                      </td>
                      <td className="px-4 py-3 text-zinc-600">
                        {AUDIT_SOURCE_LABELS[entry.source]}
                      </td>
                      <td className="px-4 py-3 text-zinc-800 font-medium">
                        {entry.action}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${severityConfig.color} ${severityConfig.bgColor}`}
                        >
                          {severityConfig.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-600">
                        {entry.actorName ?? entry.actorUserId ?? '-'}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 max-w-xs truncate">
                        {entry.summary}
                      </td>
                      <td className="px-4 py-3 text-zinc-500 text-xs">
                        {entry.targetType && (
                          <span>
                            {entry.targetType}
                            {entry.targetId && `: ${entry.targetId}`}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {result.items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                      該当するログがありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ページネーション */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1 border border-zinc-300 rounded text-sm disabled:opacity-50"
              >
                前へ
              </button>
              <span className="text-sm text-zinc-600">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1 border border-zinc-300 rounded text-sm disabled:opacity-50"
              >
                次へ
              </button>
            </div>
          )}
        </>
      )}

      {/* 詳細モーダル */}
      {selectedEntry && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setSelectedEntry(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-zinc-800">監査ログ詳細</h2>
                <button
                  onClick={() => setSelectedEntry(null)}
                  className="text-zinc-400 hover:text-zinc-600"
                >
                  ×
                </button>
              </div>

              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-zinc-500">ID</dt>
                  <dd className="font-mono text-zinc-800">{selectedEntry.id}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">発生日時</dt>
                  <dd className="text-zinc-800">{formatDateTime(selectedEntry.occurredAt)}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">ソース</dt>
                  <dd className="text-zinc-800">{AUDIT_SOURCE_LABELS[selectedEntry.source]}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">アクション</dt>
                  <dd className="text-zinc-800 font-medium">{selectedEntry.action}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">重要度</dt>
                  <dd>
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${AUDIT_SEVERITY_CONFIG[selectedEntry.severity].color} ${AUDIT_SEVERITY_CONFIG[selectedEntry.severity].bgColor}`}
                    >
                      {AUDIT_SEVERITY_CONFIG[selectedEntry.severity].label}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">アクター</dt>
                  <dd className="text-zinc-800">
                    {selectedEntry.actorName ?? selectedEntry.actorUserId ?? '-'}
                    {selectedEntry.actorUserId && selectedEntry.actorName && (
                      <span className="text-zinc-400 ml-2 font-mono text-xs">
                        ({selectedEntry.actorUserId})
                      </span>
                    )}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-zinc-500">サマリー</dt>
                  <dd className="text-zinc-800">{selectedEntry.summary}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">対象種別</dt>
                  <dd className="text-zinc-800">{selectedEntry.targetType ?? '-'}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">対象ID</dt>
                  <dd className="text-zinc-800 font-mono">{selectedEntry.targetId ?? '-'}</dd>
                </div>
                {selectedEntry.metaJson && (
                  <div className="col-span-2">
                    <dt className="text-zinc-500 mb-2">メタデータ</dt>
                    <dd className="bg-zinc-100 rounded p-3 font-mono text-xs overflow-auto max-h-48">
                      <pre>{JSON.stringify(JSON.parse(selectedEntry.metaJson), null, 2)}</pre>
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
