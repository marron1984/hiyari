'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { getIdeas, IdeaFilter } from '@/lib/repositories/ideas';
import { ImprovementIdea, IDEA_CATEGORIES, IDEA_STATUSES, IdeaStatus } from '@/types/database';
import { formatDateJP } from '@/lib/utils';

function IdeasPageContent() {
  const router = useRouter();
  const { profile, organization, facility, isManagerOrAbove } = useSupabaseAuth();
  const [ideas, setIdeas] = useState<ImprovementIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<IdeaFilter>({});
  const [searchText, setSearchText] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const pageSize = 20;
  const totalPages = Math.ceil(totalCount / pageSize);

  const fetchIdeas = useCallback(async () => {
    if (!organization) return;

    setLoading(true);
    try {
      const appliedFilter: IdeaFilter = {
        ...filter,
        search: searchText || undefined,
      };

      // staffは自分の投稿のみ
      if (!isManagerOrAbove && profile) {
        appliedFilter.created_by = profile.id;
      }

      const result = await getIdeas(appliedFilter, page, pageSize);
      setIdeas(result.data);
      setTotalCount(result.count);
    } catch (error) {
      console.error('Error fetching ideas:', error);
    } finally {
      setLoading(false);
    }
  }, [organization, filter, searchText, page, isManagerOrAbove, profile]);

  useEffect(() => {
    fetchIdeas();
  }, [fetchIdeas]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchIdeas();
  };

  const handleFilterChange = (key: keyof IdeaFilter, value: string) => {
    setFilter((prev) => ({
      ...prev,
      [key]: value || undefined,
    }));
    setPage(1);
  };

  const getStatusBadge = (status: IdeaStatus) => {
    const statusInfo = IDEA_STATUSES.find((s) => s.value === status);
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

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">改善アイデア</h1>
          <p className="text-sm text-gray-500 mt-1">
            現場の気づきを形にして、より良い介護を目指しましょう
          </p>
        </div>
        <Button onClick={() => router.push('/ideas/new')}>
          <Plus className="w-4 h-4 mr-2" />
          新規投稿
        </Button>
      </div>

      {/* 検索・フィルター */}
      <Card className="mb-6">
        <CardContent className="py-4">
          <form onSubmit={handleSearch} className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder="問題点やアイデアで検索..."
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
                onChange={(e) => handleFilterChange('status', e.target.value as IdeaStatus)}
                options={[
                  { value: '', label: 'すべて' },
                  ...IDEA_STATUSES.map((s) => ({ value: s.value, label: s.label })),
                ]}
              />
              <Select
                label="カテゴリ"
                value={filter.category || ''}
                onChange={(e) => handleFilterChange('category', e.target.value)}
                options={[
                  { value: '', label: 'すべて' },
                  ...IDEA_CATEGORIES.map((c) => ({ value: c, label: c })),
                ]}
              />
              {isManagerOrAbove && (
                <Select
                  label="表示対象"
                  value={filter.created_by ? 'mine' : 'all'}
                  onChange={(e) =>
                    handleFilterChange('created_by', e.target.value === 'mine' ? profile?.id || '' : '')
                  }
                  options={[
                    { value: 'all', label: '全員' },
                    { value: 'mine', label: '自分のみ' },
                  ]}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 一覧 */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : ideas.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500">
              {searchText || Object.keys(filter).length > 0
                ? '条件に一致するアイデアが見つかりませんでした'
                : 'まだ改善アイデアがありません'}
            </p>
            <Button className="mt-4" onClick={() => router.push('/ideas/new')}>
              最初のアイデアを投稿する
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-4">
            {ideas.map((idea) => (
              <Card
                key={idea.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => router.push(`/ideas/${idea.id}`)}
              >
                <CardContent className="py-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        {getStatusBadge(idea.status)}
                        <Badge variant="default">{idea.category}</Badge>
                        {idea.points_awarded > 0 && (
                          <span className="text-sm text-green-600 font-medium">
                            +{idea.points_awarded}pt
                          </span>
                        )}
                      </div>
                      <h3 className="font-medium text-gray-900 mb-1 line-clamp-1">
                        {idea.problem}
                      </h3>
                      <p className="text-sm text-gray-500 line-clamp-2">{idea.idea}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                        <span>{idea.creator_name || '不明'}</span>
                        <span>{idea.facility_name}</span>
                        <span>{formatDateJP(idea.created_at)}</span>
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

export default function IdeasPage() {
  return (
    <AuthGuard>
      <IdeasPageContent />
    </AuthGuard>
  );
}
