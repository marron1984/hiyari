'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Menu, X, Home, FileText, BarChart3, Trophy, Settings, LogOut, Clock, Users, ClipboardList, Lightbulb, Star, Shield, ChevronDown, Building2, Megaphone, UserPlus, Brain, Briefcase, Activity, Bot, Inbox } from 'lucide-react';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { cn } from '@/lib/utils';
import { isAiVpOwner } from '@/lib/auth';

export function Header() {
  const { user, isLeaderOrAbove, signOut } = useAuth();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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

  // メニュー順序（確定版）:
  // 1.打刻 2.稟議 3.入居希望 4.営業進捗 5.空室 6.改善 7.ランク 8.経営OS 9.報告(ヒヤリ)
  const navItems = [
    { href: '/dashboard', label: 'ホーム', icon: Home },
    { href: '/attendance', label: '打刻', icon: Clock },
    { href: '/dashboard/approvals', label: '稟議', icon: ClipboardList },
    { href: '/dashboard/prospects', label: '入居希望', icon: UserPlus },
    { href: '/sales', label: '営業', icon: Briefcase },
    { href: '/dashboard/vacancy', label: '空室', icon: Building2 },
    { href: '/improvements', label: '改善', icon: Lightbulb },
    { href: '/rankings', label: 'ランク', icon: Trophy },
    { href: '/dashboard/os', label: '経営OS', icon: Activity },
    { href: '/submit', label: '報告', icon: FileText },
  ];

  const adminItems = [
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
            <Link href="/dashboard" className="flex items-center gap-2">
              <Image
                src="/logo-icon.svg"
                alt="AA-HUB"
                width={32}
                height={32}
                className="h-8 w-8"
              />
              <span className="text-base font-bold text-zinc-900">AA-HUB</span>
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

            {/* AI副社長 (吉田専用) */}
            {isAiVpOwner(user?.email) && (
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
          </nav>

          {/* Right section */}
          <div className="flex items-center gap-2">
            {/* Notification Bell */}
            <NotificationBell />

            {/* User Menu (Desktop) */}
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

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-xl text-zinc-600 hover:bg-zinc-100 transition-colors"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-zinc-100 bg-white animate-slide-down safe-bottom">
          <nav className="px-4 py-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium transition-colors',
                    isActive
                      ? 'bg-zinc-900 text-white'
                      : 'text-zinc-600 hover:bg-zinc-100'
                  )}
                >
                  <Icon className="w-5 h-5" />
                  {item.label}
                </Link>
              );
            })}

            {isLeaderOrAbove && (
              <>
                <div className="border-t border-zinc-100 my-3" />
                <p className="px-4 py-1 text-xs font-medium text-zinc-400 uppercase tracking-wider">管理</p>
                {adminItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        'flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium transition-colors',
                        isActive
                          ? 'bg-zinc-900 text-white'
                          : 'text-zinc-600 hover:bg-zinc-100'
                      )}
                    >
                      <Icon className="w-5 h-5" />
                      {item.label}
                    </Link>
                  );
                })}
              </>
            )}

            {/* AI副社長 (吉田専用) - Mobile */}
            {isAiVpOwner(user?.email) && (
              <>
                <div className="border-t border-zinc-100 my-3" />
                <p className="px-4 py-1 text-xs font-medium text-zinc-400 uppercase tracking-wider">AI副社長</p>
                <Link
                  href="/dashboard/ai/inbox"
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium transition-colors',
                    pathname.startsWith('/dashboard/ai')
                      ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white'
                      : 'bg-gradient-to-r from-indigo-100 to-blue-100 text-indigo-700'
                  )}
                >
                  <Bot className="w-5 h-5" />
                  AI受信箱
                </Link>
                <Link
                  href="/admin/ai-vp"
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium transition-colors',
                    pathname.startsWith('/admin/ai-vp')
                      ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white'
                      : 'bg-gradient-to-r from-purple-100 to-indigo-100 text-purple-700'
                  )}
                >
                  <Brain className="w-5 h-5" />
                  AI抽出
                </Link>
              </>
            )}

            <div className="border-t border-zinc-100 my-3" />

            <div className="px-4 py-3">
              <div className="flex items-center gap-3 mb-4">
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.name} className="w-10 h-10 rounded-xl object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-zinc-900 flex items-center justify-center text-white text-sm font-medium">
                    {user.name.charAt(0)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900 truncate">{user.name}</p>
                  <p className="text-xs text-zinc-500 truncate">{user.email}</p>
                </div>
              </div>
              <button
                onClick={handleSignOut}
                className="w-full flex items-center justify-center gap-2 h-11 text-sm font-medium text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                ログアウト
              </button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
