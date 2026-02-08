'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ja">
      <body className="font-sans antialiased bg-gray-50">
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
            <h2 className="text-2xl font-bold text-slate-800 mb-4">
              エラーが発生しました
            </h2>
            <p className="text-slate-600 mb-6">
              予期しないエラーが発生しました。再試行してください。
            </p>
            <button
              onClick={() => reset()}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              再試行
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
