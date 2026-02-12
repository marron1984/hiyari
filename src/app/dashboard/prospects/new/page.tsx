'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardHeader, CardTitle, CardContent, Button, Input, Select } from '@/components/ui';
import { canEditProspects } from '@/lib/auth';
import { CARE_LEVELS } from '@/types/prospect';
import type { Gender, CareLevel } from '@/types/prospect';
import { ArrowLeft, Save, Users } from 'lucide-react';

const GENDER_OPTIONS: { value: Gender | ''; label: string }[] = [
  { value: '', label: '選択してください' },
  { value: '男性', label: '男性' },
  { value: '女性', label: '女性' },
  { value: '不明', label: '不明' },
];

const CARE_LEVEL_OPTIONS = [
  { value: '', label: '選択してください' },
  ...CARE_LEVELS.map((c) => ({ value: c, label: c })),
];

export default function NewProspectPage() {
  const router = useRouter();
  const { user, firebaseUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    customerName: '',
    age: '',
    gender: '' as Gender | '',
    careLevel: '' as CareLevel | '',
    disabilityCategory: '',
    budget: '',
    adlSummary: '',
    debtStatus: '',
    currentSituation: '',
    currentAddress: '',
    desiredFacility: '',
    desiredMoveInDate: '',
    tourRequestDate: '',
    interviewDateTime: '',
    keyPerson: '',
    salesCompanyName: '',
    salesRepName: '',
    salesRepContact: '',
    inquiryDate: '',
    otherNotes: '',
  });

  const canManage = canEditProspects(user?.role, user?.modulePermissions);

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!firebaseUser || !user || saving) return;

    if (!form.customerName.trim()) {
      setError('顧客名は必須です');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/prospects', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...form,
          age: form.age ? parseInt(form.age, 10) : undefined,
          gender: form.gender || undefined,
          careLevel: form.careLevel || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || '登録に失敗しました');
        return;
      }

      router.push(`/dashboard/prospects/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '登録に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) {
    return (
      <main className="pb-20 md:pb-8">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <p className="text-gray-500">入居希望者の登録権限がありません</p>
        </div>
      </main>
    );
  }

  return (
    <main className="pb-20 md:pb-8">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <Link href="/dashboard/prospects" className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" />
          一覧に戻る
        </Link>

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6" />
            入居希望者 新規登録
          </h1>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <div className="space-y-6">
          {/* 顧客情報 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">顧客情報</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  顧客名 <span className="text-red-500">*</span>
                </label>
                <Input
                  value={form.customerName}
                  onChange={(e) => handleChange('customerName', e.target.value)}
                  placeholder="山田 太郎"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">年齢</label>
                  <Input
                    type="number"
                    value={form.age}
                    onChange={(e) => handleChange('age', e.target.value)}
                    placeholder="80"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">性別</label>
                  <Select
                    value={form.gender}
                    onChange={(e) => handleChange('gender', e.target.value)}
                    options={GENDER_OPTIONS}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">介護度</label>
                  <Select
                    value={form.careLevel}
                    onChange={(e) => handleChange('careLevel', e.target.value)}
                    options={CARE_LEVEL_OPTIONS}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">障害区分</label>
                  <Input
                    value={form.disabilityCategory}
                    onChange={(e) => handleChange('disabilityCategory', e.target.value)}
                    placeholder=""
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">キーパーソン</label>
                <Input
                  value={form.keyPerson}
                  onChange={(e) => handleChange('keyPerson', e.target.value)}
                  placeholder="長男"
                />
              </div>
            </CardContent>
          </Card>

          {/* 入居希望 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">入居希望</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">希望施設</label>
                <Input
                  value={form.desiredFacility}
                  onChange={(e) => handleChange('desiredFacility', e.target.value)}
                  placeholder="施設名"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">入居予定日</label>
                  <Input
                    value={form.desiredMoveInDate}
                    onChange={(e) => handleChange('desiredMoveInDate', e.target.value)}
                    placeholder="2026-03-01"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">見学希望日</label>
                  <Input
                    value={form.tourRequestDate}
                    onChange={(e) => handleChange('tourRequestDate', e.target.value)}
                    placeholder="2026-02-15"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">面談日時</label>
                <Input
                  value={form.interviewDateTime}
                  onChange={(e) => handleChange('interviewDateTime', e.target.value)}
                  placeholder="2026-02-20 14:00"
                />
              </div>
            </CardContent>
          </Card>

          {/* 費用・状況 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">費用・現在状況</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">費用（希望）</label>
                  <Input
                    value={form.budget}
                    onChange={(e) => handleChange('budget', e.target.value)}
                    placeholder="15万円以内"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">借金有無</label>
                  <Input
                    value={form.debtStatus}
                    onChange={(e) => handleChange('debtStatus', e.target.value)}
                    placeholder="なし"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ADL状況</label>
                <Input
                  value={form.adlSummary}
                  onChange={(e) => handleChange('adlSummary', e.target.value)}
                  placeholder="自立歩行可能"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">現在状況</label>
                <Input
                  value={form.currentSituation}
                  onChange={(e) => handleChange('currentSituation', e.target.value)}
                  placeholder="在宅"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">現住所・入院先</label>
                <Input
                  value={form.currentAddress}
                  onChange={(e) => handleChange('currentAddress', e.target.value)}
                  placeholder=""
                />
              </div>
            </CardContent>
          </Card>

          {/* 営業会社 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">営業会社</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">営業会社名</label>
                <Input
                  value={form.salesCompanyName}
                  onChange={(e) => handleChange('salesCompanyName', e.target.value)}
                  placeholder=""
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">営業担当者名</label>
                  <Input
                    value={form.salesRepName}
                    onChange={(e) => handleChange('salesRepName', e.target.value)}
                    placeholder=""
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">連絡先</label>
                  <Input
                    value={form.salesRepContact}
                    onChange={(e) => handleChange('salesRepContact', e.target.value)}
                    placeholder="090-xxxx-xxxx"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">問い合わせ日</label>
                <Input
                  value={form.inquiryDate}
                  onChange={(e) => handleChange('inquiryDate', e.target.value)}
                  placeholder="2026-02-12"
                />
              </div>
            </CardContent>
          </Card>

          {/* 備考 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">その他備考</CardTitle>
            </CardHeader>
            <CardContent>
              <textarea
                value={form.otherNotes}
                onChange={(e) => handleChange('otherNotes', e.target.value)}
                rows={4}
                className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="自由記入"
              />
            </CardContent>
          </Card>

          {/* 送信ボタン */}
          <div className="flex justify-end gap-3">
            <Link href="/dashboard/prospects">
              <Button variant="secondary">キャンセル</Button>
            </Link>
            <Button onClick={handleSubmit} disabled={saving}>
              <Save className="w-4 h-4 mr-1" />
              {saving ? '登録中...' : '登録する'}
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
