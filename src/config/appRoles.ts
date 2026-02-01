/**
 * アプリケーションロール定義
 *
 * 役職・権限に応じた表示コンテンツとアクセス制御を管理
 */

export type AppRole =
  | 'admin'      // システム管理者
  | 'executive'  // 経営（社長/役員）
  | 'manager'    // 管理者（部門長・管理職）
  | 'leader'     // 現場リーダー
  | 'staff'      // 一般職員
  | 'auditor';   // 監査/閲覧専用

/**
 * ロールの表示名と説明
 */
export const ROLE_DISPLAY_INFO: Record<AppRole, { name: string; description: string; color: string }> = {
  admin: {
    name: 'システム管理者',
    description: '全機能へのアクセス権限を持つ管理者',
    color: 'bg-purple-100 text-purple-700',
  },
  executive: {
    name: '経営層',
    description: '経営ダッシュボード・意思決定支援機能',
    color: 'bg-indigo-100 text-indigo-700',
  },
  manager: {
    name: '管理職',
    description: '部門管理・人事・承認機能',
    color: 'bg-blue-100 text-blue-700',
  },
  leader: {
    name: '現場リーダー',
    description: 'チーム管理・日常業務支援機能',
    color: 'bg-green-100 text-green-700',
  },
  staff: {
    name: '一般職員',
    description: '日常業務・報告機能',
    color: 'bg-zinc-100 text-zinc-700',
  },
  auditor: {
    name: '監査',
    description: '閲覧専用・監査ログアクセス',
    color: 'bg-amber-100 text-amber-700',
  },
};

/**
 * メニュー項目の定義
 */
export type MenuItem = {
  id: string;
  label: string;
  href: string;
  icon?: string;
  badge?: string;
  children?: MenuItem[];
};

/**
 * ロール別メニュー可視性の定義
 */
export const MENU_VISIBILITY: Record<string, AppRole[]> = {
  // ダッシュボード系
  'dashboard': ['admin', 'executive', 'manager', 'leader', 'staff', 'auditor'],
  'dashboard/ai-vp': ['admin', 'executive', 'manager'],
  'dashboard/executive-summary': ['admin', 'executive'],
  'dashboard/wbr': ['admin', 'executive', 'manager'],
  'dashboard/alerts': ['admin', 'executive', 'manager', 'leader'],
  'dashboard/analytics': ['admin', 'executive', 'manager'],

  // 機能系
  'hiyari': ['admin', 'executive', 'manager', 'leader', 'staff'],
  'attendance': ['admin', 'manager', 'leader', 'staff'],
  'shifts': ['admin', 'manager', 'leader'],
  'documents': ['admin', 'executive', 'manager', 'leader', 'staff', 'auditor'],
  'approvals': ['admin', 'executive', 'manager', 'leader'],
  'notifications': ['admin', 'executive', 'manager', 'leader', 'staff'],

  // 管理系
  'admin/users': ['admin'],
  'admin/roles': ['admin'],
  'admin/shares': ['admin', 'executive'],
  'admin/audit-logs': ['admin', 'auditor'],
  'admin/settings': ['admin'],

  // ロードマップ・開発系
  'roadmap': ['admin', 'executive', 'manager'],
  'os-features': ['admin', 'executive'],
  'tickets': ['admin', 'executive', 'manager'],
};

/**
 * メニュー構造の定義
 */
export const MENU_STRUCTURE: MenuItem[] = [
  {
    id: 'dashboard',
    label: 'ダッシュボード',
    href: '/dashboard',
    icon: 'LayoutDashboard',
    children: [
      { id: 'dashboard/ai-vp', label: 'AI副社長', href: '/dashboard/ai-vp', icon: 'Bot' },
      { id: 'dashboard/executive-summary', label: '経営サマリー', href: '/dashboard/executive-summary', icon: 'FileText' },
      { id: 'dashboard/wbr', label: '週次レビュー', href: '/dashboard/wbr', icon: 'Calendar' },
      { id: 'dashboard/alerts', label: 'アラートセンター', href: '/dashboard/alerts', icon: 'Bell' },
      { id: 'dashboard/analytics', label: '分析', href: '/dashboard/analytics', icon: 'BarChart3' },
    ],
  },
  {
    id: 'operations',
    label: '業務',
    href: '#',
    icon: 'Briefcase',
    children: [
      { id: 'hiyari', label: 'ヒヤリハット', href: '/hiyari', icon: 'AlertTriangle' },
      { id: 'attendance', label: '勤怠管理', href: '/attendance', icon: 'Clock' },
      { id: 'shifts', label: 'シフト管理', href: '/shifts', icon: 'CalendarDays' },
      { id: 'documents', label: '文書管理', href: '/documents', icon: 'FileStack' },
      { id: 'approvals', label: '承認', href: '/approvals', icon: 'CheckSquare' },
      { id: 'notifications', label: '通知', href: '/notifications', icon: 'MessageSquare' },
    ],
  },
  {
    id: 'planning',
    label: '計画・開発',
    href: '#',
    icon: 'Map',
    children: [
      { id: 'roadmap', label: 'ロードマップ', href: '/roadmap', icon: 'Route' },
      { id: 'os-features', label: 'OS機能一覧', href: '/os-features', icon: 'Layers' },
      { id: 'tickets', label: 'チケット', href: '/tickets', icon: 'Ticket' },
    ],
  },
  {
    id: 'admin',
    label: '管理',
    href: '#',
    icon: 'Settings',
    children: [
      { id: 'admin/users', label: 'ユーザー管理', href: '/admin/users', icon: 'Users' },
      { id: 'admin/roles', label: 'ロール管理', href: '/admin/roles', icon: 'Shield' },
      { id: 'admin/shares', label: '外部共有', href: '/admin/shares', icon: 'Share2' },
      { id: 'admin/audit-logs', label: '監査ログ', href: '/admin/audit-logs', icon: 'ScrollText' },
      { id: 'admin/settings', label: 'システム設定', href: '/admin/settings', icon: 'Cog' },
    ],
  },
];

/**
 * ロールに基づいてメニュー項目が表示可能かチェック
 */
export function isMenuVisible(menuId: string, role: AppRole): boolean {
  const allowedRoles = MENU_VISIBILITY[menuId];
  if (!allowedRoles) {
    // 定義がない場合はadminのみ
    return role === 'admin';
  }
  return allowedRoles.includes(role);
}

/**
 * ロールに基づいてフィルタリングされたメニューを取得
 */
export function getFilteredMenu(role: AppRole): MenuItem[] {
  const result: MenuItem[] = [];

  for (const item of MENU_STRUCTURE) {
    // 親メニュー自体の可視性チェック
    const visibleChildren = item.children?.filter((child) => isMenuVisible(child.id, role)) ?? [];

    // 子メニューがすべて非表示なら親も非表示
    if (item.children && visibleChildren.length === 0) {
      continue;
    }

    // 親メニュー自体の可視性もチェック
    if (MENU_VISIBILITY[item.id] && !isMenuVisible(item.id, role)) {
      continue;
    }

    result.push({
      ...item,
      children: visibleChildren.length > 0 ? visibleChildren : undefined,
    });
  }

  return result;
}

/**
 * ロール別のホームページ（デフォルト遷移先）
 */
export const ROLE_HOME_PAGE: Record<AppRole, string> = {
  admin: '/dashboard',
  executive: '/dashboard/executive-summary',
  manager: '/dashboard/ai-vp',
  leader: '/dashboard',
  staff: '/hiyari',
  auditor: '/admin/audit-logs',
};

/**
 * ロール別の機能制限
 */
export type FeaturePermission = {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
  canExport: boolean;
  canShare: boolean;
};

export const ROLE_PERMISSIONS: Record<AppRole, FeaturePermission> = {
  admin: {
    canCreate: true,
    canEdit: true,
    canDelete: true,
    canApprove: true,
    canExport: true,
    canShare: true,
  },
  executive: {
    canCreate: false,
    canEdit: false,
    canDelete: false,
    canApprove: true,
    canExport: true,
    canShare: true,
  },
  manager: {
    canCreate: true,
    canEdit: true,
    canDelete: false,
    canApprove: true,
    canExport: true,
    canShare: false,
  },
  leader: {
    canCreate: true,
    canEdit: true,
    canDelete: false,
    canApprove: false,
    canExport: true,
    canShare: false,
  },
  staff: {
    canCreate: true,
    canEdit: false,
    canDelete: false,
    canApprove: false,
    canExport: false,
    canShare: false,
  },
  auditor: {
    canCreate: false,
    canEdit: false,
    canDelete: false,
    canApprove: false,
    canExport: true,
    canShare: false,
  },
};

/**
 * 権限チェックヘルパー
 */
export function hasPermission(role: AppRole, permission: keyof FeaturePermission): boolean {
  return ROLE_PERMISSIONS[role][permission];
}
