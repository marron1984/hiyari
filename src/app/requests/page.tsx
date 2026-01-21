'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, Select } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { getRequests } from '@/lib/request-engine';
import type { Request, RequestType, ApprovalStatus } from '@/types/request-engine';
import {
  REQUEST_TYPE_LABELS,
  APPROVAL_STATUS_LABELS,
  APPROVAL_STATUS_COLORS,
} from '@/types/request-engine';
import {
  FileText,
  Plus,
  Filter,
  Clock,
  CheckCircle,
  XCircle,
  ArrowRight,
  RefreshCw,
  Banknote,
  Receipt,
  CreditCard,
  Briefcase,
} from 'lucide-react';

export default function RequestsPage() {
  return (
    <AuthGuard>
      <RequestsContent />
    </AuthGuard>
  );
}

function RequestsContent() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<Request[]>([]);
  const [statusFilter, setStatusFilter] = useState<ApprovalStatus | ''>('');
  const [typeFilter, setTypeFilter] = useState<RequestType | ''>('');
  const [viewMode, setViewMode] = useState<'my' | 'all'>('my');

  const fetchRequests = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await getRequests({
        status: statusFilter || undefined,
        requestType: typeFilter || undefined,
        applicantId: viewMode === 'my' ? user.id : undefined,
        limitCount: 100,
      });
      setRequests(data);
    } catch (err) {
      console.error('Failed to fetch requests:', err);
    } finally {
      setLoading(false);
    }
  }, [user, statusFilter, typeFilter, viewMode]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const getTypeIcon = (type: RequestType) => {
    switch (type) {
      case 'ringi':
        return <FileText className="w-5 h-5" />;
      case 'expense':
        return <Receipt className="w-5 h-5" />;
      case 'payroll':
        return <Banknote className="w-5 h-5" />;
      case 'vendor_payment':
        return <CreditCard className="w-5 h-5" />;
    }
  };

  const getTypeColor = (type: RequestType) => {
    switch (type) {
      case 'ringi':
        return 'bg-blue-100 text-blue-700';
      case 'expense':
        return 'bg-green-100 text-green-700';
      case 'payroll':
        return 'bg-purple-100 text-purple-700';
      case 'vendor_payment':
        return 'bg-orange-100 text-orange-700';
    }
  };

  // 統計
  const stats = {
    draft: requests.filter(r => r.status === 'draft').length,
    pending: requests.filter(r => ['submitted', 'manager_approved', 'admin_approved', 'ai_vp_reviewed'].includes(r.status)).length,
    approved: requests.filter(r => ['final_approved_by_yoshida', 'executed'].includes(r.status)).length,
    rejected: requests.filter(r => r.status === 'rejected').length,
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
      <main className="pb-20 md:pb-8">
        <div className="max-w-6xl mx-auto px-4 py-6">
          {/* ヘッダー */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Briefcase className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">申請一覧</h1>
                <p className="text-sm text-gray-500">稟議・経費精算・給与関連・臨時支払</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={fetchRequests}>
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Link href="/requests/new">
                <Button>
                  <Plus className="w-4 h-4 mr-1" />
                  新規申請
                </Button>
              </Link>
            </div>
          </div>

          {/* 統計カード */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-100 rounded-lg">
                  <FileText className="w-5 h-5 text-gray-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.draft}</p>
                  <p className="text-xs text-gray-500">下書き</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <Clock className="w-5 h-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.pending}</p>
                  <p className="text-xs text-gray-500">承認待ち</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.approved}</p>
                  <p className="text-xs text-gray-500">承認済み</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <XCircle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.rejected}</p>
                  <p className="text-xs text-gray-500">却下</p>
                </div>
              </div>
            </Card>
          </div>

          {/* フィルター */}
          <Card className="p-4 mb-6">
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium">フィルター:</span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setViewMode('my')}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                    viewMode === 'my'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  自分の申請
                </button>
                <button
                  onClick={() => setViewMode('all')}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                    viewMode === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  すべて
                </button>
              </div>

              <Select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as RequestType | '')}
                options={[
                  { value: '', label: '全種別' },
                  { value: 'ringi', label: '稟議' },
                  { value: 'expense', label: '経費精算' },
                  { value: 'payroll', label: '給与関連' },
                  { value: 'vendor_payment', label: '臨時支払' },
                ]}
                className="w-36"
              />

              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as ApprovalStatus | '')}
                options={[
                  { value: '', label: '全ステータス' },
                  { value: 'draft', label: '下書き' },
                  { value: 'submitted', label: '申請済み' },
                  { value: 'manager_approved', label: '拠点長承認' },
                  { value: 'admin_approved', label: '管理者承認' },
                  { value: 'ai_vp_reviewed', label: 'AIレビュー済' },
                  { value: 'final_approved_by_yoshida', label: '最終決裁済' },
                  { value: 'executed', label: '実行済み' },
                  { value: 'rejected', label: '却下' },
                  { value: 'returned', label: '差し戻し' },
                ]}
                className="w-40"
              />
            </div>
          </Card>

          {/* 申請一覧 */}
          <div className="space-y-3">
            {requests.length === 0 ? (
              <Card className="p-8 text-center">
                <Briefcase className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p className="text-gray-500 mb-4">申請がありません</p>
                <Link href="/requests/new">
                  <Button>
                    <Plus className="w-4 h-4 mr-1" />
                    最初の申請を作成
                  </Button>
                </Link>
              </Card>
            ) : (
              requests.map((request) => (
                <Link key={request.id} href={`/requests/${request.id}`}>
                  <Card className="p-4 hover:bg-gray-50 transition-colors cursor-pointer">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-lg ${getTypeColor(request.requestType)}`}>
                          {getTypeIcon(request.requestType)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-500">{request.requestNumber}</span>
                            <Badge className={APPROVAL_STATUS_COLORS[request.status]}>
                              {APPROVAL_STATUS_LABELS[request.status]}
                            </Badge>
                          </div>
                          <h3 className="font-medium">{request.title}</h3>
                          <p className="text-sm text-gray-500">
                            {request.applicantName} / {request.category}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-lg font-bold">
                            {request.totalAmount.toLocaleString()}円
                          </p>
                          <p className="text-xs text-gray-500">
                            {request.createdAt.toLocaleDateString('ja-JP')}
                          </p>
                        </div>
                        <ArrowRight className="w-5 h-5 text-gray-400" />
                      </div>
                    </div>
                  </Card>
                </Link>
              ))
            )}
          </div>
        </div>
      </main>
    </>
  );
}
