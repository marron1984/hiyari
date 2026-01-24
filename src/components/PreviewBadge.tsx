'use client';

/**
 * Preview環境バッジコンポーネント
 * APP_ENV=preview の場合に画面上部に小さなバッジを表示
 * Preview環境では外部副作用（LINE WORKS送信、Webhook送信等）が無効化されていることを示す
 */
export function PreviewBadge() {
  // APP_ENVがpreviewの場合、または環境変数が設定されていない場合に表示
  const isPreview = process.env.NEXT_PUBLIC_APP_ENV === 'preview' ||
    (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app'));

  if (!isPreview) return null;

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50">
      <div className="bg-orange-500 text-white text-xs font-medium px-3 py-1 rounded-full shadow-lg">
        Preview環境
      </div>
    </div>
  );
}
