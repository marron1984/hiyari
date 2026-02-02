'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { Card, Button } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { useRole } from '@/contexts/RoleContext';
import Link from 'next/link';
import {
  GitBranch,
  ArrowLeft,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  AlertTriangle,
  CheckCircle,
  Clock,
  Archive,
  Play,
  User,
  Users,
  ChevronUp,
  ChevronDown,
  XCircle,
} from 'lucide-react';
import type {
  ApprovalFlow,
  ApprovalFlowStep,
  FlowStatus,
  ApproverType,
} from '@/lib/approvals/types';
import type { AppRole } from '@/config/appRoles';

// ロール設定
const ROLE_OPTIONS: { value: AppRole; label: string }[] = [
  { value: 'manager', label: 'マネージャー' },
  { value: 'executive', label: '役員' },
  { value: 'admin', label: '管理者' },
];

export default function ApprovalFlowDetailPage() {
  const params = useParams();
  const router = useRouter();
  const flowId = params.id as string;

  const { currentRole } = useRole();
  const isAdmin = currentRole === 'admin';

  const [flow, setFlow] = useState<ApprovalFlow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 編集用
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editMinAmount, setEditMinAmount] = useState<string>('');
  const [editMaxAmount, setEditMaxAmount] = useState<string>('');

  // 新規ステップ追加
  const [addingStep, setAddingStep] = useState(false);
  const [newStepType, setNewStepType] = useState<ApproverType>('role');
  const [newStepRole, setNewStepRole] = useState<AppRole>('manager');

  // データ取得
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/approval-flows/${flowId}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError('フローが見つかりません');
        } else {
          setError('データの取得に失敗しました');
        }
        return;
      }
      const data = await res.json();
      setFlow(data.flow);

      // 編集フィールド初期化
      setEditName(data.flow.name);
      setEditDescription(data.flow.description || '');
      setEditMinAmount(data.flow.conditionJson?.minAmount?.toString() || '');
      setEditMaxAmount(data.flow.conditionJson?.maxAmount?.toString() || '');
    } catch (err) {
      console.error('Failed to fetch flow:', err);
      setError('データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [flowId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // フロー更新
  const handleSave = async () => {
    if (!flow || flow.status !== 'draft') return;

    setSaving(true);
    try {
      const conditionJson: Record<string, number> = {};
      if (editMinAmount) conditionJson.minAmount = parseInt(editMinAmount, 10);
      if (editMaxAmount) conditionJson.maxAmount = parseInt(editMaxAmount, 10);

      const res = await fetch(`/api/approval-flows/${flowId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          description: editDescription || null,
          conditionJson: Object.keys(conditionJson).length > 0 ? conditionJson : null,
        }),
      });

      if (res.ok) {
        fetchData();
      } else {
        const data = await res.json();
        alert(data.error || '保存に失敗しました');
      }
    } catch (err) {
      console.error('Failed to save flow:', err);
    } finally {
      setSaving(false);
    }
  };

  // ステップ追加
  const handleAddStep = async () => {
    if (!flow) return;

    const newStepOrder = flow.steps.length + 1;

    try {
      const res = await fetch(`/api/approval-flows/${flowId}/steps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stepOrder: newStepOrder,
          approverType: newStepType,
          approverRole: newStepType === 'role' ? newStepRole : null,
        }),
      });

      if (res.ok) {
        setAddingStep(false);
        fetchData();
      } else {
        const data = await res.json();
        alert(data.error || 'ステップの追加に失敗しました');
      }
    } catch (err) {
      console.error('Failed to add step:', err);
    }
  };

  // ステップ削除
  const handleDeleteStep = async (stepId: string) => {
    if (!confirm('このステップを削除しますか？')) return;

    try {
      const res = await fetch(`/api/approval-flows/${flowId}/steps/${stepId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        fetchData();
      } else {
        const data = await res.json();
        alert(data.error || 'ステップの削除に失敗しました');
      }
    } catch (err) {
      console.error('Failed to delete step:', err);
    }
  };

  // フロー公開
  const handlePublish = async () => {
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

  if (error || !flow) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <Header />
        <main className="max-w-4xl mx-auto px-4 py-6">
          <Card>
            <div className="p-8 text-center">
              <XCircle className="w-12 h-12 mx-auto mb-4 text-red-500" />
              <p className="text-zinc-600">{error || 'フローが見つかりません'}</p>
              <Link href="/dashboard/approval-flow">
                <Button variant="outline" className="mt-4">
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  一覧に戻る
                </Button>
              </Link>
            </div>
          </Card>
        </main>
      </div>
    );
  }

  const isDraft = flow.status === 'draft';

  return (
    <div className="min-h-screen bg-zinc-50">
      <Header />

      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/approval-flow"
              className="p-2 hover:bg-zinc-100 rounded-lg"
            >
              <ArrowLeft className="w-5 h-5 text-zinc-600" />
            </Link>
            <GitBranch className="w-6 h-6 text-zinc-700" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold">{flow.name}</h1>
                {flow.status === 'draft' && (
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded">
                    下書き
                  </span>
                )}
                {flow.status === 'published' && (
                  <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">
                    公開中
                  </span>
                )}
                {flow.status === 'archived' && (
                  <span className="px-2 py-0.5 bg-zinc-100 text-zinc-600 text-xs rounded">
                    アーカイブ
                  </span>
                )}
              </div>
              <p className="text-sm text-zinc-500">ID: {flow.id}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="w-4 h-4 mr-1" />
              更新
            </Button>
            {isDraft && (
              <>
                <Button variant="outline" size="sm" onClick={handleSave} disabled={saving}>
                  <Save className="w-4 h-4 mr-1" />
                  保存
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handlePublish}
                  disabled={flow.steps.length === 0}
                >
                  <Play className="w-4 h-4 mr-1" />
                  公開
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {/* 基本情報 */}
          <Card>
            <div className="p-4 border-b">
              <h2 className="font-semibold">基本情報</h2>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="text-sm text-zinc-500">フロー名</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  disabled={!isDraft}
                  className="w-full px-3 py-2 border rounded-lg text-sm mt-1 disabled:bg-zinc-100"
                />
              </div>
              <div>
                <label className="text-sm text-zinc-500">説明</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  disabled={!isDraft}
                  rows={2}
                  className="w-full px-3 py-2 border rounded-lg text-sm mt-1 disabled:bg-zinc-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-zinc-500">申請タイプ</label>
                  <div className="mt-1 px-3 py-2 bg-zinc-100 rounded-lg text-sm">
                    {flow.requestType === 'expense' && '経費申請'}
                    {flow.requestType === 'overtime' && '残業申請'}
                    {flow.requestType === 'generic' && '汎用'}
                  </div>
                </div>
                <div>
                  <label className="text-sm text-zinc-500">バージョン</label>
                  <div className="mt-1 px-3 py-2 bg-zinc-100 rounded-lg text-sm">
                    v{flow.version}
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* 条件設定（経費申請の場合） */}
          {flow.requestType === 'expense' && (
            <Card>
              <div className="p-4 border-b">
                <h2 className="font-semibold">金額条件</h2>
                <p className="text-xs text-zinc-500 mt-1">
                  このフローが適用される金額範囲を設定します
                </p>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-zinc-500">最小金額</label>
                    <input
                      type="number"
                      value={editMinAmount}
                      onChange={(e) => setEditMinAmount(e.target.value)}
                      disabled={!isDraft}
                      placeholder="0"
                      className="w-full px-3 py-2 border rounded-lg text-sm mt-1 disabled:bg-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-zinc-500">最大金額</label>
                    <input
                      type="number"
                      value={editMaxAmount}
                      onChange={(e) => setEditMaxAmount(e.target.value)}
                      disabled={!isDraft}
                      placeholder="上限なし"
                      className="w-full px-3 py-2 border rounded-lg text-sm mt-1 disabled:bg-zinc-100"
                    />
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* 承認ステップ */}
          <Card>
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <h2 className="font-semibold">承認ステップ</h2>
                <p className="text-xs text-zinc-500 mt-1">
                  申請の承認順序を設定します
                </p>
              </div>
              {isDraft && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAddingStep(true)}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  ステップ追加
                </Button>
              )}
            </div>
            <div className="p-4">
              {flow.steps.length === 0 ? (
                <div className="text-center text-zinc-500 py-8">
                  承認ステップがありません
                </div>
              ) : (
                <div className="space-y-3">
                  {flow.steps.map((step, index) => (
                    <div
                      key={step.id}
                      className="flex items-center gap-4 p-3 bg-zinc-50 rounded-lg"
                    >
                      {/* ステップ番号 */}
                      <div className="w-8 h-8 flex items-center justify-center bg-blue-500 text-white rounded-full font-bold text-sm">
                        {step.stepOrder}
                      </div>

                      {/* 承認者情報 */}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          {step.approverType === 'role' ? (
                            <>
                              <Users className="w-4 h-4 text-zinc-400" />
                              <span className="font-medium">
                                {ROLE_OPTIONS.find((r) => r.value === step.approverRole)?.label ||
                                  step.approverRole}
                              </span>
                            </>
                          ) : (
                            <>
                              <User className="w-4 h-4 text-zinc-400" />
                              <span className="font-medium">
                                {step.approverUserName || step.approverUserId}
                              </span>
                            </>
                          )}
                        </div>
                        <div className="text-xs text-zinc-500 mt-1">
                          {step.approverType === 'role' ? 'ロール承認' : 'ユーザー指定'}
                          {step.required === 'all' ? '（全員の承認が必要）' : '（1人の承認でOK）'}
                        </div>
                      </div>

                      {/* 削除ボタン */}
                      {isDraft && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteStep(step.id)}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* ステップ追加フォーム */}
              {addingStep && (
                <div className="mt-4 p-4 border-2 border-dashed border-blue-300 rounded-lg bg-blue-50">
                  <h4 className="font-medium mb-3">新規ステップ</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm text-zinc-500">承認者タイプ</label>
                      <select
                        value={newStepType}
                        onChange={(e) => setNewStepType(e.target.value as ApproverType)}
                        className="w-full px-3 py-2 border rounded-lg text-sm mt-1"
                      >
                        <option value="role">ロール（役職）</option>
                        <option value="user">ユーザー指定</option>
                      </select>
                    </div>
                    {newStepType === 'role' && (
                      <div>
                        <label className="text-sm text-zinc-500">承認ロール</label>
                        <select
                          value={newStepRole}
                          onChange={(e) => setNewStepRole(e.target.value as AppRole)}
                          className="w-full px-3 py-2 border rounded-lg text-sm mt-1"
                        >
                          {ROLE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAddingStep(false)}
                      >
                        キャンセル
                      </Button>
                      <Button variant="primary" size="sm" onClick={handleAddStep}>
                        追加
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
