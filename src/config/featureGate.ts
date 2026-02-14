/**
 * Feature Gate - モジュール単位の公開制御
 *
 * 各モジュールの有効/無効を一元管理する。
 * 本番オープン状態（LAUNCH_MODE=false）では全モジュール有効。
 * Launch Mode 有効時は LAUNCH_ENABLED リストで公開範囲を制御可能。
 * (AI副社長は isAiVpOwner で別途アクセス制御)
 */

import { LAUNCH_MODE } from './launchMode';

// ── モジュール定義 ──

export type ModuleId =
  | 'prospects'
  | 'vacancies'
  | 'attendance'
  | 'approvals'
  | 'incidents'
  | 'improvements'
  | 'rankings'
  | 'sales'
  | 'os'
  | 'ai-vp'
  | 'docs';

export interface ModuleConfig {
  id: ModuleId;
  label: string;
  labelEn: string;
  /** UI上のページルート（プレフィクス一致） */
  routes: string[];
  /** API ルート（プレフィクス一致） */
  apiRoutes: string[];
}

/**
 * 全モジュール定義（順序 = 表示順）
 */
export const ALL_MODULES: ModuleConfig[] = [
  {
    id: 'attendance',
    label: '打刻',
    labelEn: 'Attendance',
    routes: ['/attendance', '/admin/attendance'],
    apiRoutes: ['/api/attendance'],
  },
  {
    id: 'approvals',
    label: '承認',
    labelEn: 'Approvals',
    routes: ['/dashboard/approvals', '/ringi', '/dashboard/admin/ringi', '/admin/ringi', '/admin/approval-routes', '/requests', '/dashboard/applications', '/dashboard/approval-flow', '/dashboard/approval-log', '/dashboard/tickets', '/dashboard/repair-tickets'],
    apiRoutes: ['/api/approvals', '/api/ringi'],
  },
  {
    id: 'prospects',
    label: '入居希望',
    labelEn: 'Prospects',
    routes: ['/dashboard/prospects', '/admin/prospects', '/dashboard/residents', '/dashboard/family-contact', '/dashboard/key-person'],
    apiRoutes: ['/api/prospects', '/api/residents'],
  },
  {
    id: 'vacancies',
    label: '空室',
    labelEn: 'Vacancies',
    routes: ['/dashboard/vacancy', '/dashboard/vacancies', '/vacancies', '/dashboard/vacancy-inquiries', '/dashboard/vacancy-analytics', '/dashboard/receivables', '/dashboard/collection-flow'],
    apiRoutes: ['/api/vacancies', '/api/vacancy', '/api/admin/vacancies'],
  },
  {
    id: 'incidents',
    label: '報告',
    labelEn: 'Incidents',
    routes: ['/submit', '/admin/incidents', '/incident', '/dashboard/complaints', '/dashboard/corrective-actions', '/dashboard/quality-risk'],
    apiRoutes: ['/api/incidents'],
  },
  {
    id: 'improvements',
    label: '改善',
    labelEn: 'Improvements',
    routes: ['/improvements', '/admin/improvements'],
    apiRoutes: ['/api/improvements'],
  },
  {
    id: 'rankings',
    label: 'ランク',
    labelEn: 'Rankings',
    routes: ['/rankings'],
    apiRoutes: ['/api/rankings'],
  },
  {
    id: 'sales',
    label: '営業',
    labelEn: 'Sales',
    routes: ['/sales'],
    apiRoutes: ['/api/sales'],
  },
  {
    id: 'os',
    label: '経営OS',
    labelEn: 'Management OS',
    routes: ['/dashboard/os', '/dashboard/handover', '/dashboard/training', '/dashboard/announcements', '/dashboard/alerts', '/dashboard/executive-summary', '/dashboard/kpi', '/dashboard/wbr', '/dashboard/business-summary'],
    apiRoutes: ['/api/os'],
  },
  {
    id: 'ai-vp',
    label: 'AI副社長',
    labelEn: 'AI VP',
    routes: ['/dashboard/ai', '/dashboard/ai-vp', '/admin/ai-vp'],
    apiRoutes: ['/api/ai-vp', '/api/fukusha-ask'],
  },
  {
    id: 'docs',
    label: 'ドキュメント',
    labelEn: 'Documents',
    routes: ['/dashboard/docs', '/dashboard/knowledge', '/dashboard/consent', '/dashboard/e-sign', '/dashboard/read-status'],
    apiRoutes: ['/api/documents'],
  },
];

// ── Launch Mode で有効なモジュール ──

const LAUNCH_ENABLED: ModuleId[] = [
  'prospects',
  'vacancies',
  'attendance',
  'approvals',
  'incidents',
  'improvements',
  'rankings',
  'sales',
  'os',
  'ai-vp',
  'docs',
];

// ── 公開API ──

/**
 * 指定モジュールが有効かどうかを判定
 */
export function isModuleEnabled(moduleId: ModuleId): boolean {
  if (!LAUNCH_MODE) return true; // 通常モード: 全有効
  return LAUNCH_ENABLED.includes(moduleId);
}

/**
 * 有効なモジュール一覧を返す
 */
export function getEnabledModules(): ModuleConfig[] {
  return ALL_MODULES.filter((m) => isModuleEnabled(m.id));
}

/**
 * 無効なモジュール一覧を返す
 */
export function getDisabledModules(): ModuleConfig[] {
  return ALL_MODULES.filter((m) => !isModuleEnabled(m.id));
}

/**
 * パスがいずれかの有効モジュールに所属するか判定
 * (共通ルートは常に許可)
 */
export function isRouteEnabledByGate(pathname: string): boolean {
  if (!LAUNCH_MODE) return true;

  // 共通ルート（認証・設定・通知など）は常に許可
  const commonPrefixes = [
    '/login', '/api/auth', '/terminated', '/onboarding',
    '/launch', '/coming-soon', '/settings',
    '/_next', '/favicon', '/api/health', '/api/version',
    '/api/users', '/api/notifications', '/api/business-units',
    '/api/tickets', '/api/admin/bootstrap', '/api/dashboard',
    '/dashboard/notifications',
    '/admin/module-permissions', '/api/admin/module-permissions',
    '/admin/sync', '/api/admin/google-sheets', '/api/sync/google-sheets', '/api/cron/sync-sheets',
    '/admin/reports', '/api/admin/reports',
    '/dashboard/admin',
  ];
  for (const prefix of commonPrefixes) {
    if (pathname === prefix || pathname.startsWith(prefix + '/') || pathname.startsWith(prefix + '?')) {
      return true;
    }
  }

  // /dashboard 自体 (LaunchModeDashboard)
  if (pathname === '/dashboard' || pathname === '/dashboard/') {
    return true;
  }

  // 有効モジュールのルートチェック
  const enabled = getEnabledModules();
  for (const mod of enabled) {
    for (const route of mod.routes) {
      if (pathname === route || pathname.startsWith(route + '/') || pathname.startsWith(route + '?')) {
        return true;
      }
    }
    for (const api of mod.apiRoutes) {
      if (pathname === api || pathname.startsWith(api + '/') || pathname.startsWith(api + '?')) {
        return true;
      }
    }
  }

  // API は基本許可（UI側で制御）
  if (pathname.startsWith('/api/')) {
    return true;
  }

  return false;
}

/**
 * ナビゲーション項目フィルタ
 * href がいずれかの有効モジュールのルートに一致するものだけを通す
 */
export function filterNavItems<T extends { href: string }>(items: T[]): T[] {
  if (!LAUNCH_MODE) return items;
  return items.filter((item) => {
    // 共通ページ（ホーム・設定など）は常に表示
    if (item.href === '/dashboard' || item.href === '/launch' || item.href.startsWith('/settings')) {
      return true;
    }
    const enabled = getEnabledModules();
    return enabled.some((mod) =>
      mod.routes.some((route) => item.href === route || item.href.startsWith(route + '/'))
    );
  });
}
