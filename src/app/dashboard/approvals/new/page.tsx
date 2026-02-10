'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
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
  RotateCcw,
  Clock,
  Route,
} from 'lucide-react';
import { createRingi } from '@/lib/ringi';
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

const DRAFT_STORAGE_KEY = 'ringi_draft';
const AUTO_SAVE_INTERVAL = 30000; // 30秒

export default function NewApprovalPage() {
  return (
    <AuthGuard>
      <NewApprovalContent />
    </AuthGuard>
  );
}

function NewApprovalContent() {
  const router = useRouter();
  const { user, firebaseUser } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [savedDraft, setSavedDraft] = useState<{ data: RingiFormData; step: number; savedAt: string } | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const formDataRef = useRef<RingiFormData | null>(null);
  const currentStepRef = useRef(1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const initialFormData: RingiFormData = {
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
  };

  const [formData, setFormData] = useState<RingiFormData>(initialFormData);
  const [categoryChangeNotice, setCategoryChangeNotice] = useState<string | null>(null);

  // refs を更新
  useEffect(() => {
    formDataRef.current = formData;
    currentStepRef.current = currentStep;
  }, [formData, currentStep]);

  // 初回ロード時に下書きを確認
  useEffect(() => {
    const checkSavedDraft = () => {
      try {
        const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          // 24時間以内の下書きのみ復元対象
          const savedTime = new Date(parsed.savedAt).getTime();
          const now = Date.now();
          if (now - savedTime < 24 * 60 * 60 * 1000) {
            setSavedDraft(parsed);
            setShowRestoreDialog(true);
          } else {
            // 24時間以上前の下書きは削除
            localStorage.removeItem(DRAFT_STORAGE_KEY);
          }
        }
      } catch (e) {
        console.error('Failed to load draft:', e);
        localStorage.removeItem(DRAFT_STORAGE_KEY);
      }
    };
    checkSavedDraft();
  }, []);

  // 下書きを保存する関数
  const saveDraft = useCallback(() => {
    if (!formDataRef.current) return;
    try {
      const draftData = {
        data: formDataRef.current,
        step: currentStepRef.current,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftData));
      setLastSaved(new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      console.error('Failed to save draft:', e);
    }
  }, []);

  // 自動保存（30秒ごと）
  useEffect(() => {
    const interval = setInterval(() => {
      saveDraft();
    }, AUTO_SAVE_INTERVAL);

    return () => clearInterval(interval);
  }, [saveDraft]);

  // ページ離脱時に保存
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveDraft();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [saveDraft]);

  // 下書きを復元
  const restoreDraft = () => {
    if (savedDraft) {
      setFormData(savedDraft.data);
      setCurrentStep(savedDraft.step);
      setShowRestoreDialog(false);
    }
  };

  // 下書きを破棄
  const discardDraft = () => {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    setShowRestoreDialog(false);
    setSavedDraft(null);
  };

  // 下書きをクリア（送信成功時に呼ぶ）
  const clearDraft = () => {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  };

  // ファイルアップロード
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  const ALLOWED_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
  ];

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !user || !firebaseUser) return;

    setUploading(true);
    try {
      const token = await firebaseUser.getIdToken();
      const newAttachments: RingiAttachment[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // バリデーション
        if (file.size > MAX_FILE_SIZE) {
          alert(`${file.name} は10MBを超えています`);
          continue;
        }
        if (!ALLOWED_TYPES.includes(file.type)) {
          alert(`${file.name} は対応していないファイル形式です`);
          continue;
        }

        // サーバーサイドAPI経由でアップロード
        const body = new FormData();
        body.append('file', file);

        const res = await fetch('/api/ringi/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body,
        });

        const result = await res.json();
        if (!res.ok || !result.success) {
          alert(`${file.name}: ${result.error || 'アップロードに失敗しました'}`);
          continue;
        }

        // 添付タイプを推定
        const lowerName = file.name.toLowerCase();
        let attachType: 'QUOTE' | 'CONTRACT_DRAFT' | 'OTHER' = 'OTHER';
        if (lowerName.includes('見積') || lowerName.includes('quote') || lowerName.includes('estimate')) {
          attachType = 'QUOTE';
        } else if (lowerName.includes('契約') || lowerName.includes('contract')) {
          attachType = 'CONTRACT_DRAFT';
        }

        newAttachments.push({
          id: `${Date.now()}_${i}`,
          type: attachType,
          fileName: result.fileName,
          fileUrl: result.fileUrl,
          fileMime: result.fileMime,
          fileSize: result.fileSize,
          uploadedAt: new Date(),
        });
      }

      if (newAttachments.length > 0) {
        setFormData((prev) => ({
          ...prev,
          attachments: [...(prev.attachments || []), ...newAttachments],
        }));
      }
    } catch (err) {
      console.error('File upload error:', err);
      alert('ファイルのアップロードに失敗しました');
    } finally {
      setUploading(false);
      // input をリセット（同じファイルを再選択可能にする）
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveAttachment = (attachmentId: string) => {
    setFormData((prev) => ({
      ...prev,
      attachments: (prev.attachments || []).filter((a) => a.id !== attachmentId),
    }));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const updateField = <K extends keyof RingiFormData>(field: K, value: RingiFormData[K]) => {
    // カテゴリ変更時の添付要件変更通知
    if (field === 'category' && value !== formData.category) {
      const newCategory = value as RingiCategory;
      const oldRequired = REQUIRED_ATTACHMENTS_BY_CATEGORY[formData.category] || [];
      const newRequired = REQUIRED_ATTACHMENTS_BY_CATEGORY[newCategory] || [];

      if (JSON.stringify(oldRequired) !== JSON.stringify(newRequired)) {
        if (newRequired.length > 0) {
          setCategoryChangeNotice(
            `カテゴリ変更により、${newRequired.join('・')}の添付が必要になりました`
          );
          // 3秒後に通知を消す
          setTimeout(() => setCategoryChangeNotice(null), 5000);
        } else if (oldRequired.length > 0) {
          setCategoryChangeNotice('カテゴリ変更により、必須添付がなくなりました');
          setTimeout(() => setCategoryChangeNotice(null), 3000);
        }
      }
    }

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
      clearDraft(); // 送信成功時にローカル下書きをクリア
      router.push('/ringi');
    } catch (error) {
      console.error('Failed to save draft:', error);
      alert('保存に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!user || !firebaseUser) return;

    const validation = validateAllSteps(formData);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    setLoading(true);
    try {
      // 1. まず稟議を作成
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

      // 2. API経由で申請（承認経路を自動適用）
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/ringi/submit', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ringiId: ringi.id }),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || '申請に失敗しました');
      }

      clearDraft(); // 送信成功時にローカル下書きをクリア
      router.push('/ringi');
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

  const allValidation = validateAllSteps(formData);
  const requiredAttachments = REQUIRED_ATTACHMENTS_BY_CATEGORY[formData.category] || [];

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* 下書き復元ダイアログ */}
      {showRestoreDialog && savedDraft && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                  <RotateCcw className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-zinc-900">下書きがあります</h3>
                  <p className="text-sm text-zinc-500">
                    {new Date(savedDraft.savedAt).toLocaleString('ja-JP')} に保存
                  </p>
                </div>
              </div>

              {savedDraft.data.title && (
                <div className="bg-zinc-50 rounded-lg p-3 mb-4">
                  <p className="text-sm text-zinc-500">件名</p>
                  <p className="font-medium text-zinc-900">{savedDraft.data.title}</p>
                </div>
              )}

              <p className="text-sm text-zinc-600 mb-4">
                前回の入力内容を復元しますか？
              </p>

              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  onClick={discardDraft}
                  className="flex-1"
                >
                  <X className="w-4 h-4 mr-1" />
                  破棄して新規作成
                </Button>
                <Button onClick={restoreDraft} className="flex-1">
                  <RotateCcw className="w-4 h-4 mr-1" />
                  復元する
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
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

          {/* 自動保存ステータス */}
          {lastSaved && (
            <div className="flex items-center gap-1.5 text-xs text-zinc-400">
              <Clock className="w-3.5 h-3.5" />
              <span>自動保存: {lastSaved}</span>
            </div>
          )}
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
                    <p className="text-sm text-amber-600 mt-1 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" />
                      このカテゴリでは {requiredAttachments.join('、')} が必要です
                    </p>
                  )}
                  {categoryChangeNotice && (
                    <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      {categoryChangeNotice}
                    </div>
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

                {/* アップロード済みファイル一覧 */}
                {(formData.attachments || []).length > 0 && (
                  <div className="space-y-2">
                    {(formData.attachments || []).map((att) => (
                      <div
                        key={att.id}
                        className="flex items-center gap-3 p-3 bg-white border border-zinc-200 rounded-lg"
                      >
                        <FileText className="w-5 h-5 text-blue-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-zinc-900 truncate">
                            {att.fileName}
                          </p>
                          <p className="text-xs text-zinc-400">
                            {att.fileSize ? formatFileSize(att.fileSize) : ''}{' '}
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              att.type === 'QUOTE' ? 'bg-blue-100 text-blue-700' :
                              att.type === 'CONTRACT_DRAFT' ? 'bg-purple-100 text-purple-700' :
                              'bg-zinc-100 text-zinc-600'
                            }`}>
                              {att.type === 'QUOTE' ? '見積書' : att.type === 'CONTRACT_DRAFT' ? '契約書案' : 'その他'}
                            </span>
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveAttachment(att.id)}
                          className="p-1 hover:bg-red-50 rounded text-zinc-400 hover:text-red-500 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* ファイル選択エリア */}
                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    uploading ? 'border-blue-300 bg-blue-50' : 'border-zinc-300 hover:border-zinc-400'
                  }`}
                  onClick={() => !uploading && fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (uploading) return;
                    const dt = e.dataTransfer;
                    if (dt.files.length > 0 && fileInputRef.current) {
                      fileInputRef.current.files = dt.files;
                      handleFileSelect({ target: { files: dt.files } } as React.ChangeEvent<HTMLInputElement>);
                    }
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  {uploading ? (
                    <>
                      <Upload className="w-12 h-12 mx-auto text-blue-400 mb-4 animate-pulse" />
                      <p className="text-blue-600 font-medium">アップロード中...</p>
                    </>
                  ) : (
                    <>
                      <Paperclip className="w-12 h-12 mx-auto text-zinc-400 mb-4" />
                      <p className="text-zinc-500 mb-4">
                        ファイルをドラッグ＆ドロップ、またはクリックして選択
                      </p>
                      <Button variant="secondary" type="button" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                        <Upload className="w-4 h-4 mr-2" />
                        ファイルを選択
                      </Button>
                      <p className="text-xs text-zinc-400 mt-2">
                        PDF, Word, Excel, 画像（10MB以下）
                      </p>
                    </>
                  )}
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

                {/* 不足項目（エラー） */}
                {!allValidation.isValid && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-red-700 mb-2">
                      <AlertCircle className="w-5 h-5" />
                      <span className="font-medium">
                        以下の必須項目が不足しています（{allValidation.errors.length}件）
                      </span>
                    </div>
                    <ul className="ml-7 text-red-600 text-sm space-y-1">
                      {allValidation.errors.map((err, idx) => (
                        <li key={idx} className="flex items-center gap-2">
                          <X className="w-4 h-4" />
                          {err.message}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-sm text-red-600 font-medium">
                      ※ 不足項目を入力するまで申請できません
                    </p>
                  </div>
                )}

                {/* 警告（推奨項目） */}
                {allValidation.warnings.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-amber-700 mb-2">
                      <AlertCircle className="w-5 h-5" />
                      <span className="font-medium">
                        推奨項目（{allValidation.warnings.length}件）
                      </span>
                    </div>
                    <ul className="ml-7 text-amber-600 text-sm space-y-1">
                      {allValidation.warnings.map((warn, idx) => (
                        <li key={idx} className="flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" />
                          {warn}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-sm text-amber-600">
                      ※ 警告項目があっても申請可能ですが、差戻しの原因になることがあります
                    </p>
                  </div>
                )}

                {allValidation.isValid && allValidation.warnings.length === 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-green-700">
                      <Check className="w-5 h-5" />
                      <span className="font-medium">入力内容に問題ありません</span>
                    </div>
                  </div>
                )}

                {allValidation.isValid && allValidation.warnings.length > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-blue-700">
                      <Check className="w-5 h-5" />
                      <span className="font-medium">必須項目は入力済みです（警告あり）</span>
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

                  {(formData.attachments || []).length > 0 && (
                    <div className="border-t pt-4">
                      <h4 className="font-medium text-zinc-700 mb-2">
                        添付ファイル（{(formData.attachments || []).length}件）
                      </h4>
                      <ul className="space-y-1">
                        {(formData.attachments || []).map((att) => (
                          <li key={att.id} className="text-sm text-zinc-600 flex items-center gap-2">
                            <Paperclip className="w-3.5 h-3.5 text-zinc-400" />
                            {att.fileName}
                            {att.fileSize ? ` (${formatFileSize(att.fileSize)})` : ''}
                          </li>
                        ))}
                      </ul>
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
