'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Button, Card, Input, Select } from '@/components/ui';
import { Loading } from '@/components/Loading';
import {
  createInsight,
  getAllInsights,
  archiveInsight,
  deleteInsight,
} from '@/lib/insight';
import { getFacilities } from '@/lib/vacancy';
import { hasMinRole } from '@/lib/auth';
import {
  DailyInsight,
  InsightFormData,
  InsightType,
  InsightPriority,
  INSIGHT_TYPE_LABELS,
  INSIGHT_PRIORITY_CONFIG,
  Facility,
} from '@/types';
import { Megaphone, Plus, Trash2, Archive, RefreshCw } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

export default function InsightsAdminPage() {
  const { user } = useAuth();
  const [insights, setInsights] = useState<DailyInsight[]>([]);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const [formData, setFormData] = useState<InsightFormData>({
    type: 'custom',
    priority: 'medium',
    title: '',
    message: '',
  });

  const canManage = hasMinRole(user?.role, 'leader');

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const [insightsData, facilitiesData] = await Promise.all([
        getAllInsights(user.tenantId),
        getFacilities(user.tenantId),
      ]);
      setInsights(insightsData);
      setFacilities(facilitiesData);
    } catch (err) {
      console.error('Failed to fetch data:', err);
      setError('データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !canManage) return;

    if (!formData.title.trim() || !formData.message.trim()) {
      setError('タイトルとメッセージは必須です');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await createInsight(formData, user.id, user.name, user.role, user.tenantId);
      setSuccess('インサイトを作成しました');
      setFormData({
        type: 'custom',
        priority: 'medium',
        title: '',
        message: '',
      });
      setShowForm(false);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '作成に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (id: string) => {
    if (!user || !canManage) return;
    try {
      await archiveInsight(id, user.id, user.role);
      setSuccess('アーカイブしました');
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'アーカイブに失敗しました');
    }
  };

  const handleDelete = (id: string) => {
    if (!user || !hasMinRole(user.role, 'admin')) return;
    setDeleteTargetId(id);
  };

  const executeDelete = async () => {
    if (!user || !deleteTargetId) return;
    try {
      await deleteInsight(deleteTargetId, user.id, user.role);
      setSuccess('削除しました');
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '削除に失敗しました');
    } finally {
      setDeleteTargetId(null);
    }
  };

  if (!canManage) {
    return (
      <AuthGuard>
        <Header />
        <div className="max-w-4xl mx-auto px-4 py-6">
          <p className="text-center text-gray-500">この機能にはリーダー以上の権限が必要です</p>
        </div>
      </AuthGuard>
    );
  }

  if (loading) {
    return (
      <AuthGuard>
        <Header />
        <Loading />
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50">
        <Header />

        <main className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Megaphone className="w-6 h-6" />
                連携提案管理
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                ダッシュボードに表示するお知らせ・提案を管理
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setLoading(true);
                  fetchData();
                }}
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Button onClick={() => setShowForm(!showForm)}>
                <Plus className="w-4 h-4 mr-1" />
                新規作成
              </Button>
            </div>
          </div>

          {/* メッセージ */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4">
              {success}
            </div>
          )}

          {/* 作成フォーム */}
          {showForm && (
            <Card className="p-6 mb-6">
              <h2 className="text-lg font-semibold mb-4">新規インサイト作成</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">種類</label>
                    <Select
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value as InsightType })}
                      options={Object.entries(INSIGHT_TYPE_LABELS).map(([value, label]) => ({
                        value,
                        label,
                      }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">優先度</label>
                    <Select
                      value={formData.priority}
                      onChange={(e) => setFormData({ ...formData, priority: e.target.value as InsightPriority })}
                      options={Object.entries(INSIGHT_PRIORITY_CONFIG).map(([value, config]) => ({
                        value,
                        label: config.label,
                      }))}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">タイトル *</label>
                  <Input
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="例: パシフィック満室！"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">メッセージ *</label>
                  <textarea
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    placeholder="例: 入居先探しの問い合わせに他施設を提案しましょう"
                    rows={3}
                    required
                    className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">関連施設（任意）</label>
                  <Select
                    value={formData.facilityId || ''}
                    onChange={(e) => setFormData({ ...formData, facilityId: e.target.value || undefined })}
                    options={[
                      { value: '', label: '選択なし' },
                      ...facilities.map((f) => ({ value: f.id, label: f.name })),
                    ]}
                  />
                </div>

                <div className="flex gap-2">
                  <Button type="submit" disabled={saving}>
                    {saving ? '作成中...' : '作成'}
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                    キャンセル
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {/* 一覧 */}
          <div className="space-y-3">
            {insights.length === 0 ? (
              <Card className="p-8 text-center text-gray-500">
                インサイトがありません
              </Card>
            ) : (
              insights.map((insight) => {
                const priorityConfig = INSIGHT_PRIORITY_CONFIG[insight.priority];
                return (
                  <Card
                    key={insight.id}
                    className={`p-4 ${!insight.isActive ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`p-2 rounded-lg ${priorityConfig.bg}`}>
                        <Megaphone className={`w-5 h-5 ${priorityConfig.color}`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded ${priorityConfig.bg} ${priorityConfig.color}`}>
                            {priorityConfig.label}
                          </span>
                          <span className="text-xs text-gray-500">
                            {INSIGHT_TYPE_LABELS[insight.type]}
                          </span>
                          {!insight.isActive && (
                            <span className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-600">
                              アーカイブ済み
                            </span>
                          )}
                        </div>
                        <h3 className="font-semibold">{insight.title}</h3>
                        <p className="text-sm text-gray-600 mt-1">{insight.message}</p>
                        <p className="text-xs text-gray-400 mt-2">
                          {insight.createdByName} · {insight.createdAt.toLocaleDateString('ja-JP')}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {insight.isActive && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleArchive(insight.id)}
                            title="アーカイブ"
                          >
                            <Archive className="w-4 h-4" />
                          </Button>
                        )}
                        {hasMinRole(user?.role, 'admin') && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleDelete(insight.id)}
                            title="削除"
                            className="text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        </main>
        <ConfirmDialog
          open={!!deleteTargetId}
          title="インサイトの削除"
          message="本当に削除しますか？"
          confirmLabel="削除する"
          variant="danger"
          onConfirm={executeDelete}
          onCancel={() => setDeleteTargetId(null)}
        />
      </div>
    </AuthGuard>
  );
}
