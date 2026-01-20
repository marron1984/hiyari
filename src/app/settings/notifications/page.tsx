'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, Button } from '@/components/ui';
import { Loading } from '@/components/Loading';
import {
  getOrCreateReminderSettings,
  updateReminderSettings,
} from '@/lib/notifications';
import { ReminderSettings } from '@/types/notification';
import { Bell, Clock, FileText, Calendar, Check } from 'lucide-react';

export default function NotificationSettingsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [settings, setSettings] = useState<ReminderSettings | null>(null);

  useEffect(() => {
    async function loadSettings() {
      if (!user) return;
      try {
        const data = await getOrCreateReminderSettings(user.tenantId, user.id);
        setSettings(data);
      } catch (err) {
        console.error('Failed to load settings:', err);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, [user]);

  const handleToggle = (key: keyof ReminderSettings) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: !settings[key] });
    setSaved(false);
  };

  const handleNumberChange = (key: keyof ReminderSettings, value: number) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
    setSaved(false);
  };

  const handleSave = async () => {
    if (!user || !settings) return;
    setSaving(true);
    try {
      await updateReminderSettings(user.tenantId, user.id, {
        clockInReminder: settings.clockInReminder,
        clockInReminderMinutes: settings.clockInReminderMinutes,
        clockOutReminder: settings.clockOutReminder,
        clockOutReminderMinutes: settings.clockOutReminderMinutes,
        overtimeReminder: settings.overtimeReminder,
        shiftPublishedNotify: settings.shiftPublishedNotify,
        shiftChangedNotify: settings.shiftChangedNotify,
        pushEnabled: settings.pushEnabled,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Loading />;
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-50">
        <Header />

        <main className="max-w-2xl mx-auto px-4 py-6">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-zinc-900">通知設定</h1>
            <p className="text-sm text-zinc-500 mt-1">
              リマインダーや通知の受信設定を管理します
            </p>
          </div>

          {settings && (
            <div className="space-y-4">
              {/* 打刻リマインダー */}
              <Card>
                <div className="p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-blue-50 rounded-xl">
                      <Clock className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-zinc-900">打刻リマインダー</h2>
                      <p className="text-sm text-zinc-500">出勤・退勤時間を通知</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {/* 出勤リマインダー */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-zinc-700">出勤前リマインダー</p>
                        <p className="text-xs text-zinc-500">シフト開始前に通知</p>
                      </div>
                      <button
                        onClick={() => handleToggle('clockInReminder')}
                        className={`relative w-12 h-7 rounded-full transition-colors ${
                          settings.clockInReminder ? 'bg-zinc-900' : 'bg-zinc-200'
                        }`}
                      >
                        <span
                          className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                            settings.clockInReminder ? 'left-6' : 'left-1'
                          }`}
                        />
                      </button>
                    </div>

                    {settings.clockInReminder && (
                      <div className="ml-4 flex items-center gap-2">
                        <select
                          value={settings.clockInReminderMinutes}
                          onChange={(e) => handleNumberChange('clockInReminderMinutes', Number(e.target.value))}
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

                    {/* 退勤リマインダー */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-zinc-700">退勤確認リマインダー</p>
                        <p className="text-xs text-zinc-500">シフト終了後に通知</p>
                      </div>
                      <button
                        onClick={() => handleToggle('clockOutReminder')}
                        className={`relative w-12 h-7 rounded-full transition-colors ${
                          settings.clockOutReminder ? 'bg-zinc-900' : 'bg-zinc-200'
                        }`}
                      >
                        <span
                          className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                            settings.clockOutReminder ? 'left-6' : 'left-1'
                          }`}
                        />
                      </button>
                    </div>

                    {settings.clockOutReminder && (
                      <div className="ml-4 flex items-center gap-2">
                        <select
                          value={settings.clockOutReminderMinutes}
                          onChange={(e) => handleNumberChange('clockOutReminderMinutes', Number(e.target.value))}
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

              {/* 残業申請 */}
              <Card>
                <div className="p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-amber-50 rounded-xl">
                      <FileText className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-zinc-900">残業申請</h2>
                      <p className="text-sm text-zinc-500">承認・却下を通知</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-zinc-700">残業申請の結果通知</p>
                      <p className="text-xs text-zinc-500">申請が承認/却下された時</p>
                    </div>
                    <button
                      onClick={() => handleToggle('overtimeReminder')}
                      className={`relative w-12 h-7 rounded-full transition-colors ${
                        settings.overtimeReminder ? 'bg-zinc-900' : 'bg-zinc-200'
                      }`}
                    >
                      <span
                        className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                          settings.overtimeReminder ? 'left-6' : 'left-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </Card>

              {/* シフト通知 */}
              <Card>
                <div className="p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-purple-50 rounded-xl">
                      <Calendar className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-zinc-900">シフト通知</h2>
                      <p className="text-sm text-zinc-500">シフトの公開・変更を通知</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-zinc-700">シフト公開通知</p>
                        <p className="text-xs text-zinc-500">新しいシフトが公開された時</p>
                      </div>
                      <button
                        onClick={() => handleToggle('shiftPublishedNotify')}
                        className={`relative w-12 h-7 rounded-full transition-colors ${
                          settings.shiftPublishedNotify ? 'bg-zinc-900' : 'bg-zinc-200'
                        }`}
                      >
                        <span
                          className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                            settings.shiftPublishedNotify ? 'left-6' : 'left-1'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-zinc-700">シフト変更通知</p>
                        <p className="text-xs text-zinc-500">シフトが変更された時</p>
                      </div>
                      <button
                        onClick={() => handleToggle('shiftChangedNotify')}
                        className={`relative w-12 h-7 rounded-full transition-colors ${
                          settings.shiftChangedNotify ? 'bg-zinc-900' : 'bg-zinc-200'
                        }`}
                      >
                        <span
                          className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                            settings.shiftChangedNotify ? 'left-6' : 'left-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              </Card>

              {/* 保存ボタン */}
              <div className="pt-2">
                <Button
                  onClick={handleSave}
                  loading={saving}
                  className="w-full"
                >
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
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
