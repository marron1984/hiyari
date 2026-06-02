'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Home, FileText, BarChart3, Trophy, Settings, LogOut, Clock, Users, ClipboardList, Lightbulb, Star, Shield, ChevronDown, Building2, Megaphone, UserPlus, Brain, Briefcase, Activity, Bot, Sparkles, FolderOpen } from 'lucide-react';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { RoleSwitcher } from '@/components/navigation/RoleSwitcher';
import { cn } from '@/lib/utils';
import { isAiVpOwner } from '@/lib/auth';
import { LAUNCH_MODE } from '@/config/launchMode';
import { filterNavItems, isModuleEnabled } from '@/config/featureGate';

export function Header() {
  const { user, isLeaderOrAbove, signOut } = useAuth();
  const pathname = usePathname();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const adminMenuRef = useRef<HTMLDivElement>(null);

  // 外側クリックでメニューを閉じる
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
      if (adminMenuRef.current && !adminMenuRef.current.contains(e.target as Node)) {
        setAdminMenuOpen(false);
      }
    }
    if (userMenuOpen || adminMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [userMenuOpen, adminMenuOpen]);

  if (!user) return null;

  // メニュー順序（確定版）
  // Launch Mode: /launch がホーム, 通常: /dashboard がホーム
  const homeItem = LAUNCH_MODE
    ? { href: '/launch', label: 'ホーム', icon: Home }
    : { href: '/dashboard', label: 'ホーム', icon: Home };

  // 全ナビゲーション定義 → featureGate でフィルタ
  const allNavItems = [
    homeItem,
    { href: '/attendance', label: '打刻', icon: Clock },
    { href: '/dashboard/approvals', label: '承認', icon: ClipboardList },
    { href: '/dashboard/prospects', label: '入居希望', icon: UserPlus },
    { href: '/sales', label: '営業', icon: Briefcase },
    { href: '/dashboard/vacancy', label: '空室', icon: Building2 },
    { href: '/improvements', label: '改善', icon: Lightbulb },
    { href: '/rankings', label: 'ランク', icon: Trophy },
    { href: '/dashboard/os', label: '経営OS', icon: Activity },
    { href: '/submit', label: '報告', icon: FileText },
    { href: '/dashboard/docs', label: 'ドキュメント', icon: FolderOpen },
  ];

  const allAdminItems = [
    { href: '/admin/incidents', label: '報告管理', icon: BarChart3 },
    { href: '/admin/attendance/dashboard', label: '勤怠管理', icon: Clock },
    { href: '/dashboard/admin/ringi', label: '稟議管理', icon: ClipboardList },
    { href: '/admin/improvements', label: '改善管理', icon: Lightbulb },
    { href: '/admin/insights', label: '連携提案', icon: Megaphone },
    { href: '/admin/points', label: 'ポイント', icon: Star },
    { href: '/admin/users', label: '権限管理', icon: Shield },
    { href: '/admin/employees', label: '従業員', icon: Users },
    { href: '/admin/settings', label: '設定', icon: Settings },
  ];

  // featureGate でフィルタ（Launch Mode = 有効モジュールのみ、通常 = 全表示）
  const navItems = filterNavItems(allNavItems);
  const adminItems = filterNavItems(allAdminItems);

  const handleSignOut = async () => {
    await signOut();
    setUserMenuOpen(false);
  };

  const isAdminActive = pathname.startsWith('/admin');

  return (
    <header className="bg-white/80 backdrop-blur-lg border-b border-zinc-100 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex justify-between h-14">
          {/* Logo */}
          <div className="flex items-center">
            <Link href="/dashboard" className="flex items-center">
              <span className="text-lg font-bold text-zinc-900 tracking-tight">DHPハブ</span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-zinc-900 text-white'
                      : 'text-zinc-600 hover:bg-zinc-100'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}

            {/* Admin Dropdown */}
            {isLeaderOrAbove && (
              <div className="relative" ref={adminMenuRef}>
                <button
                  onClick={() => setAdminMenuOpen(!adminMenuOpen)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ml-1',
                    isAdminActive
                      ? 'bg-zinc-900 text-white'
                      : 'text-zinc-600 hover:bg-zinc-100'
                  )}
                >
                  <Settings className="w-4 h-4" />
                  <span>管理</span>
                  <ChevronDown className={cn('w-3 h-3 transition-transform', adminMenuOpen && 'rotate-180')} />
                </button>
                {adminMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-zinc-100 overflow-hidden z-50 animate-slide-down">
                    <div className="p-2">
                      {adminItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = pathname.startsWith(item.href);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setAdminMenuOpen(false)}
                            className={cn(
                              'flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-colors',
                              isActive
                                ? 'bg-zinc-100 text-zinc-900 font-medium'
                                : 'text-zinc-600 hover:bg-zinc-50'
                            )}
                          >
                            <Icon className="w-4 h-4" />
                            {item.label}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* AI副社長 (吉田専用) - モジュール無効時は非表示 */}
            {isModuleEnabled('ai-vp') && isAiVpOwner(user?.email) && (
              <>
                <Link
                  href="/dashboard/ai/inbox"
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ml-1',
                    pathname.startsWith('/dashboard/ai')
                      ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white'
                      : 'bg-gradient-to-r from-indigo-100 to-blue-100 text-indigo-700 hover:from-indigo-200 hover:to-blue-200'
                  )}
                >
                  <Bot className="w-4 h-4" />
                  <span>AI受信箱</span>
                </Link>
                <Link
                  href="/admin/ai-vp"
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors',
                    pathname.startsWith('/admin/ai-vp')
                      ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white'
                      : 'bg-gradient-to-r from-purple-100 to-indigo-100 text-purple-700 hover:from-purple-200 hover:to-indigo-200'
                  )}
                >
                  <Brain className="w-4 h-4" />
                  <span>AI抽出</span>
                </Link>
              </>
            )}

            {/* Launch Mode バッジ */}
            {LAUNCH_MODE && (
              <div className="ml-2 px-2.5 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Launch Mode
              </div>
            )}
          </nav>

          {/* Right section */}
          <div className="flex items-center gap-2">
            {/* Role Switcher (Admin only) */}
            <RoleSwitcher />

            {/* Notification Bell */}
            <NotificationBell />

            {/* User Menu (Desktop only - mobile uses bottom nav) */}
            <div className="hidden md:block relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className={cn(
                  'flex items-center gap-2 p-1.5 rounded-xl transition-colors',
                  userMenuOpen ? 'bg-zinc-100' : 'hover:bg-zinc-100'
                )}
              >
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.name}
                    className="w-7 h-7 rounded-lg object-cover"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-lg bg-zinc-900 flex items-center justify-center text-white text-xs font-medium">
                    {user.name.charAt(0)}
                  </div>
                )}
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-zinc-100 overflow-hidden z-50 animate-slide-down">
                  <div className="px-4 py-3 border-b border-zinc-100">
                    <p className="text-sm font-medium text-zinc-900 truncate">{user.name}</p>
                    <p className="text-xs text-zinc-500 truncate">{user.email}</p>
                  </div>
                  <div className="p-2">
                    <button
                      onClick={handleSignOut}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 rounded-xl hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      ログアウト
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
