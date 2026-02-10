'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, Button } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { getAuth } from 'firebase/auth';
import {
  Bell,
  Clock,
  FileText,
  Calendar,
  Check,
  AlertCircle,
  AlertTriangle,
  Brain,
  Building,
  CreditCard,
  Shield,
  Target,
  CheckCircle,
  Zap,
  BookOpen,
  MessageSquare,
} from 'lucide-react';
import {
  NOTIFICATION_CATEGORIES,
  NotificationCategoryKey,
  NotifyMode,
  NotifyChannel,
  CategoryPreference,
  DEFAULT_CATEGORY_PREFERENCE,
} from '@/types/notification';
import { PushNotificationManager } from '@/components/pwa/PushNotificationManager';

// アイコンマッピング
const ICON_MAP: Record<string, React.ElementType> = {
  Clock, FileText, Calendar, CheckCircle, AlertTriangle,
  CreditCard, Brain, Building, Target, Shield,
};

const MODE_OPTIONS: { value: NotifyMode; label: string; description: string }[] = [
  { value: 'immediate', label: '即時', description: 'リアルタイムで通知' },
  { value: 'digest', label: 'ダイジェスト', description: '1日1回まとめて通知' },
  { value: 'off', label: 'オフ', description: '通知しない' },
];

const CHANNEL_OPTIONS: { value: NotifyChannel; label: string }[] = [
  { value: 'in_app', label: 'アプリ内のみ' },
  { value: 'line_works', label: 'LINE WORKSのみ' },
  { value: 'both', label: '両方' },
];

interface ReminderSettingsData {
  clockInReminder: boolean;
  clockInReminderMinutes: number;
  clockOutReminder: boolean;
  clockOutReminderMinutes: number;
  overtimeReminder: boolean;
  shiftPublishedNotify: boolean;
  shiftChangedNotify: boolean;
  pushEnabled: boolean;
}

interface PreferencesData {
  categories: Partial<Record<NotificationCategoryKey, CategoryPreference>>;
  lineWorksEnabled: boolean;
  digestHour: number;
}

export default function NotificationSettingsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [preferences, setPreferences] = useState<PreferencesData>({
    categories: {},
    lineWorksEnabled: false,
    digestHour: 9,
  });

  const [reminderSettings, setReminderSettings] = useState<ReminderSettingsData>({
    clockInReminder: true,
    clockInReminderMinutes: 15,
    clockOutReminder: true,
    clockOutReminderMinutes: 30,
    overtimeReminder: true,
    shiftPublishedNotify: true,
    shiftChangedNotify: true,
    pushEnabled: false,
  });

  const getIdToken = useCallback(async () => {
    const auth = getAuth();
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('認証が必要です');
    return currentUser.getIdToken();
  }, []);

  // 設定読み込み
  useEffect(() => {
    async function loadSettings() {
      if (!user) return;
      try {
        const idToken = await getIdToken();
        const response = await fetch('/api/notifications/preferences', {
          headers: { Authorization: `Bearer ${idToken}` },
        });

        if (!response.ok) throw new Error('設定の取得に失敗しました');

        const data = await response.json();

        if (data.preferences) {
          setPreferences({
            categories: data.preferences.categories || {},
            lineWorksEnabled: data.preferences.lineWorksEnabled || false,
            digestHour: data.preferences.digestHour ?? 9,
          });
        }

        if (data.reminderSettings) {
          setReminderSettings({
            clockInReminder: data.reminderSettings.clockInReminder ?? true,
            clockInReminderMinutes: data.reminderSettings.clockInReminderMinutes ?? 15,
            clockOutReminder: data.reminderSettings.clockOutReminder ?? true,
            clockOutReminderMinutes: data.reminderSettings.clockOutReminderMinutes ?? 30,
            overtimeReminder: data.reminderSettings.overtimeReminder ?? true,
            shiftPublishedNotify: data.reminderSettings.shiftPublishedNotify ?? true,
            shiftChangedNotify: data.reminderSettings.shiftChangedNotify ?? true,
            pushEnabled: data.reminderSettings.pushEnabled ?? false,
          });
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
        setError('設定の読み込みに失敗しました');
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, [user, getIdToken]);

  // カテゴリ設定の取得
  const getCategoryPref = (key: NotificationCategoryKey): CategoryPreference => {
    return preferences.categories[key] || DEFAULT_CATEGORY_PREFERENCE;
  };

  // カテゴリモード変更
  const setCategoryMode = (key: NotificationCategoryKey, mode: NotifyMode) => {
    setSaved(false);
    setPreferences(prev => ({
      ...prev,
      categories: {
        ...prev.categories,
        [key]: { ...getCategoryPref(key), mode },
      },
    }));
  };

  // カテゴリチャネル変更
  const setCategoryChannel = (key: NotificationCategoryKey, channel: NotifyChannel) => {
    setSaved(false);
    setPreferences(prev => ({
      ...prev,
      categories: {
        ...prev.categories,
        [key]: { ...getCategoryPref(key), channel },
      },
    }));
  };

  // リマインダートグル
  const toggleReminder = (key: keyof ReminderSettingsData) => {
    setSaved(false);
    setReminderSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // 保存
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const idToken = await getIdToken();
      const response = await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          categories: preferences.categories,
          lineWorksEnabled: preferences.lineWorksEnabled,
          digestHour: preferences.digestHour,
          reminderSettings,
        }),
      });

      if (!response.ok) throw new Error('設定の保存に失敗しました');

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save settings:', err);
      setError('設定の保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;

  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-50">
        <Header />

        <main className="max-w-2xl mx-auto px-4 py-6">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-zinc-900">通知設定</h1>
            <p className="text-sm text-zinc-500 mt-1">
              通知カテゴリごとの配信方法・チャネルを管理します
            </p>
          </div>

          <div className="space-y-4">
            {/* 全体設定 */}
            <Card>
              <div className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-zinc-100 rounded-xl">
                    <Bell className="w-5 h-5 text-zinc-700" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-zinc-900">全体設定</h2>
                    <p className="text-sm text-zinc-500">通知の基本設定</p>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* LINE WORKS */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-zinc-700">LINE WORKS通知</p>
                      <p className="text-xs text-zinc-500">LINE WORKSでも通知を受信</p>
                    </div>
                    <button
                      onClick={() => {
                        setSaved(false);
                        setPreferences(prev => ({ ...prev, lineWorksEnabled: !prev.lineWorksEnabled }));
                      }}
                      className={`relative w-12 h-7 rounded-full transition-colors ${
                        preferences.lineWorksEnabled ? 'bg-zinc-900' : 'bg-zinc-200'
                      }`}
                    >
                      <span
                        className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                          preferences.lineWorksEnabled ? 'left-6' : 'left-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* ダイジェスト時刻 */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-zinc-700">ダイジェスト配信時刻</p>
                      <p className="text-xs text-zinc-500">まとめ通知の送信時刻</p>
                    </div>
                    <select
                      value={preferences.digestHour}
                      onChange={(e) => {
                        setSaved(false);
                        setPreferences(prev => ({ ...prev, digestHour: Number(e.target.value) }));
                      }}
                      className="h-10 px-3 border border-zinc-200 rounded-xl text-sm"
                    >
                      {[7, 8, 9, 10, 17, 18, 19, 20].map(h => (
                        <option key={h} value={h}>{h}:00</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </Card>

            {/* プッシュ通知 */}
            <PushNotificationManager />

            {/* 打刻リマインダー（詳細設定） */}
            <Card>
              <div className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-blue-50 rounded-xl">
                    <Clock className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-zinc-900">打刻リマインダー</h2>
                    <p className="text-sm text-zinc-500">出勤・退勤の細かい通知設定</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-zinc-700">出勤前リマインダー</p>
                      <p className="text-xs text-zinc-500">シフト開始前に通知</p>
                    </div>
                    <button
                      onClick={() => toggleReminder('clockInReminder')}
                      className={`relative w-12 h-7 rounded-full transition-colors ${
                        reminderSettings.clockInReminder ? 'bg-zinc-900' : 'bg-zinc-200'
                      }`}
                    >
                      <span
                        className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                          reminderSettings.clockInReminder ? 'left-6' : 'left-1'
                        }`}
                      />
                    </button>
                  </div>

                  {reminderSettings.clockInReminder && (
                    <div className="ml-4 flex items-center gap-2">
                      <select
                        value={reminderSettings.clockInReminderMinutes}
                        onChange={(e) => {
                          setSaved(false);
                          setReminderSettings(prev => ({
                            ...prev,
                            clockInReminderMinutes: Number(e.target.value),
                          }));
                        }}
                        className="h-10 px-3 border border-zinc-200 rounded-xl text-sm"
                      >
                        <option value={5}>5分前</option>
                        <option value={10}>10分前</option>
                        <option value={15}>15分前</option>
                        <option value={30}>30分前</option>
                        <option value={60}>1時間前</option>
                      </select>
                      <span className="text-sm text-zinc-500">に通知</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-zinc-700">退勤確認リマインダー</p>
                      <p className="text-xs text-zinc-500">シフト終了後に通知</p>
                    </div>
                    <button
                      onClick={() => toggleReminder('clockOutReminder')}
                      className={`relative w-12 h-7 rounded-full transition-colors ${
                        reminderSettings.clockOutReminder ? 'bg-zinc-900' : 'bg-zinc-200'
                      }`}
                    >
                      <span
                        className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                          reminderSettings.clockOutReminder ? 'left-6' : 'left-1'
                        }`}
                      />
                    </button>
                  </div>

                  {reminderSettings.clockOutReminder && (
                    <div className="ml-4 flex items-center gap-2">
                      <select
                        value={reminderSettings.clockOutReminderMinutes}
                        onChange={(e) => {
                          setSaved(false);
                          setReminderSettings(prev => ({
                            ...prev,
                            clockOutReminderMinutes: Number(e.target.value),
                          }));
                        }}
                        className="h-10 px-3 border border-zinc-200 rounded-xl text-sm"
                      >
                        <option value={15}>15分後</option>
                        <option value={30}>30分後</option>
                        <option value={60}>1時間後</option>
                      </select>
                      <span className="text-sm text-zinc-500">に通知</span>
                    </div>
                  )}
                </div>
              </div>
            </Card>

            {/* カテゴリ別通知設定 */}
            {NOTIFICATION_CATEGORIES.map(category => {
              const IconComponent = ICON_MAP[category.icon] || Bell;
              const pref = getCategoryPref(category.key);
              const colorClasses = getCategoryColor(category.color);

              return (
                <Card key={category.key}>
                  <div className="p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`p-2 rounded-xl ${colorClasses.bg}`}>
                        <IconComponent className={`w-5 h-5 ${colorClasses.text}`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h2 className="font-semibold text-zinc-900">{category.label}</h2>
                          {!category.canDisable && (
                            <span className="text-xs px-2 py-0.5 bg-red-100 text-red-600 rounded-full">
                              必須
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-zinc-500">{category.description}</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {/* 通知モード */}
                      <div>
                        <label className="block text-xs font-medium text-zinc-500 mb-1.5">
                          通知頻度
                        </label>
                        <div className="flex gap-2">
                          {MODE_OPTIONS.map(option => {
                            const isDisabled = option.value === 'off' && !category.canDisable;
                            const isSelected = pref.mode === option.value;

                            return (
                              <button
                                key={option.value}
                                onClick={() => !isDisabled && setCategoryMode(category.key, option.value)}
                                disabled={isDisabled}
                                className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                                  isSelected
                                    ? 'bg-zinc-900 text-white border-zinc-900'
                                    : isDisabled
                                      ? 'bg-zinc-50 text-zinc-300 border-zinc-100 cursor-not-allowed'
                                      : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400'
                                }`}
                                title={option.description}
                              >
                                {option.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* チャネル選択（offでない場合のみ） */}
                      {pref.mode !== 'off' && preferences.lineWorksEnabled && (
                        <div>
                          <label className="block text-xs font-medium text-zinc-500 mb-1.5">
                            配信先
                          </label>
                          <select
                            value={pref.channel}
                            onChange={(e) => setCategoryChannel(category.key, e.target.value as NotifyChannel)}
                            className="w-full h-10 px-3 border border-zinc-200 rounded-lg text-sm"
                          >
                            {CHANNEL_OPTIONS.map(option => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}

            {/* エラー表示 */}
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            {/* 保存ボタン */}
            <div className="pt-2 pb-4">
              <Button onClick={handleSave} loading={saving} className="w-full">
                {saved ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    保存しました
                  </>
                ) : (
                  '設定を保存'
                )}
              </Button>
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}

// カテゴリカラーのTailwindクラスを返す
function getCategoryColor(color: string): { bg: string; text: string } {
  const colorMap: Record<string, { bg: string; text: string }> = {
    blue: { bg: 'bg-blue-50', text: 'text-blue-600' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-600' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-600' },
    green: { bg: 'bg-green-50', text: 'text-green-600' },
    orange: { bg: 'bg-orange-50', text: 'text-orange-600' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
    indigo: { bg: 'bg-indigo-50', text: 'text-indigo-600' },
    teal: { bg: 'bg-teal-50', text: 'text-teal-600' },
    rose: { bg: 'bg-rose-50', text: 'text-rose-600' },
    red: { bg: 'bg-red-50', text: 'text-red-600' },
  };
  return colorMap[color] || { bg: 'bg-zinc-50', text: 'text-zinc-600' };
}
