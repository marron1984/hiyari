'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FileText, Paperclip, X } from 'lucide-react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { createApproval, uploadApprovalAttachment } from '@/lib/repositories/approvals';
import {
  ApprovalFormData,
  APPROVAL_CATEGORIES,
  ApprovalCategory,
} from '@/types/database';

interface FormErrors {
  title?: string;
  description?: string;
  category?: string;
}

function NewApprovalPageContent() {
  const router = useRouter();
  const { profile, organization, facility } = useSupabaseAuth();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [files, setFiles] = useState<File[]>([]);
  const [formData, setFormData] = useState<ApprovalFormData>({
    title: '',
    description: '',
    amount: undefined,
    category: '' as ApprovalCategory,
    desired_due_date: '',
  });

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.title || formData.title.length < 5) {
      newErrors.title = '件名は5文字以上で入力してください';
    }
    if (!formData.description || formData.description.length < 10) {
      newErrors.description = '内容は10文字以上で入力してください';
    }
    if (!formData.category) {
      newErrors.category = 'カテゴリを選択してください';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm() || !organization || !facility || !profile) {
      return;
    }

    setLoading(true);
    try {
      const approval = await createApproval(
        formData,
        organization.id,
        facility.id,
        profile.id
      );

      // 添付ファイルをアップロード
      for (const file of files) {
        await uploadApprovalAttachment(approval.id, profile.id, file);
      }

      router.push('/approvals');
    } catch (error) {
      console.error('Error creating approval:', error);
      alert('稟議の申請に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleFileAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = e.target.files;
    if (!newFiles) return;

    const validFiles: File[] = [];
    for (const file of Array.from(newFiles)) {
      if (file.size > 10 * 1024 * 1024) {
        alert(`${file.name}は10MBを超えています`);
        continue;
      }
      validFiles.push(file);
    }

    setFiles((prev) => [...prev, ...validFiles]);
    e.target.value = '';
  };

  const handleFileRemove = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">稟議申請</h1>
          <p className="text-sm text-gray-500 mt-1">
            備品購入や設備修繕などの承認申請を行います
          </p>
        </div>
      </div>

      {/* ポイント説明 */}
      <Card className="mb-6 bg-green-50 border-green-200">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <FileText className="w-5 h-5 text-green-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-green-800">
                申請で +3ポイント獲得
              </p>
              <p className="text-xs text-green-600 mt-1">
                承認完了時に追加ポイントが付与されます
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* フォーム */}
      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>申請内容</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 件名 */}
            <Input
              label="件名"
              required
              placeholder="例: ○○事業所 車椅子購入の件"
              value={formData.title}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, title: e.target.value }))
              }
              maxLength={100}
              error={errors.title}
            />

            {/* カテゴリ */}
            <Select
              label="カテゴリ"
              required
              value={formData.category}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  category: e.target.value as ApprovalCategory,
                }))
              }
              options={[
                { value: '', label: '選択してください' },
                ...APPROVAL_CATEGORIES.map((c) => ({ value: c, label: c })),
              ]}
              error={errors.category}
            />

            {/* 金額 */}
            <Input
              label="金額（任意）"
              type="number"
              placeholder="0"
              value={formData.amount || ''}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  amount: e.target.value ? parseInt(e.target.value) : undefined,
                }))
              }
              hint="購入等にかかる費用がある場合"
            />

            {/* 希望完了日 */}
            <Input
              label="希望完了日（任意）"
              type="date"
              value={formData.desired_due_date || ''}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  desired_due_date: e.target.value,
                }))
              }
              hint="承認完了を希望する日付"
            />

            {/* 内容 */}
            <Textarea
              label="申請内容"
              required
              placeholder="申請の背景、理由、必要性などを具体的に記述してください"
              value={formData.description}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, description: e.target.value }))
              }
              rows={6}
              maxLength={2000}
              showCount
              error={errors.description}
            />
          </CardContent>
        </Card>

        {/* 添付ファイル */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>添付ファイル（任意）</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* ファイルリスト */}
              {files.length > 0 && (
                <ul className="space-y-2">
                  {files.map((file, index) => (
                    <li
                      key={index}
                      className="flex items-center justify-between p-2 bg-gray-50 rounded"
                    >
                      <div className="flex items-center gap-2">
                        <Paperclip className="w-4 h-4 text-gray-400" />
                        <span className="text-sm">{file.name}</span>
                        <span className="text-xs text-gray-400">
                          ({Math.round(file.size / 1024)}KB)
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleFileRemove(index)}
                      >
                        <X className="w-4 h-4 text-red-500" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              {/* アップロードボタン */}
              <label className="cursor-pointer inline-block">
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileAdd}
                />
                <Button type="button" variant="outline" asChild>
                  <span>
                    <Paperclip className="w-4 h-4 mr-2" />
                    ファイルを追加
                  </span>
                </Button>
              </label>
              <p className="text-xs text-gray-500">
                見積書、カタログ、参考資料などを添付できます（1ファイル10MBまで）
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 承認フロー説明 */}
        <Card className="mb-6 bg-gray-50">
          <CardContent className="py-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">承認フロー</h4>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span className="px-2 py-1 bg-white rounded border">申請</span>
              <span>→</span>
              <span className="px-2 py-1 bg-white rounded border">一次承認（拠点責任者）</span>
              <span>→</span>
              <span className="px-2 py-1 bg-white rounded border">二次承認（本部）</span>
              <span>→</span>
              <span className="px-2 py-1 bg-green-100 text-green-700 rounded border border-green-200">
                承認完了
              </span>
            </div>
          </CardContent>
        </Card>

        {/* 送信ボタン */}
        <div className="flex items-center justify-between">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            キャンセル
          </Button>
          <Button type="submit" loading={loading}>
            申請する
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function NewApprovalPage() {
  return (
    <AuthGuard>
      <NewApprovalPageContent />
    </AuthGuard>
  );
}
