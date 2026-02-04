'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, Badge, Button } from '@/components/ui';
import {
  FileSignature,
  Plus,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Filter,
  Search,
  ExternalLink,
} from 'lucide-react';
import type {
  ESignRecord,
  ESignStats,
  SignStatus,
  SubjectType,
} from '@/lib/esign/types';
import {
  SIGN_STATUS_CONFIG,
  SUBJECT_TYPE_CONFIG,
  SIGN_METHOD_CONFIG,
} from '@/lib/esign/types';

type TabType = 'requested' | 'signed' | 'expired' | 'all';

export default function ESignPage() {
  const [activeTab, setActiveTab] = useState<TabType>('requested');
  const [records, setRecords] = useState<ESignRecord[]>([]);
  const [stats, setStats] = useState<ESignStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [subjectTypeFilter, setSubjectTypeFilter] = useState<SubjectType | ''>('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // 統計情報取得
      const statsRes = await fetch('/api/e-sign/stats');
      const statsData = await statsRes.json();
      if (statsData.success) {
        setStats(statsData.stats);
      }

      // レコード一覧取得
      const params = new URLSearchParams();
      if (activeTab !== 'all') {
        if (activeTab === 'expired') {
          // 期限切れは requested で期限切れ判定（API側で対応）
          params.set('status', 'expired');
        } else {
          params.set('status', activeTab);
        }
      }
      if (subjectTypeFilter) {
        params.set('subjectType', subjectTypeFilter);
      }
      if (searchQuery) {
        params.set('q', searchQuery);
      }

      const recordsRes = await fetch(`/api/e-sign?${params.toString()}`);
      const recordsData = await recordsRes.json();
      if (recordsData.success) {
        setRecords(recordsData.records);
      }
    } catch (error) {
      console.error('[E-Sign Page] Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, [activeTab, subjectTypeFilter, searchQuery]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    fetchData();
  };

  const tabs: { key: TabType; label: string; icon: typeof Clock }[] = [
    { key: 'requested', label: '署名待ち', icon: Clock },
    { key: 'signed', label: '署名済み', icon: CheckCircle2 },
    { key: 'expired', label: '期限超過', icon: AlertTriangle },
    { key: 'all', label: 'すべて', icon: FileSignature },
  ];

  const getStatusIcon = (status: SignStatus) => {
    switch (status) {
      case 'signed':
        return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case 'requested':
        return <Clock className="w-4 h-4 text-amber-600" />;
      case 'declined':
        return <XCircle className="w-4 h-4 text-red-600" />;
      case 'expired':
        return <AlertTriangle className="w-4 h-4 text-rose-600" />;
      case 'voided':
        return <XCircle className="w-4 h-4 text-zinc-500" />;
      default:
        return null;
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const isOverdue = (record: ESignRecord) => {
    if (record.status !== 'requested') return false;
    if (!record.expiresAt) return false;
    return new Date(record.expiresAt) < new Date();
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <FileSignature className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-900">電子署名ログ</h1>
            <p className="text-sm text-zinc-500">署名/同意の証跡を一元管理</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            更新
          </Button>
          <Link href="/dashboard/e-sign/new">
            <Button className="gap-1.5">
              <Plus className="w-4 h-4" />
              新規登録
            </Button>
          </Link>
        </div>
      </div>

      {/* 統計カード */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <Clock className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-zinc-900">{stats.totalRequested}</div>
                  <div className="text-xs text-zinc-500">署名待ち</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-zinc-900">{stats.totalSigned}</div>
                  <div className="text-xs text-zinc-500">署名済み</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-rose-100 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-zinc-900">{stats.expiringWithin7Days}</div>
                  <div className="text-xs text-zinc-500">7日以内期限</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <FileSignature className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-zinc-900">{stats.signedThisMonth}</div>
                  <div className="text-xs text-zinc-500">今月の署名</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* タブ */}
      <div className="flex items-center gap-1 border-b border-zinc-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-zinc-500 hover:text-zinc-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* フィルタ */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="署名者名で検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-zinc-400" />
          <select
            value={subjectTypeFilter}
            onChange={(e) => setSubjectTypeFilter(e.target.value as SubjectType | '')}
            className="px-3 py-2 text-sm border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">すべての対象者</option>
            {Object.entries(SUBJECT_TYPE_CONFIG).map(([key, config]) => (
              <option key={key} value={key}>
                {config.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* テーブル */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-zinc-400" />
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-12 text-zinc-500">
              該当する署名ログがありません
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-zinc-50 border-b border-zinc-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase">
                      署名者
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase">
                      対象タイプ
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase">
                      ステータス
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase">
                      方法
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase">
                      署名日
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase">
                      期限
                    </th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {records.map((record) => {
                    const statusConfig = SIGN_STATUS_CONFIG[record.status];
                    const subjectConfig = SUBJECT_TYPE_CONFIG[record.subjectType];
                    const methodConfig = SIGN_METHOD_CONFIG[record.method];
                    const overdue = isOverdue(record);

                    return (
                      <tr key={record.id} className="hover:bg-zinc-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-zinc-900">{record.subjectName}</div>
                          {record.note && (
                            <div className="text-xs text-zinc-500 truncate max-w-xs">
                              {record.note}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={`${subjectConfig.bgColor} ${subjectConfig.color} text-xs`}>
                            {subjectConfig.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {getStatusIcon(record.status)}
                            <span className={`text-sm ${statusConfig.color}`}>
                              {overdue ? '期限超過' : statusConfig.label}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-zinc-600">
                          {methodConfig.label}
                        </td>
                        <td className="px-4 py-3 text-sm text-zinc-600">
                          {formatDate(record.signedAt)}
                        </td>
                        <td className="px-4 py-3">
                          {record.expiresAt && (
                            <span
                              className={`text-sm ${
                                overdue ? 'text-rose-600 font-medium' : 'text-zinc-600'
                              }`}
                            >
                              {formatDate(record.expiresAt)}
                            </span>
                          )}
                          {!record.expiresAt && <span className="text-sm text-zinc-400">-</span>}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/dashboard/e-sign/${record.id}`}
                            className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700"
                          >
                            詳細
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
