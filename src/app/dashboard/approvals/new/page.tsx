'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Card, CardContent, Button, Input, Select, Badge } from '@/components/ui';
import {
  ArrowLeft,
  ArrowRight,
  Save,
  Send,
  Check,
  AlertCircle,
  FileText,
  Upload,
  X,
  Paperclip,
} from 'lucide-react';
import { createRingi, submitRingi } from '@/lib/ringi';
import {
  RingiFormData,
  RingiCategory,
  RingiUrgency,
  PaymentMethod,
  RingiAttachment,
  RINGI_CATEGORIES,
  REQUIRED_ATTACHMENTS_BY_CATEGORY,
  validateStep1,
  validateStep2,
  validateStep3,
  validateStep4,
  validateAllSteps,
  ValidationError,
} from '@/types/ringi';

const STEPS = [
  { id: 1, title: '概要', description: '件名・カテゴリ・緊急度' },
  { id: 2, title: '内容', description: '背景・目的・効果' },
  { id: 3, title: '金額', description: '金額・支払情報' },
  { id: 4, title: '添付', description: '見積書・契約書等' },
  { id: 5, title: '確認', description: '送信前プレビュー' },
];

export default function NewApprovalPage() {
  return (
    <AuthGuard>
      <NewApprovalContent />
    </AuthGuard>
  );
}

function NewApprovalContent() {
  const router = useRouter();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<ValidationError[]>([]);

  const [formData, setFormData] = useState<RingiFormData>({
    title: '',
    category: '備品購入',
    urgency: '通常',
    background: '',
    purpose: '',
    expectedEffect: '',
    risk: '',
    amount: undefined,
    payeeName: '',
    paymentMethod: '振込',
    attachments: [],
  });

  const updateField = <K extends keyof RingiFormData>(field: K, value: RingiFormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // エラーをクリア
    setErrors((prev) => prev.filter((e) => e.field !== field));
  };

  const validateCurrentStep = useCallback(() => {
    let result;
    switch (currentStep) {
      case 1:
        result = validateStep1(formData);
        break;
      case 2:
        result = validateStep2(formData);
        break;
      case 3:
        result = validateStep3(formData);
        break;
      case 4:
        result = validateStep4(formData);
        break;
      default:
        result = { isValid: true, errors: [], warnings: [] };
    }
    setErrors(result.errors);
    return result.isValid;
  }, [currentStep, formData]);

  const handleNext = () => {
    if (validateCurrentStep()) {
      setCurrentStep((prev) => Math.min(prev + 1, 5));
    }
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSaveDraft = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await createRingi(
        {
          ...formData,
          description: `【背景】${formData.background}\n【目的】${formData.purpose}`,
        },
        user.id,
        user.name,
        user.branchId,
        user.tenantId
      );
      router.push('/ringi');
    } catch (error) {
      console.error('Failed to save draft:', error);
      alert('保存に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!user) return;

    const validation = validateAllSteps(formData);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    setLoading(true);
    try {
      const ringi = await createRingi(
        {
          ...formData,
          description: `【背景】${formData.background}\n【目的】${formData.purpose}`,
        },
        user.id,
        user.name,
        user.branchId,
        user.tenantId
      );

      await submitRingi(ringi.id, user.id, user.name, user.role, user.branchId);
      router.push('/ringi');
    } catch (error) {
      console.error('Failed to submit:', error);
      alert('申請に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const getFieldError = (field: string): string | undefined => {
    return errors.find((e) => e.field === field)?.message;
  };

  const allValidation = validateAllSteps(formData);
  const requiredAttachments = REQUIRED_ATTACHMENTS_BY_CATEGORY[formData.category] || [];

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/ringi">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-zinc-900">稟議作成</h1>
            <p className="text-sm text-zinc-500">ステップ {currentStep} / 5</p>
          </div>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-between mb-8">
          {STEPS.map((step, idx) => (
            <div key={step.id} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  currentStep > step.id
                    ? 'bg-green-500 text-white'
                    : currentStep === step.id
                    ? 'bg-blue-500 text-white'
                    : 'bg-zinc-200 text-zinc-500'
                }`}
              >
                {currentStep > step.id ? <Check className="w-4 h-4" /> : step.id}
              </div>
              {idx < STEPS.length - 1 && (
                <div
                  className={`w-8 md:w-16 h-1 mx-1 ${
                    currentStep > step.id ? 'bg-green-500' : 'bg-zinc-200'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <Card className="mb-6">
          <CardContent className="p-6">
            {/* Step 1: 概要 */}
            {currentStep === 1 && (
              <div className="space-y-5">
                <h2 className="text-lg font-semibold mb-4">概要</h2>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                    件名 <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={formData.title}
                    onChange={(e) => updateField('title', e.target.value)}
                    placeholder="例: 車椅子の購入について"
                  />
                  {getFieldError('title') && (
                    <p className="text-red-500 text-sm mt-1">{getFieldError('title')}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                    カテゴリ <span className="text-red-500">*</span>
                  </label>
                  <Select
                    value={formData.category}
                    onChange={(e) => updateField('category', e.target.value as RingiCategory)}
                    options={RINGI_CATEGORIES.map((cat) => ({ value: cat, label: cat }))}
                  />
                  {requiredAttachments.length > 0 && (
                    <p className="text-sm text-amber-600 mt-1">
                      このカテゴリでは {requiredAttachments.join('、')} が必要です
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                    緊急度
                  </label>
                  <div className="flex gap-4">
                    {(['通常', '至急'] as RingiUrgency[]).map((u) => (
                      <label key={u} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="urgency"
                          checked={formData.urgency === u}
                          onChange={() => updateField('urgency', u)}
                          className="w-4 h-4"
                        />
                        <span className={u === '至急' ? 'text-red-600 font-medium' : ''}>
                          {u}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                    希望決裁日（任意）
                  </label>
                  <Input
                    type="date"
                    value={formData.desiredDecisionDate || ''}
                    onChange={(e) => updateField('desiredDecisionDate', e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Step 2: 内容 */}
            {currentStep === 2 && (
              <div className="space-y-5">
                <h2 className="text-lg font-semibold mb-4">内容（背景と目的）</h2>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                    背景（なぜ必要か） <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={formData.background}
                    onChange={(e) => updateField('background', e.target.value)}
                    placeholder="現在の問題や課題、なぜこの申請が必要なのかを記載"
                    rows={4}
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {getFieldError('background') && (
                    <p className="text-red-500 text-sm mt-1">{getFieldError('background')}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                    目的（何をするか） <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={formData.purpose}
                    onChange={(e) => updateField('purpose', e.target.value)}
                    placeholder="具体的に何を購入・実施するのかを記載"
                    rows={4}
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {getFieldError('purpose') && (
                    <p className="text-red-500 text-sm mt-1">{getFieldError('purpose')}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                    期待効果（任意）
                  </label>
                  <textarea
                    value={formData.expectedEffect || ''}
                    onChange={(e) => updateField('expectedEffect', e.target.value)}
                    placeholder="この申請が承認されるとどう良くなるか"
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                    リスク・懸念（任意）
                  </label>
                  <textarea
                    value={formData.risk || ''}
                    onChange={(e) => updateField('risk', e.target.value)}
                    placeholder="考えられるリスクや懸念点があれば記載"
                    rows={2}
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}

            {/* Step 3: 金額と支払い */}
            {currentStep === 3 && (
              <div className="space-y-5">
                <h2 className="text-lg font-semibold mb-4">金額と支払い</h2>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                    金額 <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
                      ¥
                    </span>
                    <Input
                      type="number"
                      value={formData.amount || ''}
                      onChange={(e) =>
                        updateField('amount', e.target.value ? Number(e.target.value) : undefined)
                      }
                      placeholder="0"
                      className="pl-8"
                    />
                  </div>
                  {getFieldError('amount') && (
                    <p className="text-red-500 text-sm mt-1">{getFieldError('amount')}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                    支払先
                  </label>
                  <Input
                    value={formData.payeeName || ''}
                    onChange={(e) => updateField('payeeName', e.target.value)}
                    placeholder="取引先名・会社名"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                    支払方法
                  </label>
                  <Select
                    value={formData.paymentMethod || '振込'}
                    onChange={(e) => updateField('paymentMethod', e.target.value as PaymentMethod)}
                    options={[
                      { value: '振込', label: '振込' },
                      { value: '口座振替', label: '口座振替' },
                      { value: 'カード', label: 'カード' },
                      { value: '現金', label: '現金' },
                      { value: 'その他', label: 'その他' },
                    ]}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                    希望支払日（任意）
                  </label>
                  <Input
                    type="date"
                    value={formData.desiredPayDate || ''}
                    onChange={(e) => updateField('desiredPayDate', e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Step 4: 添付 */}
            {currentStep === 4 && (
              <div className="space-y-5">
                <h2 className="text-lg font-semibold mb-4">添付ファイル</h2>

                {requiredAttachments.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-amber-700">
                      <AlertCircle className="w-5 h-5" />
                      <span className="font-medium">
                        このカテゴリでは以下が必要です:
                      </span>
                    </div>
                    <ul className="mt-2 ml-7 text-amber-600 text-sm list-disc">
                      {requiredAttachments.map((att) => (
                        <li key={att}>{att}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 添付リスト（プレースホルダー） */}
                <div className="border-2 border-dashed border-zinc-300 rounded-lg p-8 text-center">
                  <Paperclip className="w-12 h-12 mx-auto text-zinc-400 mb-4" />
                  <p className="text-zinc-500 mb-4">
                    ファイルをドラッグ＆ドロップ、またはクリックして選択
                  </p>
                  <Button variant="secondary">
                    <Upload className="w-4 h-4 mr-2" />
                    ファイルを選択
                  </Button>
                  <p className="text-xs text-zinc-400 mt-2">
                    PDF, Word, Excel, 画像（10MB以下）
                  </p>
                </div>

                {getFieldError('attachments') && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-red-700">
                      <AlertCircle className="w-5 h-5" />
                      <span>{getFieldError('attachments')}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 5: 確認 */}
            {currentStep === 5 && (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold mb-4">送信前確認</h2>

                {/* バリデーション結果 */}
                {!allValidation.isValid && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-red-700 mb-2">
                      <AlertCircle className="w-5 h-5" />
                      <span className="font-medium">以下の項目が不足しています</span>
                    </div>
                    <ul className="ml-7 text-red-600 text-sm list-disc">
                      {allValidation.errors.map((err, idx) => (
                        <li key={idx}>{err.message}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {allValidation.isValid && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-green-700">
                      <Check className="w-5 h-5" />
                      <span className="font-medium">入力内容に問題ありません</span>
                    </div>
                  </div>
                )}

                {/* プレビュー */}
                <div className="bg-zinc-50 rounded-lg p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-lg">{formData.title || '(件名未入力)'}</h3>
                    {formData.urgency === '至急' && (
                      <Badge className="bg-red-100 text-red-700">至急</Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-zinc-500">カテゴリ:</span>{' '}
                      <span className="font-medium">{formData.category}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">金額:</span>{' '}
                      <span className="font-medium">
                        ¥{formData.amount?.toLocaleString() || '-'}
                      </span>
                    </div>
                    {formData.payeeName && (
                      <div>
                        <span className="text-zinc-500">支払先:</span>{' '}
                        <span className="font-medium">{formData.payeeName}</span>
                      </div>
                    )}
                    {formData.desiredDecisionDate && (
                      <div>
                        <span className="text-zinc-500">希望決裁日:</span>{' '}
                        <span className="font-medium">{formData.desiredDecisionDate}</span>
                      </div>
                    )}
                  </div>

                  <div className="border-t pt-4">
                    <h4 className="font-medium text-zinc-700 mb-2">背景</h4>
                    <p className="text-zinc-600 whitespace-pre-wrap">
                      {formData.background || '(未入力)'}
                    </p>
                  </div>

                  <div>
                    <h4 className="font-medium text-zinc-700 mb-2">目的</h4>
                    <p className="text-zinc-600 whitespace-pre-wrap">
                      {formData.purpose || '(未入力)'}
                    </p>
                  </div>

                  {formData.expectedEffect && (
                    <div>
                      <h4 className="font-medium text-zinc-700 mb-2">期待効果</h4>
                      <p className="text-zinc-600 whitespace-pre-wrap">
                        {formData.expectedEffect}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Navigation Buttons */}
        <div className="flex gap-3">
          {currentStep > 1 && (
            <Button variant="secondary" onClick={handleBack} disabled={loading}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              戻る
            </Button>
          )}

          <div className="flex-1" />

          <Button variant="secondary" onClick={handleSaveDraft} disabled={loading}>
            <Save className="w-4 h-4 mr-1" />
            下書き保存
          </Button>

          {currentStep < 5 ? (
            <Button onClick={handleNext} disabled={loading}>
              次へ
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={loading || !allValidation.isValid}
              className={!allValidation.isValid ? 'opacity-50 cursor-not-allowed' : ''}
            >
              <Send className="w-4 h-4 mr-1" />
              申請する
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
