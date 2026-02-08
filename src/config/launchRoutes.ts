/**
 * Launch Mode 公開ルート定義
 *
 * 先行カットオーバーで公開する4機能:
 * 1. 入居希望 (Prospects)
 * 2. 空室 (Vacancies)
 * 3. 打刻 (Attendance)
 * 4. 承認 (Approvals/Ringi)
 */

/**
 * 常に許可するルート（認証・静的アセット等）
 */
export const ALWAYS_ALLOWED_ROUTES = [
  // 認証関連
  '/login',
  '/api/auth',
  '/terminated',
  '/onboarding',

  // Launch Mode 専用
  '/launch',
  '/coming-soon',

  // 静的アセット・システム
  '/_next',
  '/favicon.ico',
  '/api/health',
  '/api/version',
  '/api/admin/bootstrap',
];

/**
 * Launch Mode で許可するルート（4機能）
 */
export const LAUNCH_ALLOWED_ROUTES = [
  // ホーム（Launch Mode用ダッシュボード）
  '/dashboard',

  // 入居希望 (Prospects)
  '/dashboard/prospects',

  // 空室 (Vacancies)
  '/dashboard/vacancy',
  '/dashboard/vacancies',
  '/dashboard/vacancy-inquiries',
  '/vacancies',

  // 打刻 (Attendance)
  '/attendance',
  '/admin/attendance',

  // 承認 (Approvals/Ringi)
  '/dashboard/approvals',
  '/ringi',
  '/dashboard/admin/ringi',
  '/admin/ringi',

  // 通知設定（共通機能）
  '/settings/notifications',

  // API エンドポイント（機能に必要なもの）
  '/api/prospects',
  '/api/vacancies',
  '/api/vacancy',
  '/api/attendance',
  '/api/approvals',
  '/api/ringi',
  '/api/tickets',
  '/api/users',
  '/api/notifications',
  '/api/business-units',
];

/**
 * パスが Launch Mode で許可されているか判定
 */
export function isAllowedInLaunchMode(pathname: string): boolean {
  // 常に許可するルート
  for (const route of ALWAYS_ALLOWED_ROUTES) {
    if (pathname === route || pathname.startsWith(route + '/') || pathname.startsWith(route)) {
      return true;
    }
  }

  // Launch Mode 許可ルート
  for (const route of LAUNCH_ALLOWED_ROUTES) {
    if (pathname === route || pathname.startsWith(route + '/') || pathname.startsWith(route + '?')) {
      return true;
    }
  }

  // API は基本的に許可（UI側で制御）
  if (pathname.startsWith('/api/')) {
    return true;
  }

  return false;
}

/**
 * Launch Mode のナビゲーション項目
 */
export interface LaunchNavItem {
  label: string;
  labelEn: string;
  href: string;
  icon: string;
  description: string;
}

export const LAUNCH_NAV_ITEMS: LaunchNavItem[] = [
  {
    label: '入居希望',
    labelEn: 'Prospects',
    href: '/dashboard/prospects',
    icon: 'Users',
    description: '入居希望者の管理',
  },
  {
    label: '空室',
    labelEn: 'Vacancies',
    href: '/dashboard/vacancy',
    icon: 'Building2',
    description: '空室状況の確認',
  },
  {
    label: '打刻',
    labelEn: 'Attendance',
    href: '/attendance',
    icon: 'Clock',
    description: '出退勤の記録',
  },
  {
    label: '承認',
    labelEn: 'Approvals',
    href: '/dashboard/approvals',
    icon: 'CheckCircle',
    description: '申請の承認',
  },
];
