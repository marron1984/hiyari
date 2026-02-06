'use client';

/**
 * 文書署名ページ
 *
 * Ticket 093: 初回ログイン時の電子契約完了ゲート
 * Ticket 096: 契約改訂時の差分表示
 *
 * 署名確認と実行、改訂時は差分を表示
 */

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { UserRequiredItem } from '@/lib/onboarding/types';

interface PageProps {
  params: Promise<{ documentVersionId: string }>;
}

interface DiffData {
  hasPreviousVersion: boolean;
  currentVersion: {
    id: string;
    title: string;
    content: string;
    version: number;
  } | null;
  previousVersion: {
    id: string;
    title: string;
    content: string;
    version: number;
  } | null;
  diff: {
    summary: string[];
    stats: {
      addedLines: number;
      removedLines: number;
      addedSections: number;
      modifiedSections: number;
    };
    hasChanges: boolean;
  } | null;
}

export default function SignDocumentPage({ params }: PageProps) {
  const { documentVersionId } = use(params);
  const router = useRouter();

  const [document, setDocument] = useState<UserRequiredItem | null>(null);
  const [diffData, setDiffData] = useState<DiffData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // UIステート
  const [showDiffDetails, setShowDiffDetails] = useState(false);
  const [showFullContent, setShowFullContent] = useState(false);

  const [formData, setFormData] = useState({
    subjectName: '',
    confirmed: false,
    diffReviewed: false, // 差分確認済みチェック
  });

  useEffect(() => {
    fetchDocument();
    fetchDiff();
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

  const fetchDiff = async () => {
    try {
      const res = await fetch(`/api/onboarding/diff?documentVersionId=${documentVersionId}`);
      if (res.ok) {
        const data = await res.json();
        setDiffData(data);
      }
    } catch (err) {
      console.error('差分の取得に失敗:', err);
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

    // 差分がある場合は差分確認が必要
    if (diffData?.hasPreviousVersion && diffData.diff?.hasChanges && !formData.diffReviewed) {
      setError('変更点を確認し、チェックを入れてください');
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

  const hasDiff = diffData?.hasPreviousVersion && diffData.diff?.hasChanges;

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

          {/* バージョン情報 */}
          {diffData?.currentVersion && (
            <p className="text-sm text-zinc-500 mb-4">
              バージョン: v{diffData.currentVersion.version}
              {diffData.previousVersion && (
                <span className="ml-2 text-amber-600">
                  (v{diffData.previousVersion.version} から改訂)
                </span>
              )}
            </p>
          )}

          <p className="text-zinc-600 mb-8">
            以下の内容を確認し、署名を行ってください。
          </p>

          {/* Ticket 096: 変更点セクション */}
          {hasDiff && (
            <div className="border border-amber-200 rounded-lg p-4 mb-6 bg-amber-50">
              <h2 className="text-lg font-semibold text-amber-800 mb-3">
                前回からの変更点
              </h2>

              {/* 変更サマリー */}
              <div className="mb-4">
                <ul className="space-y-1">
                  {diffData.diff?.summary.map((item, idx) => (
                    <li key={idx} className="text-sm text-amber-900">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* 統計 */}
              <div className="flex gap-4 text-xs text-amber-700 mb-4">
                {(diffData.diff?.stats.addedSections ?? 0) > 0 && (
                  <span>{diffData.diff?.stats.addedSections}セクション追加</span>
                )}
                {(diffData.diff?.stats.modifiedSections ?? 0) > 0 && (
                  <span>{diffData.diff?.stats.modifiedSections}セクション変更</span>
                )}
                <span>{diffData.diff?.stats.addedLines}行追加</span>
                <span>{diffData.diff?.stats.removedLines}行削除</span>
              </div>

              {/* 詳細表示トグル */}
              <button
                type="button"
                onClick={() => setShowDiffDetails(!showDiffDetails)}
                className="text-sm text-amber-700 hover:text-amber-900 underline"
              >
                {showDiffDetails ? '詳細を閉じる' : '詳細を表示'}
              </button>

              {/* 詳細差分 */}
              {showDiffDetails && diffData.currentVersion && diffData.previousVersion && (
                <div className="mt-4 border-t border-amber-200 pt-4">
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <h4 className="font-medium text-amber-800 mb-2">
                        旧版 (v{diffData.previousVersion.version})
                      </h4>
                      <div className="bg-white border border-amber-200 rounded p-3 max-h-60 overflow-y-auto">
                        <pre className="whitespace-pre-wrap text-zinc-600">
                          {diffData.previousVersion.content}
                        </pre>
                      </div>
                    </div>
                    <div>
                      <h4 className="font-medium text-amber-800 mb-2">
                        新版 (v{diffData.currentVersion.version})
                      </h4>
                      <div className="bg-white border border-amber-200 rounded p-3 max-h-60 overflow-y-auto">
                        <pre className="whitespace-pre-wrap text-zinc-600">
                          {diffData.currentVersion.content}
                        </pre>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 文書プレビュー */}
          <div className="border border-zinc-200 rounded-lg p-6 mb-8 bg-zinc-50">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">{document?.title}</h2>
              {diffData?.currentVersion?.content && (
                <button
                  type="button"
                  onClick={() => setShowFullContent(!showFullContent)}
                  className="text-sm text-blue-600 hover:underline"
                >
                  {showFullContent ? '折りたたむ' : '全文を表示'}
                </button>
              )}
            </div>

            {diffData?.currentVersion?.content ? (
              <div className={`text-sm text-zinc-600 ${showFullContent ? '' : 'max-h-48 overflow-hidden'}`}>
                <pre className="whitespace-pre-wrap font-sans">
                  {diffData.currentVersion.content}
                </pre>
              </div>
            ) : (
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
            )}

            {!showFullContent && diffData?.currentVersion?.content && (
              <div className="mt-2 text-center text-sm text-zinc-400">
                ... 続きを見るには「全文を表示」をクリック
              </div>
            )}
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

            {/* 差分確認チェック（差分がある場合のみ） */}
            {hasDiff && (
              <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <input
                  type="checkbox"
                  id="diffReviewed"
                  checked={formData.diffReviewed}
                  onChange={(e) =>
                    setFormData({ ...formData, diffReviewed: e.target.checked })
                  }
                  className="mt-1"
                />
                <label htmlFor="diffReviewed" className="text-sm text-amber-900">
                  上記の変更点を確認しました。
                </label>
              </div>
            )}

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
