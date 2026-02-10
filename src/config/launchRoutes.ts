/**
 * Launch Mode 公開ルート定義
 *
 * 全11モジュール公開:
 * 1. 入居希望 (Prospects)    2. 空室 (Vacancies)
 * 3. 打刻 (Attendance)       4. 承認 (Approvals/Ringi)
 * 5. 報告 (Incidents)        6. 改善 (Improvements)
 * 7. ランキング (Rankings)    8. ドキュメント (Documents)
 * 9. 営業 (Sales)            10. 経営OS (Management OS)
 * 11. AI副社長 (AI VP)
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
 * Launch Mode で許可するルート（全11機能）
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

  // 報告 (Incidents)
  '/submit',
  '/incident',
  '/admin/incidents',

  // 改善 (Improvements)
  '/improvements',
  '/admin/improvements',

  // ランキング (Rankings)
  '/rankings',

  // ドキュメント (Documents)
  '/dashboard/docs',

  // 営業 (Sales)
  '/sales',

  // 経営OS (Management OS)
  '/dashboard/os',

  // AI副社長 (AI VP)
  '/dashboard/ai',
  '/admin/ai-vp',

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
  '/api/documents',
  '/api/incidents',
  '/api/sales',
  '/api/os',
  '/api/ai-vp',
  '/api/ai',
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
  {
    label: '報告',
    labelEn: 'Incidents',
    href: '/submit',
    icon: 'FileText',
    description: 'ヒヤリハット報告',
  },
  {
    label: '改善',
    labelEn: 'Improvements',
    href: '/improvements',
    icon: 'Lightbulb',
    description: '改善提案の管理',
  },
  {
    label: 'ランキング',
    labelEn: 'Rankings',
    href: '/rankings',
    icon: 'Trophy',
    description: '報告ランキング',
  },
  {
    label: 'ドキュメント',
    labelEn: 'Documents',
    href: '/dashboard/docs',
    icon: 'FolderOpen',
    description: '書類管理',
  },
  {
    label: '営業',
    labelEn: 'Sales',
    href: '/sales',
    icon: 'Briefcase',
    description: '営業管理・案件追跡',
  },
  {
    label: '経営OS',
    labelEn: 'Management OS',
    href: '/dashboard/os',
    icon: 'Activity',
    description: 'コンディション管理',
  },
];
