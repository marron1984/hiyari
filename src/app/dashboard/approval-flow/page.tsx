'use client';

import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/Header';
import { Card, Button } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { useRole } from '@/contexts/RoleContext';
import Link from 'next/link';
import {
  GitBranch,
  Plus,
  RefreshCw,
  Edit3,
  Archive,
  CheckCircle,
  Clock,
  AlertTriangle,
  ChevronRight,
  Layers,
  FileText,
  Briefcase,
  Settings,
  Play,
  Share2,
} from 'lucide-react';
import type { ApprovalFlow, FlowStatus, RequestType } from '@/lib/approvals/types';

// ステータス設定
const STATUS_CONFIG: Record<FlowStatus, { label: string; color: string; icon: React.ReactNode }> = {
  draft: {
    label: '下書き',
    color: 'bg-amber-100 text-amber-700',
    icon: <Clock className="w-3 h-3" />,
  },
  published: {
    label: '公開中',
    color: 'bg-green-100 text-green-700',
    icon: <CheckCircle className="w-3 h-3" />,
  },
  archived: {
    label: 'アーカイブ',
    color: 'bg-zinc-100 text-zinc-600',
    icon: <Archive className="w-3 h-3" />,
  },
};

// 申請タイプ設定
const REQUEST_TYPE_CONFIG: Record<RequestType, { label: string; icon: React.ReactNode }> = {
  expense: { label: '経費申請', icon: <FileText className="w-4 h-4" /> },
  overtime: { label: '残業申請', icon: <Clock className="w-4 h-4" /> },
  generic: { label: '汎用', icon: <Briefcase className="w-4 h-4" /> },
  share_issue: { label: '外部共有', icon: <Share2 className="w-4 h-4" /> }, // Task 040
};

export default function ApprovalFlowPage() {
  const { currentRole } = useRole();
  const isAdmin = currentRole === 'admin';

  const [flows, setFlows] = useState<ApprovalFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<RequestType | ''>('');
  const [filterStatus, setFilterStatus] = useState<FlowStatus | ''>('');

  // 新規作成モーダル
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newFlowName, setNewFlowName] = useState('');
  const [newFlowType, setNewFlowType] = useState<RequestType>('generic');
  const [creating, setCreating] = useState(false);

  // データ取得
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterType) params.set('requestType', filterType);
      if (filterStatus) params.set('status', filterStatus);

      const res = await fetch(`/api/approval-flows?${params}`);
      if (res.ok) {
        const data = await res.json();
        setFlows(data.flows);
      }
    } catch (err) {
      console.error('Failed to fetch flows:', err);
    } finally {
      setLoading(false);
    }
  }, [filterType, filterStatus]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // フロー作成
  const handleCreate = async () => {
    if (!newFlowName.trim()) return;

    setCreating(true);
    try {
      const res = await fetch('/api/approval-flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newFlowName,
          requestType: newFlowType,
        }),
      });

      if (res.ok) {
        setShowCreateModal(false);
        setNewFlowName('');
        setNewFlowType('generic');
        fetchData();
      }
    } catch (err) {
      console.error('Failed to create flow:', err);
    } finally {
      setCreating(false);
    }
  };

  // フロー公開
  const handlePublish = async (flowId: string) => {
    if (!confirm('このフローを公開しますか？公開後は編集できなくなります。')) return;

    try {
      const res = await fetch(`/api/approval-flows/${flowId}/publish`, {
        method: 'POST',
      });

      if (res.ok) {
        fetchData();
      } else {
        const data = await res.json();
        alert(data.error || '公開に失敗しました');
      }
    } catch (err) {
      console.error('Failed to publish flow:', err);
    }
  };

  // フローアーカイブ
  const handleArchive = async (flowId: string) => {
    if (!confirm('このフローをアーカイブしますか？')) return;

    try {
      const res = await fetch(`/api/approval-flows/${flowId}/archive`, {
        method: 'POST',
      });

      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error('Failed to archive flow:', err);
    }
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <Header />
        <main className="max-w-4xl mx-auto px-4 py-6">
          <Card>
            <div className="p-8 text-center">
              <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-amber-500" />
              <p className="text-zinc-600">このページは管理者のみアクセスできます</p>
            </div>
          </Card>
        </main>
      </div>
    );
  }

  if (loading) {
    return <Loading />;
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <Header />

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <GitBranch className="w-6 h-6 text-zinc-700" />
            <div>
              <h1 className="text-xl font-bold">承認フロー管理</h1>
              <p className="text-sm text-zinc-500">承認フローの作成・編集・公開</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="w-4 h-4 mr-1" />
              更新
            </Button>
            <Button variant="primary" size="sm" onClick={() => setShowCreateModal(true)}>
              <Plus className="w-4 h-4 mr-1" />
              新規作成
            </Button>
          </div>
        </div>

        {/* フィルタ */}
        <Card className="mb-6">
          <div className="p-4 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-500">申請タイプ:</span>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as RequestType | '')}
                className="px-3 py-1.5 border rounded-lg text-sm"
              >
                <option value="">すべて</option>
                <option value="expense">経費申請</option>
                <option value="overtime">残業申請</option>
                <option value="generic">汎用</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-500">ステータス:</span>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as FlowStatus | '')}
                className="px-3 py-1.5 border rounded-lg text-sm"
              >
                <option value="">すべて</option>
                <option value="draft">下書き</option>
                <option value="published">公開中</option>
                <option value="archived">アーカイブ</option>
              </select>
            </div>
          </div>
        </Card>

        {/* フロー一覧 */}
        {flows.length === 0 ? (
          <Card>
            <div className="p-8 text-center text-zinc-500">
              フローがありません
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {flows.map((flow) => {
              const statusConfig = STATUS_CONFIG[flow.status];
              const typeConfig = REQUEST_TYPE_CONFIG[flow.requestType];

              return (
                <Card key={flow.id} className="hover:shadow-md transition-shadow">
                  <div className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {/* ステータス */}
                          <span
                            className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded ${statusConfig.color}`}
                          >
                            {statusConfig.icon}
                            {statusConfig.label}
                          </span>

                          {/* 申請タイプ */}
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                            {typeConfig.icon}
                            {typeConfig.label}
                          </span>

                          {/* バージョン */}
                          {flow.version > 0 && (
                            <span className="text-xs text-zinc-400">
                              v{flow.version}
                            </span>
                          )}
                        </div>

                        <h3 className="font-semibold text-lg">{flow.name}</h3>

                        {flow.description && (
                          <p className="text-sm text-zinc-500 mt-1">{flow.description}</p>
                        )}

                        {/* ステップ数 */}
                        <div className="flex items-center gap-4 mt-2 text-sm text-zinc-500">
                          <span className="flex items-center gap-1">
                            <Layers className="w-4 h-4" />
                            {flow.steps.length}ステップ
                          </span>

                          {/* 条件 */}
                          {flow.conditionJson && (
                            <span className="flex items-center gap-1">
                              <Settings className="w-4 h-4" />
                              条件あり
                            </span>
                          )}
                        </div>
                      </div>

                      {/* アクション */}
                      <div className="flex items-center gap-2 ml-4">
                        {flow.status === 'draft' && (
                          <>
                            <Link href={`/dashboard/approval-flow/${flow.id}`}>
                              <Button variant="outline" size="sm">
                                <Edit3 className="w-4 h-4 mr-1" />
                                編集
                              </Button>
                            </Link>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handlePublish(flow.id)}
                              disabled={flow.steps.length === 0}
                            >
                              <Play className="w-4 h-4 mr-1" />
                              公開
                            </Button>
                          </>
                        )}

                        {flow.status === 'published' && (
                          <>
                            <Link href={`/dashboard/approval-flow/${flow.id}`}>
                              <Button variant="outline" size="sm">
                                <ChevronRight className="w-4 h-4" />
                              </Button>
                            </Link>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleArchive(flow.id)}
                            >
                              <Archive className="w-4 h-4" />
                            </Button>
                          </>
                        )}

                        {flow.status === 'archived' && (
                          <Link href={`/dashboard/approval-flow/${flow.id}`}>
                            <Button variant="outline" size="sm">
                              <ChevronRight className="w-4 h-4" />
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* フッター */}
        <div className="mt-6 text-center">
          <Link
            href="/dashboard/approvals"
            className="text-sm text-blue-500 hover:text-blue-700"
          >
            承認センターを見る →
          </Link>
        </div>
      </main>

      {/* 新規作成モーダル */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <div className="p-4 border-b">
              <h2 className="font-semibold">新規フロー作成</h2>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="text-sm text-zinc-500">フロー名</label>
                <input
                  type="text"
                  value={newFlowName}
                  onChange={(e) => setNewFlowName(e.target.value)}
                  placeholder="例: 経費申請フロー（10万円以下）"
                  className="w-full px-3 py-2 border rounded-lg text-sm mt-1"
                />
              </div>
              <div>
                <label className="text-sm text-zinc-500">申請タイプ</label>
                <select
                  value={newFlowType}
                  onChange={(e) => setNewFlowType(e.target.value as RequestType)}
                  className="w-full px-3 py-2 border rounded-lg text-sm mt-1"
                >
                  <option value="expense">経費申請</option>
                  <option value="overtime">残業申請</option>
                  <option value="generic">汎用</option>
                </select>
              </div>
            </div>
            <div className="p-4 border-t flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCreateModal(false)}
              >
                キャンセル
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleCreate}
                disabled={!newFlowName.trim() || creating}
              >
                作成
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
