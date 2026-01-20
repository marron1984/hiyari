'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Menu, X, Home, FileText, BarChart3, Trophy, Settings, LogOut, Clock, Users, ClipboardList, Lightbulb, Star, Shield } from 'lucide-react';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { cn } from '@/lib/utils';

export function Header() {
  const { user, isLeaderOrAbove, signOut } = useAuth();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // 外側クリックでメニューを閉じる
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    if (userMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [userMenuOpen]);

  if (!user) return null;

  const navItems = [
    { href: '/dashboard', label: 'ホーム', icon: Home },
    { href: '/submit', label: '報告', icon: FileText },
    { href: '/attendance', label: '打刻', icon: Clock },
    { href: '/ringi', label: '稟議', icon: ClipboardList },
    { href: '/improvements', label: '改善', icon: Lightbulb },
    { href: '/rankings', label: 'ランク', icon: Trophy },
  ];

  const adminItems = [
    { href: '/admin/incidents', label: '報告管理', icon: BarChart3 },
    { href: '/admin/attendance/dashboard', label: '勤怠', icon: Clock },
    { href: '/admin/ringi', label: '稟議', icon: ClipboardList },
    { href: '/admin/improvements', label: '改善', icon: Lightbulb },
    { href: '/admin/points', label: 'ポイント', icon: Star },
    { href: '/admin/users', label: '権限', icon: Shield },
    { href: '/admin/employees', label: '従業員', icon: Users },
    { href: '/admin/settings', label: '設定', icon: Settings },
  ];

  const handleSignOut = async () => {
    await signOut();
    setUserMenuOpen(false);
  };

  return (
    <header className="bg-white/80 backdrop-blur-lg border-b border-zinc-100 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex justify-between h-14">
          {/* Logo */}
          <div className="flex items-center">
            <Link href="/dashboard" className="text-base font-bold text-zinc-900">
              HiyariHub
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
            {isLeaderOrAbove && (
              <>
                <div className="w-px h-5 bg-zinc-200 mx-1" />
                {adminItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname.startsWith(item.href);
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
