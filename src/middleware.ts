import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isAllowedInLaunchMode } from '@/config/launchRoutes';

// ======== Launch Mode ========

const LAUNCH_MODE = process.env.NEXT_PUBLIC_LAUNCH_MODE === 'true';

// ======== セキュリティヘッダー ========

const securityHeaders = {
  // XSS防御
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  // Referrer Policy
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // HTTPS強制
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  // Permissions Policy（不要なブラウザ機能を制限）
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), interest-cohort=()',
};

// CSP（Content Security Policy）
// Firebase Auth, Firestore, Storage, Vercel Analytics 等を許可
const cspDirectives = [
  "default-src 'self'",
  // Firebase SDK, Google APIs, Vercel
  "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://apis.google.com https://*.firebaseio.com https://www.gstatic.com https://va.vercel-scripts.com",
  // スタイル（Tailwind等のインライン + Google Fonts）
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  // 画像（Firebase Storage, Google, data URI）
  "img-src 'self' data: blob: https://*.googleapis.com https://*.googleusercontent.com https://firebasestorage.googleapis.com",
  // フォント
  "font-src 'self' https://fonts.gstatic.com",
  // API接続先
  "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com https://firebasestorage.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://va.vercel-scripts.com wss://*.firebaseio.com",
  // フレーム（Firebase Auth popup用）
  "frame-src 'self' https://accounts.google.com https://*.firebaseapp.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];

const cspHeader = cspDirectives.join('; ');

// ======== レートリミット（インメモリ簡易版） ========

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// Edge Runtime はサーバーレスのため、この Map はインスタンス間で共有されない
// 本番での完全なレートリミットには Redis 等が必要だが、
// 基本的な防御として同一インスタンスへの連続リクエストを制限する
const rateLimitMap = new Map<string, RateLimitEntry>();

const RATE_LIMIT_WINDOW_MS = 60_000; // 1分
const RATE_LIMIT_MAX = 60; // 1分あたり最大60リクエスト
const RATE_LIMIT_CLEANUP_INTERVAL = 300_000; // 5分ごとにクリーンアップ
let lastCleanup = Date.now();

function cleanupRateLimitMap() {
  const now = Date.now();
  if (now - lastCleanup < RATE_LIMIT_CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of rateLimitMap) {
    if (entry.resetAt < now) {
      rateLimitMap.delete(key);
    }
  }
}

function checkRateLimit(identifier: string): { allowed: boolean; remaining: number } {
  cleanupRateLimitMap();
  const now = Date.now();
  const entry = rateLimitMap.get(identifier);

  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(identifier, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0 };
  }

  return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count };
}

// ======== Middleware ========

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 静的ファイル・Next.js内部パスはスキップ
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname.match(/\.(ico|svg|png|jpg|jpeg|gif|webp|css|js|woff2?)$/)
  ) {
    return NextResponse.next();
  }

  // ======== Launch Mode ルーティングブロック ========
  if (LAUNCH_MODE) {
    // /dashboard → /launch へ強制リダイレクト
    if (pathname === '/dashboard' || pathname === '/dashboard/') {
      const url = request.nextUrl.clone();
      url.pathname = '/launch';
      return NextResponse.redirect(url);
    }

    // 未公開ページは /coming-soon にリダイレクト
    if (!isAllowedInLaunchMode(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = '/coming-soon';
      return NextResponse.redirect(url);
    }
  }

  const response = NextResponse.next();

  // セキュリティヘッダーを設定
  for (const [key, value] of Object.entries(securityHeaders)) {
    response.headers.set(key, value);
  }

  // CSPヘッダーを設定
  response.headers.set('Content-Security-Policy', cspHeader);

  // API ルートへのレートリミット
  if (pathname.startsWith('/api/')) {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    const { allowed, remaining } = checkRateLimit(ip);

    response.headers.set('X-RateLimit-Limit', String(RATE_LIMIT_MAX));
    response.headers.set('X-RateLimit-Remaining', String(remaining));

    if (!allowed) {
      return new NextResponse(
        JSON.stringify({ error: 'Too Many Requests' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '60',
            ...securityHeaders,
          },
        }
      );
    }
  }

  return response;
}

export const config = {
  matcher: [
    // 全ページ + APIルートに適用（静的ファイル除外）
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
