'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, Badge } from '@/components/ui';
import {
  Ticket,
  Plus,
  Filter,
  Search,
  User,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  ChevronRight,
  Calendar,
  Building2,
} from 'lucide-react';
import type {
  Ticket as TicketType,
  TicketStatus,
  TicketPriority,
  TicketCategory,
  TicketStats,
} from '@/lib/tickets/types';
import {
  TICKET_STATUS_CONFIG,
  TICKET_PRIORITY_CONFIG,
  TICKET_CATEGORY_CONFIG,
} from '@/lib/tickets/types';
import type { BusinessUnit } from '@/lib/business/types';

type TabType = 'my_assigned' | 'my_requested' | 'open' | 'overdue';

const TABS: { id: TabType; label: string; icon: React.ReactNode; myFilter?: string; statusFilter?: string; overdueFilter?: boolean }[] = [
  { id: 'my_assigned', label: '自分の担当', icon: <User className="w-4 h-4" />, myFilter: 'assigned' },
  { id: 'my_requested', label: '自分の起票', icon: <Ticket className="w-4 h-4" />, myFilter: 'requested' },
  { id: 'open', label: 'オープン', icon: <RefreshCw className="w-4 h-4" /> },
  { id: 'overdue', label: '期限超過', icon: <AlertTriangle className="w-4 h-4" />, overdueFilter: true },
];

export default function TicketsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('my_assigned');
  const [tickets, setTickets] = useState<TicketType[]>([]);
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // フィルタ
  const [statusFilter, setStatusFilter] = useState<TicketStatus | ''>('');
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | ''>('');
  const [categoryFilter, setCategoryFilter] = useState<TicketCategory | ''>('');
  const [businessUnitFilter, setBusinessUnitFilter] = useState('');  // Task 030
  const [searchQuery, setSearchQuery] = useState('');

  // Task 030: 事業単位リスト
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();

      // タブによるフィルタ
      const tab = TABS.find(t => t.id === activeTab);
      if (tab?.myFilter) {
        params.append('my', tab.myFilter);
      }
      if (tab?.overdueFilter) {
        params.append('overdue', 'true');
      }

      // オープンタブの場合、open/in_progress/waitingのみ
      if (activeTab === 'open' && !statusFilter) {
        // status filter will be applied in the display logic
      }

      // 追加フィルタ
      if (statusFilter) params.append('status', statusFilter);
      if (priorityFilter) params.append('priority', priorityFilter);
      if (categoryFilter) params.append('category', categoryFilter);
      if (businessUnitFilter) params.append('businessUnitId', businessUnitFilter);  // Task 030
      if (searchQuery) params.append('q', searchQuery);

      const res = await fetch(`/api/tickets?${params.toString()}`);
      const data = await res.json();

      let items = data.items || [];

      // オープンタブの場合、ステータスでフィルタ
      if (activeTab === 'open' && !statusFilter) {
        items = items.filter((t: TicketType) => ['open', 'in_progress', 'waiting'].includes(t.status));
      }

      setTickets(items);
      setTotalCount(data.totalCount || 0);
    } catch (error) {
      console.error('Failed to fetch tickets:', error);
    } finally {
      setLoading(false);
    }
  }, [activeTab, statusFilter, priorityFilter, categoryFilter, businessUnitFilter, searchQuery]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/tickets/stats');
      const data = await res.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  }, []);

  // Task 030: 事業単位リスト取得
  const fetchBusinessUnits = useCallback(async () => {
    try {
      const res = await fetch('/api/business/units');
      if (res.ok) {
        const data = await res.json();
        setBusinessUnits(data.units || []);
      }
    } catch (error) {
      console.error('Failed to fetch business units:', error);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
    fetchStats();
    fetchBusinessUnits();
  }, [fetchTickets, fetchStats, fetchBusinessUnits]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ja-JP', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isOverdue = (ticket: TicketType) => {
    if (!ticket.dueAt) return false;
    if (['resolved', 'closed', 'archived'].includes(ticket.status)) return false;
    return new Date(ticket.dueAt) < new Date();
  };

  return (
    <main className="pb-8">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg">
              <Ticket className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-zinc-900">チケット管理</h1>
              <p className="text-sm text-zinc-500">
                問い合わせ・対応チケット
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/tickets/new"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            新規作成
          </Link>
        </div>

        {/* 統計カード */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-blue-700">{stats.open}</div>
                <div className="text-xs text-blue-600">オープン</div>
              </CardContent>
            </Card>
            <Card className="bg-red-50 border-red-200">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-red-700">{stats.urgentOpen}</div>
                <div className="text-xs text-red-600">緊急</div>
              </CardContent>
            </Card>
            <Card className="bg-amber-50 border-amber-200">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-amber-700">{stats.overdue}</div>
                <div className="text-xs text-amber-600">期限超過</div>
              </CardContent>
            </Card>
            <Card className="bg-indigo-50 border-indigo-200">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-indigo-700">{stats.myAssignedOpen}</div>
                <div className="text-xs text-indigo-600">自分の担当</div>
              </CardContent>
            </Card>
            <Card className="bg-green-50 border-green-200">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-green-700">{stats.resolvedThisWeek}</div>
                <div className="text-xs text-green-600">今週解決</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* タブ */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.id === 'overdue' && stats && stats.overdue > 0 && (
                <Badge className="bg-red-500 text-white text-xs ml-1">
                  {stats.overdue}
                </Badge>
              )}
            </button>
          ))}
        </div>

        {/* フィルタ */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 text-sm text-zinc-600">
                <Filter className="w-4 h-4" />
                <span className="font-medium">フィルタ:</span>
              </div>

              {/* ステータス */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as TicketStatus | '')}
                className="px-3 py-1.5 border border-zinc-200 rounded-lg text-sm"
              >
                <option value="">全ステータス</option>
                {Object.entries(TICKET_STATUS_CONFIG).map(([key, config]) => (
                  <option key={key} value={key}>{config.label}</option>
                ))}
              </select>

              {/* 優先度 */}
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value as TicketPriority | '')}
                className="px-3 py-1.5 border border-zinc-200 rounded-lg text-sm"
              >
                <option value="">全優先度</option>
                {Object.entries(TICKET_PRIORITY_CONFIG).map(([key, config]) => (
                  <option key={key} value={key}>{config.emoji} {config.label}</option>
                ))}
              </select>

              {/* カテゴリ */}
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as TicketCategory | '')}
                className="px-3 py-1.5 border border-zinc-200 rounded-lg text-sm"
              >
                <option value="">全カテゴリ</option>
                {Object.entries(TICKET_CATEGORY_CONFIG).map(([key, config]) => (
                  <option key={key} value={key}>{config.icon} {config.label}</option>
                ))}
              </select>

              {/* Task 030: 事業単位 */}
              <select
                value={businessUnitFilter}
                onChange={(e) => setBusinessUnitFilter(e.target.value)}
                className="px-3 py-1.5 border border-zinc-200 rounded-lg text-sm"
              >
                <option value="">全事業</option>
                {businessUnits.map((bu) => (
                  <option key={bu.id} value={bu.id}>{bu.name}</option>
                ))}
              </select>

              {/* 検索 */}
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="タイトル・内容で検索..."
                    className="w-full pl-10 pr-4 py-1.5 border border-zinc-200 rounded-lg text-sm"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* チケット一覧 */}
        {loading ? (
          <div className="text-center py-12 text-zinc-500">読み込み中...</div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-12 text-zinc-500">
            チケットがありません
          </div>
        ) : (
          <div className="space-y-3">
            {tickets.map((ticket) => (
              <Link key={ticket.id} href={`/dashboard/tickets/${ticket.id}`}>
                <Card className={`hover:shadow-md transition-all cursor-pointer ${
                  isOverdue(ticket) ? 'border-red-300 bg-red-50/30' : ''
                }`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      {/* 優先度バッジ */}
                      <div className={`w-10 h-10 flex items-center justify-center rounded-lg text-lg ${
                        TICKET_PRIORITY_CONFIG[ticket.priority].bg
                      }`}>
                        {TICKET_PRIORITY_CONFIG[ticket.priority].emoji}
                      </div>

                      {/* メインコンテンツ */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <Badge className={`text-xs ${
                            TICKET_STATUS_CONFIG[ticket.status].bg
                          } ${TICKET_STATUS_CONFIG[ticket.status].color}`}>
                            {TICKET_STATUS_CONFIG[ticket.status].label}
                          </Badge>
                          <Badge className="bg-zinc-100 text-zinc-600 text-xs">
                            {TICKET_CATEGORY_CONFIG[ticket.category].icon}{' '}
                            {TICKET_CATEGORY_CONFIG[ticket.category].label}
                          </Badge>
                          {isOverdue(ticket) && (
                            <Badge className="bg-red-100 text-red-700 text-xs flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              期限超過
                            </Badge>
                          )}
                        </div>

                        <h3 className="font-medium text-zinc-800 mb-1 truncate">
                          {ticket.title}
                        </h3>

                        <div className="flex items-center gap-4 text-xs text-zinc-500">
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {ticket.assigneeUserName || '未割当'}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDate(ticket.updatedAt)}
                          </span>
                          {ticket.dueAt && (
                            <span className={`flex items-center gap-1 ${
                              isOverdue(ticket) ? 'text-red-600 font-medium' : ''
                            }`}>
                              <Calendar className="w-3 h-3" />
                              期限: {formatDate(ticket.dueAt)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 矢印 */}
                      <ChevronRight className="w-5 h-5 text-zinc-400 flex-shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}

        {/* 件数表示 */}
        <div className="mt-4 text-center text-sm text-zinc-500">
          {totalCount}件中 {tickets.length}件表示
        </div>
      </div>
    </main>
  );
}
