'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import {
  ArrowLeft,
  ShieldAlert,
  AlertTriangle,
  Building2,
} from 'lucide-react';
import type {
  CorrectiveActionSeverity,
  SourceType,
} from '@/lib/correctiveActions/types';
import {
  CA_SEVERITY_CONFIG,
  SOURCE_TYPE_CONFIG,
} from '@/lib/correctiveActions/types';
import type { BusinessUnit } from '@/lib/business/types';

export default function NewCorrectiveActionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Task 030: businessUnitId 初期値（URLパラメータまたはソースから継承）
  const initialBusinessUnitId = searchParams.get('businessUnitId') || '';
  const initialSourceType = searchParams.get('sourceType') as SourceType | null;
  const initialSourceId = searchParams.get('sourceId') || '';

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<CorrectiveActionSeverity>('minor');
  const [sourceType, setSourceType] = useState<SourceType>(initialSourceType || 'manual');
  const [sourceId, setSourceId] = useState(initialSourceId);
  const [businessUnitId, setBusinessUnitId] = useState(initialBusinessUnitId);
  const [rootCause, setRootCause] = useState('');
  const [actionPlan, setActionPlan] = useState('');
  const [ownerUserId, setOwnerUserId] = useState('');
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
      setError('件名と説明は必須です');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/corrective-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          severity,
          sourceType,
          sourceId: sourceId || null,
          businessUnitId: businessUnitId || null,  // Task 030
          rootCause: rootCause.trim() || null,
          actionPlan: actionPlan.trim() || null,
          ownerUserId: ownerUserId || null,
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || '是正措置の作成に失敗しました');
        return;
      }

      router.push(`/dashboard/corrective-actions`);
    } catch {
      setError('是正措置の作成に失敗しました');
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
            href="/dashboard/corrective-actions"
            className="p-2 hover:bg-zinc-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg">
              <ShieldAlert className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-900">新規是正措置</h1>
              <p className="text-sm text-zinc-500">問題の根本原因分析と改善措置</p>
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
                  placeholder="例：転倒事故防止策の徹底"
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg"
                  required
                />
              </div>

              {/* 説明 */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  説明 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="問題の概要と是正措置の目的を入力..."
                  rows={4}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg resize-none"
                  required
                />
              </div>

              {/* 重要度・ソースタイプ */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    重要度
                  </label>
                  <select
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value as CorrectiveActionSeverity)}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-lg"
                  >
                    {Object.entries(CA_SEVERITY_CONFIG).map(([key, config]) => (
                      <option key={key} value={key}>
                        {config.emoji} {config.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    発生源
                  </label>
                  <select
                    value={sourceType}
                    onChange={(e) => setSourceType(e.target.value as SourceType)}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-lg"
                  >
                    {Object.entries(SOURCE_TYPE_CONFIG).map(([key, config]) => (
                      <option key={key} value={key}>
                        {config.icon} {config.label}
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
              <CardTitle className="text-base">分析・対策（任意）</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 根本原因 */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  根本原因
                </label>
                <textarea
                  value={rootCause}
                  onChange={(e) => setRootCause(e.target.value)}
                  placeholder="問題が発生した根本原因を分析..."
                  rows={3}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg resize-none"
                />
              </div>

              {/* 対策計画 */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  対策計画
                </label>
                <textarea
                  value={actionPlan}
                  onChange={(e) => setActionPlan(e.target.value)}
                  placeholder="具体的な是正措置の計画..."
                  rows={3}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg resize-none"
                />
              </div>

              {/* 担当者・期限 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    担当者ID
                  </label>
                  <input
                    type="text"
                    value={ownerUserId}
                    onChange={(e) => setOwnerUserId(e.target.value)}
                    placeholder="例：user_001"
                    className="w-full px-3 py-2 border border-zinc-200 rounded-lg"
                  />
                </div>
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
              </div>
            </CardContent>
          </Card>

          {/* 送信ボタン */}
          <div className="flex justify-end gap-3">
            <Link
              href="/dashboard/corrective-actions"
              className="px-4 py-2 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors"
            >
              キャンセル
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? '作成中...' : '是正措置を作成'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
