'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Plus, FileText, Clock, CheckCircle, XCircle, Edit } from 'lucide-react';
import { getRingisByUser } from '@/lib/ringi';
import { Ringi, RINGI_STATUS_LABELS, RINGI_STATUS_COLORS } from '@/types';

export default function RingiListPage() {
  const { user } = useAuth();
  const [ringis, setRingis] = useState<Ringi[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'draft' | 'submitted' | 'approved' | 'rejected'>('all');

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

  const filteredRingis = filter === 'all'
    ? ringis
    : ringis.filter(r => r.status === filter);

  const statusIcon = (status: Ringi['status']) => {
    switch (status) {
      case 'draft': return <Edit className="w-4 h-4" />;
      case 'submitted': return <Clock className="w-4 h-4" />;
      case 'approved': return <CheckCircle className="w-4 h-4" />;
      case 'rejected': return <XCircle className="w-4 h-4" />;
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

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-2xl mx-auto px-4 py-6 safe-top safe-bottom">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-zinc-900">稟議</h1>
          <Link href="/ringi/new">
            <Button size="sm">
              <Plus className="w-4 h-4" />
              新規作成
            </Button>
          </Link>
        </div>

        {/* Filter */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
          {(['all', 'draft', 'submitted', 'approved', 'rejected'] as const).map((status) => (
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
                  {ringis.filter(r => r.status === status).length}
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
                {filter === 'all' ? '稟議がありません' : `${RINGI_STATUS_LABELS[filter]}の稟議がありません`}
              </p>
              <Link href="/ringi/new" className="mt-4 inline-block">
                <Button variant="secondary" size="sm">
                  <Plus className="w-4 h-4" />
                  新規作成
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
                        </div>
                        <h3 className="font-medium text-zinc-900 truncate">{ringi.title}</h3>
                        <p className="text-sm text-zinc-500 line-clamp-1 mt-1">
                          {ringi.description}
                        </p>
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
