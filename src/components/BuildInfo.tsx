'use client';

/**
 * BuildInfo - デプロイ確認用ビルド情報表示
 *
 * Build SHA とビルド時刻を表示する
 * /api/version のクライアント版
 */

const BUILD_SHA =
  process.env.NEXT_PUBLIC_GIT_SHA || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || 'local';

const BUILT_AT =
  process.env.NEXT_PUBLIC_BUILD_TIME || '';

export function BuildInfo() {
  const short = BUILD_SHA.slice(0, 7);

  return (
    <div className="mt-6 text-center">
      <p className="text-[10px] text-zinc-300 font-mono select-all">
        Build {short}
        {BUILT_AT && ` · ${BUILT_AT}`}
      </p>
    </div>
  );
}
