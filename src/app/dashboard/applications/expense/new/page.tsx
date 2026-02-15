'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardContent, Button, Input, Select } from '@/components/ui';
import { ArrowLeft, Save, Send, AlertCircle, Upload, Receipt, X, FileText, Loader2 } from 'lucide-react';
import {
  ExpenseFormData,
  EXPENSE_CATEGORIES,
  EXPENSE_PAYMENT_METHODS,
  validateExpense,
  ApplicationValidationError,
} from '@/types/application';

export default function NewExpenseApplicationPage() {
  return (
    <AuthGuard>
      <NewExpenseApplicationContent />
    </AuthGuard>
  );
}

function NewExpenseApplicationContent() {
  const router = useRouter();
  const { user, firebaseUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<ApplicationValidationError[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; url: string }[]>([]);

  const [formData, setFormData] = useState<ExpenseFormData>({
    expenseDate: new Date().toISOString().split('T')[0],
    amount: '',
    category: '',
    paymentMethod: '',
    description: '',
    receiptUrls: [],
    vendor: '',
    purpose: '',
  });

  const updateField = <K extends keyof ExpenseFormData>(field: K, value: ExpenseFormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => prev.filter((e) => e.field !== field));
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !firebaseUser) return;

    setUploading(true);
    try {
      const token = await firebaseUser.getIdToken();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fd = new FormData();
        fd.append('file', file);

        const res = await fetch('/api/applications/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });

        const result = await res.json();
        if (!res.ok) {
          alert(result.error || 'アップロードに失敗しました');
          continue;
        }

        setUploadedFiles((prev) => [...prev, { name: result.fileName, url: result.fileUrl }]);
        setFormData((prev) => ({
          ...prev,
          receiptUrls: [...prev.receiptUrls, result.fileUrl],
        }));
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('アップロードに失敗しました');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
    setFormData((prev) => ({
      ...prev,
      receiptUrls: prev.receiptUrls.filter((_, i) => i !== index),
    }));
  };

  const validate = useCallback(() => {
    const result = validateExpense(formData);
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
          type: 'EXPENSE',
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
          type: 'EXPENSE',
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
            <h1 className="text-xl font-bold text-zinc-900">経費申請</h1>
            <p className="text-sm text-zinc-500">新規作成</p>
          </div>
        </div>

        {/* Form */}
        <Card className="mb-6">
          <CardContent className="p-6 space-y-5">
            {/* 経費発生日 */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                経費発生日 <span className="text-red-500">*</span>
              </label>
              <Input
                type="date"
                value={formData.expenseDate}
                onChange={(e) => updateField('expenseDate', e.target.value)}
              />
              {getFieldError('expenseDate') && (
                <p className="text-red-500 text-sm mt-1">{getFieldError('expenseDate')}</p>
              )}
            </div>

            {/* 金額 */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                金額 <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">¥</span>
                <Input
                  type="number"
                  value={formData.amount}
                  onChange={(e) =>
                    updateField('amount', e.target.value ? Number(e.target.value) : '')
                  }
                  placeholder="0"
                  className="pl-8"
                />
              </div>
              {getFieldError('amount') && (
                <p className="text-red-500 text-sm mt-1">{getFieldError('amount')}</p>
              )}
            </div>

            {/* カテゴリ */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                カテゴリ <span className="text-red-500">*</span>
              </label>
              <Select
                value={formData.category}
                onChange={(e) => updateField('category', e.target.value as ExpenseFormData['category'])}
                options={[
                  { value: '', label: '選択してください' },
                  ...EXPENSE_CATEGORIES.map((cat) => ({ value: cat, label: cat })),
                ]}
              />
              {getFieldError('category') && (
                <p className="text-red-500 text-sm mt-1">{getFieldError('category')}</p>
              )}
            </div>

            {/* 支払方法 */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                支払方法 <span className="text-red-500">*</span>
              </label>
              <Select
                value={formData.paymentMethod}
                onChange={(e) =>
                  updateField('paymentMethod', e.target.value as ExpenseFormData['paymentMethod'])
                }
                options={[
                  { value: '', label: '選択してください' },
                  ...EXPENSE_PAYMENT_METHODS.map((m) => ({ value: m, label: m })),
                ]}
              />
              {getFieldError('paymentMethod') && (
                <p className="text-red-500 text-sm mt-1">{getFieldError('paymentMethod')}</p>
              )}
            </div>

            {/* 支払先 */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">支払先</label>
              <Input
                value={formData.vendor || ''}
                onChange={(e) => updateField('vendor', e.target.value)}
                placeholder="店舗名・会社名など"
              />
            </div>

            {/* 内容 */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                内容 <span className="text-red-500">*</span>
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => updateField('description', e.target.value)}
                placeholder="経費の内容を記載してください"
                rows={3}
                className="w-full px-4 py-3 rounded-xl border border-zinc-200 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {getFieldError('description') && (
                <p className="text-red-500 text-sm mt-1">{getFieldError('description')}</p>
              )}
            </div>

            {/* 利用目的 */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">利用目的</label>
              <Input
                value={formData.purpose || ''}
                onChange={(e) => updateField('purpose', e.target.value)}
                placeholder="業務上の目的・理由"
              />
            </div>

            {/* 領収書 */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">領収書</label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,application/pdf"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />

              {/* アップロード済みファイル一覧 */}
              {uploadedFiles.length > 0 && (
                <div className="space-y-2 mb-3">
                  {uploadedFiles.map((file, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg"
                    >
                      <FileText className="w-4 h-4 text-green-600 flex-shrink-0" />
                      <span className="text-sm text-green-800 truncate flex-1">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeFile(idx)}
                        className="p-1 hover:bg-green-100 rounded"
                      >
                        <X className="w-4 h-4 text-green-600" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-2 border-dashed border-zinc-300 rounded-lg p-6 text-center">
                {uploading ? (
                  <>
                    <Loader2 className="w-10 h-10 mx-auto text-blue-400 mb-3 animate-spin" />
                    <p className="text-sm text-zinc-500">アップロード中...</p>
                  </>
                ) : (
                  <>
                    <Receipt className="w-10 h-10 mx-auto text-zinc-400 mb-3" />
                    <p className="text-sm text-zinc-500 mb-3">
                      領収書画像をアップロード
                    </p>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      ファイルを選択
                    </Button>
                    <p className="text-xs text-zinc-400 mt-2">PNG, JPG, PDF（10MB以下）</p>
                  </>
                )}
              </div>
            </div>

            {/* Warnings */}
            {warnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-center gap-2 text-amber-700 mb-2">
                  <AlertCircle className="w-5 h-5" />
                  <span className="font-medium">推奨事項</span>
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
