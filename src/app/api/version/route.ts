import { NextResponse } from 'next/server';

/**
 * GET /api/version
 *
 * デプロイ確認用バージョンエンドポイント
 * Build SHA とビルド時刻を返す
 */

const BUILD_SHA =
  process.env.NEXT_PUBLIC_GIT_SHA ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  'local';

const BUILT_AT =
  process.env.NEXT_PUBLIC_BUILD_TIME || new Date().toISOString();

export async function GET() {
  return NextResponse.json(
    {
      sha: BUILD_SHA,
      short: BUILD_SHA.slice(0, 7),
      builtAt: BUILT_AT,
      env: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
      launchMode: process.env.NEXT_PUBLIC_LAUNCH_MODE === 'true',
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
}
