'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Header } from '@/components/Header';
import { Card, Button } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { useRole } from '@/contexts/RoleContext';
import Link from 'next/link';
import {
  BookOpen,
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Minus,
  ExternalLink,
  Tag,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Edit3,
  Save,
  Clock,
  User,
  Database,
  Calculator,
  Shield,
  History,
  FileText,
  Settings,
  Archive,
  RotateCcw,
} from 'lucide-react';
import type {
  KPIDictionaryEntry,
  KPIAnomalyRule,
  KPIDefinitionEvent,
  UpdateAnomalyRuleRequest,
} from '@/lib/kpiDictionary/types';

// カテゴリ設定
const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  sales: { label: '営業', color: 'bg-blue-100 text-blue-700' },
  operation: { label: '業務', color: 'bg-green-100 text-green-700' },
  people: { label: '人・組織', color: 'bg-purple-100 text-purple-700' },
  finance: { label: '財務', color: 'bg-amber-100 text-amber-700' },
  risk: { label: 'リスク', color: 'bg-red-100 text-red-700' },
  quality: { label: '品質', color: 'bg-cyan-100 text-cyan-700' },
};

// 算出方法
const CALCULATION_METHOD_LABELS: Record<string, string> = {
  manual: '手動入力',
  sql: 'SQLクエリ',
  code: 'コード算出',
  vendor: '外部連携',
};

// 更新頻度
const REFRESH_CADENCE_LABELS: Record<string, string> = {
  realtime: 'リアルタイム',
  daily: '日次',
  weekly: '週次',
  monthly: '月次',
};

// 頻度
const FREQUENCY_LABELS: Record<string, string> = {
  daily: '日次',
  weekly: '週次',
  monthly: '月次',
  quarterly: '四半期',
};

export default function KpiDictionaryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const kpiId = params.kpiId as string;

  const { currentRole } = useRole();
  const isAdmin = currentRole === 'admin';
  const isManager = ['admin', 'executive', 'manager'].includes(currentRole);

  const [entry, setEntry] = useState<KPIDictionaryEntry | null>(null);
  const [anomalyRule, setAnomalyRule] = useState<KPIAnomalyRule | null>(null);
  const [events, setEvents] = useState<KPIDefinitionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 異常検知ルール編集
  const [editingRule, setEditingRule] = useState(false);
  const [ruleDraft, setRuleDraft] = useState<UpdateAnomalyRuleRequest | null>(null);
  const [savingRule, setSavingRule] = useState(false);

  // アクション実行中
  const [actionLoading, setActionLoading] = useState(false);

  // データ取得
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // KPI辞書エントリ取得
      const entryRes = await fetch(`/api/kpi/dictionary/${kpiId}`);
      if (!entryRes.ok) {
        if (entryRes.status === 404) {
          setError('KPIが見つかりません');
        } else {
          setError('データの取得に失敗しました');
        }
        return;
      }
      const entryData = await entryRes.json();
      setEntry(entryData.entry);

      // 異常検知ルール取得
      const ruleRes = await fetch(`/api/kpi/dictionary/${kpiId}/anomaly-rule`);
      if (ruleRes.ok) {
        const ruleData = await ruleRes.json();
        setAnomalyRule(ruleData.rule);
      }

      // 変更履歴取得（管理者/マネージャーのみ）
      if (isManager) {
        const eventsRes = await fetch(`/api/kpi/dictionary/${kpiId}/events?limit=10`);
        if (eventsRes.ok) {
          const eventsData = await eventsRes.json();
          setEvents(eventsData.events);
        }
      }
    } catch (err) {
      console.error('Failed to fetch KPI dictionary:', err);
      setError('データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [kpiId, isManager]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 方向性アイコン
  const DirectionIcon = ({ direction }: { direction: string }) => {
    if (direction === 'higher_is_better') {
      return (
        <span className="flex items-center gap-1 text-green-600">
          <TrendingUp className="w-4 h-4" />
          <span className="text-sm">上がると良い</span>
        </span>
      );
    }
    if (direction === 'lower_is_better') {
      return (
        <span className="flex items-center gap-1 text-red-600">
          <TrendingDown className="w-4 h-4" />
          <span className="text-sm">下がると良い</span>
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-zinc-500">
        <Minus className="w-4 h-4" />
        <span className="text-sm">中立</span>
      </span>
    );
  };

  // 異常検知ルール編集開始
  const startEditRule = () => {
    if (anomalyRule) {
      setRuleDraft({
        enabled: anomalyRule.enabled,
        missingDataAlert: anomalyRule.missingDataAlert,
        thresholdHigh: anomalyRule.thresholdHigh,
        thresholdLow: anomalyRule.thresholdLow,
        maxPercentChange: anomalyRule.maxPercentChange,
        compareTo: anomalyRule.compareTo,
      });
    } else {
      setRuleDraft({
        enabled: true,
        missingDataAlert: true,
        thresholdHigh: null,
        thresholdLow: null,
        maxPercentChange: 30,
        compareTo: 'prevDay',
      });
    }
    setEditingRule(true);
  };

  // 異常検知ルール保存
  const saveRule = async () => {
    if (!ruleDraft) return;

    setSavingRule(true);
    try {
      const res = await fetch(`/api/kpi/dictionary/${kpiId}/anomaly-rule`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ruleDraft),
      });

      if (res.ok) {
        const data = await res.json();
        setAnomalyRule(data.rule);
        setEditingRule(false);
        setRuleDraft(null);
      }
    } catch (err) {
      console.error('Failed to save anomaly rule:', err);
    } finally {
      setSavingRule(false);
    }
  };

  // KPI廃止
  const handleDeprecate = async () => {
    if (!confirm('このKPIを廃止しますか？')) return;

    setActionLoading(true);
    try {
      const res = await fetch(`/api/kpi/dictionary/${kpiId}/deprecate`, {
        method: 'POST',
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error('Failed to deprecate KPI:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // KPI復元
  const handleRestore = async () => {
    if (!confirm('このKPIを復元しますか？')) return;

    setActionLoading(true);
    try {
      const res = await fetch(`/api/kpi/dictionary/${kpiId}/restore`, {
        method: 'POST',
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error('Failed to restore KPI:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // 日時フォーマット
  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // アクションラベル
  const getActionLabel = (action: string) => {
    switch (action) {
      case 'create':
        return { label: '作成', color: 'bg-green-100 text-green-700' };
      case 'update':
        return { label: '更新', color: 'bg-blue-100 text-blue-700' };
      case 'deprecate':
        return { label: '廃止', color: 'bg-red-100 text-red-700' };
      case 'restore':
        return { label: '復元', color: 'bg-purple-100 text-purple-700' };
      default:
        return { label: action, color: 'bg-zinc-100 text-zinc-700' };
    }
  };

  if (loading) {
    return <Loading />;
  }

  if (error || !entry) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <Header />
        <main className="max-w-4xl mx-auto px-4 py-6">
          <Card>
            <div className="p-8 text-center">
              <XCircle className="w-12 h-12 mx-auto mb-4 text-red-500" />
              <p className="text-zinc-600">{error || 'KPIが見つかりません'}</p>
              <Link href="/dashboard/kpi-dictionary">
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

  return (
    <div className="min-h-screen bg-zinc-50">
      <Header />

      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/kpi-dictionary"
              className="p-2 hover:bg-zinc-100 rounded-lg"
            >
              <ArrowLeft className="w-5 h-5 text-zinc-600" />
            </Link>
            <BookOpen className="w-6 h-6 text-zinc-700" />
            <div>
              <h1 className="text-xl font-bold">{entry.name}</h1>
              <p className="text-sm text-zinc-500">ID: {entry.id}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="w-4 h-4 mr-1" />
              更新
            </Button>
            {isAdmin && (
              <>
                {entry.status === 'active' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDeprecate}
                    disabled={actionLoading}
                  >
                    <Archive className="w-4 h-4 mr-1" />
                    廃止
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRestore}
                    disabled={actionLoading}
                  >
                    <RotateCcw className="w-4 h-4 mr-1" />
                    復元
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* ステータスバナー */}
        {entry.status === 'deprecated' && (
          <div className="mb-6 p-4 bg-zinc-200 rounded-lg flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-zinc-600" />
            <span className="text-zinc-700">このKPIは廃止されています</span>
          </div>
        )}

        <div className="space-y-6">
          {/* 1. 概要セクション */}
          <Card>
            <div className="p-4 border-b flex items-center gap-2">
              <FileText className="w-4 h-4" />
              <h2 className="font-semibold">概要</h2>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {/* ステータス */}
                <div>
                  <div className="text-xs text-zinc-500 mb-1">ステータス</div>
                  {entry.status === 'active' ? (
                    <span className="px-2 py-1 bg-green-100 text-green-700 text-sm rounded">
                      稼働中
                    </span>
                  ) : (
                    <span className="px-2 py-1 bg-zinc-200 text-zinc-600 text-sm rounded">
                      廃止
                    </span>
                  )}
                </div>

                {/* カテゴリ */}
                <div>
                  <div className="text-xs text-zinc-500 mb-1">カテゴリ</div>
                  <span
                    className={`px-2 py-1 text-sm rounded ${
                      CATEGORY_CONFIG[entry.category]?.color || 'bg-zinc-100'
                    }`}
                  >
                    {CATEGORY_CONFIG[entry.category]?.label || entry.category}
                  </span>
                </div>

                {/* 単位 */}
                <div>
                  <div className="text-xs text-zinc-500 mb-1">単位</div>
                  <div className="font-medium">{entry.unit}</div>
                </div>

                {/* 頻度 */}
                <div>
                  <div className="text-xs text-zinc-500 mb-1">測定頻度</div>
                  <div className="font-medium">
                    {FREQUENCY_LABELS[entry.frequency] || entry.frequency}
                  </div>
                </div>

                {/* 方向性 */}
                <div>
                  <div className="text-xs text-zinc-500 mb-1">方向性</div>
                  <DirectionIcon direction={entry.direction} />
                </div>

                {/* 外部公開 */}
                <div>
                  <div className="text-xs text-zinc-500 mb-1">外部公開</div>
                  {entry.isExternalAllowed ? (
                    <span className="flex items-center gap-1 text-blue-600">
                      <ExternalLink className="w-4 h-4" />
                      <span className="text-sm">公開可</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-zinc-500">
                      <Shield className="w-4 h-4" />
                      <span className="text-sm">内部限定</span>
                    </span>
                  )}
                </div>
              </div>

              {/* 責任者 */}
              {(entry.ownerRole || entry.ownerUserName) && (
                <div className="mt-4 pt-4 border-t">
                  <div className="text-xs text-zinc-500 mb-1">責任者</div>
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-zinc-400" />
                    <span>
                      {entry.ownerUserName || entry.ownerRole || '-'}
                      {entry.ownerRole && ` (${entry.ownerRole})`}
                    </span>
                  </div>
                </div>
              )}

              {/* タグ */}
              {entry.tags.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <div className="text-xs text-zinc-500 mb-2">タグ</div>
                  <div className="flex flex-wrap items-center gap-1">
                    <Tag className="w-3 h-3 text-zinc-400" />
                    {entry.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 bg-zinc-100 text-zinc-600 text-xs rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 説明 */}
              {entry.description && (
                <div className="mt-4 pt-4 border-t">
                  <div className="text-xs text-zinc-500 mb-1">説明</div>
                  <p className="text-sm text-zinc-700">{entry.description}</p>
                </div>
              )}
            </div>
          </Card>

          {/* 2. 定義・意味セクション */}
          <Card>
            <div className="p-4 border-b flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              <h2 className="font-semibold">定義・意味</h2>
            </div>
            <div className="p-4 space-y-4">
              {/* 定義 */}
              <div>
                <div className="text-xs text-zinc-500 mb-1">定義</div>
                <p className="text-sm text-zinc-700">
                  {entry.definition || '（未設定）'}
                </p>
              </div>

              {/* なぜ重要か */}
              <div>
                <div className="text-xs text-zinc-500 mb-1">なぜ重要か</div>
                <p className="text-sm text-zinc-700">
                  {entry.whyItMatters || '（未設定）'}
                </p>
              </div>

              {/* 目標・基準 */}
              <div>
                <div className="text-xs text-zinc-500 mb-1">目標・基準</div>
                <p className="text-sm text-zinc-700">
                  {entry.targetText || '（未設定）'}
                </p>
              </div>
            </div>
          </Card>

          {/* 3. 算出セクション */}
          <Card>
            <div className="p-4 border-b flex items-center gap-2">
              <Calculator className="w-4 h-4" />
              <h2 className="font-semibold">算出方法</h2>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 gap-4">
                {/* 算出方法 */}
                <div>
                  <div className="text-xs text-zinc-500 mb-1">算出方法</div>
                  <div className="font-medium">
                    {CALCULATION_METHOD_LABELS[entry.calculationMethod] ||
                      entry.calculationMethod}
                  </div>
                </div>

                {/* データソース */}
                <div>
                  <div className="text-xs text-zinc-500 mb-1">データソース</div>
                  <div className="flex items-center gap-1">
                    <Database className="w-4 h-4 text-zinc-400" />
                    <span>{entry.dataSource || '（未設定）'}</span>
                  </div>
                </div>

                {/* 更新頻度 */}
                <div>
                  <div className="text-xs text-zinc-500 mb-1">データ更新頻度</div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4 text-zinc-400" />
                    <span>
                      {entry.refreshCadence
                        ? REFRESH_CADENCE_LABELS[entry.refreshCadence] ||
                          entry.refreshCadence
                        : '（未設定）'}
                    </span>
                  </div>
                </div>
              </div>

              {/* 算出ノート */}
              {entry.calculationNotes && (
                <div className="mt-4 pt-4 border-t">
                  <div className="text-xs text-zinc-500 mb-1">算出ノート</div>
                  <p className="text-sm text-zinc-700 whitespace-pre-wrap">
                    {entry.calculationNotes}
                  </p>
                </div>
              )}
            </div>
          </Card>

          {/* 4. 異常検知ルールセクション */}
          <Card>
            <div className="p-4 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <h2 className="font-semibold">異常検知ルール</h2>
              </div>
              {isManager && !editingRule && (
                <Button variant="outline" size="sm" onClick={startEditRule}>
                  <Edit3 className="w-4 h-4 mr-1" />
                  編集
                </Button>
              )}
            </div>
            <div className="p-4">
              {editingRule && ruleDraft ? (
                // 編集モード
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={ruleDraft.enabled ?? true}
                        onChange={(e) =>
                          setRuleDraft({ ...ruleDraft, enabled: e.target.checked })
                        }
                        className="rounded"
                      />
                      <span className="text-sm">検知を有効にする</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={ruleDraft.missingDataAlert ?? true}
                        onChange={(e) =>
                          setRuleDraft({
                            ...ruleDraft,
                            missingDataAlert: e.target.checked,
                          })
                        }
                        className="rounded"
                      />
                      <span className="text-sm">欠損データ通知</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-zinc-500">上限閾値</label>
                      <input
                        type="number"
                        value={ruleDraft.thresholdHigh ?? ''}
                        onChange={(e) =>
                          setRuleDraft({
                            ...ruleDraft,
                            thresholdHigh: e.target.value
                              ? Number(e.target.value)
                              : null,
                          })
                        }
                        placeholder="なし"
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500">下限閾値</label>
                      <input
                        type="number"
                        value={ruleDraft.thresholdLow ?? ''}
                        onChange={(e) =>
                          setRuleDraft({
                            ...ruleDraft,
                            thresholdLow: e.target.value
                              ? Number(e.target.value)
                              : null,
                          })
                        }
                        placeholder="なし"
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500">変化率上限（%）</label>
                      <input
                        type="number"
                        value={ruleDraft.maxPercentChange ?? ''}
                        onChange={(e) =>
                          setRuleDraft({
                            ...ruleDraft,
                            maxPercentChange: e.target.value
                              ? Number(e.target.value)
                              : null,
                          })
                        }
                        placeholder="なし"
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500">比較対象</label>
                      <select
                        value={ruleDraft.compareTo ?? ''}
                        onChange={(e) =>
                          setRuleDraft({
                            ...ruleDraft,
                            compareTo: e.target.value
                              ? (e.target.value as 'prevDay' | 'prevWeek')
                              : null,
                          })
                        }
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                      >
                        <option value="">なし</option>
                        <option value="prevDay">前日</option>
                        <option value="prevWeek">前週</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingRule(false);
                        setRuleDraft(null);
                      }}
                    >
                      キャンセル
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={saveRule}
                      disabled={savingRule}
                    >
                      <Save className="w-4 h-4 mr-1" />
                      保存
                    </Button>
                  </div>
                </div>
              ) : anomalyRule ? (
                // 表示モード
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    {anomalyRule.enabled ? (
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle className="w-4 h-4" />
                        <span className="text-sm">有効</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-zinc-500">
                        <XCircle className="w-4 h-4" />
                        <span className="text-sm">無効</span>
                      </span>
                    )}
                    {anomalyRule.missingDataAlert && (
                      <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded">
                        欠損通知ON
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-xs text-zinc-500">上限閾値</div>
                      <div className="font-medium">
                        {anomalyRule.thresholdHigh ?? '-'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500">下限閾値</div>
                      <div className="font-medium">
                        {anomalyRule.thresholdLow ?? '-'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500">変化率上限</div>
                      <div className="font-medium">
                        {anomalyRule.maxPercentChange
                          ? `${anomalyRule.maxPercentChange}%`
                          : '-'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500">比較対象</div>
                      <div className="font-medium">
                        {anomalyRule.compareTo === 'prevDay'
                          ? '前日'
                          : anomalyRule.compareTo === 'prevWeek'
                          ? '前週'
                          : '-'}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center text-zinc-500 py-4">
                  異常検知ルールが設定されていません
                </div>
              )}
            </div>
          </Card>

          {/* 5. 変更履歴セクション（管理者/マネージャーのみ） */}
          {isManager && (
            <Card>
              <div className="p-4 border-b flex items-center gap-2">
                <History className="w-4 h-4" />
                <h2 className="font-semibold">変更履歴</h2>
              </div>
              <div className="p-4">
                {events.length === 0 ? (
                  <div className="text-center text-zinc-500 py-4">
                    変更履歴がありません
                  </div>
                ) : (
                  <div className="space-y-3">
                    {events.map((event) => {
                      const actionInfo = getActionLabel(event.action);
                      return (
                        <div
                          key={event.id}
                          className="flex items-start gap-3 p-3 bg-zinc-50 rounded-lg"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span
                                className={`px-1.5 py-0.5 text-xs rounded ${actionInfo.color}`}
                              >
                                {actionInfo.label}
                              </span>
                              <span className="text-sm font-medium">
                                {event.actorUserName || event.actorUserId || 'システム'}
                              </span>
                            </div>
                            {event.note && (
                              <p className="text-sm text-zinc-600">{event.note}</p>
                            )}
                            <div className="text-xs text-zinc-400 mt-1">
                              {formatDateTime(event.createdAt)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* メタ情報 */}
          <div className="text-xs text-zinc-400 text-center">
            作成: {formatDateTime(entry.createdAt)} / 最終更新:{' '}
            {formatDateTime(entry.updatedAt)}
            {entry.lastDefinitionUpdatedAt && (
              <> / 定義更新: {formatDateTime(entry.lastDefinitionUpdatedAt)}</>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
