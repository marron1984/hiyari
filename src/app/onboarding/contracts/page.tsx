'use client';

/**
 * オンボーディング契約署名ページ
 *
 * Ticket 093: 初回ログイン時の電子契約完了ゲート
 *
 * 必須文書の一覧と署名状況を表示
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  REQUIRED_ITEM_STATUS_CONFIG,
  type UserOnboarding,
} from '@/lib/onboarding/types';
import { useApiFetch } from '@/hooks/useApiFetch';

export default function OnboardingContractsPage() {
  const apiFetch = useApiFetch();
  const [onboarding, setOnboarding] = useState<UserOnboarding | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOnboarding = useCallback(async () => {
    try {
      const res = await apiFetch('/api/onboarding/status');
      if (!res.ok) {
        throw new Error('オンボーディング情報の取得に失敗しました');
      }
      const data = await res.json();
      setOnboarding(data.onboarding);
    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラー');
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchOnboarding();
  }, [fetchOnboarding]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="text-zinc-500">読み込み中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-sm p-8 max-w-md">
          <h1 className="text-xl font-semibold text-red-600 mb-4">エラー</h1>
          <p className="text-zinc-600">{error}</p>
        </div>
      </div>
    );
  }

  // 完了済みの場合
  if (onboarding?.status === 'completed') {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-sm p-8 max-w-md text-center">
          <div className="text-4xl mb-4">✅</div>
          <h1 className="text-xl font-semibold text-green-700 mb-4">
            契約署名完了
          </h1>
          <p className="text-zinc-600 mb-6">
            すべての必須文書への署名が完了しました。
          </p>
          <Link
            href="/dashboard"
            className="inline-block bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700"
          >
            ダッシュボードへ
          </Link>
        </div>
      </div>
    );
  }

  // 必須文書がない場合
  if (!onboarding || onboarding.requiredItems.length === 0) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-sm p-8 max-w-md text-center">
          <h1 className="text-xl font-semibold text-zinc-900 mb-4">
            署名が必要な文書はありません
          </h1>
          <Link
            href="/dashboard"
            className="inline-block bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700"
          >
            ダッシュボードへ
          </Link>
        </div>
      </div>
    );
  }

  const pendingItems = onboarding.requiredItems.filter((i) => i.status === 'pending');
  const signedItems = onboarding.requiredItems.filter((i) => i.status === 'signed');

  return (
    <div className="min-h-screen bg-zinc-50 py-12">
      <div className="max-w-2xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-sm p-8">
          <h1 className="text-2xl font-bold text-zinc-900 mb-2">
            入社手続き - 契約署名
          </h1>
          <p className="text-zinc-600 mb-8">
            業務を開始する前に、以下の必須文書への署名をお願いします。
          </p>

          {/* 進捗表示 */}
          <div className="mb-8">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-zinc-600">署名進捗</span>
              <span className="font-medium">
                {signedItems.length} / {onboarding.requiredItems.length} 完了
              </span>
            </div>
            <div className="h-2 bg-zinc-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all"
                style={{
                  width: `${(signedItems.length / onboarding.requiredItems.length) * 100}%`,
                }}
              />
            </div>
          </div>

          {/* 未署名文書 */}
          {pendingItems.length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-zinc-900 mb-4">
                署名が必要な文書
              </h2>
              <div className="space-y-3">
                {pendingItems.map((item) => (
                  <div
                    key={item.documentVersionId}
                    className="flex items-center justify-between p-4 border border-amber-200 bg-amber-50 rounded-lg"
                  >
                    <div>
                      <div className="font-medium text-zinc-900">{item.title}</div>
                      <div className={`text-sm ${REQUIRED_ITEM_STATUS_CONFIG.pending.color}`}>
                        {REQUIRED_ITEM_STATUS_CONFIG.pending.label}
                      </div>
                    </div>
                    <Link
                      href={`/onboarding/contracts/sign/${item.documentVersionId}`}
                      className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700"
                    >
                      署名する
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 署名済み文書 */}
          {signedItems.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 mb-4">
                署名済みの文書
              </h2>
              <div className="space-y-3">
                {signedItems.map((item) => (
                  <div
                    key={item.documentVersionId}
                    className="flex items-center justify-between p-4 border border-green-200 bg-green-50 rounded-lg"
                  >
                    <div>
                      <div className="font-medium text-zinc-900">{item.title}</div>
                      <div className={`text-sm ${REQUIRED_ITEM_STATUS_CONFIG.signed.color}`}>
                        {REQUIRED_ITEM_STATUS_CONFIG.signed.label}
                        {item.signedAt && (
                          <span className="text-zinc-500 ml-2">
                            ({new Date(item.signedAt).toLocaleDateString('ja-JP')})
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-green-600 text-xl">✓</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
