'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/Header';
import { Card, CardHeader, CardTitle, CardContent, Button, Select } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { Bell, Save, Info, Lock, AlertTriangle } from 'lucide-react';

type NotifyMode = 'immediate' | 'digest' | 'off';

interface CategorySetting {
  key: string;
  label: string;
  currentMode: NotifyMode;
  isEnforced: boolean;
}

interface NotificationSettings {
  userId: string;
  modeDefault: NotifyMode;
  overrides: Record<string, NotifyMode>;
  updatedAt: string;
}

const MODE_LABELS: Record<NotifyMode, string> = {
  immediate: '即時通知',
  digest: 'ダイジェスト（まとめ）',
  off: 'オフ（通知しない）',
};

const MODE_OPTIONS = [
  { value: 'immediate', label: '即時通知' },
  { value: 'digest', label: 'ダイジェスト（まとめ）' },
  { value: 'off', label: 'オフ（通知しない）' },
];

export default function NotificationSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [categories, setCategories] = useState<CategorySetting[]>([]);
  const [modeDefault, setModeDefault] = useState<NotifyMode>('digest');
  const [overrides, setOverrides] = useState<Record<string, NotifyMode>>({});
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/notification-settings');
      if (!res.ok) throw new Error('Failed to fetch settings');

      const data = await res.json();
      setSettings(data.settings);
      setCategories(data.categories);
      setModeDefault(data.settings.modeDefault);
      setOverrides(data.settings.overrides);
    } catch (error) {
      console.error('Failed to fetch settings:', error);
      setMessage({ type: 'error', text: '設定の読み込みに失敗しました' });
    } finally {
      setLoading(false);
    }
  };

  const handleModeDefaultChange = (value: string) => {
    setModeDefault(value as NotifyMode);
  };

  const handleOverrideChange = (key: string, value: string) => {
    setOverrides((prev) => ({
      ...prev,
      [key]: value as NotifyMode,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/notification-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modeDefault, overrides }),
      });

      if (!res.ok) throw new Error('Failed to save settings');

      const data = await res.json();
      setSettings(data.settings);
      setCategories(data.categories);
      setMessage({ type: 'success', text: '設定を保存しました' });
    } catch (error) {
      console.error('Failed to save settings:', error);
      setMessage({ type: 'error', text: '設定の保存に失敗しました' });
    } finally {
      setSaving(false);
    }
  };

  const getEffectiveMode = (category: CategorySetting): NotifyMode => {
    const override = overrides[category.key];
    return override ?? modeDefault;
  };

  const getModeOptionsForCategory = (category: CategorySetting) => {
    if (category.isEnforced) {
      // off を選べないようにする
      return MODE_OPTIONS.filter((opt) => opt.value !== 'off');
    }
    return MODE_OPTIONS;
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
              <Bell className="w-6 h-6 text-gray-500 mr-2" />
              通知設定
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

          {/* 説明 */}
          <Card className="mb-6 bg-blue-50 border-blue-100">
            <CardContent className="py-4">
              <div className="flex items-start">
                <Info className="w-5 h-5 text-blue-500 mt-0.5 mr-3 flex-shrink-0" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">通知モードについて</p>
                  <ul className="list-disc list-inside space-y-1 text-blue-700">
                    <li><strong>即時通知</strong>: 発生時にすぐ通知されます</li>
                    <li><strong>ダイジェスト</strong>: 毎朝9時にまとめて通知されます</li>
                    <li><strong>オフ</strong>: 通知しません（画面上では確認可能）</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 重要通知の注意 */}
          <Card className="mb-6 bg-yellow-50 border-yellow-100">
            <CardContent className="py-4">
              <div className="flex items-start">
                <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" />
                <div className="text-sm text-yellow-800">
                  <p className="font-medium mb-1">重要通知について</p>
                  <p className="text-yellow-700">
                    システムエラー、未分類スコープ、KPI異常などの重要通知は
                    オフにすることができません（最低でもダイジェストで通知されます）。
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 全体のデフォルト設定 */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>全体の通知モード</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    デフォルトの通知モード
                  </label>
                  <Select
                    value={modeDefault}
                    onChange={(e) => handleModeDefaultChange(e.target.value)}
                    options={MODE_OPTIONS}
                  />
                  <p className="mt-2 text-sm text-gray-500">
                    個別に設定されていない通知は、このモードで送信されます。
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* カテゴリ別設定 */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>カテゴリ別設定</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {categories.map((category) => {
                  const effectiveMode = getEffectiveMode(category);
                  const options = getModeOptionsForCategory(category);

                  return (
                    <div
                      key={category.key}
                      className={`flex items-center justify-between p-4 rounded-lg ${
                        category.isEnforced
                          ? 'bg-yellow-50 border border-yellow-100'
                          : 'bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center flex-1 min-w-0">
                        {category.isEnforced && (
                          <Lock className="w-4 h-4 text-yellow-600 mr-2 flex-shrink-0" />
                        )}
                        <div>
                          <p className="font-medium text-gray-900">
                            {category.label}
                          </p>
                          {category.isEnforced && (
                            <p className="text-xs text-yellow-600 mt-0.5">
                              重要通知（オフ不可）
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="ml-4 w-48 flex-shrink-0">
                        <Select
                          value={overrides[category.key] ?? ''}
                          onChange={(e) =>
                            handleOverrideChange(
                              category.key,
                              e.target.value || modeDefault
                            )
                          }
                          options={[
                            {
                              value: '',
                              label: `デフォルト（${MODE_LABELS[modeDefault]}）`,
                            },
                            ...options,
                          ]}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
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
