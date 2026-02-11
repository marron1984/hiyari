'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  Database,
  Search,
  Building2,
  AlertTriangle,
  CheckCircle,
  Play,
  Eye,
  History,
  RefreshCw,
} from 'lucide-react';
import type { BusinessUnit } from '@/lib/business/types';

// ========== 型定義 ==========

type EntityType = 'tickets' | 'repairs' | 'correctiveActions';

interface BackfillSampleItem {
  id: string;
  title: string;
  createdAt: string;
  hint: string;
}

interface BackfillEvent {
  id: string;
  actorUserId: string;
  actorUserName: string | null;
  entityType: string;
  filterJson: string;
  targetBusinessUnitId: string;
  targetBusinessUnitName: string | null;
  affectedCount: number;
  dryRun: boolean;
  createdAt: string;
}

const ENTITY_TYPES: { id: EntityType; label: string; description: string }[] = [
  { id: 'tickets', label: 'チケット', description: '問い合わせ・対応チケット' },
  { id: 'repairs', label: '修繕', description: '設備故障・修繕依頼' },
  { id: 'correctiveActions', label: '是正措置', description: '問題の根本原因分析と改善措置' },
];

// ========== メインページ ==========

export default function ScopeBackfillPage() {
  // Step 状態
  const [step, setStep] = useState(1);

  // Step 1: エンティティタイプ
  const [entityType, setEntityType] = useState<EntityType>('tickets');

  // Step 2: フィルタ
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Step 3: ターゲット事業単位
  const [targetBusinessUnitId, setTargetBusinessUnitId] = useState('');
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);

  // Step 4: プレビュー結果
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewSample, setPreviewSample] = useState<BackfillSampleItem[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Step 5: 適用結果
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyResult, setApplyResult] = useState<{ affectedCount: number; eventId: string } | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  // 監査ログ
  const [events, setEvents] = useState<BackfillEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [showEvents, setShowEvents] = useState(false);

  // 事業単位リスト取得
  useEffect(() => {
    async function fetchBusinessUnits() {
      try {
        const res = await fetch('/api/business/units');
        if (res.ok) {
          const data = await res.json();
          setBusinessUnits(data.units || []);
        }
      } catch (error) {
        console.error('Failed to fetch business units:', error);
      }
    }
    fetchBusinessUnits();
  }, []);

  // プレビュー実行
  const handlePreview = async () => {
    if (!targetBusinessUnitId) {
      setPreviewError('事業単位を選択してください');
      return;
    }

    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewCount(null);
    setPreviewSample([]);

    try {
      const res = await fetch('/api/admin/scope-backfill/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType,
          filters: {
            onlyUnclassified: true,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
            q: searchQuery || undefined,
            limit: 200,
          },
          targetBusinessUnitId,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        setPreviewError(data.error || 'プレビューに失敗しました');
        return;
      }

      setPreviewCount(data.count);
      setPreviewSample(data.sample || []);
      setStep(4);
    } catch (error) {
      setPreviewError('プレビューに失敗しました');
    } finally {
      setPreviewLoading(false);
    }
  };

  const [showApplyConfirm, setShowApplyConfirm] = useState(false);

  // 適用確認
  const handleApplyClick = () => {
    setShowApplyConfirm(true);
  };

  // 適用実行
  const handleApply = async () => {
    setShowApplyConfirm(false);
    setApplyLoading(true);
    setApplyError(null);
    setApplyResult(null);

    try {
      const res = await fetch('/api/admin/scope-backfill/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType,
          filters: {
            onlyUnclassified: true,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
            q: searchQuery || undefined,
          },
          targetBusinessUnitId,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        setApplyError(data.error || '適用に失敗しました');
        return;
      }

      setApplyResult({
        affectedCount: data.affectedCount,
        eventId: data.eventId,
      });
      setStep(5);
    } catch (error) {
      setApplyError('適用に失敗しました');
    } finally {
      setApplyLoading(false);
    }
  };

  // 監査ログ取得
  const fetchEvents = async () => {
    setEventsLoading(true);
    try {
      const res = await fetch('/api/admin/scope-backfill/events');
      const data = await res.json();
      if (data.success) {
        setEvents(data.events || []);
      }
    } catch (error) {
      console.error('Failed to fetch events:', error);
    } finally {
      setEventsLoading(false);
    }
  };

  // リセット
  const handleReset = () => {
    setStep(1);
    setPreviewCount(null);
    setPreviewSample([]);
    setPreviewError(null);
    setApplyResult(null);
    setApplyError(null);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const selectedBusinessUnit = businessUnits.find((bu) => bu.id === targetBusinessUnitId);

  return (
    <main className="pb-8">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-zinc-700 to-zinc-900 rounded-lg">
              <Database className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-zinc-900">Scope Backfill</h1>
              <p className="text-sm text-zinc-500">
                未分類データへの事業単位一括付与（Admin専用）
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setShowEvents(!showEvents);
              if (!showEvents) fetchEvents();
            }}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-100 text-zinc-700 rounded-lg hover:bg-zinc-200 transition-colors"
          >
            <History className="w-4 h-4" />
            {showEvents ? '設定に戻る' : '実行履歴'}
          </button>
        </div>

        {/* 監査ログ表示 */}
        {showEvents ? (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <History className="w-4 h-4" />
                  実行履歴（監査ログ）
                </CardTitle>
                <button
                  onClick={fetchEvents}
                  disabled={eventsLoading}
                  className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
                >
                  <RefreshCw className={`w-4 h-4 ${eventsLoading ? 'animate-spin' : ''}`} />
                  更新
                </button>
              </div>
            </CardHeader>
            <CardContent>
              {events.length === 0 ? (
                <p className="text-center text-zinc-500 py-4">実行履歴がありません</p>
              ) : (
                <div className="space-y-3">
                  {events.map((event) => (
                    <div
                      key={event.id}
                      className="p-3 bg-zinc-50 rounded-lg border border-zinc-200"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-zinc-200 text-zinc-700">
                            {event.entityType}
                          </Badge>
                          <span className="text-sm font-medium">
                            → {event.targetBusinessUnitName || event.targetBusinessUnitId}
                          </span>
                        </div>
                        <span className="text-xs text-zinc-500">
                          {formatDate(event.createdAt)}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-zinc-600">
                        <span>更新件数: {event.affectedCount}件</span>
                        <span>実行者: {event.actorUserName || event.actorUserId}</span>
                        <span className="text-xs text-zinc-400">ID: {event.id}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            {/* ステップインジケーター */}
            <div className="flex items-center gap-2 mb-6">
              {[1, 2, 3, 4, 5].map((s) => (
                <div
                  key={s}
                  className={`flex items-center ${s < 5 ? 'flex-1' : ''}`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                      step >= s
                        ? 'bg-zinc-800 text-white'
                        : 'bg-zinc-200 text-zinc-500'
                    }`}
                  >
                    {s}
                  </div>
                  {s < 5 && (
                    <div
                      className={`flex-1 h-1 mx-2 ${
                        step > s ? 'bg-zinc-800' : 'bg-zinc-200'
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Step 1: エンティティタイプ選択 */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-base">Step 1: 対象エンティティ</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3">
                  {ENTITY_TYPES.map((et) => (
                    <button
                      key={et.id}
                      onClick={() => {
                        setEntityType(et.id);
                        if (step < 2) setStep(2);
                      }}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${
                        entityType === et.id
                          ? 'border-zinc-800 bg-zinc-50'
                          : 'border-zinc-200 hover:border-zinc-300'
                      }`}
                    >
                      <div className="font-medium text-zinc-900">{et.label}</div>
                      <div className="text-xs text-zinc-500 mt-1">{et.description}</div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Step 2: フィルタ設定 */}
            {step >= 2 && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="text-base">Step 2: フィルタ条件</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-sm text-amber-700">
                    <AlertTriangle className="w-4 h-4" />
                    <span>未分類（businessUnitId = null）のデータのみが対象です</span>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1">
                        開始日
                      </label>
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="w-full px-3 py-2 border border-zinc-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1">
                        終了日
                      </label>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="w-full px-3 py-2 border border-zinc-200 rounded-lg"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">
                      キーワード検索（任意）
                    </label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-zinc-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="タイトル・内容で絞り込み..."
                        className="w-full pl-10 pr-4 py-2 border border-zinc-200 rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      onClick={() => setStep(3)}
                      className="px-4 py-2 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition-colors"
                    >
                      次へ
                    </button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 3: ターゲット事業単位選択 */}
            {step >= 3 && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    Step 3: 付与先事業単位
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <select
                    value={targetBusinessUnitId}
                    onChange={(e) => setTargetBusinessUnitId(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-lg"
                  >
                    <option value="">事業単位を選択...</option>
                    {businessUnits.map((bu) => (
                      <option key={bu.id} value={bu.id}>
                        {bu.name}
                      </option>
                    ))}
                  </select>

                  {previewError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                      {previewError}
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      onClick={handlePreview}
                      disabled={previewLoading || !targetBusinessUnitId}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                      {previewLoading ? 'プレビュー中...' : 'プレビュー'}
                    </button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 4: プレビュー結果 */}
            {step >= 4 && previewCount !== null && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="text-base">Step 4: プレビュー結果</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-4 bg-zinc-50 rounded-lg border border-zinc-200">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-zinc-900">
                        {previewCount}件
                      </div>
                      <div className="text-sm text-zinc-500 mt-1">
                        対象レコード数
                      </div>
                    </div>
                    <div className="mt-3 text-center text-sm text-zinc-600">
                      → <strong>{selectedBusinessUnit?.name}</strong> に付与予定
                    </div>
                  </div>

                  {previewSample.length > 0 && (
                    <div>
                      <div className="text-sm font-medium text-zinc-700 mb-2">
                        サンプル（最大200件）
                      </div>
                      <div className="max-h-64 overflow-y-auto border border-zinc-200 rounded-lg">
                        <table className="w-full text-sm">
                          <thead className="bg-zinc-50 sticky top-0">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium text-zinc-700">ID</th>
                              <th className="px-3 py-2 text-left font-medium text-zinc-700">タイトル</th>
                              <th className="px-3 py-2 text-left font-medium text-zinc-700">作成日</th>
                              <th className="px-3 py-2 text-left font-medium text-zinc-700">ヒント</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-100">
                            {previewSample.map((item) => (
                              <tr key={item.id} className="hover:bg-zinc-50">
                                <td className="px-3 py-2 text-zinc-500 font-mono text-xs">
                                  {item.id}
                                </td>
                                <td className="px-3 py-2 text-zinc-900 truncate max-w-xs">
                                  {item.title}
                                </td>
                                <td className="px-3 py-2 text-zinc-500 text-xs">
                                  {new Date(item.createdAt).toLocaleDateString('ja-JP')}
                                </td>
                                <td className="px-3 py-2 text-zinc-500 text-xs">
                                  {item.hint}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {applyError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                      {applyError}
                    </div>
                  )}

                  <div className="flex justify-between">
                    <button
                      onClick={handleReset}
                      className="px-4 py-2 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors"
                    >
                      リセット
                    </button>
                    <button
                      onClick={handleApplyClick}
                      disabled={applyLoading || previewCount === 0}
                      className="flex items-center gap-2 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Play className="w-4 h-4" />
                      {applyLoading ? '適用中...' : `${previewCount}件に適用`}
                    </button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 5: 適用完了 */}
            {step >= 5 && applyResult && (
              <Card className="mb-6 border-green-200 bg-green-50">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2 text-green-700">
                    <CheckCircle className="w-5 h-5" />
                    Step 5: 適用完了
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-center py-4">
                    <div className="text-4xl font-bold text-green-700">
                      {applyResult.affectedCount}件
                    </div>
                    <div className="text-sm text-green-600 mt-1">
                      正常に更新されました
                    </div>
                  </div>

                  <div className="p-3 bg-white rounded-lg border border-green-200 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-600">監査ログID</span>
                      <span className="font-mono text-zinc-900">{applyResult.eventId}</span>
                    </div>
                  </div>

                  <div className="flex justify-center">
                    <button
                      onClick={handleReset}
                      className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                      新しいバックフィルを開始
                    </button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      {/* 適用確認ダイアログ */}
      <ConfirmDialog
        open={showApplyConfirm}
        title="一括付与の確認"
        message={`${previewCount}件のレコードに事業単位を一括付与します。よろしいですか？`}
        confirmLabel="適用"
        variant="danger"
        onConfirm={handleApply}
        onCancel={() => setShowApplyConfirm(false)}
      />
    </main>
  );
}
