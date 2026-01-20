'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  CheckCircle, XCircle, Clock, ChevronRight, Filter, Lightbulb, Heart
} from 'lucide-react';
import { getImprovements, setReviewing, adoptImprovement, rejectImprovement } from '@/lib/improvement';
import {
  Improvement, ImprovementStatus,
  IMPROVEMENT_STATUS_LABELS, IMPROVEMENT_STATUS_COLORS
} from '@/types';

export default function AdminImprovementsPage() {
  const { user, isAdmin } = useAuth();
  const [improvements, setImprovements] = useState<Improvement[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<ImprovementStatus | 'all'>('submitted');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ id: string; title: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getImprovements(user.tenantId, {
        branchId: isAdmin ? undefined : user.branchId,
      });
      setImprovements(data);
    } catch (error) {
      console.error('Failed to load:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (id: string, action: 'reviewing' | 'adopt' | 'reject') => {
    if (!user) return;

    if (action === 'reject') {
      const item = improvements.find((i) => i.id === id);
      setRejectModal({ id, title: item?.title || '' });
      return;
    }

    setActionLoading(id);
    try {
      if (action === 'reviewing') {
        await setReviewing(id, user.id, user.role);
      } else if (action === 'adopt') {
        await adoptImprovement(id, user.id, user.name, user.role);
      }
      await loadData();
    } catch (error) {
      alert(error instanceof Error ? error.message : '操作に失敗しました');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!user || !rejectModal || !rejectReason.trim()) {
      alert('理由を入力してください');
      return;
    }
    setActionLoading(rejectModal.id);
    try {
      await rejectImprovement(rejectModal.id, user.id, user.name, user.role, rejectReason);
      setRejectModal(null);
      setRejectReason('');
      await loadData();
    } catch (error) {
      alert(error instanceof Error ? error.message : '操作に失敗しました');
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('ja-JP', {
      month: 'numeric', day: 'numeric',
    }).format(date);
  };

  const filtered = statusFilter === 'all'
    ? improvements
    : improvements.filter((i) => i.status === statusFilter);

  const pendingCount = improvements.filter((i) => i.status === 'submitted' || i.status === 'reviewing').length;

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-4xl mx-auto px-4 py-6 safe-top safe-bottom">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-zinc-900">改善アイデア管理</h1>
          {pendingCount > 0 && (
            <Badge className="bg-amber-100 text-amber-700">
              {pendingCount}件 未処理
            </Badge>
          )}
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
        ) : filtered.length === 0 ? (
          <Card className="p-8 text-center">
            <Lightbulb className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
            <p className="text-zinc-500">該当する改善アイデアはありません</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((item) => {
              const colors = IMPROVEMENT_STATUS_COLORS[item.status];
              const isPending = item.status === 'submitted' || item.status === 'reviewing';

              return (
                <Card key={item.id} className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={`${colors.bg} ${colors.text}`}>
                          {IMPROVEMENT_STATUS_LABELS[item.status]}
                        </Badge>
                        <span className="text-xs text-zinc-400">{item.category}</span>
                      </div>
                      <h3 className="font-medium text-zinc-900">{item.title}</h3>
                      <p className="text-sm text-zinc-500 line-clamp-1 mt-1">{item.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-zinc-400">
                        <span>{item.authorName}</span>
                        <span className="flex items-center gap-1">
                          <Heart className="w-3 h-3" /> {item.likeCount}
                        </span>
                        <span>{formatDate(item.createdAt)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isPending && (
                        <>
                          {item.status === 'submitted' && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleAction(item.id, 'reviewing')}
                              disabled={actionLoading === item.id}
                            >
                              <Clock className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            onClick={() => handleAction(item.id, 'adopt')}
                            disabled={actionLoading === item.id}
                            className="bg-emerald-600 hover:bg-emerald-700"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleAction(item.id, 'reject')}
                            disabled={actionLoading === item.id}
                            className="text-red-600 hover:bg-red-50"
                          >
                            <XCircle className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                      <Link href={`/improvements/${item.id}`}>
                        <Button variant="ghost" size="sm">
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-zinc-900 mb-2">不採用理由</h3>
            <p className="text-sm text-zinc-500 mb-4">{rejectModal.title}</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="不採用の理由を入力してください"
              rows={4}
              className="w-full px-4 py-3 rounded-xl border border-zinc-200 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 resize-none mb-4"
            />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => { setRejectModal(null); setRejectReason(''); }} className="flex-1">
                キャンセル
              </Button>
              <Button onClick={handleReject} disabled={actionLoading === rejectModal.id} className="flex-1 bg-red-600 hover:bg-red-700">
                不採用にする
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
