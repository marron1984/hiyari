'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Search,
  Filter,
  Download,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Info,
  Shield,
  Calendar,
  User,
  FileText,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, Button, Badge, Input } from '@/components/ui';
import {
  AUDIT_SOURCE_CONFIG,
  AUDIT_SEVERITY_CONFIG,
  type AuditEntry,
  type AuditSource,
  type AuditSeverity,
} from '@/lib/audit/types';

interface FilterState {
  from: string;
  to: string;
  source: string;
  severity: string;
  q: string;
}

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState<FilterState>({
    from: '',
    to: '',
    source: '',
    severity: '',
    q: '',
  });
  const [showFilters, setShowFilters] = useState(false);

  const limit = 50;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      if (filters.source) params.set('source', filters.source);
      if (filters.severity) params.set('severity', filters.severity);
      if (filters.q) params.set('q', filters.q);
      params.set('limit', String(limit));
      params.set('offset', String(page * limit));

      const res = await fetch(`/api/audit-log?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'エラーが発生しました');
        setEntries([]);
        setTotal(0);
      } else {
        setEntries(data.items ?? []);
        setTotal(data.total ?? 0);
      }
    } catch (err) {
      setError('通信エラーが発生しました');
      setEntries([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleFilterChange = (key: keyof FilterState, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(0);
  };

  const handleExportCsv = () => {
    const params = new URLSearchParams();
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    if (filters.source) params.set('source', filters.source);
    if (filters.severity) params.set('severity', filters.severity);
    if (filters.q) params.set('q', filters.q);

    window.open(`/api/audit-log/export?${params.toString()}`, '_blank');
  };

  const getSeverityIcon = (severity: AuditSeverity) => {
    switch (severity) {
      case 'critical':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      default:
        return <Info className="w-4 h-4 text-zinc-400" />;
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('ja-JP', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-violet-100 rounded-xl">
            <Shield className="w-6 h-6 text-violet-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">監査ログ</h1>
            <p className="text-sm text-zinc-500">横断的な証跡検索</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={fetchLogs} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            更新
          </Button>
          <Button variant="secondary" size="sm" onClick={handleExportCsv}>
            <Download className="w-4 h-4 mr-1" />
            CSV出力
          </Button>
        </div>
      </div>

      {/* エラー表示 */}
      {error && (
        <Card className="mb-6 border-red-200 bg-red-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-5 h-5" />
              <span>{error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* フィルタバー */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex items-center gap-4 flex-wrap">
            {/* 検索 */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <Input
                type="text"
                placeholder="サマリーを検索..."
                value={filters.q}
                onChange={(e) => handleFilterChange('q', e.target.value)}
                className="pl-10"
              />
            </div>

            {/* フィルタトグル */}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="w-4 h-4 mr-1" />
              フィルタ
              <ChevronDown className={`w-4 h-4 ml-1 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </Button>
          </div>

          {/* 詳細フィルタ */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-zinc-200 grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* 期間 */}
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">開始日</label>
                <Input
                  type="date"
                  value={filters.from}
                  onChange={(e) => handleFilterChange('from', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">終了日</label>
                <Input
                  type="date"
                  value={filters.to}
                  onChange={(e) => handleFilterChange('to', e.target.value)}
                />
              </div>

              {/* ソース */}
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">ソース</label>
                <select
                  value={filters.source}
                  onChange={(e) => handleFilterChange('source', e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm"
                >
                  <option value="">すべて</option>
                  {Object.entries(AUDIT_SOURCE_CONFIG).map(([key, config]) => (
                    <option key={key} value={key}>{config.label}</option>
                  ))}
                </select>
              </div>

              {/* 重要度 */}
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">重要度</label>
                <select
                  value={filters.severity}
                  onChange={(e) => handleFilterChange('severity', e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm"
                >
                  <option value="">すべて</option>
                  {Object.entries(AUDIT_SEVERITY_CONFIG).map(([key, config]) => (
                    <option key={key} value={key}>{config.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 件数表示 */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-zinc-600">
          {total.toLocaleString()}件中 {page * limit + 1} - {Math.min((page + 1) * limit, total)}件を表示
        </p>
      </div>

      {/* ログ一覧 */}
      <Card>
        <div className="divide-y divide-zinc-100">
          {loading && entries.length === 0 ? (
            <div className="p-8 text-center text-zinc-400">
              <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" />
              読み込み中...
            </div>
          ) : entries.length === 0 ? (
            <div className="p-8 text-center text-zinc-400">
              <FileText className="w-6 h-6 mx-auto mb-2 opacity-50" />
              該当するログがありません
            </div>
          ) : (
            entries.map((entry) => {
              const sourceConfig = AUDIT_SOURCE_CONFIG[entry.source];
              const severityConfig = AUDIT_SEVERITY_CONFIG[entry.severity];
              const isExpanded = expandedId === entry.id;

              return (
                <div key={entry.id} className="hover:bg-zinc-50 transition-colors">
                  <button
                    className="w-full px-4 py-3 flex items-center gap-4 text-left"
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  >
                    {/* 展開アイコン */}
                    <div className="shrink-0">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-zinc-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-zinc-400" />
                      )}
                    </div>

                    {/* 重要度 */}
                    <div className="shrink-0">
                      {getSeverityIcon(entry.severity)}
                    </div>

                    {/* 日時 */}
                    <div className="shrink-0 w-20 text-xs text-zinc-500">
                      {formatDate(entry.occurredAt)}
                    </div>

                    {/* ソース */}
                    <Badge className={`shrink-0 ${sourceConfig.bgColor} ${sourceConfig.color} text-xs`}>
                      {sourceConfig.label}
                    </Badge>

                    {/* アクション */}
                    <Badge className={`shrink-0 ${severityConfig.bgColor} ${severityConfig.color} text-xs`}>
                      {entry.action}
                    </Badge>

                    {/* サマリー */}
                    <div className="flex-1 min-w-0 text-sm text-zinc-700 truncate">
                      {entry.summary}
                    </div>

                    {/* アクター */}
                    {entry.actorUserId && (
                      <div className="shrink-0 flex items-center gap-1 text-xs text-zinc-500">
                        <User className="w-3 h-3" />
                        {entry.actorName ?? entry.actorUserId}
                      </div>
                    )}
                  </button>

                  {/* 詳細 */}
                  {isExpanded && (
                    <div className="px-4 pb-4 ml-8 border-l-2 border-zinc-200">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-zinc-500">日時:</span>{' '}
                          <span className="text-zinc-700">{new Date(entry.occurredAt).toLocaleString('ja-JP')}</span>
                        </div>
                        <div>
                          <span className="text-zinc-500">ソース:</span>{' '}
                          <span className="text-zinc-700">{sourceConfig.label}</span>
                        </div>
                        <div>
                          <span className="text-zinc-500">アクション:</span>{' '}
                          <span className="text-zinc-700">{entry.action}</span>
                        </div>
                        <div>
                          <span className="text-zinc-500">重要度:</span>{' '}
                          <span className={severityConfig.color}>{severityConfig.label}</span>
                        </div>
                        {entry.actorUserId && (
                          <div>
                            <span className="text-zinc-500">操作者:</span>{' '}
                            <span className="text-zinc-700">{entry.actorName ?? entry.actorUserId}</span>
                          </div>
                        )}
                        {entry.targetType && (
                          <div>
                            <span className="text-zinc-500">対象:</span>{' '}
                            <span className="text-zinc-700">{entry.targetType} / {entry.targetId}</span>
                          </div>
                        )}
                      </div>

                      {/* メタ情報 */}
                      {entry.metaJson && (
                        <div className="mt-3 p-3 bg-zinc-50 rounded-lg">
                          <p className="text-xs font-medium text-zinc-500 mb-2">詳細情報</p>
                          <pre className="text-xs text-zinc-600 overflow-x-auto">
                            {JSON.stringify(entry.metaJson, null, 2)}
                          </pre>
                        </div>
                      )}

                      {/* 関連リンク */}
                      {entry.targetId && (
                        <div className="mt-3">
                          <Link
                            href={getTargetLink(entry)}
                            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                          >
                            <ExternalLink className="w-4 h-4" />
                            関連項目を表示
                          </Link>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </Card>

      {/* ページネーション */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            前へ
          </Button>
          <span className="text-sm text-zinc-600">
            {page + 1} / {totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
          >
            次へ
          </Button>
        </div>
      )}
    </div>
  );
}

function getTargetLink(entry: AuditEntry): string {
  if (!entry.targetId) return '#';

  switch (entry.targetType) {
    case 'ticket':
      return `/dashboard/tickets/${entry.targetId}`;
    case 'esign_record':
      return `/dashboard/e-sign/${entry.targetId}`;
    case 'external_user':
      return `/admin/external-accounts`;
    case 'ai_vp_config':
      return `/dashboard/ai-vp/settings`;
    case 'consent':
      return `/dashboard/consent`;
    case 'contract':
      return `/dashboard/contracts`;
    default:
      return '#';
  }
}
