'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import {
  Home, FileText, BarChart3, Trophy, Settings, LogOut,
  Clock, Users, ClipboardList, Lightbulb, Star, Shield,
  ChevronDown, ChevronRight, Building2, Megaphone, UserPlus,
  Brain, Briefcase, Activity, Bot, FolderOpen,
  PanelLeftClose, PanelLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { isAiVpOwner } from '@/lib/auth';
import { LAUNCH_MODE } from '@/config/launchMode';
import { filterNavItems, isModuleEnabled } from '@/config/featureGate';

interface NavGroup {
  label: string;
  items: { href: string; label: string; icon: React.ElementType; requireAdmin?: boolean }[];
}

export function DesktopSidebar() {
  const { user, isLeaderOrAbove, isAdmin, signOut } = useAuth();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [adminOpen, setAdminOpen] = useState(true);

  if (!user) return null;

  const homeItem = LAUNCH_MODE
    ? { href: '/launch', label: 'ホーム', icon: Home }
    : { href: '/dashboard', label: 'ホーム', icon: Home };

  // メイングループ
  const mainItems = filterNavItems([
    homeItem,
    { href: '/submit', label: '報告', icon: FileText },
    { href: '/improvements', label: '改善', icon: Lightbulb },
    { href: '/rankings', label: 'ランキング', icon: Trophy },
  ]);

  // 業務グループ
  const workItems = filterNavItems([
    { href: '/attendance', label: '打刻', icon: Clock },
    { href: '/dashboard/approvals', label: '承認・稟議', icon: ClipboardList },
    { href: '/dashboard/docs', label: 'ドキュメント', icon: FolderOpen },
  ]);

  // 営業・入居グループ
  const salesItems = filterNavItems([
    { href: '/dashboard/prospects', label: '入居希望', icon: UserPlus },
    { href: '/sales', label: '営業', icon: Briefcase },
    { href: '/dashboard/vacancy', label: '空室管理', icon: Building2 },
    { href: '/dashboard/os', label: '経営OS', icon: Activity },
  ]);

  // 管理グループ
  const allAdminItems = [
    { href: '/admin/incidents', label: '報告管理', icon: BarChart3 },
    { href: '/admin/attendance/dashboard', label: '勤怠管理', icon: Clock },
    { href: '/dashboard/admin/ringi', label: '稟議管理', icon: ClipboardList },
    { href: '/admin/improvements', label: '改善管理', icon: Lightbulb },
    { href: '/admin/insights', label: '連携提案', icon: Megaphone },
    { href: '/admin/points', label: 'ポイント', icon: Star, requireAdmin: true },
    { href: '/admin/users', label: '権限管理', icon: Shield, requireAdmin: true },
    { href: '/admin/employees', label: '従業員', icon: Users, requireAdmin: true },
    { href: '/admin/settings', label: '設定', icon: Settings, requireAdmin: true },
  ];
  const adminItems = filterNavItems(allAdminItems).filter(
    (item) => !('requireAdmin' in item && item.requireAdmin) || isAdmin
  );

  const navGroups: NavGroup[] = [
    { label: 'メイン', items: mainItems },
    { label: '業務', items: workItems },
    { label: '営業・施設', items: salesItems },
  ];

  const isActive = (href: string) => {
    if (href === '/dashboard' || href === '/launch') return pathname === href;
    return pathname.startsWith(href);
  };

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col bg-white border-r border-zinc-200/80 h-[calc(100vh-56px)] sticky top-14 transition-all duration-200 ease-out shrink-0',
        collapsed ? 'w-16' : 'w-56'
      )}
    >
      {/* Collapse Toggle */}
      <div className="flex items-center justify-end px-2 pt-2">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
          title={collapsed ? 'メニューを展開' : 'メニューを折りたたむ'}
        >
          {collapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      {/* Nav Groups */}
      <nav className="flex-1 overflow-y-auto px-2 pb-4 space-y-5">
        {navGroups.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="px-3 mb-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg transition-colors relative group',
                      collapsed ? 'justify-center px-0 py-2.5 mx-1' : 'px-3 py-2',
                      active
                        ? 'bg-zinc-900 text-white'
                        : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
                    )}
                  >
                    <Icon className={cn('shrink-0', collapsed ? 'w-5 h-5' : 'w-4 h-4')} />
                    {!collapsed && (
                      <span className="text-[13px] font-medium truncate">{item.label}</span>
                    )}
                    {/* Tooltip on collapsed */}
                    {collapsed && (
                      <span className="absolute left-full ml-2 px-2 py-1 bg-zinc-800 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
                        {item.label}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        {/* AI VP */}
        {isModuleEnabled('ai-vp') && isAiVpOwner(user?.email) && (
          <div>
            {!collapsed && (
              <p className="px-3 mb-1 text-[10px] font-semibold text-indigo-400 uppercase tracking-wider">
                AI
              </p>
            )}
            <div className="space-y-0.5">
              <Link
                href="/dashboard/ai/inbox"
                title={collapsed ? 'AI受信箱' : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg transition-colors relative group',
                  collapsed ? 'justify-center px-0 py-2.5 mx-1' : 'px-3 py-2',
                  pathname.startsWith('/dashboard/ai')
                    ? 'bg-indigo-600 text-white'
                    : 'text-indigo-600 hover:bg-indigo-50'
                )}
              >
                <Bot className={cn('shrink-0', collapsed ? 'w-5 h-5' : 'w-4 h-4')} />
                {!collapsed && <span className="text-[13px] font-medium">AI受信箱</span>}
                {collapsed && (
                  <span className="absolute left-full ml-2 px-2 py-1 bg-zinc-800 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
                    AI受信箱
                  </span>
                )}
              </Link>
              <Link
                href="/admin/ai-vp"
                title={collapsed ? 'AI抽出' : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg transition-colors relative group',
                  collapsed ? 'justify-center px-0 py-2.5 mx-1' : 'px-3 py-2',
                  pathname.startsWith('/admin/ai-vp')
                    ? 'bg-purple-600 text-white'
                    : 'text-purple-600 hover:bg-purple-50'
                )}
              >
                <Brain className={cn('shrink-0', collapsed ? 'w-5 h-5' : 'w-4 h-4')} />
                {!collapsed && <span className="text-[13px] font-medium">AI抽出</span>}
                {collapsed && (
                  <span className="absolute left-full ml-2 px-2 py-1 bg-zinc-800 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
                    AI抽出
                  </span>
                )}
              </Link>
            </div>
          </div>
        )}

        {/* Admin */}
        {isLeaderOrAbove && adminItems.length > 0 && (
          <div>
            {!collapsed ? (
              <button
                onClick={() => setAdminOpen(!adminOpen)}
                className="w-full flex items-center justify-between px-3 mb-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider hover:text-zinc-600 transition-colors"
              >
                <span>管理</span>
                {adminOpen ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
              </button>
            ) : (
              <div className="border-t border-zinc-200 mx-3 my-2" />
            )}
            {(collapsed || adminOpen) && (
              <div className="space-y-0.5">
                {adminItems.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg transition-colors relative group',
                        collapsed ? 'justify-center px-0 py-2.5 mx-1' : 'px-3 py-2',
                        active
                          ? 'bg-zinc-900 text-white'
                          : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900'
                      )}
                    >
                      <Icon className={cn('shrink-0', collapsed ? 'w-5 h-5' : 'w-4 h-4')} />
                      {!collapsed && (
                        <span className="text-[13px] font-medium truncate">{item.label}</span>
                      )}
                      {collapsed && (
                        <span className="absolute left-full ml-2 px-2 py-1 bg-zinc-800 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
                          {item.label}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </nav>

      {/* User Footer */}
      <div className="border-t border-zinc-200/80 p-2">
        {collapsed ? (
          <button
            onClick={handleSignOut}
            title="ログアウト"
            className="w-full flex items-center justify-center py-2.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-5 h-5" />
          </button>
        ) : (
          <div className="flex items-center gap-2 px-2 py-1.5">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.name}
                className="w-8 h-8 rounded-lg object-cover shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-zinc-900 flex items-center justify-center text-white text-xs font-medium shrink-0">
                {user.name.charAt(0)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-zinc-900 truncate">{user.name}</p>
              <p className="text-[10px] text-zinc-400 truncate">{user.email}</p>
            </div>
            <button
              onClick={handleSignOut}
              title="ログアウト"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
