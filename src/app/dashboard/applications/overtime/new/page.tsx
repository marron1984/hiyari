'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardContent, Button, Input, Select } from '@/components/ui';
import { ArrowLeft, Save, Send, AlertCircle, Clock } from 'lucide-react';
import {
  OvertimeFormData,
  OVERTIME_REASONS,
  validateOvertime,
  calculateOvertimeHours,
  ApplicationValidationError,
} from '@/types/application';

export default function NewOvertimeApplicationPage() {
  return (
    <AuthGuard>
      <NewOvertimeApplicationContent />
    </AuthGuard>
  );
}

function NewOvertimeApplicationContent() {
  const router = useRouter();
  const { user, firebaseUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<ApplicationValidationError[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  const [formData, setFormData] = useState<OvertimeFormData>({
    date: new Date().toISOString().split('T')[0],
    startTime: '18:00',
    endTime: '19:00',
    reason: '',
    reasonDetail: '',
    workContent: '',
    isHoliday: false,
    isNightShift: false,
  });

  const calculatedHours = useMemo(() => {
    return calculateOvertimeHours(formData.startTime, formData.endTime);
  }, [formData.startTime, formData.endTime]);

  const updateField = <K extends keyof OvertimeFormData>(field: K, value: OvertimeFormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => prev.filter((e) => e.field !== field));
  };

  const validate = useCallback(() => {
    const result = validateOvertime(formData);
    setErrors(result.errors);
    setWarnings(result.warnings);
    return result.isValid;
  }, [formData]);

  const handleSaveDraft = async () => {
    if (!firebaseUser) return;

    setLoading(true);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'OVERTIME',
          data: formData,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || '保存に失敗しました');
      }

      router.push('/dashboard/applications');
    } catch (error) {
      console.error('Failed to save draft:', error);
      alert(error instanceof Error ? error.message : '保存に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!firebaseUser) return;

    if (!validate()) {
      return;
    }

    setLoading(true);
    try {
      const token = await firebaseUser.getIdToken();

      // 1. Create application
      const createRes = await fetch('/api/applications', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'OVERTIME',
          data: formData,
        }),
      });

      const createResult = await createRes.json();
      if (!createRes.ok) {
        throw new Error(createResult.error || '作成に失敗しました');
      }

      // 2. Submit application
      const submitRes = await fetch(`/api/applications/${createResult.id}/submit`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const submitResult = await submitRes.json();
      if (!submitRes.ok) {
        throw new Error(submitResult.error || '申請に失敗しました');
      }

      router.push('/dashboard/applications');
    } catch (error) {
      console.error('Failed to submit:', error);
      alert(error instanceof Error ? error.message : '申請に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const getFieldError = (field: string): string | undefined => {
    return errors.find((e) => e.field === field)?.message;
  };

  return (
    <div className="min-h-screen bg-zinc-50">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-6 safe-bottom">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/dashboard/applications">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-zinc-900">残業申請</h1>
            <p className="text-sm text-zinc-500">新規作成</p>
          </div>
        </div>

        {/* Form */}
        <Card className="mb-6">
          <CardContent className="p-6 space-y-5">
            {/* 日付 */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                日付 <span className="text-red-500">*</span>
              </label>
              <Input
                type="date"
                value={formData.date}
                onChange={(e) => updateField('date', e.target.value)}
              />
              {getFieldError('date') && (
                <p className="text-red-500 text-sm mt-1">{getFieldError('date')}</p>
              )}
            </div>

            {/* 時間 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                  開始時間 <span className="text-red-500">*</span>
                </label>
                <Input
                  type="time"
                  value={formData.startTime}
                  onChange={(e) => updateField('startTime', e.target.value)}
                />
                {getFieldError('startTime') && (
                  <p className="text-red-500 text-sm mt-1">{getFieldError('startTime')}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                  終了時間 <span className="text-red-500">*</span>
                </label>
                <Input
                  type="time"
                  value={formData.endTime}
                  onChange={(e) => updateField('endTime', e.target.value)}
                />
                {getFieldError('endTime') && (
                  <p className="text-red-500 text-sm mt-1">{getFieldError('endTime')}</p>
                )}
              </div>
            </div>

            {/* 計算時間表示 */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-blue-700">
                <Clock className="w-5 h-5" />
                <span className="font-medium">残業時間: {calculatedHours}時間</span>
              </div>
            </div>

            {/* 残業区分 */}
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isHoliday}
                  onChange={(e) => updateField('isHoliday', e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm">休日出勤</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isNightShift}
                  onChange={(e) => updateField('isNightShift', e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm">深夜帯（22:00〜5:00）</span>
              </label>
            </div>

            {/* 理由 */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                残業理由 <span className="text-red-500">*</span>
              </label>
              <Select
                value={formData.reason}
                onChange={(e) =>
                  updateField('reason', e.target.value as OvertimeFormData['reason'])
                }
                options={[
                  { value: '', label: '選択してください' },
                  ...OVERTIME_REASONS.map((r) => ({ value: r, label: r })),
                ]}
              />
              {getFieldError('reason') && (
                <p className="text-red-500 text-sm mt-1">{getFieldError('reason')}</p>
              )}
            </div>

            {/* 詳細理由（その他の場合必須） */}
            {formData.reason === 'その他' && (
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                  詳細理由 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={formData.reasonDetail || ''}
                  onChange={(e) => updateField('reasonDetail', e.target.value)}
                  placeholder="具体的な理由を記載してください"
                  rows={2}
                  className="w-full px-4 py-3 rounded-xl border border-zinc-200 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {getFieldError('reasonDetail') && (
                  <p className="text-red-500 text-sm mt-1">{getFieldError('reasonDetail')}</p>
                )}
              </div>
            )}

            {/* 作業内容 */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">作業内容</label>
              <textarea
                value={formData.workContent || ''}
                onChange={(e) => updateField('workContent', e.target.value)}
                placeholder="残業中に行った業務内容"
                rows={3}
                className="w-full px-4 py-3 rounded-xl border border-zinc-200 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Warnings */}
            {warnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-center gap-2 text-amber-700 mb-2">
                  <AlertCircle className="w-5 h-5" />
                  <span className="font-medium">注意事項</span>
                </div>
                <ul className="ml-7 text-amber-600 text-sm space-y-1">
                  {warnings.map((warn, idx) => (
                    <li key={idx}>{warn}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button variant="secondary" onClick={handleSaveDraft} disabled={loading} className="flex-1">
            <Save className="w-4 h-4 mr-1" />
            下書き保存
          </Button>
          <Button onClick={handleSubmit} disabled={loading} className="flex-1">
            <Send className="w-4 h-4 mr-1" />
            申請する
          </Button>
        </div>
      </div>
    </div>
  );
}
