'use client';

/**
 * 文書署名ページ
 *
 * Ticket 093: 初回ログイン時の電子契約完了ゲート
 *
 * 署名確認と実行
 */

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { UserRequiredItem } from '@/lib/onboarding/types';

interface PageProps {
  params: Promise<{ documentVersionId: string }>;
}

export default function SignDocumentPage({ params }: PageProps) {
  const { documentVersionId } = use(params);
  const router = useRouter();

  const [document, setDocument] = useState<UserRequiredItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    subjectName: '',
    confirmed: false,
  });

  useEffect(() => {
    fetchDocument();
  }, [documentVersionId]);

  const fetchDocument = async () => {
    try {
      const res = await fetch('/api/onboarding/status');
      if (!res.ok) {
        throw new Error('オンボーディング情報の取得に失敗しました');
      }
      const data = await res.json();
      const item = data.onboarding?.requiredItems?.find(
        (i: UserRequiredItem) => i.documentVersionId === documentVersionId
      );

      if (!item) {
        setError('対象の文書が見つかりません');
      } else if (item.status === 'signed') {
        // 既に署名済み
        router.push('/onboarding/contracts');
      } else {
        setDocument(item);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラー');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.subjectName.trim()) {
      setError('署名者名を入力してください');
      return;
    }

    if (!formData.confirmed) {
      setError('内容を確認し、チェックを入れてください');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/onboarding/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: document?.documentId,
          documentVersionId,
          subjectName: formData.subjectName.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '署名に失敗しました');
      }

      // 成功 - 一覧に戻る
      router.push('/onboarding/contracts');
    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラー');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="text-zinc-500">読み込み中...</div>
      </div>
    );
  }

  if (error && !document) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-sm p-8 max-w-md">
          <h1 className="text-xl font-semibold text-red-600 mb-4">エラー</h1>
          <p className="text-zinc-600 mb-6">{error}</p>
          <Link
            href="/onboarding/contracts"
            className="text-blue-600 hover:underline"
          >
            戻る
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 py-12">
      <div className="max-w-2xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-sm p-8">
          <div className="mb-6">
            <Link
              href="/onboarding/contracts"
              className="text-zinc-500 hover:text-zinc-700 text-sm"
            >
              ← 一覧に戻る
            </Link>
          </div>

          <h1 className="text-2xl font-bold text-zinc-900 mb-2">
            {document?.title}
          </h1>
          <p className="text-zinc-600 mb-8">
            以下の内容を確認し、署名を行ってください。
          </p>

          {/* 文書プレビュー（デモ用） */}
          <div className="border border-zinc-200 rounded-lg p-6 mb-8 bg-zinc-50">
            <h2 className="text-lg font-semibold mb-4">{document?.title}</h2>
            <div className="text-sm text-zinc-600 space-y-4">
              <p>
                本書面は、貴殿と当社との間で締結される契約の内容を定めるものです。
              </p>
              <p>
                署名をもって、以下の事項に同意したものとみなします：
              </p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>就業規則の遵守</li>
                <li>機密情報の保護</li>
                <li>業務上知り得た情報の秘密保持</li>
                <li>利益相反行為の禁止</li>
              </ul>
              <p className="text-zinc-400 italic">
                ※ これはデモ用のプレビューです。実際の文書内容は別途提供されます。
              </p>
            </div>
          </div>

          {/* 署名フォーム */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                署名者名（フルネーム）
              </label>
              <input
                type="text"
                value={formData.subjectName}
                onChange={(e) =>
                  setFormData({ ...formData, subjectName: e.target.value })
                }
                className="w-full border border-zinc-300 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="山田 太郎"
                required
              />
            </div>

            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="confirmed"
                checked={formData.confirmed}
                onChange={(e) =>
                  setFormData({ ...formData, confirmed: e.target.checked })
                }
                className="mt-1"
              />
              <label htmlFor="confirmed" className="text-sm text-zinc-700">
                上記の内容を確認し、同意の上で署名します。
              </label>
            </div>

            {error && (
              <div className="text-red-600 text-sm">{error}</div>
            )}

            <div className="flex gap-4">
              <Link
                href="/onboarding/contracts"
                className="flex-1 text-center border border-zinc-300 text-zinc-700 px-4 py-2 rounded-md hover:bg-zinc-50"
              >
                キャンセル
              </Link>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? '処理中...' : '署名する'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
