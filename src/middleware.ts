/**
 * Next.js Middleware
 *
 * Ticket 093: 初回ログイン時の電子契約完了ゲート
 *
 * - staff/leader ユーザーはオンボーディング完了までダッシュボードにアクセスできない
 * - /onboarding/* と /api/onboarding/* は例外
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * オンボーディングゲートの保護対象パス
 */
const PROTECTED_PATHS = [
  '/dashboard',
  '/admin',
  '/api/admin',
];

/**
 * オンボーディングゲートの例外パス
 */
const EXEMPT_PATHS = [
  '/onboarding',
  '/api/onboarding',
  '/logout',
  '/login',
  '/auth',
  '/_next',
  '/favicon.ico',
  '/vacancies',  // 公開ページ
  '/api/vacancies', // 公開API
  '/api/public',  // 公開API
];

/**
 * パスが保護対象かチェック
 */
function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some((path) => pathname.startsWith(path));
}

/**
 * パスが例外かチェック
 */
function isExemptPath(pathname: string): boolean {
  return EXEMPT_PATHS.some((path) => pathname.startsWith(path));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 例外パスはスキップ
  if (isExemptPath(pathname)) {
    return NextResponse.next();
  }

  // 保護対象パスでなければスキップ
  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  // オンボーディング完了状態をクッキーから取得
  // Note: 実際のオンボーディング判定はサーバーサイドで行い、
  //       結果をクッキーに保存する設計
  const onboardingComplete = request.cookies.get('onboarding_complete')?.value;

  // 開発モード：ヘッダーでスキップ可能
  const skipOnboarding = request.headers.get('x-skip-onboarding');
  if (skipOnboarding === 'true') {
    return NextResponse.next();
  }

  // ロールをヘッダーから取得（開発用）
  const userRole = request.headers.get('x-user-role') || 'admin';

  // manager以上はオンボーディング免除
  if (['admin', 'executive', 'manager', 'auditor'].includes(userRole)) {
    return NextResponse.next();
  }

  // staff/leader でオンボーディング未完了の場合はリダイレクト
  if (onboardingComplete !== 'true') {
    // APIの場合は403を返す
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'オンボーディングが完了していません', code: 'ONBOARDING_REQUIRED' },
        { status: 403 }
      );
    }

    // ページの場合はリダイレクト
    const url = request.nextUrl.clone();
    url.pathname = '/onboarding';
    return NextResponse.redirect(url);
  }

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
