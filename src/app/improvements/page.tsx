'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Plus, Heart, MessageCircle, ChevronRight, Filter, Lightbulb } from 'lucide-react';
import { getImprovements, toggleLike } from '@/lib/improvement';
import {
  Improvement,
  ImprovementStatus,
  IMPROVEMENT_STATUS_LABELS,
  IMPROVEMENT_STATUS_COLORS,
} from '@/types';

export default function ImprovementsPage() {
  const { user } = useAuth();
  const [improvements, setImprovements] = useState<Improvement[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'mine'>('all');
  const [statusFilter, setStatusFilter] = useState<ImprovementStatus | 'all'>('all');

  useEffect(() => {
    if (user) loadData();
  }, [user, filter]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getImprovements(user.tenantId, {
        authorId: filter === 'mine' ? user.id : undefined,
      });
      setImprovements(data);
    } catch (error) {
      console.error('Failed to load:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return;
    try {
      const updated = await toggleLike(id, user.id);
      setImprovements((prev) =>
        prev.map((i) => (i.id === id ? updated : i))
      );
    } catch (error) {
      console.error('Like failed:', error);
    }
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('ja-JP', {
      month: 'numeric',
      day: 'numeric',
    }).format(date);
  };

  const filteredImprovements = statusFilter === 'all'
    ? improvements
    : improvements.filter((i) => i.status === statusFilter);

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-2xl mx-auto px-4 py-6 safe-top safe-bottom">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-zinc-900">改善アイデア</h1>
          <Link href="/improvements/new">
            <Button size="sm">
              <Plus className="w-4 h-4" />
              提案する
            </Button>
          </Link>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              filter === 'all'
                ? 'bg-zinc-900 text-white'
                : 'bg-white text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            すべて
          </button>
          <button
            onClick={() => setFilter('mine')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              filter === 'mine'
                ? 'bg-zinc-900 text-white'
                : 'bg-white text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            自分の提案
          </button>
        </div>

        {/* Status Filter */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
          <Filter className="w-4 h-4 text-zinc-400 shrink-0 mt-1.5" />
          {(['all', 'submitted', 'reviewing', 'adopted', 'rejected'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                statusFilter === status
                  ? 'bg-zinc-200 text-zinc-900'
                  : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
              }`}
            >
              {status === 'all' ? 'すべて' : IMPROVEMENT_STATUS_LABELS[status]}
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900" />
          </div>
        ) : filteredImprovements.length === 0 ? (
          <Card className="p-8 text-center">
            <Lightbulb className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
            <p className="text-zinc-500 mb-4">改善アイデアがありません</p>
            <Link href="/improvements/new">
              <Button variant="secondary">最初の提案をする</Button>
            </Link>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredImprovements.map((item) => {
              const colors = IMPROVEMENT_STATUS_COLORS[item.status];
              const hasLiked = user && item.likedBy.includes(user.id);

              return (
                <Link key={item.id} href={`/improvements/${item.id}`}>
                  <Card className="p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={`${colors.bg} ${colors.text}`}>
                            {IMPROVEMENT_STATUS_LABELS[item.status]}
                          </Badge>
                          <span className="text-xs text-zinc-400">{item.category}</span>
                        </div>
                        <h3 className="font-medium text-zinc-900">{item.title}</h3>
                        <p className="text-sm text-zinc-500 line-clamp-2 mt-1">
                          {item.description}
                        </p>
                        <div className="flex items-center gap-4 mt-3">
                          <button
                            onClick={(e) => handleLike(item.id, e)}
                            className={`flex items-center gap-1 text-sm transition-colors ${
                              hasLiked ? 'text-red-500' : 'text-zinc-400 hover:text-red-500'
                            }`}
                          >
                            <Heart className={`w-4 h-4 ${hasLiked ? 'fill-current' : ''}`} />
                            {item.likeCount}
                          </button>
                          <span className="flex items-center gap-1 text-sm text-zinc-400">
                            <MessageCircle className="w-4 h-4" />
                            {item.commentCount}
                          </span>
                          <span className="text-xs text-zinc-400">
                            {item.authorName} · {formatDate(item.createdAt)}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-zinc-300 shrink-0" />
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
