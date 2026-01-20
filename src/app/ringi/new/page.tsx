'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ArrowLeft, Save, Send } from 'lucide-react';
import { createRingi, submitRingi } from '@/lib/ringi';
import { RingiFormData, RINGI_CATEGORIES, RingiCategory } from '@/types';
import Link from 'next/link';

export default function NewRingiPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<RingiFormData>({
    title: '',
    category: '備品購入',
    amount: undefined,
    description: '',
  });

  const handleSubmit = async (asDraft: boolean) => {
    if (!user) return;

    if (!formData.title.trim()) {
      alert('件名を入力してください');
      return;
    }
    if (!formData.description.trim()) {
      alert('申請理由を入力してください');
      return;
    }

    setLoading(true);
    try {
      const ringi = await createRingi(
        formData,
        user.id,
        user.name,
        user.branchId,
        user.tenantId
      );

      if (!asDraft) {
        // 即時申請
        await submitRingi(
          ringi.id,
          user.id,
          user.name,
          user.role,
          user.branchId
        );
      }

      router.push('/ringi');
    } catch (error) {
      console.error('Failed to create ringi:', error);
      alert('作成に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-2xl mx-auto px-4 py-6 safe-top safe-bottom">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/ringi">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold text-zinc-900">稟議作成</h1>
        </div>

        <Card className="p-6">
          <div className="space-y-5">
            {/* 件名 */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                件名 <span className="text-red-500">*</span>
              </label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="例: 車椅子の購入について"
              />
            </div>

            {/* カテゴリ */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                カテゴリ
              </label>
              <Select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as RingiCategory })}
                options={RINGI_CATEGORIES.map((cat) => ({ value: cat, label: cat }))}
              />
            </div>

            {/* 金額 */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                金額（任意）
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">¥</span>
                <Input
                  type="number"
                  value={formData.amount || ''}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="0"
                  className="pl-8"
                />
              </div>
            </div>

            {/* 申請理由 */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                申請理由・詳細 <span className="text-red-500">*</span>
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="購入の理由、必要性、期待される効果などを記載してください"
                rows={6}
                className="w-full px-4 py-3 rounded-xl border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent resize-none"
              />
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-2">
              <Button
                variant="secondary"
                onClick={() => handleSubmit(true)}
                disabled={loading}
                className="flex-1"
              >
                <Save className="w-4 h-4" />
                下書き保存
              </Button>
              <Button
                onClick={() => handleSubmit(false)}
                disabled={loading}
                className="flex-1"
              >
                <Send className="w-4 h-4" />
                申請する
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
