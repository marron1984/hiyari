'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  Plus,
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  Edit,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import { getRingisByUser } from '@/lib/ringi';
import { Ringi, RingiStatus, RINGI_STATUS_LABELS, RINGI_STATUS_COLORS } from '@/types';

export default function ApprovalsListPage() {
  return (
    <AuthGuard>
      <ApprovalsListContent />
    </AuthGuard>
  );
}

function ApprovalsListContent() {
  const { user } = useAuth();
  const [ringis, setRingis] = useState<Ringi[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | RingiStatus>('all');

  useEffect(() => {
    if (!user) return;

    const loadRingis = async () => {
      try {
        const data = await getRingisByUser(user.id, user.tenantId);
        setRingis(data);
      } catch (error) {
        console.error('Failed to load ringis:', error);
      } finally {
        setLoading(false);
      }
    };

    loadRingis();
  }, [user]);

  const filteredRingis =
    filter === 'all' ? ringis : ringis.filter((r) => r.status === filter);

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

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('ja-JP', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  // 件数集計
  const draftCount = ringis.filter((r) => r.status === 'draft').length;
  const submittedCount = ringis.filter((r) => r.status === 'submitted').length;
  const returnedCount = ringis.filter((r) => r.status === 'returned').length;

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <Header />
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6 safe-bottom">
        {/* Page Title & New Button */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-zinc-900">稟議</h1>
          <Link href="/dashboard/approvals/new">
            <Button size="sm">
              <Plus className="w-4 h-4" />
              新規稟議
            </Button>
          </Link>
        </div>

        {/* Summary Cards */}
        {(draftCount > 0 || submittedCount > 0 || returnedCount > 0) && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            <Card className="p-3 text-center">
              <p className="text-2xl font-bold text-zinc-900">{draftCount}</p>
              <p className="text-xs text-zinc-500">下書き</p>
            </Card>
            <Card className="p-3 text-center">
              <p className="text-2xl font-bold text-amber-600">{submittedCount}</p>
              <p className="text-xs text-zinc-500">申請中</p>
            </Card>
            {returnedCount > 0 && (
              <Card className="p-3 text-center bg-orange-50 border-orange-200">
                <p className="text-2xl font-bold text-orange-600">{returnedCount}</p>
                <p className="text-xs text-orange-600">差戻し</p>
              </Card>
            )}
            {returnedCount === 0 && (
              <Card className="p-3 text-center">
                <p className="text-2xl font-bold text-emerald-600">
                  {ringis.filter((r) => r.status === 'approved').length}
                </p>
                <p className="text-xs text-zinc-500">承認済</p>
              </Card>
            )}
          </div>
        )}

        {/* 差戻しアラート */}
        {returnedCount > 0 && (
          <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-xl flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0" />
            <div>
              <p className="text-sm font-medium text-orange-700">
                {returnedCount}件の稟議が差戻されています
              </p>
              <p className="text-xs text-orange-600">修正して再申請してください</p>
            </div>
          </div>
        )}

        {/* Filter */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
          {(
            ['all', 'draft', 'submitted', 'approved', 'rejected', 'returned'] as const
          ).map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                filter === status
                  ? 'bg-zinc-900 text-white'
                  : 'bg-white text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              {status === 'all' ? 'すべて' : RINGI_STATUS_LABELS[status]}
              {status !== 'all' && (
                <span className="ml-1.5 text-xs opacity-70">
                  {ringis.filter((r) => r.status === status).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="space-y-3">
          {filteredRingis.length === 0 ? (
            <Card className="p-8 text-center">
              <FileText className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
              <p className="text-zinc-500">
                {filter === 'all'
                  ? '稟議がありません'
                  : `${RINGI_STATUS_LABELS[filter]}の稟議がありません`}
              </p>
              <Link href="/dashboard/approvals/new" className="mt-4 inline-block">
                <Button variant="secondary" size="sm">
                  <Plus className="w-4 h-4" />
                  新規稟議を作成
                </Button>
              </Link>
            </Card>
          ) : (
            filteredRingis.map((ringi) => {
              const colors = RINGI_STATUS_COLORS[ringi.status];
              return (
                <Link key={ringi.id} href={`/ringi/${ringi.id}`}>
                  <Card className="p-4 hover:bg-zinc-50 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={`${colors.bg} ${colors.text}`}>
                            {statusIcon(ringi.status)}
                            <span className="ml-1">{RINGI_STATUS_LABELS[ringi.status]}</span>
                          </Badge>
                          <span className="text-xs text-zinc-400">{ringi.category}</span>
                          {ringi.urgency === '至急' && (
                            <Badge className="bg-red-100 text-red-700 text-xs">至急</Badge>
                          )}
                        </div>
                        <h3 className="font-medium text-zinc-900 truncate">{ringi.title}</h3>
                        {ringi.description && (
                          <p className="text-sm text-zinc-500 line-clamp-1 mt-1">
                            {ringi.description}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        {ringi.amount && (
                          <p className="text-sm font-medium text-zinc-900">
                            ¥{ringi.amount.toLocaleString()}
                          </p>
                        )}
                        <p className="text-xs text-zinc-400 mt-1">
                          {formatDate(ringi.createdAt)}
                        </p>
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
