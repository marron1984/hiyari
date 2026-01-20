'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ArrowLeft, Send, Lightbulb } from 'lucide-react';
import { createImprovement } from '@/lib/improvement';
import { ImprovementFormData, ImprovementCategory, IMPROVEMENT_CATEGORIES } from '@/types';

export default function NewImprovementPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<ImprovementFormData>({
    title: '',
    category: '業務効率化',
    description: '',
    expectedEffect: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!formData.title.trim() || !formData.description.trim()) {
      alert('タイトルと内容は必須です');
      return;
    }

    setLoading(true);
    try {
      await createImprovement(formData, user.id, user.name, user.branchId, user.tenantId);
      router.push('/improvements');
    } catch (error) {
      console.error('Submit failed:', error);
      alert(error instanceof Error ? error.message : '投稿に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="max-w-2xl mx-auto px-4 py-6 safe-top safe-bottom">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/improvements">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold text-zinc-900">改善提案</h1>
        </div>

        {/* Info */}
        <Card className="p-4 mb-6 bg-amber-50 border-amber-200">
          <div className="flex gap-3">
            <Lightbulb className="w-5 h-5 text-amber-600 shrink-0" />
            <div className="text-sm text-amber-800">
              <p className="font-medium mb-1">ポイント付与について</p>
              <ul className="text-xs space-y-0.5">
                <li>・提案投稿: 1ポイント</li>
                <li>・採用された場合: +5ポイント</li>
              </ul>
            </div>
          </div>
        </Card>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <Card className="p-6 space-y-4">
            {/* タイトル */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                タイトル <span className="text-red-500">*</span>
              </label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="改善提案のタイトル"
                required
              />
            </div>

            {/* カテゴリ */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                カテゴリ
              </label>
              <Select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as ImprovementCategory })}
                options={IMPROVEMENT_CATEGORIES.map((cat) => ({ value: cat, label: cat }))}
              />
            </div>

            {/* 内容 */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                提案内容 <span className="text-red-500">*</span>
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="現状の課題と改善提案の詳細を記入してください"
                rows={6}
                required
                className="w-full px-4 py-3 rounded-xl border border-zinc-200 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 resize-none"
              />
            </div>

            {/* 期待される効果 */}
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                期待される効果（任意）
              </label>
              <textarea
                value={formData.expectedEffect || ''}
                onChange={(e) => setFormData({ ...formData, expectedEffect: e.target.value })}
                placeholder="この改善により期待される効果を記入してください"
                rows={3}
                className="w-full px-4 py-3 rounded-xl border border-zinc-200 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 resize-none"
              />
            </div>

            {/* Submit */}
            <div className="flex gap-3 pt-2">
              <Link href="/improvements" className="flex-1">
                <Button type="button" variant="secondary" className="w-full">
                  キャンセル
                </Button>
              </Link>
              <Button type="submit" disabled={loading} className="flex-1">
                <Send className="w-4 h-4" />
                {loading ? '送信中...' : '提案する'}
              </Button>
            </div>
          </Card>
        </form>
      </div>
    </div>
  );
}
