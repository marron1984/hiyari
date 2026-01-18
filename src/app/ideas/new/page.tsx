'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Lightbulb, AlertCircle } from 'lucide-react';
import { useSupabaseAuth } from '@/contexts/SupabaseAuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { createIdea } from '@/lib/repositories/ideas';
import {
  IdeaFormData,
  IDEA_CATEGORIES,
  IDEA_DIFFICULTIES,
  IDEA_COST_LEVELS,
  IdeaCategory,
  IdeaDifficulty,
  IdeaCostLevel,
} from '@/types/database';

interface FormErrors {
  category?: string;
  problem?: string;
  idea?: string;
}

function NewIdeaPageContent() {
  const router = useRouter();
  const { profile, organization, facility } = useSupabaseAuth();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formData, setFormData] = useState<IdeaFormData>({
    category: '' as IdeaCategory,
    problem: '',
    idea: '',
    expected_effects: [],
    difficulty: 'mid',
    cost_level: 'zero',
  });
  const [effectInput, setEffectInput] = useState('');

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.category) {
      newErrors.category = 'カテゴリを選択してください';
    }
    if (!formData.problem || formData.problem.length < 10) {
      newErrors.problem = '課題・問題点は10文字以上で入力してください';
    }
    if (!formData.idea || formData.idea.length < 10) {
      newErrors.idea = '改善アイデアは10文字以上で入力してください';
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
      await createIdea(formData, organization.id, facility.id, profile.id);
      router.push('/ideas');
    } catch (error) {
      console.error('Error creating idea:', error);
      alert('アイデアの投稿に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const addEffect = () => {
    if (effectInput.trim() && formData.expected_effects.length < 5) {
      setFormData((prev) => ({
        ...prev,
        expected_effects: [...prev.expected_effects, effectInput.trim()],
      }));
      setEffectInput('');
    }
  };

  const removeEffect = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      expected_effects: prev.expected_effects.filter((_, i) => i !== index),
    }));
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">改善アイデア投稿</h1>
          <p className="text-sm text-gray-500 mt-1">
            気づいた課題と改善案を共有しましょう
          </p>
        </div>
      </div>

      {/* ポイント説明 */}
      <Card className="mb-6 bg-green-50 border-green-200">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Lightbulb className="w-5 h-5 text-green-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-green-800">
                投稿で +5ポイント獲得
              </p>
              <p className="text-xs text-green-600 mt-1">
                アイデアが採用されると追加ポイントが付与されます
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* フォーム */}
      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>アイデアの内容</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* カテゴリ */}
            <Select
              label="カテゴリ"
              required
              value={formData.category}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  category: e.target.value as IdeaCategory,
                }))
              }
              options={[
                { value: '', label: '選択してください' },
                ...IDEA_CATEGORIES.map((c) => ({ value: c, label: c })),
              ]}
              error={errors.category}
            />

            {/* 課題・問題点 */}
            <Textarea
              label="課題・問題点"
              required
              placeholder="現状の課題や気づいた問題点を具体的に記述してください"
              value={formData.problem}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, problem: e.target.value }))
              }
              rows={4}
              maxLength={1000}
              showCount
              error={errors.problem}
              hint="どのような場面で、何が問題になっているか"
            />

            {/* 改善アイデア */}
            <Textarea
              label="改善アイデア"
              required
              placeholder="具体的な改善案を記述してください"
              value={formData.idea}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, idea: e.target.value }))
              }
              rows={4}
              maxLength={1000}
              showCount
              error={errors.idea}
              hint="どのように改善すればよいか、具体的な方法"
            />

            {/* 期待される効果 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                期待される効果（任意・最大5つ）
              </label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="例: 作業時間が30%短縮"
                  value={effectInput}
                  onChange={(e) => setEffectInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addEffect();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={addEffect}
                  disabled={formData.expected_effects.length >= 5}
                >
                  追加
                </Button>
              </div>
              {formData.expected_effects.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.expected_effects.map((effect, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm"
                    >
                      {effect}
                      <button
                        type="button"
                        onClick={() => removeEffect(index)}
                        className="text-blue-500 hover:text-blue-700"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* 難易度・コスト */}
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="実施の難易度"
                value={formData.difficulty}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    difficulty: e.target.value as IdeaDifficulty,
                  }))
                }
                options={IDEA_DIFFICULTIES.map((d) => ({
                  value: d.value,
                  label: d.label,
                }))}
              />
              <Select
                label="必要コスト"
                value={formData.cost_level}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    cost_level: e.target.value as IdeaCostLevel,
                  }))
                }
                options={IDEA_COST_LEVELS.map((c) => ({
                  value: c.value,
                  label: c.label,
                }))}
              />
            </div>
          </CardContent>
        </Card>

        {/* 送信ボタン */}
        <div className="flex items-center justify-between mt-6">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            キャンセル
          </Button>
          <Button type="submit" loading={loading}>
            投稿する
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function NewIdeaPage() {
  return (
    <AuthGuard>
      <NewIdeaPageContent />
    </AuthGuard>
  );
}
