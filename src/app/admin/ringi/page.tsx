'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  Clock, CheckCircle, XCircle, FileText, ChevronRight,
  Filter
} from 'lucide-react';
import { getPendingRingis, getAllRingis, approveRingi, rejectRingi } from '@/lib/ringi';
import { Ringi, RingiStatus, RINGI_STATUS_LABELS, RINGI_STATUS_COLORS } from '@/types';

type TabType = 'pending' | 'all';

export default function AdminRingiPage() {
  const { user, isAdmin, canApprove } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [ringis, setRingis] = useState<Ringi[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<RingiStatus | 'all'>('all');
  const [rejectModal, setRejectModal] = useState<{ ringiId: string; title: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    if (!user) return;
    loadRingis();
  }, [user, activeTab]);

  const loadRingis = async () => {
    if (!user) return;
    setLoading(true);
    try {
      let data: Ringi[];
      if (activeTab === 'pending') {
        // leaderは自事業所のみ、adminは全件
        data = await getPendingRingis(
          user.tenantId,
          isAdmin ? undefined : user.branchId
        );
      } else {
        data = await getAllRingis(
          user.tenantId,
          isAdmin ? undefined : user.branchId
        );
      }
      setRingis(data);
    } catch (error) {
      console.error('Failed to load ringis:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (ringiId: string) => {
    if (!user) return;
    setActionLoading(ringiId);
    try {
      await approveRingi(ringiId, user.id, user.name, user.role, user.branchId);
      await loadRingis();
    } catch (error) {
      console.error('Approve failed:', error);
      alert(error instanceof Error ? error.message : '承認に失敗しました');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!user || !rejectModal || !rejectReason.trim()) {
      alert('却下理由を入力してください');
      return;
    }
    setActionLoading(rejectModal.ringiId);
    try {
      await rejectRingi(rejectModal.ringiId, user.id, user.name, user.role, user.branchId, rejectReason);
      setRejectModal(null);
      setRejectReason('');
      await loadRingis();
    } catch (error) {
      console.error('Reject failed:', error);
      alert(error instanceof Error ? error.message : '却下に失敗しました');
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('ja-JP', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const filteredRingis = activeTab === 'all' && statusFilter !== 'all'
    ? ringis.filter(r => r.status === statusFilter)
    : ringis;

  const pendingCount = ringis.filter(r => r.status === 'submitted').length;

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-4xl mx-auto px-4 py-6 safe-top safe-bottom">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-zinc-900">稟議管理</h1>
          {activeTab === 'pending' && pendingCount > 0 && (
            <Badge className="bg-amber-100 text-amber-700">
              {pendingCount}件 承認待ち
            </Badge>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              activeTab === 'pending'
                ? 'bg-zinc-900 text-white'
                : 'bg-white text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            <Clock className="w-4 h-4 inline mr-1.5" />
            承認待ち
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              activeTab === 'all'
                ? 'bg-zinc-900 text-white'
                : 'bg-white text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            <FileText className="w-4 h-4 inline mr-1.5" />
            すべて
          </button>
        </div>

        {/* Status Filter (all tab only) */}
        {activeTab === 'all' && (
          <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
            <Filter className="w-4 h-4 text-zinc-400 shrink-0 mt-1.5" />
            {(['all', 'draft', 'submitted', 'approved', 'rejected'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  statusFilter === status
                    ? 'bg-zinc-200 text-zinc-900'
                    : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
                }`}
              >
                {status === 'all' ? 'すべて' : RINGI_STATUS_LABELS[status]}
              </button>
            ))}
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900" />
          </div>
        ) : filteredRingis.length === 0 ? (
          <Card className="p-8 text-center">
            <FileText className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
            <p className="text-zinc-500">
              {activeTab === 'pending' ? '承認待ちの稟議はありません' : '稟議がありません'}
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredRingis.map((ringi) => {
              const colors = RINGI_STATUS_COLORS[ringi.status];
              const canApproveThis = canApprove(ringi.branchId) && ringi.status === 'submitted';

              return (
                <Card key={ringi.id} className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={`${colors.bg} ${colors.text}`}>
                          {RINGI_STATUS_LABELS[ringi.status]}
                        </Badge>
                        <span className="text-xs text-zinc-400">{ringi.category}</span>
                      </div>
                      <h3 className="font-medium text-zinc-900">{ringi.title}</h3>
                      <p className="text-sm text-zinc-500 line-clamp-1 mt-1">
                        {ringi.description}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-zinc-400">
                        <span>{ringi.authorName}</span>
                        {ringi.amount && <span>¥{ringi.amount.toLocaleString()}</span>}
                        <span>{ringi.submittedAt ? formatDate(ringi.submittedAt) : formatDate(ringi.createdAt)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {canApproveThis && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => handleApprove(ringi.id)}
                            disabled={actionLoading === ringi.id}
                            className="bg-emerald-600 hover:bg-emerald-700"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setRejectModal({ ringiId: ringi.id, title: ringi.title })}
                            disabled={actionLoading === ringi.id}
                            className="text-red-600 hover:bg-red-50"
                          >
                            <XCircle className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                      <Link href={`/ringi/${ringi.id}`}>
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
            <h3 className="text-lg font-bold text-zinc-900 mb-2">却下理由</h3>
            <p className="text-sm text-zinc-500 mb-4">{rejectModal.title}</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="却下の理由を入力してください"
              rows={4}
              className="w-full px-4 py-3 rounded-xl border border-zinc-200 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 resize-none mb-4"
            />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => { setRejectModal(null); setRejectReason(''); }} className="flex-1">
                キャンセル
              </Button>
              <Button
                onClick={handleReject}
                disabled={actionLoading === rejectModal.ringiId}
                className="flex-1 bg-red-600 hover:bg-red-700"
              >
                却下する
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
