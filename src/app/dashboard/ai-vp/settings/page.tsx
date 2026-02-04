'use client';

/**
 * AI副社長 スコアリング設定ページ
 *
 * Implementation Ticket 062/063-fix: AI副社長Top3の重み（スコアリング）を管理画面から調整
 *
 * - 重み・閾値・多様性設定の編集
 * - リアルタイムで変更を反映（Role Home、朝イチダイジェストに影響）
 * - 変更履歴（監査ログ）の表示
 * - デフォルトへのリセット / ロールバック / プリセット適用
 */

import { useEffect, useState } from 'react';
import { Header } from '@/components/Header';
import { Card, CardHeader, CardTitle, CardContent, Button, Input } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { Settings, Save, RefreshCw, History, Info, RotateCcw, Layers, Eye } from 'lucide-react';

interface WeightLabel {
  label: string;
  category: string;
}

interface ScoringWeights {
  [key: string]: number;
}

interface ScoringThresholds {
  [key: string]: number;
}

interface DiversitySettings {
  maxPerCategory: number;
  maxFinanceCandidates: number;
  top3Limit?: number;
  globalTopLimit?: number;
}

interface AiVpScoringConfig {
  weights: ScoringWeights;
  thresholds: ScoringThresholds;
  diversity: DiversitySettings;
}

interface AuditLogEntry {
  id: string;
  action: 'update' | 'reset' | 'rollback' | 'apply_preset';
  actorUserId: string;
  createdAt: string;
  note: string | null;
  beforeJson: AiVpScoringConfig | null;
  afterJson: AiVpScoringConfig;
}

interface Preset {
  id: string;
  name: string;
  description: string;
  scenario: string;
}

interface PreviewResult {
  businessUnitId: string;
  businessUnitName: string;
  top3: Array<{ key: string; label: string; count: number; weight: number; score: number }>;
  totalScore: number;
}

export default function AiVpSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<AiVpScoringConfig | null>(null);
  const [defaults, setDefaults] = useState<AiVpScoringConfig | null>(null);
  const [weightLabels, setWeightLabels] = useState<Record<string, WeightLabel>>({});
  const [thresholdLabels, setThresholdLabels] = useState<Record<string, string>>({});
  const [diversityLabels, setDiversityLabels] = useState<Record<string, string>>({});
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [showAudit, setShowAudit] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  // 063-fix: プリセットとプレビュー
  const [presets, setPresets] = useState<Preset[]>([]);
  const [showPresets, setShowPresets] = useState(false);
  const [previewResults, setPreviewResults] = useState<PreviewResult[] | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    fetchSettings();
    fetchPresets();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/ai-vp/settings?includeAudit=true');
      if (!res.ok) throw new Error('Failed to fetch settings');

      const data = await res.json();
      setConfig(data.settings.config);
      setDefaults(data.defaults);
      setWeightLabels(data.labels.weights);
      setThresholdLabels(data.labels.thresholds);
      setDiversityLabels(data.labels.diversity || {});
      setAuditLog(data.auditLog || []);
      setUpdatedAt(data.settings.updatedAt);
    } catch (error) {
      console.error('Failed to fetch settings:', error);
      setMessage({ type: 'error', text: '設定の読み込みに失敗しました' });
    } finally {
      setLoading(false);
    }
  };

  const fetchPresets = async () => {
    try {
      const res = await fetch('/api/ai-vp/settings/presets');
      if (res.ok) {
        const data = await res.json();
        setPresets(data.presets || []);
      }
    } catch (error) {
      console.error('Failed to fetch presets:', error);
    }
  };

  const handleWeightChange = (key: string, value: string) => {
    if (!config) return;
    const numValue = parseInt(value, 10) || 0;
    setConfig({
      ...config,
      weights: { ...config.weights, [key]: numValue },
    });
  };

  const handleThresholdChange = (key: string, value: string) => {
    if (!config) return;
    const numValue = parseInt(value, 10) || 0;
    setConfig({
      ...config,
      thresholds: { ...config.thresholds, [key]: numValue },
    });
  };

  const handleDiversityChange = (key: keyof DiversitySettings, value: string) => {
    if (!config) return;
    const numValue = parseInt(value, 10) || 1;
    setConfig({
      ...config,
      diversity: { ...config.diversity, [key]: numValue },
    });
  };

  const handleSave = async () => {
    if (!config) return;

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/ai-vp/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to save settings');
      }

      const data = await res.json();
      setConfig(data.settings.config);
      setUpdatedAt(data.settings.updatedAt);
      setMessage({ type: 'success', text: '設定を保存しました' });

      fetchSettings();
    } catch (error) {
      console.error('Failed to save settings:', error);
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '設定の保存に失敗しました' });
    } finally {
      setSaving(false);
    }
  };

  // 063-fix: POST /api/ai-vp/settings/reset を使用
  const handleReset = async () => {
    if (!confirm('設定をデフォルトに戻しますか？この操作は取り消せません。')) {
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/ai-vp/settings/reset', {
        method: 'POST',
      });

      if (!res.ok) throw new Error('Failed to reset settings');

      const data = await res.json();
      setConfig(data.settings.config);
      setUpdatedAt(data.settings.updatedAt);
      setMessage({ type: 'success', text: 'デフォルト設定に戻しました' });

      fetchSettings();
    } catch (error) {
      console.error('Failed to reset settings:', error);
      setMessage({ type: 'error', text: '設定のリセットに失敗しました' });
    } finally {
      setSaving(false);
    }
  };

  // 063-fix: ロールバック
  const handleRollback = async () => {
    if (!confirm('直前の設定に戻しますか？')) {
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/ai-vp/settings/rollback', {
        method: 'POST',
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to rollback settings');
      }

      const data = await res.json();
      setConfig(data.settings.config);
      setUpdatedAt(data.settings.updatedAt);
      setMessage({ type: 'success', text: '直前の設定にロールバックしました' });

      fetchSettings();
    } catch (error) {
      console.error('Failed to rollback settings:', error);
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'ロールバックに失敗しました' });
    } finally {
      setSaving(false);
    }
  };

  // 063-fix: プリセット適用
  const handleApplyPreset = async (presetId: string) => {
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;

    if (!confirm(`プリセット「${preset.name}」を適用しますか？`)) {
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/ai-vp/settings/apply-preset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presetId }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to apply preset');
      }

      const data = await res.json();
      setConfig(data.settings.config);
      setUpdatedAt(data.settings.updatedAt);
      setMessage({ type: 'success', text: `プリセット「${preset.name}」を適用しました` });
      setShowPresets(false);

      fetchSettings();
    } catch (error) {
      console.error('Failed to apply preset:', error);
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'プリセットの適用に失敗しました' });
    } finally {
      setSaving(false);
    }
  };

  // 063-fix: プレビュー
  const handlePreview = async () => {
    if (!config) return;

    setMessage(null);

    try {
      const res = await fetch('/api/ai-vp/preview-top3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configJson: config }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to preview');
      }

      const data = await res.json();
      setPreviewResults(data.preview.businessUnits);
      setShowPreview(true);
    } catch (error) {
      console.error('Failed to preview:', error);
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'プレビューに失敗しました' });
    }
  };

  // カテゴリ別に重みをグループ化
  const groupedWeights = config
    ? Object.entries(config.weights).reduce(
        (acc, [key, value]) => {
          const label = weightLabels[key];
          const category = label?.category || 'その他';
          if (!acc[category]) acc[category] = [];
          acc[category].push({ key, value, label: label?.label || key });
          return acc;
        },
        {} as Record<string, Array<{ key: string; value: number; label: string }>>
      )
    : {};

  // 変更差分を計算
  const getChangeSummary = (entry: AuditLogEntry): string[] => {
    if (entry.action === 'reset') {
      return ['デフォルト設定にリセット'];
    }
    if (entry.action === 'rollback') {
      return ['直前の設定にロールバック'];
    }
    if (entry.action === 'apply_preset') {
      return [entry.note || 'プリセット適用'];
    }
    if (!entry.beforeJson) {
      return ['初期設定'];
    }

    const changes: string[] = [];
    const before = entry.beforeJson;
    const after = entry.afterJson;

    // weights の変更
    for (const key of Object.keys(after.weights)) {
      const bVal = before.weights?.[key];
      const aVal = after.weights[key];
      if (bVal !== aVal) {
        const label = weightLabels[key]?.label || key;
        changes.push(`${label}: ${bVal ?? '-'} → ${aVal}`);
      }
    }

    // thresholds の変更
    for (const key of Object.keys(after.thresholds)) {
      const bVal = before.thresholds?.[key];
      const aVal = after.thresholds[key];
      if (bVal !== aVal) {
        const label = thresholdLabels[key] || key;
        changes.push(`${label}: ${bVal ?? '-'} → ${aVal}`);
      }
    }

    // diversity の変更
    for (const key of Object.keys(after.diversity)) {
      const bVal = before.diversity?.[key as keyof DiversitySettings];
      const aVal = after.diversity[key as keyof DiversitySettings];
      if (bVal !== aVal) {
        const label = diversityLabels[key] || key;
        changes.push(`${label}: ${bVal ?? '-'} → ${aVal}`);
      }
    }

    return changes.length > 0 ? changes : ['変更なし'];
  };

  const getActionLabel = (action: AuditLogEntry['action']): string => {
    switch (action) {
      case 'reset':
        return 'リセット';
      case 'rollback':
        return 'ロールバック';
      case 'apply_preset':
        return 'プリセット適用';
      default:
        return '更新';
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
      <main className="pb-8">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-bold text-gray-900 flex items-center">
              <Settings className="w-6 h-6 text-gray-500 mr-2" />
              AI副社長 スコアリング設定
            </h1>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPresets(!showPresets)}
              >
                <Layers className="w-4 h-4 mr-1" />
                プリセット
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAudit(!showAudit)}
              >
                <History className="w-4 h-4 mr-1" />
                変更履歴
              </Button>
            </div>
          </div>

          {message && (
            <div
              className={`mb-6 p-4 rounded-lg ${
                message.type === 'success'
                  ? 'bg-green-50 border border-green-200 text-green-700'
                  : 'bg-red-50 border border-red-200 text-red-700'
              }`}
            >
              {message.text}
            </div>
          )}

          {updatedAt && (
            <p className="text-sm text-gray-500 mb-4">
              最終更新: {new Date(updatedAt).toLocaleString('ja-JP')}
            </p>
          )}

          {/* 説明 */}
          <Card className="mb-6 bg-blue-50 border-blue-100">
            <CardContent className="py-4">
              <div className="flex items-start">
                <Info className="w-5 h-5 text-blue-500 mt-0.5 mr-3 flex-shrink-0" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">スコアリング設定について</p>
                  <p className="text-blue-700">
                    AI副社長の「今週のTop3」アクション候補は、各項目の件数に重みを掛けて
                    スコアを算出し、上位から表示されます。重みを大きくすると優先度が上がります。
                    変更は即時反映され、Role Home や朝イチダイジェストにも影響します。
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* プリセット選択 */}
          {showPresets && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Layers className="w-5 h-5 text-gray-500 mr-2" />
                  プリセット選択
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {presets.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => handleApplyPreset(preset.id)}
                      disabled={saving}
                      className="p-4 text-left border rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      <p className="font-medium text-gray-900">{preset.name}</p>
                      <p className="text-sm text-gray-500 mt-1">{preset.description}</p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* プレビュー結果 */}
          {showPreview && previewResults && (
            <Card className="mb-6 border-purple-200 bg-purple-50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center text-purple-700">
                    <Eye className="w-5 h-5 mr-2" />
                    プレビュー結果（サンプルデータ）
                  </CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowPreview(false)}
                  >
                    閉じる
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {previewResults.map((result) => (
                    <div key={result.businessUnitId} className="p-3 bg-white rounded-lg">
                      <p className="font-medium text-gray-900 mb-2">
                        {result.businessUnitName}
                        <span className="text-sm text-gray-500 ml-2">
                          (合計スコア: {result.totalScore})
                        </span>
                      </p>
                      {result.top3.length > 0 ? (
                        <ul className="text-sm text-gray-600 space-y-1">
                          {result.top3.map((item, i) => (
                            <li key={item.key}>
                              {i + 1}. {item.label} - {item.count}件 × {item.weight} = {item.score}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-gray-400">Top3なし</p>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-purple-600 mt-3">
                  ※ これはプレビューです。実際のデータは保存されていません。
                </p>
              </CardContent>
            </Card>
          )}

          {/* 監査ログ */}
          {showAudit && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <History className="w-5 h-5 text-gray-500 mr-2" />
                  変更履歴（監査ログ）
                </CardTitle>
              </CardHeader>
              <CardContent>
                {auditLog.length === 0 ? (
                  <p className="text-gray-500 text-sm">変更履歴はありません</p>
                ) : (
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {auditLog.map((entry) => {
                      const changes = getChangeSummary(entry);
                      return (
                        <div
                          key={entry.id}
                          className="p-3 bg-gray-50 rounded-lg text-sm"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium">
                              {getActionLabel(entry.action)}
                            </span>
                            <span className="text-gray-500 text-xs">
                              {new Date(entry.createdAt).toLocaleString('ja-JP')}
                            </span>
                          </div>
                          <p className="text-gray-500 text-xs mb-1">by {entry.actorUserId}</p>
                          {entry.note && (
                            <p className="text-xs text-gray-600 mb-1">メモ: {entry.note}</p>
                          )}
                          <ul className="text-xs text-gray-600 list-disc list-inside">
                            {changes.slice(0, 5).map((change, i) => (
                              <li key={i}>{change}</li>
                            ))}
                            {changes.length > 5 && (
                              <li>...他 {changes.length - 5} 件</li>
                            )}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* 重み設定（カテゴリ別） */}
          {Object.entries(groupedWeights).map(([category, items]) => (
            <Card key={category} className="mb-6">
              <CardHeader>
                <CardTitle>{category}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {items.map(({ key, value, label }) => {
                    const defaultValue = defaults?.weights[key];
                    const isChanged = defaultValue !== undefined && defaultValue !== value;

                    return (
                      <div
                        key={key}
                        className={`flex items-center gap-4 p-3 rounded-lg ${
                          isChanged ? 'bg-yellow-50' : 'bg-gray-50'
                        }`}
                      >
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{label}</p>
                          {isChanged && (
                            <p className="text-xs text-yellow-600">
                              デフォルト: {defaultValue}
                            </p>
                          )}
                        </div>
                        <div className="w-24">
                          <Input
                            type="number"
                            value={value}
                            onChange={(e) => handleWeightChange(key, e.target.value)}
                            min={0}
                            max={100}
                            className="text-center"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}

          {/* 閾値設定 */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>閾値設定</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {config &&
                  Object.entries(config.thresholds).map(([key, value]) => {
                    const label = thresholdLabels[key] || key;
                    const defaultValue = defaults?.thresholds[key];
                    const isChanged = defaultValue !== undefined && defaultValue !== value;

                    return (
                      <div
                        key={key}
                        className={`flex items-center gap-4 p-3 rounded-lg ${
                          isChanged ? 'bg-yellow-50' : 'bg-gray-50'
                        }`}
                      >
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{label}</p>
                          {isChanged && (
                            <p className="text-xs text-yellow-600">
                              デフォルト: {defaultValue?.toLocaleString()}
                            </p>
                          )}
                        </div>
                        <div className="w-32">
                          <Input
                            type="number"
                            value={value}
                            onChange={(e) => handleThresholdChange(key, e.target.value)}
                            min={0}
                            className="text-center"
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>

          {/* 表示件数設定 */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>表示件数設定</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {config && (
                  <>
                    <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">Top3の表示件数</p>
                        <p className="text-xs text-gray-500">事業別Top3の件数</p>
                      </div>
                      <div className="w-20">
                        <Input
                          type="number"
                          value={config.diversity.top3Limit ?? 3}
                          onChange={(e) => handleDiversityChange('top3Limit', e.target.value)}
                          min={1}
                          max={10}
                          className="text-center"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">全事業Topの表示件数</p>
                        <p className="text-xs text-gray-500">全事業横断Topアクションの件数</p>
                      </div>
                      <div className="w-20">
                        <Input
                          type="number"
                          value={config.diversity.globalTopLimit ?? 5}
                          onChange={(e) => handleDiversityChange('globalTopLimit', e.target.value)}
                          min={1}
                          max={20}
                          className="text-center"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">カテゴリ別最大件数</p>
                        <p className="text-xs text-gray-500">1カテゴリあたりの最大候補数</p>
                      </div>
                      <div className="w-20">
                        <Input
                          type="number"
                          value={config.diversity.maxPerCategory}
                          onChange={(e) => handleDiversityChange('maxPerCategory', e.target.value)}
                          min={1}
                          max={10}
                          className="text-center"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">財務系最大件数</p>
                        <p className="text-xs text-gray-500">財務系候補の最大表示件数</p>
                      </div>
                      <div className="w-20">
                        <Input
                          type="number"
                          value={config.diversity.maxFinanceCandidates}
                          onChange={(e) => handleDiversityChange('maxFinanceCandidates', e.target.value)}
                          min={1}
                          max={10}
                          className="text-center"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 操作ボタン */}
          <div className="flex flex-wrap gap-2 justify-between">
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleReset} disabled={saving}>
                <RefreshCw className="w-4 h-4 mr-2" />
                デフォルトに戻す
              </Button>
              <Button variant="outline" onClick={handleRollback} disabled={saving}>
                <RotateCcw className="w-4 h-4 mr-2" />
                ロールバック
              </Button>
              <Button variant="outline" onClick={handlePreview} disabled={saving}>
                <Eye className="w-4 h-4 mr-2" />
                プレビュー
              </Button>
            </div>
            <Button onClick={handleSave} loading={saving} size="lg">
              <Save className="w-4 h-4 mr-2" />
              設定を保存
            </Button>
          </div>
        </div>
      </main>
    </>
  );
}
