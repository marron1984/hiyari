'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import {
  ArrowLeft,
  Wrench,
  AlertTriangle,
  Building2,
} from 'lucide-react';
import type { RepairCategory, SafetyRisk } from '@/lib/repairs/types';
import {
  REPAIR_CATEGORY_CONFIG,
  SAFETY_RISK_CONFIG,
} from '@/lib/repairs/types';
import type { BusinessUnit } from '@/lib/business/types';

export default function NewRepairPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Task 030: businessUnitId 初期値（URLパラメータから取得）
  const initialBusinessUnitId = searchParams.get('businessUnitId') || '';

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<RepairCategory>('other');
  const [safetyRisk, setSafetyRisk] = useState<SafetyRisk>('low');
  const [businessUnitId, setBusinessUnitId] = useState(initialBusinessUnitId);
  const [location, setLocation] = useState('');
  const [dueAt, setDueAt] = useState('');

  // Task 030: 事業単位リスト
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [loadingBU, setLoadingBU] = useState(true);

  useEffect(() => {
    async function fetchBusinessUnits() {
      try {
        const res = await fetch('/api/business/units');
        if (res.ok) {
          const data = await res.json();
          setBusinessUnits(data.units || []);
        }
      } catch {
        console.error('Failed to fetch business units');
      } finally {
        setLoadingBU(false);
      }
    }
    fetchBusinessUnits();
  }, []);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !description.trim()) {
      setError('件名と詳細は必須です');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/repairs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          category,
          safetyRisk,
          businessUnitId: businessUnitId || null,  // Task 030
          location: location.trim() || null,
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || '修繕依頼の作成に失敗しました');
        return;
      }

      router.push(`/dashboard/repairs`);
    } catch {
      setError('修繕依頼の作成に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="pb-8">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* ヘッダー */}
        <div className="flex items-center gap-4 mb-6">
          <Link
            href="/dashboard/repairs"
            className="p-2 hover:bg-zinc-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg">
              <Wrench className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-900">新規修繕依頼</h1>
              <p className="text-sm text-zinc-500">設備故障・修繕の報告</p>
            </div>
          </div>
        </div>

        {/* エラー表示 */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <span className="text-red-700">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base">基本情報</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 件名 */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  件名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="例：2階非常口の照明故障"
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg"
                  required
                />
              </div>

              {/* 詳細 */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  詳細 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="故障・修繕の詳細を入力..."
                  rows={5}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg resize-none"
                  required
                />
              </div>

              {/* カテゴリ・安全リスク */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    カテゴリ
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as RepairCategory)}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-lg"
                  >
                    {Object.entries(REPAIR_CATEGORY_CONFIG).map(([key, config]) => (
                      <option key={key} value={key}>
                        {config.icon} {config.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    安全リスク
                  </label>
                  <select
                    value={safetyRisk}
                    onChange={(e) => setSafetyRisk(e.target.value as SafetyRisk)}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-lg"
                  >
                    {Object.entries(SAFETY_RISK_CONFIG).map(([key, config]) => (
                      <option key={key} value={key}>
                        {config.emoji} {config.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Task 030: 事業単位 */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="w-4 h-4" />
                    事業単位
                  </span>
                </label>
                <select
                  value={businessUnitId}
                  onChange={(e) => setBusinessUnitId(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg"
                  disabled={loadingBU}
                >
                  <option value="">（未指定）</option>
                  {businessUnits.map((bu) => (
                    <option key={bu.id} value={bu.id}>
                      {bu.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-zinc-500">
                  関連する事業を選択すると、事業別の集計に反映されます
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base">追加情報（任意）</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 場所 */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  場所
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="例：2階非常口、3階東棟トイレ"
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg"
                />
              </div>

              {/* 期限 */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  対応期限
                </label>
                <input
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg"
                />
              </div>
            </CardContent>
          </Card>

          {/* 送信ボタン */}
          <div className="flex justify-end gap-3">
            <Link
              href="/dashboard/repairs"
              className="px-4 py-2 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors"
            >
              キャンセル
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? '作成中...' : '修繕依頼を作成'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
