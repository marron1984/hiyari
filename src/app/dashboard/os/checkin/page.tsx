'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardHeader, CardTitle, CardContent, Button, Textarea } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { PreviewBadge } from '@/components/PreviewBadge';
import { saveCheckin, getCheckin, getCheckinHistory } from '@/lib/chaos';
import {
  CheckinFormData,
  StaffCheckin,
  CHECKIN_LABELS,
  CHECKIN_SCALE_LABELS,
  SUPPORT_PURPOSE_TEXT,
  METER_LABELS,
  METER_COLORS,
  getMeterColor,
  MeterColor,
} from '@/types/chaos';
import {
  ArrowLeft,
  Heart,
  CheckCircle,
  Calendar,
  TrendingUp,
  Shield,
} from 'lucide-react';

export default function OSCheckinPage() {
  return (
    <AuthGuard>
      <OSCheckinContent />
    </AuthGuard>
  );
}

function OSCheckinContent() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [todayCheckin, setTodayCheckin] = useState<StaffCheckin | null>(null);
  const [history, setHistory] = useState<StaffCheckin[]>([]);

  const today = new Date().toISOString().split('T')[0];

  const [formData, setFormData] = useState<CheckinFormData>({
    physicalFatigue: 0,
    mentalFatigue: 0,
    sleep: 2,
    anxiety: 0,
    decisionLoad: 0,
    consulted: 2,
    note: '',
  });

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;

      try {
        const [checkinData, historyData] = await Promise.all([
          getCheckin(user.id, today),
          getCheckinHistory(user.id, 7),
        ]);

        if (checkinData) {
          setTodayCheckin(checkinData);
          setFormData({
            physicalFatigue: checkinData.physicalFatigue,
            mentalFatigue: checkinData.mentalFatigue,
            sleep: checkinData.sleep,
            anxiety: checkinData.anxiety,
            decisionLoad: checkinData.decisionLoad,
            consulted: checkinData.consulted,
            note: checkinData.note || '',
          });
        }

        setHistory(historyData);
      } catch (error) {
        console.error('Failed to fetch checkin data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, today]);

  const handleSubmit = async () => {
    if (!user) return;

    setSaving(true);
    try {
      await saveCheckin(user.id, user.name, today, formData);
      setSaved(true);

      // 履歴を再取得
      const historyData = await getCheckinHistory(user.id, 7);
      setHistory(historyData);

      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('Failed to save checkin:', error);
      alert('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleScaleChange = (field: keyof CheckinFormData, value: number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
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
      <PreviewBadge />
      <main className="pb-8">
        <div className="max-w-lg mx-auto px-4 py-6">
          {/* ヘッダー */}
          <div className="flex items-center mb-6">
            <Link href="/dashboard/os" className="p-2 -ml-2 rounded-lg hover:bg-gray-100">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <div className="ml-2">
              <h1 className="text-xl font-bold text-gray-900 flex items-center">
                <Heart className="w-5 h-5 mr-2 text-red-500" />
                今日のチェックイン
              </h1>
              <p className="text-sm text-gray-500">{today}</p>
            </div>
          </div>

          {/* 支援目的の注意文 */}
          <Card className="mb-4 bg-blue-50 border-blue-200">
            <CardContent className="p-3 flex items-start gap-2">
              <Shield className="w-4 h-4 text-blue-600 mt-0.5" />
              <p className="text-xs text-blue-700">
                これは支援のための指標です。評価や査定のためではありません。
                1on1は安全装置です。
              </p>
            </CardContent>
          </Card>

          {/* 完了メッセージ */}
          {saved && (
            <Card className="mb-4 bg-green-50 border-green-200">
              <CardContent className="p-4 flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <p className="text-green-800">チェックインを記録しました</p>
              </CardContent>
            </Card>
          )}

          {/* チェックインフォーム */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base">今の状態を教えてください</CardTitle>
              <p className="text-xs text-gray-500 mt-1">{SUPPORT_PURPOSE_TEXT}</p>
            </CardHeader>
            <CardContent className="space-y-6">
              {(Object.keys(CHECKIN_LABELS) as (keyof typeof CHECKIN_LABELS)[]).map((field) => (
                <div key={field}>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {CHECKIN_LABELS[field]}
                  </label>
                  <div className="flex gap-2">
                    {[0, 1, 2, 3, 4].map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => handleScaleChange(field, value)}
                        className={`flex-1 py-2 px-1 text-xs rounded-lg border transition-colors ${
                          formData[field] === value
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                        }`}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 mt-1 px-1">
                    <span>{CHECKIN_SCALE_LABELS[0]}</span>
                    <span>{CHECKIN_SCALE_LABELS[4]}</span>
                  </div>
                </div>
              ))}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  メモ（任意）
                </label>
                <Textarea
                  value={formData.note}
                  onChange={(e) => setFormData((prev) => ({ ...prev, note: e.target.value }))}
                  placeholder="今日の気づきや気になることがあれば..."
                  rows={3}
                />
              </div>

              <Button
                onClick={handleSubmit}
                loading={saving}
                className="w-full"
              >
                {todayCheckin ? '更新する' : 'チェックインする'}
              </Button>
            </CardContent>
          </Card>

          {/* 直近の履歴 */}
          {history.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center">
                  <Calendar className="w-4 h-4 mr-2" />
                  直近7日間
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* 7日間の色推移（数値は表示しない） */}
                <div className="flex gap-1 mb-4">
                  {history.slice(0, 7).map((checkin) => {
                    const avgScore = Math.round(
                      ((checkin.physicalFatigue + checkin.mentalFatigue + checkin.anxiety +
                        checkin.decisionLoad + (4 - checkin.sleep) + (4 - checkin.consulted)) / 6) * 25
                    );
                    const color = getMeterColor(avgScore);
                    return (
                      <div
                        key={checkin.id}
                        className={`w-8 h-8 rounded-full ${METER_COLORS[color].bg} ${METER_COLORS[color].border} border-2`}
                        title={`${checkin.date}: ${METER_LABELS[color]}`}
                      />
                    );
                  })}
                </div>
                <div className="space-y-2">
                  {history.map((checkin) => {
                    const avgScore = Math.round(
                      ((checkin.physicalFatigue + checkin.mentalFatigue + checkin.anxiety +
                        checkin.decisionLoad + (4 - checkin.sleep) + (4 - checkin.consulted)) / 6) * 25
                    );
                    const color = getMeterColor(avgScore);
                    return (
                      <div
                        key={checkin.id}
                        className={`flex items-center justify-between p-3 rounded-lg ${METER_COLORS[color].bg}`}
                      >
                        <span className="text-sm font-medium">{checkin.date}</span>
                        <span className={`text-sm font-medium ${METER_COLORS[color].text}`}>
                          {METER_LABELS[color]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </>
  );
}
