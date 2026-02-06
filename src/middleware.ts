/**
 * Next.js Middleware
 *
 * Note: オンボーディングゲートは Edge Runtime 制約のため
 * /app/dashboard/layout.tsx の OnboardingGuard で実装
 *
 * このファイルは将来の拡張用に残しておく
 * 例: CSRFトークン検証、レート制限、etc.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(_request: NextRequest) {
  // 現在は特別な処理なし
  // オンボーディングゲートは OnboardingGuard コンポーネントで処理
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
