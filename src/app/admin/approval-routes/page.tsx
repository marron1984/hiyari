'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, Input, Select } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { getApprovalRoutes, createApprovalRoute } from '@/lib/request-engine';
import type { ApprovalRoute, ApprovalRouteCondition, ApprovalStep, RequestType } from '@/types/request-engine';
import { REQUEST_TYPE_LABELS } from '@/types/request-engine';
import {
  Route,
  Plus,
  Settings,
  Trash2,
  Edit,
  ChevronDown,
  ChevronUp,
  Users,
  Shield,
  Brain,
  Crown,
  AlertCircle,
  Check,
  X,
} from 'lucide-react';

export default function ApprovalRoutesPage() {
  return (
    <AuthGuard requireAdmin>
      <ApprovalRoutesContent />
    </AuthGuard>
  );
}

function ApprovalRoutesContent() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [routes, setRoutes] = useState<ApprovalRoute[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [expandedRoute, setExpandedRoute] = useState<string | null>(null);

  // フォーム状態
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPriority, setFormPriority] = useState(10);
  const [formRequestTypes, setFormRequestTypes] = useState<RequestType[]>([]);
  const [formMinAmount, setFormMinAmount] = useState<number | undefined>();
  const [formMaxAmount, setFormMaxAmount] = useState<number | undefined>();
  const [formSteps, setFormSteps] = useState<ApprovalStep[]>([
    { order: 1, role: 'manager', roleLabel: '拠点長', isRequired: true, canSkip: false },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRoutes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getApprovalRoutes();
      setRoutes(data);
    } catch (err) {
      console.error('Failed to fetch routes:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoutes();
  }, [fetchRoutes]);

  const resetForm = () => {
    setFormName('');
    setFormDescription('');
    setFormPriority(10);
    setFormRequestTypes([]);
    setFormMinAmount(undefined);
    setFormMaxAmount(undefined);
    setFormSteps([
      { order: 1, role: 'manager', roleLabel: '拠点長', isRequired: true, canSkip: false },
    ]);
    setError(null);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      setError('ルート名を入力してください');
      return;
    }

    if (formSteps.length === 0) {
      setError('承認ステップを1つ以上追加してください');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const condition: ApprovalRouteCondition = {};
      if (formRequestTypes.length > 0) {
        condition.requestTypes = formRequestTypes;
      }
      if (formMinAmount !== undefined) {
        condition.minAmount = formMinAmount;
      }
      if (formMaxAmount !== undefined) {
        condition.maxAmount = formMaxAmount;
      }

      await createApprovalRoute({
        name: formName,
        description: formDescription,
        priority: formPriority,
        condition,
        steps: formSteps,
        isActive: true,
      });

      resetForm();
      setShowForm(false);
      fetchRoutes();
    } catch (err) {
      console.error('Failed to save route:', err);
      setError('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const addStep = () => {
    const nextOrder = formSteps.length + 1;
    const availableRoles: Array<{ role: ApprovalStep['role']; label: string }> = [
      { role: 'manager', label: '拠点長' },
      { role: 'admin', label: '管理者' },
      { role: 'ai_vp', label: 'AI副社長' },
      { role: 'yoshida', label: '吉田（最終決裁）' },
    ];

    // 次に追加すべきロールを決定
    const usedRoles = formSteps.map(s => s.role);
    const nextRole = availableRoles.find(r => !usedRoles.includes(r.role)) || availableRoles[0];

    setFormSteps([
      ...formSteps,
      {
        order: nextOrder,
        role: nextRole.role,
        roleLabel: nextRole.label,
        isRequired: true,
        canSkip: false,
      },
    ]);
  };

  const removeStep = (index: number) => {
    const newSteps = formSteps.filter((_, i) => i !== index);
    // order を再採番
    setFormSteps(newSteps.map((s, i) => ({ ...s, order: i + 1 })));
  };

  const updateStep = (index: number, updates: Partial<ApprovalStep>) => {
    const newSteps = [...formSteps];
    newSteps[index] = { ...newSteps[index], ...updates };
    setFormSteps(newSteps);
  };

  const toggleRequestType = (type: RequestType) => {
    if (formRequestTypes.includes(type)) {
      setFormRequestTypes(formRequestTypes.filter(t => t !== type));
    } else {
      setFormRequestTypes([...formRequestTypes, type]);
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'manager':
        return <Users className="w-4 h-4" />;
      case 'admin':
        return <Shield className="w-4 h-4" />;
      case 'ai_vp':
        return <Brain className="w-4 h-4" />;
      case 'yoshida':
        return <Crown className="w-4 h-4" />;
      default:
        return <Users className="w-4 h-4" />;
    }
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
              <div className="p-2 bg-indigo-100 rounded-lg">
                <Route className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">承認ルート管理</h1>
                <p className="text-sm text-gray-500">申請種別・金額に応じた承認フローを設定</p>
              </div>
            </div>
            <Button onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4 mr-1" />
              新規ルート
            </Button>
          </div>

          {/* 新規作成フォーム */}
          {showForm && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  新規承認ルート
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* 基本情報 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">ルート名 *</label>
                      <Input
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        placeholder="例: 標準稟議ルート"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">優先度（低い値が優先）</label>
                      <Input
                        type="number"
                        value={formPriority}
                        onChange={(e) => setFormPriority(parseInt(e.target.value) || 10)}
                        min={1}
                        max={100}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">説明</label>
                    <Input
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                      placeholder="このルートの適用条件や目的を記載"
                    />
                  </div>

                  {/* 適用条件 */}
                  <div className="border-t pt-4">
                    <h3 className="font-medium mb-3">適用条件</h3>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">申請種別（空の場合は全種別に適用）</label>
                        <div className="flex flex-wrap gap-2">
                          {(Object.keys(REQUEST_TYPE_LABELS) as RequestType[]).map((type) => (
                            <button
                              key={type}
                              onClick={() => toggleRequestType(type)}
                              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                                formRequestTypes.includes(type)
                                  ? 'bg-indigo-600 text-white'
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              }`}
                            >
                              {REQUEST_TYPE_LABELS[type]}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-1">最小金額（円）</label>
                          <Input
                            type="number"
                            value={formMinAmount || ''}
                            onChange={(e) => setFormMinAmount(e.target.value ? parseInt(e.target.value) : undefined)}
                            placeholder="指定なし"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">最大金額（円）</label>
                          <Input
                            type="number"
                            value={formMaxAmount || ''}
                            onChange={(e) => setFormMaxAmount(e.target.value ? parseInt(e.target.value) : undefined)}
                            placeholder="指定なし"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 承認ステップ */}
                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-medium">承認ステップ</h3>
                      <Button size="sm" variant="secondary" onClick={addStep}>
                        <Plus className="w-4 h-4 mr-1" />
                        ステップ追加
                      </Button>
                    </div>

                    <div className="space-y-3">
                      {formSteps.map((step, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg"
                        >
                          <div className="flex items-center gap-2 min-w-[120px]">
                            <span className="w-6 h-6 bg-indigo-600 text-white rounded-full flex items-center justify-center text-sm">
                              {step.order}
                            </span>
                            {getRoleIcon(step.role)}
                          </div>

                          <Select
                            value={step.role}
                            onChange={(e) => {
                              const role = e.target.value as ApprovalStep['role'];
                              const labels: Record<string, string> = {
                                manager: '拠点長',
                                admin: '管理者',
                                ai_vp: 'AI副社長',
                                yoshida: '吉田（最終決裁）',
                              };
                              updateStep(index, { role, roleLabel: labels[role] });
                            }}
                            options={[
                              { value: 'manager', label: '拠点長' },
                              { value: 'admin', label: '管理者' },
                              { value: 'ai_vp', label: 'AI副社長（レビュー）' },
                              { value: 'yoshida', label: '吉田（最終決裁）' },
                            ]}
                            className="flex-1"
                          />

                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={step.canSkip}
                              onChange={(e) => updateStep(index, { canSkip: e.target.checked })}
                              className="rounded"
                            />
                            スキップ可
                          </label>

                          <button
                            onClick={() => removeStep(index)}
                            className="p-1 text-red-500 hover:bg-red-50 rounded"
                            disabled={formSteps.length <= 1}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {error && (
                    <div className="p-3 bg-red-50 text-red-700 rounded-lg flex items-center gap-2">
                      <AlertCircle className="w-5 h-5" />
                      {error}
                    </div>
                  )}

                  {/* ボタン */}
                  <div className="flex justify-end gap-3 pt-4 border-t">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        resetForm();
                        setShowForm(false);
                      }}
                    >
                      キャンセル
                    </Button>
                    <Button onClick={handleSave} disabled={saving}>
                      {saving ? '保存中...' : '保存'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ルート一覧 */}
          <div className="space-y-4">
            {routes.length === 0 ? (
              <Card className="p-8 text-center">
                <Route className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p className="text-gray-500 mb-4">承認ルートが登録されていません</p>
                <Button onClick={() => setShowForm(true)}>
                  <Plus className="w-4 h-4 mr-1" />
                  最初のルートを作成
                </Button>
              </Card>
            ) : (
              routes.map((route) => (
                <Card key={route.id}>
                  <div
                    className="p-4 cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpandedRoute(expandedRoute === route.id ? null : route.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Badge variant={route.isActive ? 'success' : 'default'}>
                          {route.isActive ? '有効' : '無効'}
                        </Badge>
                        <div>
                          <h3 className="font-medium">{route.name}</h3>
                          <p className="text-sm text-gray-500">{route.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-sm text-gray-500">
                          優先度: {route.priority}
                        </div>
                        <div className="flex items-center gap-1">
                          {route.steps.map((step, idx) => (
                            <div
                              key={idx}
                              className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center"
                              title={step.roleLabel}
                            >
                              {getRoleIcon(step.role)}
                            </div>
                          ))}
                        </div>
                        {expandedRoute === route.id ? (
                          <ChevronUp className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                    </div>
                  </div>

                  {expandedRoute === route.id && (
                    <div className="border-t p-4 bg-gray-50">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* 適用条件 */}
                        <div>
                          <h4 className="font-medium mb-2">適用条件</h4>
                          <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-2">
                              <span className="text-gray-500">申請種別:</span>
                              {route.condition.requestTypes?.length ? (
                                <div className="flex gap-1">
                                  {route.condition.requestTypes.map((type) => (
                                    <Badge key={type} variant="default">
                                      {REQUEST_TYPE_LABELS[type]}
                                    </Badge>
                                  ))}
                                </div>
                              ) : (
                                <span>全種別</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-gray-500">金額範囲:</span>
                              <span>
                                {route.condition.minAmount !== undefined
                                  ? `${route.condition.minAmount.toLocaleString()}円`
                                  : '下限なし'}
                                {' 〜 '}
                                {route.condition.maxAmount !== undefined
                                  ? `${route.condition.maxAmount.toLocaleString()}円`
                                  : '上限なし'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* 承認ステップ */}
                        <div>
                          <h4 className="font-medium mb-2">承認フロー</h4>
                          <div className="flex items-center gap-2">
                            {route.steps.map((step, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                <div className="flex flex-col items-center">
                                  <div
                                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                      step.role === 'yoshida'
                                        ? 'bg-yellow-100 text-yellow-700'
                                        : step.role === 'ai_vp'
                                        ? 'bg-purple-100 text-purple-700'
                                        : 'bg-indigo-100 text-indigo-700'
                                    }`}
                                  >
                                    {getRoleIcon(step.role)}
                                  </div>
                                  <span className="text-xs mt-1">{step.roleLabel}</span>
                                  {step.canSkip && (
                                    <span className="text-xs text-gray-400">(スキップ可)</span>
                                  )}
                                </div>
                                {idx < route.steps.length - 1 && (
                                  <div className="w-8 h-0.5 bg-gray-300" />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </Card>
              ))
            )}
          </div>

          {/* デフォルトルート案内 */}
          <Card className="mt-6 bg-blue-50 border-blue-200">
            <CardContent className="py-4">
              <h3 className="font-medium text-blue-900 mb-2">承認ルートの適用順序</h3>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>1. 申請が作成されると、優先度の低い順にルートをチェック</li>
                <li>2. 条件（種別・金額）に一致する最初のルートが適用</li>
                <li>3. 一致するルートがない場合、デフォルト（全ステップ必須）が適用</li>
                <li>4. AI副社長ステップでは自動レビュー・整形が実行</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
