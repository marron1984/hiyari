'use client';

/**
 * 承認ログ（監査ビュー）ページ
 *
 * /dashboard/approval-log
 * - 横断検索（期間、種別、アクション、ステータス等）
 * - 統計サマリー
 * - CSVエクスポート
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ClipboardList,
  Search,
  Download,
  Filter,
  Calendar,
  CheckCircle,
  XCircle,
  RotateCcw,
  Send,
  Ban,
  MessageSquare,
  Clock,
  User,
  TrendingUp,
  RefreshCw,
} from 'lucide-react';

interface LogItem {
  actionId: string;
  createdAt: string;
  action: string;
  note: string | null;
  actor: {
    id: string;
    name: string;
  };
  request: {
    id: string;
    requestType: string;
    title: string;
    status: string;
    requester: {
      id: string;
      name: string;
    };
    submittedAt: string | null;
    decidedAt: string | null;
    currentStepOrder: number;
  };
}

interface LogStats {
  totalActions: number;
  submits: number;
  approvals: number;
  rejects: number;
  returns: number;
  cancels: number;
  comments: number;
  avgLeadTimeHours: number | null;
  topActors: { userId: string; userName: string; count: number }[];
}

const REQUEST_TYPE_LABELS: Record<string, string> = {
  expense: '経費申請',
  overtime: '残業申請',
  generic: '汎用申請',
};

const ACTION_LABELS: Record<string, string> = {
  submit: '提出',
  approve: '承認',
  reject: '却下',
  return: '差戻し',
  cancel: '取消',
  comment: 'コメント',
};

const STATUS_LABELS: Record<string, string> = {
  draft: '下書き',
  pending: '承認待ち',
  approved: '承認済み',
  rejected: '却下',
  returned: '差戻し',
  cancelled: '取消',
};

function ActionIcon({ action }: { action: string }) {
  switch (action) {
    case 'approve':
      return <CheckCircle className="h-4 w-4 text-green-600" />;
    case 'reject':
      return <XCircle className="h-4 w-4 text-red-600" />;
    case 'return':
      return <RotateCcw className="h-4 w-4 text-yellow-600" />;
    case 'submit':
      return <Send className="h-4 w-4 text-blue-600" />;
    case 'cancel':
      return <Ban className="h-4 w-4 text-zinc-600" />;
    case 'comment':
      return <MessageSquare className="h-4 w-4 text-purple-600" />;
    default:
      return <ClipboardList className="h-4 w-4 text-zinc-400" />;
  }
}

function ActionBadge({ action }: { action: string }) {
  const colors: Record<string, string> = {
    approve: 'bg-green-100 text-green-800',
    reject: 'bg-red-100 text-red-800',
    return: 'bg-yellow-100 text-yellow-800',
    submit: 'bg-blue-100 text-blue-800',
    cancel: 'bg-zinc-100 text-zinc-800',
    comment: 'bg-purple-100 text-purple-800',
  };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${colors[action] ?? 'bg-zinc-100 text-zinc-800'}`}>
      <ActionIcon action={action} />
      {ACTION_LABELS[action] ?? action}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: 'bg-zinc-100 text-zinc-700',
    pending: 'bg-blue-100 text-blue-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    returned: 'bg-yellow-100 text-yellow-700',
    cancelled: 'bg-zinc-100 text-zinc-700',
  };

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[status] ?? 'bg-zinc-100 text-zinc-700'}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function formatDateTime(isoString: string): string {
  const d = new Date(isoString);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function getDefaultDateRange(): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { from, to };
}

export default function ApprovalLogPage() {
  const defaultDates = getDefaultDateRange();

  const [logs, setLogs] = useState<LogItem[]>([]);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // フィルタ状態
  const [dateFrom, setDateFrom] = useState(defaultDates.from);
  const [dateTo, setDateTo] = useState(defaultDates.to);
  const [requestType, setRequestType] = useState('');
  const [action, setAction] = useState('');
  const [status, setStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 50;

  // フィルタパネル表示
  const [showFilters, setShowFilters] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (requestType) params.set('requestType', requestType);
      if (action) params.set('action', action);
      if (status) params.set('status', status);
      if (searchQuery) params.set('q', searchQuery);
      params.set('limit', String(limit));
      params.set('offset', String(offset));

      const res = await fetch(`/api/approval-log?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch logs');
      const data = await res.json();
      setLogs(data.items);
      setTotalCount(data.totalCount);
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, requestType, action, status, searchQuery, offset]);

  const fetchStats = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (requestType) params.set('requestType', requestType);
      if (action) params.set('action', action);
      if (status) params.set('status', status);
      if (searchQuery) params.set('q', searchQuery);

      const res = await fetch(`/api/approval-log/stats?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch stats');
      const data = await res.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  }, [dateFrom, dateTo, requestType, action, status, searchQuery]);

  useEffect(() => {
    fetchLogs();
    fetchStats();
  }, [fetchLogs, fetchStats]);

  const handleSearch = () => {
    setOffset(0);
    fetchLogs();
    fetchStats();
  };

  const handleExport = () => {
    const params = new URLSearchParams();
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    if (requestType) params.set('requestType', requestType);
    if (action) params.set('action', action);
    if (status) params.set('status', status);
    if (searchQuery) params.set('q', searchQuery);

    window.open(`/api/approval-log/export?${params.toString()}`, '_blank');
  };

  const handleResetFilters = () => {
    const defaults = getDefaultDateRange();
    setDateFrom(defaults.from);
    setDateTo(defaults.to);
    setRequestType('');
    setAction('');
    setStatus('');
    setSearchQuery('');
    setOffset(0);
  };

  const hasMorePages = offset + limit < totalCount;
  const hasPrevPages = offset > 0;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-8 w-8 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">承認ログ（監査ビュー）</h1>
            <p className="text-sm text-zinc-500">承認履歴の横断検索・監査</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-zinc-300 rounded-lg hover:bg-zinc-50"
          >
            <Filter className="h-4 w-4" />
            フィルタ
          </button>
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <Download className="h-4 w-4" />
            CSVエクスポート
          </button>
        </div>
      </div>

      {/* 統計サマリー */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
          <div className="bg-white rounded-lg border border-zinc-200 p-4">
            <div className="text-sm text-zinc-500">総アクション</div>
            <div className="text-2xl font-bold text-zinc-900">{stats.totalActions}</div>
          </div>
          <div className="bg-white rounded-lg border border-zinc-200 p-4">
            <div className="text-sm text-zinc-500">提出</div>
            <div className="text-2xl font-bold text-blue-600">{stats.submits}</div>
          </div>
          <div className="bg-white rounded-lg border border-zinc-200 p-4">
            <div className="text-sm text-zinc-500">承認</div>
            <div className="text-2xl font-bold text-green-600">{stats.approvals}</div>
          </div>
          <div className="bg-white rounded-lg border border-zinc-200 p-4">
            <div className="text-sm text-zinc-500">却下</div>
            <div className="text-2xl font-bold text-red-600">{stats.rejects}</div>
          </div>
          <div className="bg-white rounded-lg border border-zinc-200 p-4">
            <div className="text-sm text-zinc-500">差戻し</div>
            <div className="text-2xl font-bold text-yellow-600">{stats.returns}</div>
          </div>
          <div className="bg-white rounded-lg border border-zinc-200 p-4">
            <div className="text-sm text-zinc-500">取消</div>
            <div className="text-2xl font-bold text-zinc-600">{stats.cancels}</div>
          </div>
          <div className="bg-white rounded-lg border border-zinc-200 p-4">
            <div className="flex items-center gap-1 text-sm text-zinc-500">
              <Clock className="h-3 w-3" />
              平均処理時間
            </div>
            <div className="text-2xl font-bold text-purple-600">
              {stats.avgLeadTimeHours !== null ? `${stats.avgLeadTimeHours}h` : '-'}
            </div>
          </div>
        </div>
      )}

      {/* トップアクター */}
      {stats && stats.topActors.length > 0 && (
        <div className="bg-white rounded-lg border border-zinc-200 p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-zinc-500" />
            <span className="text-sm font-medium text-zinc-700">アクション数上位</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {stats.topActors.map((actor, idx) => (
              <span
                key={actor.userId}
                className="inline-flex items-center gap-1 px-2 py-1 bg-zinc-100 rounded text-sm"
              >
                <span className="text-zinc-400">{idx + 1}.</span>
                <User className="h-3 w-3 text-zinc-400" />
                {actor.userName}
                <span className="text-zinc-500">({actor.count})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* フィルタパネル */}
      {showFilters && (
        <div className="bg-white rounded-lg border border-zinc-200 p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                <Calendar className="inline h-3 w-3 mr-1" />
                開始日
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                <Calendar className="inline h-3 w-3 mr-1" />
                終了日
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">申請種別</label>
              <select
                value={requestType}
                onChange={(e) => setRequestType(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">すべて</option>
                <option value="expense">経費申請</option>
                <option value="overtime">残業申請</option>
                <option value="generic">汎用申請</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">アクション</label>
              <select
                value={action}
                onChange={(e) => setAction(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">すべて</option>
                <option value="submit">提出</option>
                <option value="approve">承認</option>
                <option value="reject">却下</option>
                <option value="return">差戻し</option>
                <option value="cancel">取消</option>
                <option value="comment">コメント</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">ステータス</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">すべて</option>
                <option value="pending">承認待ち</option>
                <option value="approved">承認済み</option>
                <option value="rejected">却下</option>
                <option value="returned">差戻し</option>
                <option value="cancelled">取消</option>
              </select>
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                <Search className="inline h-3 w-3 mr-1" />
                タイトル検索
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="申請タイトルで検索..."
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={handleResetFilters}
              className="inline-flex items-center gap-2 px-3 py-2 text-zinc-600 hover:text-zinc-800"
            >
              <RefreshCw className="h-4 w-4" />
              リセット
            </button>
            <button
              onClick={handleSearch}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Search className="h-4 w-4" />
              検索
            </button>
          </div>
        </div>
      )}

      {/* ログ一覧 */}
      <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
          <span className="text-sm text-zinc-600">
            {totalCount}件中 {offset + 1}〜{Math.min(offset + limit, totalCount)}件を表示
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-zinc-500">読み込み中...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-zinc-500">該当するログがありません</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">日時</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">種別</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">タイトル</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">申請者</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">実行者</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">アクション</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">ステータス</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-600">詳細</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {logs.map((log) => (
                  <tr key={log.actionId} className="hover:bg-zinc-50">
                    <td className="px-4 py-3 text-zinc-600 whitespace-nowrap">
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs bg-zinc-100 px-2 py-0.5 rounded">
                        {REQUEST_TYPE_LABELS[log.request.requestType] ?? log.request.requestType}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-xs truncate">
                      {log.request.title}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-zinc-600">
                      {log.request.requester.name}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-zinc-600">
                      {log.actor.name}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <ActionBadge action={log.action} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge status={log.request.status} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link
                        href={`/dashboard/approvals/${log.request.id}`}
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        詳細
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ページネーション */}
        {(hasPrevPages || hasMorePages) && (
          <div className="px-4 py-3 border-t border-zinc-200 flex justify-between items-center">
            <button
              onClick={() => setOffset(Math.max(0, offset - limit))}
              disabled={!hasPrevPages}
              className="px-3 py-1 text-sm border border-zinc-300 rounded hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              前へ
            </button>
            <span className="text-sm text-zinc-500">
              ページ {Math.floor(offset / limit) + 1} / {Math.ceil(totalCount / limit)}
            </span>
            <button
              onClick={() => setOffset(offset + limit)}
              disabled={!hasMorePages}
              className="px-3 py-1 text-sm border border-zinc-300 rounded hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              次へ
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
