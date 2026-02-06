'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, Badge } from '@/components/ui';
import {
  Users,
  Phone,
  Calendar,
  Building2,
  Clock,
  AlertTriangle,
  CheckCircle,
  Eye,
  Home,
  FileText,
  XCircle,
  TrendingUp,
  RefreshCw,
  ChevronRight,
} from 'lucide-react';
import type {
  Ticket,
  VacancyInquiryStage,
  VacancyInquiryStats,
} from '@/lib/tickets/types';
import {
  VACANCY_INQUIRY_STAGE_CONFIG,
} from '@/lib/tickets/types';
import type { BusinessUnit } from '@/lib/business/types';

// ステージ順序
const STAGE_ORDER: VacancyInquiryStage[] = [
  'new',
  'contacted',
  'tour_scheduled',
  'applied',
  'accepted',
  'rejected',
  'closed',
];

// ステージアイコン
const STAGE_ICONS: Record<VacancyInquiryStage, React.ReactNode> = {
  new: <Phone className="w-4 h-4" />,
  contacted: <CheckCircle className="w-4 h-4" />,
  tour_scheduled: <Calendar className="w-4 h-4" />,
  applied: <FileText className="w-4 h-4" />,
  accepted: <Home className="w-4 h-4" />,
  rejected: <XCircle className="w-4 h-4" />,
  closed: <XCircle className="w-4 h-4" />,
};

export default function VacancyInquiriesPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<VacancyInquiryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState<VacancyInquiryStage | ''>('');
  const [businessUnitFilter, setBusinessUnitFilter] = useState('');
  const [slaFilter, setSlaFilter] = useState(false);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('relatedType', 'vacancy_inquiry');

      if (stageFilter) params.append('stage', stageFilter);
      if (businessUnitFilter) params.append('businessUnitId', businessUnitFilter);
      if (slaFilter) params.append('slaBreached', 'true');

      const [ticketsRes, statsRes] = await Promise.all([
        fetch(`/api/tickets?${params.toString()}`),
        fetch(`/api/tickets/vacancy-inquiry-stats${businessUnitFilter ? `?businessUnitId=${businessUnitFilter}` : ''}`),
      ]);

      const ticketsData = await ticketsRes.json();
      setTickets(ticketsData.items || []);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }, [stageFilter, businessUnitFilter, slaFilter]);

  // 事業単位取得
  useEffect(() => {
    fetch('/api/business-units')
      .then((res) => res.json())
      .then((data) => setBusinessUnits(data.items || []))
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ステージ変更
  const handleStageChange = async (ticketId: string, newStage: VacancyInquiryStage) => {
    try {
      const res = await fetch(`/api/tickets/${ticketId}/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: newStage }),
      });

      if (res.ok) {
        // ローカルで更新
        setTickets((prev) =>
          prev.map((t) =>
            t.id === ticketId
              ? { ...t, stage: newStage, stageChangedAt: new Date().toISOString() }
              : t
          )
        );
        // 統計も再取得
        fetchData();
      }
    } catch (error) {
      console.error('Failed to update stage:', error);
    }
  };

  // SLA超過判定
  const isSlaBreached = (ticket: Ticket): boolean => {
    if (!ticket.slaDueAt) return false;
    if (ticket.stage !== 'new') return false;
    return new Date(ticket.slaDueAt) < new Date();
  };

  // 時間フォーマット
  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  // 残り時間計算
  const getTimeRemaining = (slaDueAt: string | null): string => {
    if (!slaDueAt) return '-';
    const diff = new Date(slaDueAt).getTime() - Date.now();
    if (diff < 0) {
      const hours = Math.floor(-diff / (1000 * 60 * 60));
      return `${hours}時間超過`;
    }
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `残り${hours}時間${minutes}分`;
  };

  return (
    <div className="p-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-600" />
            空室問い合わせ管理
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            問い合わせのステージ管理・SLA監視
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
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {STAGE_ORDER.map((stage) => {
            const config = VACANCY_INQUIRY_STAGE_CONFIG[stage];
            const count = stats.byStage[stage] || 0;
            const isActive = stageFilter === stage;

            return (
              <button
                key={stage}
                onClick={() => setStageFilter(isActive ? '' : stage)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  isActive
                    ? `${config.bg} ${config.border} ring-2 ring-offset-1`
                    : 'bg-white hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={config.color}>{STAGE_ICONS[stage]}</span>
                  <span className="text-xs text-gray-500">{config.label}</span>
                </div>
                <div className={`text-2xl font-bold ${config.color}`}>
                  {count}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* サマリー行 */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{stats.total}</div>
                <div className="text-xs text-gray-500">総問い合わせ</div>
              </div>
            </div>
          </Card>

          <Card
            className={`p-4 cursor-pointer ${slaFilter ? 'ring-2 ring-red-500' : ''}`}
            onClick={() => setSlaFilter(!slaFilter)}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">
                  {stats.slaBreached}
                </div>
                <div className="text-xs text-gray-500">SLA超過</div>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {stats.slaComplianceRate}%
                </div>
                <div className="text-xs text-gray-500">SLA遵守率</div>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100">
                <Home className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-600">
                  {stats.byStage.accepted || 0}
                </div>
                <div className="text-xs text-gray-500">成約数</div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* フィルタ */}
      <div className="flex items-center gap-4 flex-wrap">
        <select
          value={businessUnitFilter}
          onChange={(e) => setBusinessUnitFilter(e.target.value)}
          className="px-3 py-2 border rounded-lg text-sm"
        >
          <option value="">全事業所</option>
          {businessUnits.map((bu) => (
            <option key={bu.id} value={bu.id}>
              {bu.name}
            </option>
          ))}
        </select>

        {stageFilter && (
          <Badge
            className={`${VACANCY_INQUIRY_STAGE_CONFIG[stageFilter].bg} ${VACANCY_INQUIRY_STAGE_CONFIG[stageFilter].color} cursor-pointer`}
            onClick={() => setStageFilter('')}
          >
            {VACANCY_INQUIRY_STAGE_CONFIG[stageFilter].label} ×
          </Badge>
        )}

        {slaFilter && (
          <Badge
            className="bg-red-100 text-red-700 cursor-pointer"
            onClick={() => setSlaFilter(false)}
          >
            SLA超過のみ ×
          </Badge>
        )}
      </div>

      {/* チケット一覧 */}
      {loading ? (
        <div className="flex justify-center py-12">
          <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : tickets.length === 0 ? (
        <Card className="p-12 text-center">
          <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500">該当する問い合わせがありません</p>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    タイトル
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    ステージ
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    担当者
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    事業所
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    SLA期限
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    作成日
                  </th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {tickets.map((ticket) => {
                  const breached = isSlaBreached(ticket);
                  const stageConfig = ticket.stage
                    ? VACANCY_INQUIRY_STAGE_CONFIG[ticket.stage]
                    : null;

                  return (
                    <tr
                      key={ticket.id}
                      className={`hover:bg-gray-50 ${breached ? 'bg-red-50' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/tickets/${ticket.id}`}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          {ticket.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={ticket.stage || 'new'}
                          onChange={(e) =>
                            handleStageChange(
                              ticket.id,
                              e.target.value as VacancyInquiryStage
                            )
                          }
                          className={`px-2 py-1 rounded border text-xs ${
                            stageConfig
                              ? `${stageConfig.bg} ${stageConfig.color} ${stageConfig.border}`
                              : ''
                          }`}
                        >
                          {STAGE_ORDER.map((s) => (
                            <option key={s} value={s}>
                              {VACANCY_INQUIRY_STAGE_CONFIG[s].label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {ticket.assigneeUserName || (
                          <span className="text-orange-500">未割当</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {businessUnits.find((b) => b.id === ticket.businessUnitId)
                          ?.name || '-'}
                      </td>
                      <td className="px-4 py-3">
                        {ticket.stage === 'new' && ticket.slaDueAt ? (
                          <div
                            className={`flex items-center gap-1 ${
                              breached ? 'text-red-600 font-medium' : 'text-gray-600'
                            }`}
                          >
                            {breached && (
                              <AlertTriangle className="w-4 h-4" />
                            )}
                            {getTimeRemaining(ticket.slaDueAt)}
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {formatDate(ticket.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/dashboard/tickets/${ticket.id}`}>
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* 今週の統計 */}
      {stats && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-600" />
            今週のファネル
          </h2>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-blue-600">
                {stats.thisWeek.newCount}
              </div>
              <div className="text-xs text-gray-500">新規</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-cyan-600">
                {stats.thisWeek.contactedCount}
              </div>
              <div className="text-xs text-gray-500">連絡済み</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-600">
                {stats.thisWeek.tourScheduledCount}
              </div>
              <div className="text-xs text-gray-500">見学予定</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-600">
                {stats.thisWeek.appliedCount}
              </div>
              <div className="text-xs text-gray-500">申込み</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">
                {stats.thisWeek.acceptedCount}
              </div>
              <div className="text-xs text-gray-500">成約</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600">
                {stats.thisWeek.rejectedCount}
              </div>
              <div className="text-xs text-gray-500">不成約</div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
