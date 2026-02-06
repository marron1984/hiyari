'use client';

/**
 * 退社済みユーザー向けページ
 *
 * Ticket 110: HR 入退社基盤
 *
 * terminated のユーザーがアクセスしようとした時に表示されるページ
 */

import Link from 'next/link';

export default function TerminatedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="max-w-md w-full mx-4 p-8 bg-white rounded-lg shadow-md text-center">
        <div className="mb-6">
          <div className="w-16 h-16 mx-auto bg-gray-200 rounded-full flex items-center justify-center">
            <svg
              className="w-8 h-8 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
        </div>

        <h1 className="text-xl font-bold text-gray-900 mb-2">
          アクセスが制限されています
        </h1>

        <p className="text-gray-600 mb-6">
          退社処理が完了しているため、このシステムにアクセスすることはできません。
        </p>

        <p className="text-sm text-gray-500 mb-6">
          ご不明な点がございましたら、管理者にお問い合わせください。
        </p>

        <div className="space-y-3">
          <Link
            href="/login"
            className="block w-full px-4 py-2 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-lg"
          >
            別のアカウントでログイン
          </Link>
          <button
            onClick={() => {
              // ログアウト処理（実際の実装ではセッションクリアなど）
              window.location.href = '/login';
            }}
            className="block w-full px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
          >
            ログアウト
          </button>
        </div>
      </div>
    </div>
  );
}
