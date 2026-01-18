'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { getApprovals, ApprovalFilter, getPendingCountByRole } from '@/lib/repositories/approvals';
import {
  Approval,
  APPROVAL_CATEGORIES,
  APPROVAL_STATUSES,
  ApprovalStatus,
} from '@/types/database';
import { formatDateJP } from '@/lib/utils';

type ViewMode = 'mine' | 'pending' | 'all';

function ApprovalsPageContent() {
  const router = useRouter();
  const { profile, organization, facility, isManagerOrAbove, isHqOrAbove, isServiceChiefOrAbove, isFacilityManagerOrAbove, isAreaManagerOrAbove } = useSupabaseAuth();
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>('mine');
  const [filter, setFilter] = useState<ApprovalFilter>({});
  const [searchText, setSearchText] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const pageSize = 20;
  const totalPages = Math.ceil(totalCount / pageSize);

  const fetchApprovals = useCallback(async () => {
    if (!organization || !profile || !facility) return;

    setLoading(true);
    try {
      const appliedFilter: ApprovalFilter = {
        ...filter,
        search: searchText || undefined,
      };

      // 表示モードによるフィルター
      if (viewMode === 'mine') {
        appliedFilter.applicant_id = profile.id;
      } else if (viewMode === 'pending') {
        // 5段階承認フロー：各ロールが承認可能なステータスでフィルター
        // getPendingCountByRoleと同様のロジック
        switch (profile.role) {
          case 'service_chief':
            appliedFilter.facility_id = facility.id;
            appliedFilter.status = 'level1_pending';
            break;
          case 'facility_manager':
            appliedFilter.facility_id = facility.id;
            // level1_pending または level2_pending（承認可能なもの）
            break;
          case 'area_manager':
            // level1〜3_pending
            break;
          case 'hq':
          case 'admin':
            // 全レベル承認可能
            break;
        }
      }

      const result = await getApprovals(appliedFilter, page, pageSize);
      setApprovals(result.data);
      setTotalCount(result.count);

      // 承認待ち件数取得
      if (isManagerOrAbove) {
        const pending = await getPendingCountByRole(
          facility.id,
          organization.id,
          profile.role
        );
        setPendingCount(pending);
      }
    } catch (error) {
      console.error('Error fetching approvals:', error);
    } finally {
      setLoading(false);
    }
  }, [organization, profile, facility, filter, searchText, page, viewMode, isManagerOrAbove]);

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchApprovals();
  };

  const handleFilterChange = (key: keyof ApprovalFilter, value: string) => {
    setFilter((prev) => ({
      ...prev,
      [key]: value || undefined,
    }));
    setPage(1);
  };

  const getStatusBadge = (status: ApprovalStatus) => {
    const statusInfo = APPROVAL_STATUSES.find((s) => s.value === status);
    if (!statusInfo) return null;

    const variantMap: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
      default: 'default',
      success: 'success',
      warning: 'warning',
      danger: 'danger',
      info: 'info',
    };

    return (
      <Badge variant={variantMap[statusInfo.color] || 'default'}>
        {statusInfo.label}
      </Badge>
    );
  };

  const isOverdue = (approval: Approval) => {
    if (!approval.desired_due_date) return false;
    if (approval.status === 'approved' || approval.status === 'rejected') return false;
    return new Date(approval.desired_due_date) < new Date();
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">稟議</h1>
          <p className="text-sm text-gray-500 mt-1">
            備品購入や設備修繕などの申請・承認管理
          </p>
        </div>
        <Button onClick={() => router.push('/approvals/new')}>
          <Plus className="w-4 h-4 mr-2" />
          新規申請
        </Button>
      </div>

      {/* タブ */}
      <div className="flex items-center gap-4 mb-6 border-b">
        <button
          onClick={() => {
            setViewMode('mine');
            setPage(1);
          }}
          className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
            viewMode === 'mine'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          自分の申請
        </button>
        {isManagerOrAbove && (
          <button
            onClick={() => {
              setViewMode('pending');
              setPage(1);
            }}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              viewMode === 'pending'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            承認待ち
            {pendingCount > 0 && (
              <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5">
                {pendingCount}
              </span>
            )}
          </button>
        )}
        {isManagerOrAbove && (
          <button
            onClick={() => {
              setViewMode('all');
              setPage(1);
            }}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              viewMode === 'all'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            全件
          </button>
        )}
      </div>

      {/* 検索・フィルター */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <form onSubmit={handleSearch} className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder="件名や内容で検索..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button type="submit" variant="secondary">
              検索
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="w-4 h-4 mr-2" />
              フィルター
            </Button>
          </form>

          {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 pt-4 border-t">
              <Select
                label="ステータス"
                value={filter.status || ''}
                onChange={(e) => handleFilterChange('status', e.target.value as ApprovalStatus)}
                options={[
                  { value: '', label: 'すべて' },
                  ...APPROVAL_STATUSES.map((s) => ({ value: s.value, label: s.label })),
                ]}
              />
              <Select
                label="カテゴリ"
                value={filter.category || ''}
                onChange={(e) => handleFilterChange('category', e.target.value)}
                options={[
                  { value: '', label: 'すべて' },
                  ...APPROVAL_CATEGORIES.map((c) => ({ value: c, label: c })),
                ]}
              />
              <Select
                label="期限"
                value={filter.is_overdue ? 'overdue' : ''}
                onChange={(e) =>
                  setFilter((prev) => ({
                    ...prev,
                    is_overdue: e.target.value === 'overdue',
                  }))
                }
                options={[
                  { value: '', label: 'すべて' },
                  { value: 'overdue', label: '期限超過のみ' },
                ]}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* 一覧 */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : approvals.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500">
              {viewMode === 'pending'
                ? '承認待ちの稟議はありません'
                : searchText || Object.keys(filter).length > 0
                ? '条件に一致する稟議が見つかりませんでした'
                : 'まだ稟議がありません'}
            </p>
            {viewMode === 'mine' && (
              <Button className="mt-4" onClick={() => router.push('/approvals/new')}>
                最初の稟議を申請する
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-4">
            {approvals.map((approval) => (
              <Card
                key={approval.id}
                className={`hover:shadow-md transition-shadow cursor-pointer ${
                  isOverdue(approval) ? 'border-red-200 bg-red-50' : ''
                }`}
                onClick={() => router.push(`/approvals/${approval.id}`)}
              >
                <CardContent className="py-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        {getStatusBadge(approval.status)}
                        <Badge variant="default">{approval.category}</Badge>
                        {isOverdue(approval) && (
                          <Badge variant="danger">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            期限超過
                          </Badge>
                        )}
                        {approval.amount && (
                          <span className="text-sm text-gray-600">
                            ¥{approval.amount.toLocaleString()}
                          </span>
                        )}
                      </div>
                      <h3 className="font-medium text-gray-900 mb-1 line-clamp-1">
                        {approval.title}
                      </h3>
                      <p className="text-sm text-gray-500 line-clamp-2">
                        {approval.description}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                        <span>{approval.applicant_name || '不明'}</span>
                        <span>{approval.facility_name}</span>
                        <span>{formatDateJP(approval.created_at)}</span>
                        {approval.desired_due_date && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            希望: {formatDateJP(approval.desired_due_date)}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0 ml-4" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* ページネーション */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6">
              <p className="text-sm text-gray-500">
                {totalCount}件中 {(page - 1) * pageSize + 1}〜
                {Math.min(page * pageSize, totalCount)}件を表示
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm text-gray-600">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function ApprovalsPage() {
  return (
    <AuthGuard>
      <ApprovalsPageContent />
    </AuthGuard>
  );
}
