'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardContent, Button, Badge, Input, Select } from '@/components/ui';
import { PageHeader, ErrorBanner, FilterChips } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  Clock,
  CheckCircle,
  XCircle,
  FileText,
  ChevronRight,
  Settings,
  Plus,
  Trash2,
  GripVertical,
  Save,
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  Route,
  Users,
  Building2,
  CircleDollarSign,
  ChevronDown,
  ChevronUp,
  Edit,
  Star,
} from 'lucide-react';
import { getPendingRingis, getAllRingis, approveRingi, rejectRingi } from '@/lib/ringi';
import {
  Ringi,
  RingiStatus,
  RINGI_STATUS_LABELS,
  RINGI_STATUS_COLORS,
  RingiCategory,
  RINGI_CATEGORIES,
  RingiApprovalRoute,
  RingiApprovalRouteStep,
  RingiApprovalRouteFormData,
  ApproverType,
  ApproverRole,
  APPROVER_ROLE_LABELS,
  formatAmountCondition,
} from '@/types';
import { getBranches } from '@/lib/firestore';
import { Branch } from '@/types';

// ===== タブ定義 =====
type TabType = 'pending' | 'all' | 'routes';

export default function AdminRingiPage() {
  return (
    <AuthGuard requireAdmin>
      <AdminRingiContent />
    </AuthGuard>
  );
}

function AdminRingiContent() {
  const { user, isAdmin, canApprove, firebaseUser } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [confirmAction, setConfirmAction] = useState<{ type: string; id: string; message: string } | null>(null);
  const [ringis, setRingis] = useState<Ringi[]>([]);
  const [routes, setRoutes] = useState<RingiApprovalRoute[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<RingiStatus | 'all'>('all');

  // 承認経路用ローディング・エラー
  const [routesLoading, setRoutesLoading] = useState(true);
  const [routesError, setRoutesError] = useState<string | null>(null);
  const [routesFetched, setRoutesFetched] = useState(false); // 取得完了フラグ
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  // 稟議却下モーダル
  const [rejectModal, setRejectModal] = useState<{ ringiId: string; title: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // 承認経路編集
  const [editingRoute, setEditingRoute] = useState<RingiApprovalRoute | null>(null);
  const [editForm, setEditForm] = useState<RingiApprovalRouteFormData | null>(null);
  const [isNewRoute, setIsNewRoute] = useState(false);

  // 稟議読み込み
  const loadRingis = useCallback(async (showLoading = true) => {
    if (!user) return;
    if (showLoading) setRefreshing(true);
    setError(null);

    try {
      let data: Ringi[];
      if (activeTab === 'pending') {
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
    } catch (err) {
      console.error('Failed to load ringis:', err);
      setError(err instanceof Error ? err.message : 'データの取得に失敗しました');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, activeTab, isAdmin]);

  // 拠点読み込み
  const loadBranches = useCallback(async () => {
    if (!user) return;
    try {
      const data = await getBranches(user.tenantId);
      setBranches(data);
    } catch (err) {
      console.error('Failed to load branches:', err);
    }
  }, [user]);

  // 承認経路読み込み
  const loadRoutes = useCallback(async (showLoading = true) => {
    if (!firebaseUser) return;
    if (showLoading) setRoutesLoading(true);
    setRoutesError(null);

    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/admin/approval-routes', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-cache',
        },
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '承認経路の取得に失敗しました');
      }

      // Date型への変換
      const routesWithDates = data.routes.map((route: RingiApprovalRoute) => ({
        ...route,
        createdAt: new Date(route.createdAt),
        updatedAt: new Date(route.updatedAt),
        steps: route.steps.map((step: RingiApprovalRouteStep) => ({
          ...step,
          createdAt: new Date(step.createdAt),
        })),
      }));

      setRoutes(routesWithDates);
      setRoutesFetched(true);
      setRoutesError(null);
    } catch (err) {
      console.error('Failed to load routes:', err);
      setRoutesError(err instanceof Error ? err.message : '承認経路の取得に失敗しました');
      setRoutesFetched(false);
    } finally {
      setRoutesLoading(false);
    }
  }, [firebaseUser]);

  // 初期テンプレ作成
  const seedTemplates = async () => {
    if (!firebaseUser) return;
    setSeeding(true);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/admin/approval-routes/seed', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '作成に失敗しました');
      }

      if (data.seeded) {
        // 作成成功 → リロード
        toast('テンプレートを作成しました', 'success');
        await loadRoutes(false);
      } else {
        // 既に存在する場合
        toast(data.message, 'info');
      }
    } catch (err) {
      console.error('Failed to seed templates:', err);
      toast(err instanceof Error ? err.message : '作成に失敗しました', 'error');
    } finally {
      setSeeding(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'pending' || activeTab === 'all') {
      loadRingis();
    }
    if (activeTab === 'routes') {
      loadRoutes();
    }
    loadBranches();
  }, [activeTab, loadRingis, loadBranches, loadRoutes]);

  // 承認処理
  const handleApprove = async (ringiId: string) => {
    if (!user) return;
    setActionLoading(ringiId);
    try {
      await approveRingi(ringiId, user.id, user.name, user.role, user.branchId);
      toast('承認しました', 'success');
      await loadRingis(false);
    } catch (err) {
      console.error('Approve failed:', err);
      toast(err instanceof Error ? err.message : '承認に失敗しました', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // 却下処理
  const handleReject = async () => {
    if (!user || !rejectModal || !rejectReason.trim()) {
      toast('却下理由を入力してください', 'warning');
      return;
    }
    setActionLoading(rejectModal.ringiId);
    try {
      await rejectRingi(rejectModal.ringiId, user.id, user.name, user.role, user.branchId, rejectReason);
      setRejectModal(null);
      setRejectReason('');
      toast('却下しました', 'success');
      await loadRingis(false);
    } catch (err) {
      console.error('Reject failed:', err);
      toast(err instanceof Error ? err.message : '却下に失敗しました', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  // 経路編集開始
  const startEditRoute = (route: RingiApprovalRoute) => {
    setEditingRoute(route);
    setIsNewRoute(false);
    setEditForm({
      name: route.name,
      description: route.description,
      category: route.category || '',
      branchId: route.branchId || '',
      minAmount: route.minAmount ?? '',
      maxAmount: route.maxAmount ?? '',
      isActive: route.isActive,
      priority: route.priority,
      steps: route.steps.map((s) => ({
        approverType: s.approverType,
        approverValue: s.approverValue,
        required: s.required,
      })),
    });
  };

  // 新規経路作成
  const startNewRoute = () => {
    const newRoute: RingiApprovalRoute = {
      id: `route-new-${Date.now()}`,
      tenantId: user?.tenantId || 'defaultTenant',
      name: '',
      category: null,
      branchId: null,
      minAmount: null,
      maxAmount: null,
      isActive: true,
      isDefault: false,
      priority: 50,
      steps: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: user?.id || '',
      createdByName: user?.name || '',
    };
    setEditingRoute(newRoute);
    setIsNewRoute(true);
    setEditForm({
      name: '',
      description: '',
      category: '',
      branchId: '',
      minAmount: '',
      maxAmount: '',
      isActive: true,
      priority: 50,
      steps: [{ approverType: 'ROLE', approverValue: 'leader', required: true }],
    });
  };

  // 経路保存（API経由）
  const saveRoute = async () => {
    if (!editingRoute || !editForm || !firebaseUser) return;
    if (!editForm.name.trim()) {
      toast('経路名を入力してください', 'warning');
      return;
    }
    if (editForm.steps.length === 0) {
      toast('承認ステップを1つ以上追加してください', 'warning');
      return;
    }

    setSaving(true);
    try {
      const token = await firebaseUser.getIdToken();
      const url = isNewRoute
        ? '/api/admin/approval-routes'
        : `/api/admin/approval-routes/${editingRoute.id}`;
      const method = isNewRoute ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '保存に失敗しました');
      }

      // リスト再読み込み
      await loadRoutes(false);
      setEditingRoute(null);
      setEditForm(null);
      setIsNewRoute(false);
      toast('保存しました', 'success');
    } catch (err) {
      console.error('Failed to save route:', err);
      toast(err instanceof Error ? err.message : '保存に失敗しました', 'error');
    } finally {
      setSaving(false);
    }
  };

  // 経路削除（確認後に実行）
  const confirmDeleteRoute = (routeId: string) => {
    setConfirmAction({ type: 'deleteRoute', id: routeId, message: 'この承認経路を削除しますか？' });
  };

  const deleteRoute = async (routeId: string) => {
    if (!firebaseUser) return;

    setDeleting(routeId);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch(`/api/admin/approval-routes/${routeId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '削除に失敗しました');
      }

      // 編集中の経路なら閉じる
      if (editingRoute?.id === routeId) {
        setEditingRoute(null);
        setEditForm(null);
      }

      toast('削除しました', 'success');
      // リスト再読み込み
      await loadRoutes(false);
    } catch (err) {
      console.error('Failed to delete route:', err);
      toast(err instanceof Error ? err.message : '削除に失敗しました', 'error');
    } finally {
      setDeleting(null);
    }
  };

  // デフォルト経路設定（確認後に実行）
  const confirmSetDefault = (routeId: string) => {
    setConfirmAction({ type: 'setDefault', id: routeId, message: 'この経路をデフォルトに設定しますか？' });
  };

  const setDefaultRoute = async (routeId: string) => {
    if (!firebaseUser) return;

    setSaving(true);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch(`/api/admin/approval-routes/${routeId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ setDefault: true }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '設定に失敗しました');
      }

      toast('デフォルト経路を設定しました', 'success');
      // リスト再読み込み
      await loadRoutes(false);
    } catch (err) {
      console.error('Failed to set default route:', err);
      toast(err instanceof Error ? err.message : '設定に失敗しました', 'error');
    } finally {
      setSaving(false);
    }
  };

  // ステップ追加
  const addStep = () => {
    if (!editForm) return;
    setEditForm({
      ...editForm,
      steps: [...editForm.steps, { approverType: 'ROLE', approverValue: 'leader', required: true }],
    });
  };

  // ステップ削除
  const removeStep = (index: number) => {
    if (!editForm) return;
    setEditForm({
      ...editForm,
      steps: editForm.steps.filter((_, i) => i !== index),
    });
  };

  // ステップ更新
  const updateStep = (index: number, field: string, value: string | boolean) => {
    if (!editForm) return;
    const newSteps = [...editForm.steps];
    newSteps[index] = { ...newSteps[index], [field]: value };
    setEditForm({ ...editForm, steps: newSteps });
  };

  // ステップ並び替え（上へ）
  const moveStepUp = (index: number) => {
    if (!editForm || index === 0) return;
    const newSteps = [...editForm.steps];
    [newSteps[index - 1], newSteps[index]] = [newSteps[index], newSteps[index - 1]];
    setEditForm({ ...editForm, steps: newSteps });
  };

  // ステップ並び替え（下へ）
  const moveStepDown = (index: number) => {
    if (!editForm || index === editForm.steps.length - 1) return;
    const newSteps = [...editForm.steps];
    [newSteps[index], newSteps[index + 1]] = [newSteps[index + 1], newSteps[index]];
    setEditForm({ ...editForm, steps: newSteps });
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('ja-JP', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const filteredRingis =
    activeTab === 'all' && statusFilter !== 'all'
      ? ringis.filter((r) => r.status === statusFilter)
      : ringis;

  const pendingCount = ringis.filter((r) => r.status === 'submitted').length;

  return (
    <div className="min-h-screen bg-zinc-50">
      <Header />
      <div className="max-w-5xl mx-auto px-4 py-6 safe-bottom">
        {/* Header */}
        <PageHeader
          title="稟議管理"
          icon={<FileText className="w-6 h-6" />}
          subtitle="稟議の承認・経路設定"
          onRefresh={activeTab !== 'routes' ? () => loadRingis() : undefined}
          refreshing={refreshing}
        />

        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-2 ${
              activeTab === 'pending'
                ? 'bg-zinc-900 text-white'
                : 'bg-white text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            <Clock className="w-4 h-4" />
            承認待ち
            {pendingCount > 0 && (
              <Badge className="bg-amber-100 text-amber-700 text-xs">{pendingCount}</Badge>
            )}
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-2 ${
              activeTab === 'all'
                ? 'bg-zinc-900 text-white'
                : 'bg-white text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            <FileText className="w-4 h-4" />
            全稟議
          </button>
          <button
            onClick={() => setActiveTab('routes')}
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-2 ${
              activeTab === 'routes'
                ? 'bg-zinc-900 text-white'
                : 'bg-white text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            <Route className="w-4 h-4" />
            承認経路設定
          </button>
        </div>

        {/* Error Banner */}
        {error && (
          <ErrorBanner
            message={error}
            onRetry={() => loadRingis()}
            retrying={refreshing}
          />
        )}

        {/* Content */}
        {activeTab === 'routes' ? (
          // ===== 承認経路設定タブ =====
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 左: 経路リスト */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-zinc-900">承認経路一覧</h2>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadRoutes()}
                    disabled={routesLoading}
                  >
                    <RefreshCw className={`w-4 h-4 ${routesLoading ? 'animate-spin' : ''}`} />
                  </Button>
                  <Button size="sm" onClick={startNewRoute} disabled={saving}>
                    <Plus className="w-4 h-4" />
                    新規作成
                  </Button>
                </div>
              </div>

              {/* エラー表示（取得失敗時のみ） */}
              {routesError && !routesFetched && (
                <ErrorBanner
                  message={routesError}
                  onRetry={() => loadRoutes()}
                  retrying={routesLoading}
                />
              )}

              {/* ローディング */}
              {routesLoading && routes.length === 0 && !routesFetched ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900" />
                </div>
              ) : routesFetched && routes.length === 0 ? (
                // 取得成功 & 0件の場合
                <Card className="p-8 text-center">
                  <Route className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
                  <p className="text-zinc-500 mb-2">承認経路がありません</p>
                  <p className="text-xs text-zinc-400 mb-4">
                    初期テンプレートを作成するか、新規作成ボタンから追加してください
                  </p>
                  <Button
                    onClick={seedTemplates}
                    disabled={seeding}
                    className="mx-auto"
                  >
                    {seeding ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        作成中...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4 mr-2" />
                        初期テンプレートを作成
                      </>
                    )}
                  </Button>
                </Card>
              ) : routes.length > 0 ? (
                <div className="space-y-3">
                  {routes.map((route) => (
                    <Card
                      key={route.id}
                      className={`cursor-pointer transition-all ${
                        editingRoute?.id === route.id
                          ? 'ring-2 ring-zinc-900'
                          : 'hover:bg-zinc-50'
                      } ${deleting === route.id ? 'opacity-50' : ''}`}
                      onClick={() => startEditRoute(route)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-medium text-zinc-900">{route.name}</h3>
                              {route.isDefault && (
                                <Badge className="bg-blue-100 text-blue-700 text-xs">デフォルト</Badge>
                              )}
                              {!route.isActive && (
                                <Badge className="bg-zinc-100 text-zinc-500 text-xs">無効</Badge>
                              )}
                            </div>
                            <p className="text-sm text-zinc-500 mb-2">
                              {route.description || formatAmountCondition(route.minAmount, route.maxAmount)}
                            </p>
                            <div className="flex items-center gap-4 text-xs text-zinc-400">
                              {route.category && (
                                <span className="flex items-center gap-1">
                                  <FileText className="w-3 h-3" />
                                  {route.category}
                                </span>
                              )}
                              {route.branchName && (
                                <span className="flex items-center gap-1">
                                  <Building2 className="w-3 h-3" />
                                  {route.branchName}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                {route.steps.length}ステップ
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {!route.isDefault && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  confirmSetDefault(route.id);
                                }}
                                className="p-1.5 hover:bg-blue-50 rounded text-zinc-400 hover:text-blue-600"
                                title="デフォルトに設定"
                              >
                                <Star className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                confirmDeleteRoute(route.id);
                              }}
                              className="p-1.5 hover:bg-red-50 rounded text-zinc-400 hover:text-red-600"
                              disabled={deleting === route.id}
                              title="削除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                            <Edit className="w-4 h-4 text-zinc-400 ml-1" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : null}
            </div>

            {/* 右: 経路編集 */}
            <div>
              {editingRoute && editForm ? (
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-lg font-bold text-zinc-900">
                        {isNewRoute ? '新規経路' : '経路編集'}
                      </h2>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingRoute(null);
                          setEditForm(null);
                        }}
                      >
                        <XCircle className="w-4 h-4" />
                      </Button>
                    </div>

                    <div className="space-y-4">
                      {/* 経路名 */}
                      <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-1">
                          経路名 <span className="text-red-500">*</span>
                        </label>
                        <Input
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          placeholder="例: 通常稟議"
                        />
                      </div>

                      {/* 説明 */}
                      <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-1">説明</label>
                        <Input
                          value={editForm.description || ''}
                          onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                          placeholder="例: 50万円未満の通常稟議"
                        />
                      </div>

                      {/* カテゴリ */}
                      <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-1">
                          対象カテゴリ
                        </label>
                        <Select
                          value={editForm.category}
                          onChange={(e) =>
                            setEditForm({ ...editForm, category: e.target.value as RingiCategory | '' })
                          }
                          options={[
                            { value: '', label: '全カテゴリ' },
                            ...RINGI_CATEGORIES.map((c) => ({ value: c, label: c })),
                          ]}
                        />
                      </div>

                      {/* 拠点 */}
                      <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-1">
                          対象拠点
                        </label>
                        <Select
                          value={editForm.branchId}
                          onChange={(e) => setEditForm({ ...editForm, branchId: e.target.value })}
                          options={[
                            { value: '', label: '全拠点' },
                            ...branches.map((b) => ({ value: b.id, label: b.name })),
                          ]}
                        />
                      </div>

                      {/* 金額範囲 */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-zinc-700 mb-1">
                            金額下限
                          </label>
                          <Input
                            type="number"
                            value={editForm.minAmount}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                minAmount: e.target.value === '' ? '' : Number(e.target.value),
                              })
                            }
                            placeholder="下限なし"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-zinc-700 mb-1">
                            金額上限
                          </label>
                          <Input
                            type="number"
                            value={editForm.maxAmount}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                maxAmount: e.target.value === '' ? '' : Number(e.target.value),
                              })
                            }
                            placeholder="上限なし"
                          />
                        </div>
                      </div>

                      {/* 有効/無効 */}
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="isActive"
                          checked={editForm.isActive}
                          onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
                          className="w-4 h-4 rounded border-zinc-300"
                        />
                        <label htmlFor="isActive" className="text-sm text-zinc-700">
                          この経路を有効にする
                        </label>
                      </div>

                      {/* 承認ステップ */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-sm font-medium text-zinc-700">
                            承認ステップ <span className="text-red-500">*</span>
                          </label>
                          <Button variant="outline" size="sm" onClick={addStep}>
                            <Plus className="w-3 h-3 mr-1" />
                            追加
                          </Button>
                        </div>
                        <div className="space-y-2">
                          {editForm.steps.map((step, index) => (
                            <div
                              key={index}
                              className="flex items-center gap-2 p-3 bg-zinc-50 rounded-xl"
                            >
                              <div className="flex flex-col gap-1">
                                <button
                                  type="button"
                                  onClick={() => moveStepUp(index)}
                                  disabled={index === 0}
                                  className="p-0.5 hover:bg-zinc-200 rounded disabled:opacity-30"
                                >
                                  <ChevronUp className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveStepDown(index)}
                                  disabled={index === editForm.steps.length - 1}
                                  className="p-0.5 hover:bg-zinc-200 rounded disabled:opacity-30"
                                >
                                  <ChevronDown className="w-3 h-3" />
                                </button>
                              </div>
                              <span className="text-xs font-bold text-zinc-400 w-6">
                                {index + 1}.
                              </span>
                              <Select
                                value={step.approverType}
                                onChange={(e) =>
                                  updateStep(index, 'approverType', e.target.value)
                                }
                                options={[
                                  { value: 'ROLE', label: 'ロール' },
                                  { value: 'USER', label: '個人' },
                                ]}
                                className="w-24"
                              />
                              {step.approverType === 'ROLE' ? (
                                <Select
                                  value={step.approverValue}
                                  onChange={(e) =>
                                    updateStep(index, 'approverValue', e.target.value)
                                  }
                                  options={Object.entries(APPROVER_ROLE_LABELS).map(([k, v]) => ({
                                    value: k,
                                    label: v,
                                  }))}
                                  className="flex-1"
                                />
                              ) : (
                                <Input
                                  value={step.approverValue}
                                  onChange={(e) =>
                                    updateStep(index, 'approverValue', e.target.value)
                                  }
                                  placeholder="ユーザーID"
                                  className="flex-1"
                                />
                              )}
                              <label className="flex items-center gap-1 text-xs">
                                <input
                                  type="checkbox"
                                  checked={step.required}
                                  onChange={(e) =>
                                    updateStep(index, 'required', e.target.checked)
                                  }
                                  className="w-3 h-3"
                                />
                                必須
                              </label>
                              <button
                                type="button"
                                onClick={() => removeStep(index)}
                                className="p-1 text-red-500 hover:bg-red-50 rounded"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                          {editForm.steps.length === 0 && (
                            <p className="text-sm text-zinc-400 text-center py-4">
                              ステップを追加してください
                            </p>
                          )}
                        </div>
                      </div>

                      {/* 保存ボタン */}
                      <div className="pt-4">
                        <Button onClick={saveRoute} className="w-full" disabled={saving}>
                          {saving ? (
                            <>
                              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                              保存中...
                            </>
                          ) : (
                            <>
                              <Save className="w-4 h-4 mr-2" />
                              保存
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="p-8 text-center">
                  <Route className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
                  <p className="text-zinc-500">
                    左のリストから経路を選択するか、
                    <br />
                    新規作成してください
                  </p>
                </Card>
              )}
            </div>
          </div>
        ) : (
          // ===== 稟議一覧タブ =====
          <>
            {/* Status Filter (all tab only) */}
            {activeTab === 'all' && (
              <FilterChips
                chips={[
                  { key: 'all', label: 'すべて' },
                  { key: 'draft', label: RINGI_STATUS_LABELS.draft },
                  { key: 'submitted', label: RINGI_STATUS_LABELS.submitted },
                  { key: 'approved', label: RINGI_STATUS_LABELS.approved },
                  { key: 'rejected', label: RINGI_STATUS_LABELS.rejected },
                  { key: 'returned', label: RINGI_STATUS_LABELS.returned },
                ]}
                activeKey={statusFilter}
                onSelect={(key) => setStatusFilter(key as RingiStatus | 'all')}
              />
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
                    <Card key={ringi.id} className="p-4 hover:bg-zinc-50 transition-colors">
                      <div className="flex items-start gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge className={`${colors.bg} ${colors.text}`}>
                              {RINGI_STATUS_LABELS[ringi.status]}
                            </Badge>
                            <span className="text-xs text-zinc-400">{ringi.category}</span>
                            {ringi.urgency === '至急' && (
                              <Badge className="bg-red-100 text-red-700 text-xs">至急</Badge>
                            )}
                          </div>
                          <h3 className="font-medium text-zinc-900">{ringi.title}</h3>
                          <p className="text-sm text-zinc-500 line-clamp-1 mt-1">
                            {ringi.description || ringi.background}
                          </p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-zinc-400">
                            <span>{ringi.authorName}</span>
                            {ringi.amount && <span>¥{ringi.amount.toLocaleString()}</span>}
                            <span>
                              {ringi.submittedAt
                                ? formatDate(ringi.submittedAt)
                                : formatDate(ringi.createdAt)}
                            </span>
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
                                onClick={() =>
                                  setRejectModal({ ringiId: ringi.id, title: ringi.title })
                                }
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
          </>
        )}
      </div>

      {/* 確認ダイアログ */}
      <ConfirmDialog
        open={!!confirmAction}
        title="確認"
        message={confirmAction?.message ?? ''}
        confirmLabel={confirmAction?.type === 'deleteRoute' ? '削除' : '設定'}
        variant={confirmAction?.type === 'deleteRoute' ? 'danger' : 'default'}
        onConfirm={async () => {
          if (!confirmAction) return;
          if (confirmAction.type === 'deleteRoute') {
            await deleteRoute(confirmAction.id);
          } else if (confirmAction.type === 'setDefault') {
            await setDefaultRoute(confirmAction.id);
          }
          setConfirmAction(null);
        }}
        onCancel={() => setConfirmAction(null)}
      />

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
              <Button
                variant="secondary"
                onClick={() => {
                  setRejectModal(null);
                  setRejectReason('');
                }}
                className="flex-1"
              >
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
