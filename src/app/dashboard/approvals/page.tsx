'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Loading } from '@/components/Loading';
import { Card, Button, Badge } from '@/components/ui';
import {
  Plus,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  Edit,
  RotateCcw,
  AlertTriangle,
  RefreshCw,
  AlertCircle,
  Wallet,
  Timer,
  ClipboardList,
  ChevronDown,
} from 'lucide-react';
import { getRingisByUser } from '@/lib/ringi';
import { Ringi, RingiStatus, RINGI_STATUS_LABELS, RINGI_STATUS_COLORS } from '@/types';
import {
  ApplicationType,
  APPLICATION_TYPE_LABELS,
  ExpensePayload,
  OvertimePayload,
} from '@/types/application';
import { LAUNCH_MODE } from '@/config/launchMode';

const AUTO_REFRESH_INTERVAL = 60000;

type ApprovalType = 'ALL' | 'RINGI' | 'EXPENSE' | 'OVERTIME';

interface ApplicationItem {
  id: string;
  type: ApplicationType;
  title: string;
  status: RingiStatus;
  authorId: string;
  authorName: string;
  amount?: number;
  payload?: ExpensePayload | OvertimePayload;
  category?: string;
  urgency?: string;
  createdAt: string | Date;
  submittedAt?: string | Date;
}

export default function ApprovalsListPage() {
  const { user, firebaseUser } = useAuth();
  const [items, setItems] = useState<ApplicationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [typeFilter, setTypeFilter] = useState<ApprovalType>('ALL');
  const [statusFilter, setStatusFilter] = useState<'all' | RingiStatus>('all');
  const [showNewMenu, setShowNewMenu] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const loadData = useCallback(
    async (showLoadingState = true) => {
      if (!user || !firebaseUser) return;

      if (showLoadingState) {
        setRefreshing(true);
      }
      setError(null);

      try {
        const token = await firebaseUser.getIdToken();

        // Fetch all three types in parallel
        const [ringisData, applicationsRes] = await Promise.all([
          getRingisByUser(user.id, user.tenantId),
          fetch('/api/applications?mine=1', {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        // Process ringis
        const ringiItems: ApplicationItem[] = ringisData.map((r: Ringi) => ({
          id: r.id,
          type: 'RINGI' as ApplicationType,
          title: r.title,
          status: r.status,
          authorId: r.authorId,
          authorName: r.authorName,
          amount: r.amount,
          category: r.category,
          urgency: r.urgency,
          createdAt: r.createdAt,
          submittedAt: r.submittedAt,
        }));

        // Process applications (expense, overtime)
        let appItems: ApplicationItem[] = [];
        if (applicationsRes.ok) {
          const appData = await applicationsRes.json();
          appItems = (appData.applications || []).map((a: ApplicationItem) => ({
            id: a.id,
            type: a.type,
            title: a.title,
            status: a.status,
            authorId: a.authorId,
            authorName: a.authorName,
            amount: a.amount,
            payload: a.payload,
            createdAt: a.createdAt,
            submittedAt: a.submittedAt,
          }));
        }

        // Merge and sort by createdAt (newest first)
        const allItems = [...ringiItems, ...appItems].sort((a, b) => {
          const aTime = new Date(a.createdAt).getTime();
          const bTime = new Date(b.createdAt).getTime();
          return bTime - aTime;
        });

        setItems(allItems);
        setLastUpdated(new Date());
      } catch (err) {
        console.error('Failed to load data:', err);
        setError(err instanceof Error ? err.message : 'データの取得に失敗しました');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user, firebaseUser]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      loadData(false);
    }, AUTO_REFRESH_INTERVAL);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [loadData]);

  const handleRefresh = () => {
    loadData(true);
  };

  // Filter items
  let filteredItems = items;
  if (typeFilter !== 'ALL') {
    filteredItems = filteredItems.filter((item) => item.type === typeFilter);
  }
  if (statusFilter !== 'all') {
    filteredItems = filteredItems.filter((item) => item.status === statusFilter);
  }

  const statusIcon = (status: RingiStatus) => {
    switch (status) {
      case 'draft':
        return <Edit className="w-4 h-4" />;
      case 'submitted':
        return <Clock className="w-4 h-4" />;
      case 'approved':
        return <CheckCircle className="w-4 h-4" />;
      case 'rejected':
        return <XCircle className="w-4 h-4" />;
      case 'returned':
        return <RotateCcw className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  const typeIcon = (type: ApplicationType) => {
    switch (type) {
      case 'RINGI':
        return <ClipboardList className="w-4 h-4" />;
      case 'EXPENSE':
        return <Wallet className="w-4 h-4" />;
      case 'OVERTIME':
        return <Timer className="w-4 h-4" />;
    }
  };

  const formatDate = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat('ja-JP', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleString('ja-JP', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const displayCount = (count: number | null): string => {
    if (error || count === null) return '--';
    return count.toString();
  };

  const getItemLink = (item: ApplicationItem) => {
    if (item.type === 'RINGI') {
      return `/ringi/${item.id}`;
    }
    return `/dashboard/applications/${item.id}`;
  };

  const getSubtitle = (item: ApplicationItem) => {
    if (item.type === 'RINGI') {
      return item.category || '';
    }
    if (item.type === 'EXPENSE') {
      const payload = item.payload as ExpensePayload;
      return payload ? `${payload.category} / ${payload.expenseDate}` : '';
    }
    if (item.type === 'OVERTIME') {
      const payload = item.payload as OvertimePayload;
      return payload ? `${payload.date} / ${payload.hours}時間` : '';
    }
    return '';
  };

  // Counts
  const draftCount = error ? null : items.filter((i) => i.status === 'draft').length;
  const submittedCount = error ? null : items.filter((i) => i.status === 'submitted').length;
  const returnedCount = error ? null : items.filter((i) => i.status === 'returned').length;
  const approvedCount = error ? null : items.filter((i) => i.status === 'approved').length;

  if (loading) {
    return <Loading text="読み込み中..." />;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 safe-bottom">
        {/* Page Title */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-zinc-900">承認</h1>
            {lastUpdated && (
              <p className="text-xs text-zinc-400 mt-1 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                最終更新: {formatTime(lastUpdated)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
            <div className="relative">
              <Button size="sm" onClick={() => setShowNewMenu(!showNewMenu)}>
                <Plus className="w-4 h-4" />
                新規申請
                <ChevronDown className="w-4 h-4 ml-1" />
              </Button>
              {showNewMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowNewMenu(false)}
                  />
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-zinc-200 z-20 overflow-hidden">
                    <Link
                      href="/dashboard/approvals/new"
                      onClick={() => setShowNewMenu(false)}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 transition-colors"
                    >
                      <ClipboardList className="w-5 h-5 text-blue-600" />
                      <span className="font-medium">稟議</span>
                    </Link>
                    {!LAUNCH_MODE && (
                      <>
                        <Link
                          href="/dashboard/applications/expense/new"
                          onClick={() => setShowNewMenu(false)}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 transition-colors"
                        >
                          <Wallet className="w-5 h-5 text-green-600" />
                          <span className="font-medium">経費申請</span>
                        </Link>
                        <Link
                          href="/dashboard/attendance/overtime/new"
                          onClick={() => setShowNewMenu(false)}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 transition-colors"
                        >
                          <Timer className="w-5 h-5 text-purple-600" />
                          <span className="font-medium">残業申請</span>
                        </Link>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <Card className="p-4 mb-6 bg-red-50 border border-red-200">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-red-800">データ取得エラー</p>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
              <Button variant="secondary" size="sm" onClick={handleRefresh}>
                再試行
              </Button>
            </div>
          </Card>
        )}

        {/* Type Tabs */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
          {(LAUNCH_MODE ? ['ALL', 'RINGI'] as ApprovalType[] : ['ALL', 'RINGI', 'EXPENSE', 'OVERTIME'] as ApprovalType[]).map((type) => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                typeFilter === type
                  ? 'bg-zinc-900 text-white'
                  : 'bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200'
              }`}
            >
              {type === 'ALL' ? (
                <FileText className="w-4 h-4" />
              ) : (
                typeIcon(type as ApplicationType)
              )}
              {type === 'ALL' ? 'すべて' : APPLICATION_TYPE_LABELS[type as ApplicationType]}
              {!error && (
                <span className="text-xs opacity-70">
                  {type === 'ALL'
                    ? items.length
                    : items.filter((i) => i.type === type).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <Card className="p-3 text-center">
            <p className={`text-2xl font-bold ${error ? 'text-zinc-400' : 'text-zinc-900'}`}>
              {displayCount(draftCount)}
            </p>
            <p className="text-xs text-zinc-500">下書き</p>
          </Card>
          <Card
            className={`p-3 text-center ${
              submittedCount && submittedCount > 0 ? 'bg-amber-50 border-amber-200' : ''
            }`}
          >
            <p className={`text-2xl font-bold ${error ? 'text-zinc-400' : 'text-amber-600'}`}>
              {displayCount(submittedCount)}
            </p>
            <p className="text-xs text-zinc-500">申請中</p>
          </Card>
          {returnedCount && returnedCount > 0 ? (
            <Card className="p-3 text-center bg-orange-50 border-orange-200">
              <p className="text-2xl font-bold text-orange-600">{displayCount(returnedCount)}</p>
              <p className="text-xs text-orange-600">差戻し</p>
            </Card>
          ) : (
            <Card className="p-3 text-center">
              <p className={`text-2xl font-bold ${error ? 'text-zinc-400' : 'text-emerald-600'}`}>
                {displayCount(approvedCount)}
              </p>
              <p className="text-xs text-zinc-500">承認済</p>
            </Card>
          )}
        </div>

        {/* Returned Alert */}
        {returnedCount && returnedCount > 0 && !error && (
          <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-xl flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0" />
            <div>
              <p className="text-sm font-medium text-orange-700">
                {returnedCount}件の申請が差戻されています
              </p>
              <p className="text-xs text-orange-600">修正して再申請してください</p>
            </div>
          </div>
        )}

        {/* Status Filter */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
          {(['all', 'draft', 'submitted', 'approved', 'rejected', 'returned'] as const).map(
            (status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  statusFilter === status
                    ? 'bg-zinc-700 text-white'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}
              >
                {status === 'all' ? 'すべて' : RINGI_STATUS_LABELS[status]}
              </button>
            )
          )}
        </div>

        {/* List */}
        <div className="space-y-3">
          {error ? (
            <Card className="p-8 text-center">
              <AlertCircle className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
              <p className="text-zinc-500">データを取得できませんでした</p>
              <Button variant="secondary" size="sm" onClick={handleRefresh} className="mt-4">
                <RefreshCw className="w-4 h-4 mr-1" />
                再試行
              </Button>
            </Card>
          ) : filteredItems.length === 0 ? (
            <Card className="p-8 text-center">
              <FileText className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
              <p className="text-zinc-500">申請がありません</p>
            </Card>
          ) : (
            filteredItems.map((item) => {
              const colors = RINGI_STATUS_COLORS[item.status];
              return (
                <Link key={`${item.type}-${item.id}`} href={getItemLink(item)}>
                  <Card className="p-4 hover:bg-zinc-50 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge
                            className={`${
                              item.type === 'RINGI'
                                ? 'bg-blue-100 text-blue-700'
                                : item.type === 'EXPENSE'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-purple-100 text-purple-700'
                            }`}
                          >
                            {typeIcon(item.type)}
                            <span className="ml-1">{APPLICATION_TYPE_LABELS[item.type]}</span>
                          </Badge>
                          <Badge className={`${colors.bg} ${colors.text}`}>
                            {statusIcon(item.status)}
                            <span className="ml-1">{RINGI_STATUS_LABELS[item.status]}</span>
                          </Badge>
                          <span className="text-xs text-zinc-400">{getSubtitle(item)}</span>
                          {item.urgency === '至急' && (
                            <Badge className="bg-red-100 text-red-700 text-xs">至急</Badge>
                          )}
                        </div>
                        <h3 className="font-medium text-zinc-900 truncate">{item.title}</h3>
                      </div>
                      <div className="text-right shrink-0">
                        {item.amount && (
                          <p className="text-sm font-medium text-zinc-900">
                            ¥{item.amount.toLocaleString()}
                          </p>
                        )}
                        {item.type === 'OVERTIME' && item.payload && (
                          <p className="text-sm font-medium text-zinc-900">
                            {(item.payload as OvertimePayload).hours}h
                          </p>
                        )}
                        <p className="text-xs text-zinc-400 mt-1">{formatDate(item.createdAt)}</p>
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })
          )}
        </div>

      {/* Footer */}
      <div className="mt-6 text-center text-xs text-zinc-400">
        <p>自動更新: 60秒ごと</p>
      </div>
    </div>
  );
}
