'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_TENANT_ID } from '@/lib/firebase';
import { getIncidentsByTenant, getBranches } from '@/lib/firestore';
import { generateCSV, downloadFile, formatDateJP } from '@/lib/utils';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardContent, Badge, Button, Select, Input } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { Incident, Branch, CATEGORIES, Category } from '@/types';
import {
  Download,
  Filter,
  Search,
  AlertTriangle,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

const PAGE_SIZE = 20;

export default function AdminIncidentsPage() {
  return (
    <AuthGuard requireAdmin>
      <AdminIncidentsContent />
    </AuthGuard>
  );
}

function AdminIncidentsContent() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [filteredIncidents, setFilteredIncidents] = useState<Incident[]>([]);
  const [currentPage, setCurrentPage] = useState(1);

  // フィルタ
  const [filters, setFilters] = useState({
    branchId: '',
    category: '' as Category | '',
    dateFrom: '',
    dateTo: '',
    fraudOnly: false,
    searchText: '',
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [incidentsData, branchesData] = await Promise.all([
          getIncidentsByTenant(DEFAULT_TENANT_ID, 500),
          getBranches(),
        ]);
        setIncidents(incidentsData);
        setBranches(branchesData);
        setFilteredIncidents(incidentsData);
      } catch (error) {
        console.error('Failed to fetch data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // フィルタ適用
  useEffect(() => {
    let result = [...incidents];

    if (filters.branchId) {
      result = result.filter((i) => i.branchId === filters.branchId);
    }
    if (filters.category) {
      result = result.filter((i) => i.category === filters.category);
    }
    if (filters.dateFrom) {
      result = result.filter((i) => i.date >= filters.dateFrom);
    }
    if (filters.dateTo) {
      result = result.filter((i) => i.date <= filters.dateTo);
    }
    if (filters.fraudOnly) {
      result = result.filter((i) => i.fraudFlag);
    }
    if (filters.searchText) {
      const searchLower = filters.searchText.toLowerCase();
      result = result.filter(
        (i) =>
          i.body.toLowerCase().includes(searchLower) ||
          i.userName?.toLowerCase().includes(searchLower) ||
          i.category.toLowerCase().includes(searchLower)
      );
    }

    setFilteredIncidents(result);
    setCurrentPage(1);
  }, [filters, incidents]);

  const totalPages = Math.ceil(filteredIncidents.length / PAGE_SIZE);
  const paginatedIncidents = filteredIncidents.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const handleExportCSV = () => {
    const headers = [
      'ID',
      '日付',
      '時間帯',
      '事業所',
      '投稿者',
      '職種',
      'カテゴリ',
      '重大度',
      '本文',
      '回避行動',
      '再発防止提案',
      '場所',
      'タグ',
      '本文文字数',
      '合計文字数',
      'スコア',
      '画像あり',
      '不正フラグ',
      '不正理由',
      '投稿日時',
    ];

    const rows = filteredIncidents.map((incident) => [
      incident.id,
      incident.date,
      incident.timeSlot,
      branches.find((b) => b.id === incident.branchId)?.name || '',
      incident.userName || '',
      incident.jobType,
      incident.category,
      incident.severity,
      incident.body,
      incident.action || '',
      incident.prevention || '',
      incident.location || '',
      incident.tags?.join(', ') || '',
      incident.bodyLength,
      incident.totalLength,
      incident.scoreTotal,
      incident.hasImage ? 'あり' : 'なし',
      incident.fraudFlag ? 'あり' : 'なし',
      incident.fraudReason || '',
      incident.createdAt.toISOString(),
    ]);

    const csv = generateCSV(headers, rows);
    const filename = `incidents_${new Date().toISOString().split('T')[0]}.csv`;
    downloadFile(csv, filename);
  };

  const handleResetFilters = () => {
    setFilters({
      branchId: '',
      category: '',
      dateFrom: '',
      dateTo: '',
      fraudOnly: false,
      searchText: '',
    });
  };

  if (loading) {
    return (
      <>
        <Header />
        <Loading text="読み込み中..." />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="pb-8">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-bold text-gray-900">投稿管理</h1>
            <Button onClick={handleExportCSV} variant="outline">
              <Download className="w-4 h-4 mr-2" />
              CSV出力
            </Button>
          </div>

          {/* フィルタ */}
          <Card className="mb-6">
            <CardContent>
              <div className="flex items-center mb-4">
                <Filter className="w-4 h-4 text-gray-500 mr-2" />
                <span className="font-medium text-gray-700">フィルタ</span>
                <button
                  onClick={handleResetFilters}
                  className="ml-auto text-sm text-blue-600 hover:underline"
                >
                  リセット
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="relative md:col-span-2">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="本文・投稿者名で検索"
                    value={filters.searchText}
                    onChange={(e) =>
                      setFilters({ ...filters, searchText: e.target.value })
                    }
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <Select
                  value={filters.branchId}
                  onChange={(e) =>
                    setFilters({ ...filters, branchId: e.target.value })
                  }
                  placeholder="事業所"
                  options={[
                    { value: '', label: 'すべての事業所' },
                    ...branches.map((b) => ({ value: b.id, label: b.name })),
                  ]}
                />

                <Select
                  value={filters.category}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      category: e.target.value as Category | '',
                    })
                  }
                  placeholder="カテゴリ"
                  options={[
                    { value: '', label: 'すべてのカテゴリ' },
                    ...CATEGORIES.map((c) => ({ value: c, label: c })),
                  ]}
                />

                <Input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) =>
                    setFilters({ ...filters, dateFrom: e.target.value })
                  }
                  placeholder="開始日"
                />

                <Input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) =>
                    setFilters({ ...filters, dateTo: e.target.value })
                  }
                  placeholder="終了日"
                />
              </div>

              <div className="mt-4">
                <label className="inline-flex items-center">
                  <input
                    type="checkbox"
                    checked={filters.fraudOnly}
                    onChange={(e) =>
                      setFilters({ ...filters, fraudOnly: e.target.checked })
                    }
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">
                    不正フラグありのみ表示
                  </span>
                </label>
              </div>
            </CardContent>
          </Card>

          {/* 結果サマリー */}
          <div className="mb-4 text-sm text-gray-600">
            {filteredIncidents.length} 件の投稿
            {filters.searchText ||
            filters.branchId ||
            filters.category ||
            filters.dateFrom ||
            filters.dateTo ||
            filters.fraudOnly
              ? '（フィルタ適用中）'
              : ''}
          </div>

          {/* インシデント一覧 */}
          <Card>
            <CardContent className="p-0">
              {paginatedIncidents.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">
                          日付
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">
                          投稿者
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">
                          事業所
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">
                          カテゴリ
                        </th>
                        <th className="px-4 py-3 text-center font-medium text-gray-600">
                          重大度
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600 max-w-xs">
                          本文
                        </th>
                        <th className="px-4 py-3 text-right font-medium text-gray-600">
                          スコア
                        </th>
                        <th className="px-4 py-3 text-center font-medium text-gray-600">
                          状態
                        </th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {paginatedIncidents.map((incident) => (
                        <tr key={incident.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap">
                            {incident.date}
                            <br />
                            <span className="text-xs text-gray-500">
                              {incident.timeSlot}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {incident.userName || '-'}
                            <br />
                            <span className="text-xs text-gray-500">
                              {incident.jobType}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {branches.find((b) => b.id === incident.branchId)
                              ?.name || '-'}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="info">{incident.category}</Badge>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge
                              variant={
                                incident.severity >= 4 ? 'danger' : 'default'
                              }
                            >
                              {incident.severity}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 max-w-xs">
                            <p className="line-clamp-2 text-gray-700">
                              {incident.body}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-blue-600">
                            {incident.scoreTotal} pt
                          </td>
                          <td className="px-4 py-3 text-center">
                            {incident.fraudFlag && (
                              <Badge variant="warning" className="flex items-center">
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                要確認
                              </Badge>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              href={`/incident/${incident.id}`}
                              className="text-blue-600 hover:underline flex items-center"
                            >
                              詳細
                              <ExternalLink className="w-3 h-3 ml-1" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  条件に一致する投稿がありません
                </div>
              )}
            </CardContent>
          </Card>

          {/* ページネーション */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-gray-600">
                {(currentPage - 1) * PAGE_SIZE + 1} -{' '}
                {Math.min(currentPage * PAGE_SIZE, filteredIncidents.length)} /{' '}
                {filteredIncidents.length} 件
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm text-gray-600">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
