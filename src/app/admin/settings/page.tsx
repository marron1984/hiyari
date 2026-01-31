'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_TENANT_ID } from '@/lib/firebase';
import { getSettings, updateSettings, initializeSettings } from '@/lib/firestore';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardHeader, CardTitle, CardContent, Button, Input, Select } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { Settings, ScoringRule, DEFAULT_SCORING_RULES } from '@/types';
import { Save, RefreshCw, Settings as SettingsIcon, AlertTriangle, Link2, ChevronRight, BookOpen } from 'lucide-react';

export default function AdminSettingsPage() {
  return (
    <AuthGuard requireAdmin>
      <AdminSettingsContent />
    </AuthGuard>
  );
}

function AdminSettingsContent() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [scoringRules, setScoringRules] = useState<ScoringRule[]>(DEFAULT_SCORING_RULES);
  const [visibilityMode, setVisibilityMode] = useState<'all' | 'branch' | 'self'>('all');
  const [domainAllowList, setDomainAllowList] = useState('');
  const [excludeFraudFromRanking, setExcludeFraudFromRanking] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        let data = await getSettings(DEFAULT_TENANT_ID);
        if (!data) {
          // 設定が存在しない場合は初期化
          await initializeSettings(DEFAULT_TENANT_ID);
          data = await getSettings(DEFAULT_TENANT_ID);
        }
        if (data) {
          setSettings(data);
          setScoringRules(data.scoringRules || DEFAULT_SCORING_RULES);
          setVisibilityMode(data.visibilityMode || 'all');
          setDomainAllowList(data.domainAllowList?.join('\n') || '');
          setExcludeFraudFromRanking(data.excludeFraudFromRanking ?? true);
        }
      } catch (error) {
        console.error('Failed to fetch settings:', error);
        setMessage({ type: 'error', text: '設定の読み込みに失敗しました' });
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleScoringRuleChange = (
    index: number,
    field: keyof ScoringRule,
    value: string | number | boolean
  ) => {
    const newRules = [...scoringRules];
    newRules[index] = { ...newRules[index], [field]: value };
    setScoringRules(newRules);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await updateSettings(DEFAULT_TENANT_ID, {
        scoringRules,
        visibilityMode,
        domainAllowList: domainAllowList
          .split('\n')
          .map((d) => d.trim())
          .filter((d) => d),
        excludeFraudFromRanking,
      });
      setMessage({ type: 'success', text: '設定を保存しました' });
    } catch (error) {
      console.error('Failed to save settings:', error);
      setMessage({ type: 'error', text: '設定の保存に失敗しました' });
    } finally {
      setSaving(false);
    }
  };

  const handleResetRules = () => {
    if (confirm('スコアリングルールをデフォルトに戻しますか？')) {
      setScoringRules(DEFAULT_SCORING_RULES);
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
              <SettingsIcon className="w-6 h-6 text-gray-500 mr-2" />
              システム設定
            </h1>
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

          {/* スコアリングルール */}
          <Card className="mb-6">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>スコアリングルール</CardTitle>
              <Button variant="ghost" size="sm" onClick={handleResetRules}>
                <RefreshCw className="w-4 h-4 mr-1" />
                デフォルトに戻す
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {scoringRules.map((rule, index) => (
                  <div
                    key={rule.key}
                    className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg"
                  >
                    <div className="flex-shrink-0">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={(e) =>
                          handleScoringRuleChange(index, 'enabled', e.target.checked)
                        }
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{rule.label}</p>
                      <p className="text-sm text-gray-500">{rule.condition}</p>
                    </div>
                    <div className="w-24">
                      <div className="flex items-center">
                        <span className="text-gray-500 mr-1">+</span>
                        <Input
                          type="number"
                          value={rule.points}
                          onChange={(e) =>
                            handleScoringRuleChange(
                              index,
                              'points',
                              parseInt(e.target.value, 10) || 0
                            )
                          }
                          className="text-center"
                          min={0}
                          max={100}
                        />
                        <span className="text-gray-500 ml-1">pt</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm text-gray-500">
                ※ ルール変更は新規投稿から適用されます。既存の投稿のスコアは変更されません。
              </p>
            </CardContent>
          </Card>

          {/* 公開範囲設定 */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>公開範囲設定</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ランキング・投稿の公開範囲
                </label>
                <Select
                  value={visibilityMode}
                  onChange={(e) =>
                    setVisibilityMode(e.target.value as 'all' | 'branch' | 'self')
                  }
                  options={[
                    { value: 'all', label: '全体公開（全員が全員の情報を閲覧可能）' },
                    { value: 'branch', label: '事業所内のみ（同じ事業所の情報のみ閲覧可能）' },
                    { value: 'self', label: '自分のみ（自分の情報のみ閲覧可能）' },
                  ]}
                />
                <p className="mt-2 text-sm text-gray-500">
                  ※ MVPでは設定のみ。実際の制限は今後実装予定です。
                </p>
              </div>
            </CardContent>
          </Card>

          {/* 不正検知設定 */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center">
                <AlertTriangle className="w-5 h-5 text-yellow-500 mr-2" />
                不正検知設定
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="inline-flex items-center">
                  <input
                    type="checkbox"
                    checked={excludeFraudFromRanking}
                    onChange={(e) => setExcludeFraudFromRanking(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">
                    不正フラグのある投稿をランキングから除外する
                  </span>
                </label>
                <p className="mt-2 text-sm text-gray-500">
                  ※ 不正フラグは以下の条件で自動的に付与されます：
                </p>
                <ul className="mt-1 text-sm text-gray-500 list-disc list-inside">
                  <li>24時間以内に同一内容の投稿が存在する場合</li>
                  <li>1時間以内に5件以上の投稿がある場合</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* ドメイン制限 */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>アクセス制限</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  許可ドメイン（1行に1ドメイン）
                </label>
                <textarea
                  value={domainAllowList}
                  onChange={(e) => setDomainAllowList(e.target.value)}
                  rows={4}
                  placeholder="example.com&#10;company.co.jp"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-2 text-sm text-gray-500">
                  ※ 空白の場合は制限なし。MVPでは設定のみ、実際の制限は今後実装予定です。
                </p>
              </div>
            </CardContent>
          </Card>

          {/* 外部連携 */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Link2 className="w-5 h-5 text-blue-500 mr-2" />
                外部サービス連携
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <a
                href="/admin/settings/freee"
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                    <span className="text-blue-600 font-bold text-sm">freee</span>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">freee会計</p>
                    <p className="text-sm text-gray-500">支払い依頼の自動連携</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </a>
              <a
                href="/admin/accounting-templates"
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mr-3">
                    <BookOpen className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">仕訳テンプレート</p>
                    <p className="text-sm text-gray-500">freee自動仕訳のルール設定</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </a>
            </CardContent>
          </Card>

          {/* 保存ボタン */}
          <div className="flex justify-end">
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
