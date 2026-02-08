'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import {
  Home,
  FileText,
  ClipboardCheck,
  Settings,
  MoreHorizontal,
  X,
  Clock,
  UserPlus,
  Briefcase,
  Building2,
  Lightbulb,
  Trophy,
  Activity,
  BarChart3,
  Star,
  Shield,
  Users,
  Megaphone,
  Bot,
  Brain,
  LogOut,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { isAiVpOwner } from '@/lib/auth';
import { LAUNCH_MODE } from '@/config/launchMode';
import { filterNavItems, isModuleEnabled } from '@/config/featureGate';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  matchPaths?: string[];
}

export function MobileBottomNav() {
  const { user, isLeaderOrAbove, signOut } = useAuth();
  const pathname = usePathname();
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  if (!user) return null;

  // Launch Mode: 専用ナビゲーション（featureGate で有効なモジュールのみ）
  if (LAUNCH_MODE) {
    const launchNavAll: NavItem[] = [
      { href: '/launch', label: 'ホーム', icon: Home, matchPaths: ['/launch'] },
      { href: '/dashboard/prospects', label: '入居希望', icon: UserPlus, matchPaths: ['/dashboard/prospects'] },
      { href: '/dashboard/vacancy', label: '空室', icon: Building2, matchPaths: ['/dashboard/vacancy'] },
      { href: '/attendance', label: '打刻', icon: Clock, matchPaths: ['/attendance'] },
      { href: '/dashboard/approvals', label: '承認', icon: ClipboardCheck, matchPaths: ['/dashboard/approvals'] },
    ];
    const launchNavItems = filterNavItems(launchNavAll);

    const isActiveLaunch = (item: NavItem) => {
      if (item.matchPaths && item.matchPaths.length > 0) {
        return item.matchPaths.some((path) => pathname.startsWith(path));
      }
      return pathname === item.href;
    };

    return (
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-zinc-200 md:hidden safe-bottom">
        <div className="flex items-center justify-around h-16">
          {launchNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActiveLaunch(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors',
                  active ? 'text-zinc-900' : 'text-zinc-400'
                )}
              >
                <Icon className={cn('w-6 h-6', active && 'text-zinc-900')} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    );
  }

  // 通常モード: 主要ナビゲーション（5つまで）
  const mainNavItems: NavItem[] = [
    { href: '/dashboard', label: 'ホーム', icon: Home, matchPaths: ['/dashboard'] },
    { href: '/attendance', label: '打刻', icon: Clock, matchPaths: ['/attendance'] },
    { href: '/dashboard/approvals', label: '承認', icon: ClipboardCheck, matchPaths: ['/dashboard/approvals'] },
  ];

  // 管理者は管理タブを追加
  if (isLeaderOrAbove) {
    mainNavItems.push({
      href: '/admin',
      label: '管理',
      icon: Settings,
      matchPaths: ['/admin'],
    });
  }

  // その他メニュー
  mainNavItems.push({
    href: '#more',
    label: 'その他',
    icon: MoreHorizontal,
    matchPaths: [],
  });

  // その他メニューの中身
  const allMoreItems: NavItem[] = [
    { href: '/submit', label: '報告', icon: FileText },
    { href: '/dashboard/prospects', label: '入居希望', icon: UserPlus },
    { href: '/sales', label: '営業', icon: Briefcase },
    { href: '/dashboard/vacancy', label: '空室', icon: Building2 },
    { href: '/improvements', label: '改善', icon: Lightbulb },
    { href: '/rankings', label: 'ランク', icon: Trophy },
    { href: '/dashboard/os', label: '経営OS', icon: Activity },
  ];

  // featureGate でフィルタ
  const moreItems = filterNavItems(allMoreItems);

  // 管理者メニュー（その他内）
  const allAdminMoreItems: NavItem[] = isLeaderOrAbove
    ? [
        { href: '/admin/incidents', label: '報告管理', icon: BarChart3 },
        { href: '/admin/attendance/dashboard', label: '勤怠管理', icon: Clock },
        { href: '/dashboard/admin/ringi', label: '稟議管理', icon: ClipboardCheck },
        { href: '/admin/improvements', label: '改善管理', icon: Lightbulb },
        { href: '/admin/insights', label: '連携提案', icon: Megaphone },
        { href: '/admin/points', label: 'ポイント', icon: Star },
        { href: '/admin/users', label: '権限管理', icon: Shield },
        { href: '/admin/employees', label: '従業員', icon: Users },
        { href: '/admin/settings', label: '設定', icon: Settings },
      ]
    : [];

  // featureGate でフィルタ
  const adminMoreItems = filterNavItems(allAdminMoreItems);

  // AI副社長メニュー - featureGate で制御
  const aiVpItems: NavItem[] = isModuleEnabled('ai-vp') && isAiVpOwner(user?.email)
    ? [
        { href: '/dashboard/ai/inbox', label: 'AI受信箱', icon: Bot },
        { href: '/admin/ai-vp', label: 'AI抽出', icon: Brain },
      ]
    : [];

  const isActive = (item: NavItem) => {
    if (item.href === '#more') return moreMenuOpen;
    if (item.matchPaths && item.matchPaths.length > 0) {
      return item.matchPaths.some((path) => {
        if (path === '/dashboard') {
          return pathname === '/dashboard' || pathname === '/dashboard/ai/todos';
        }
        return pathname.startsWith(path);
      });
    }
    return pathname === item.href;
  };

  const handleMoreClick = () => {
    setMoreMenuOpen(!moreMenuOpen);
  };

  const handleNavClick = (item: NavItem) => {
    if (item.href === '#more') {
      handleMoreClick();
    } else {
      setMoreMenuOpen(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    setMoreMenuOpen(false);
  };

  return (
    <>
      {/* その他メニューオーバーレイ */}
      {moreMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* 背景オーバーレイ */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMoreMenuOpen(false)}
          />

          {/* メニューパネル */}
          <div className="absolute bottom-16 left-0 right-0 bg-white rounded-t-2xl max-h-[70vh] overflow-y-auto animate-slide-up safe-bottom">
            {/* ヘッダー */}
            <div className="sticky top-0 bg-white border-b border-zinc-100 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold text-zinc-900">その他のメニュー</span>
                {LAUNCH_MODE && (
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    Launch
                  </span>
                )}
              </div>
              <button
                onClick={() => setMoreMenuOpen(false)}
                className="p-2 -mr-2 rounded-full hover:bg-zinc-100"
              >
                <X className="w-5 h-5 text-zinc-500" />
              </button>
            </div>

            {/* メニュー項目 */}
            <div className="px-4 py-3">
              {/* 基本メニュー */}
              <div className="grid grid-cols-4 gap-2">
                {moreItems.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href || pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMoreMenuOpen(false)}
                      className={cn(
                        'flex flex-col items-center gap-1.5 p-3 rounded-xl transition-colors',
                        active ? 'bg-zinc-900 text-white' : 'bg-zinc-50 text-zinc-600 hover:bg-zinc-100'
                      )}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-xs font-medium">{item.label}</span>
                    </Link>
                  );
                })}
              </div>

              {/* AI副社長メニュー */}
              {aiVpItems.length > 0 && (
                <>
                  <div className="mt-4 mb-2 px-1">
                    <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                      AI副社長
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {aiVpItems.map((item) => {
                      const Icon = item.icon;
                      const active = pathname.startsWith(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMoreMenuOpen(false)}
                          className={cn(
                            'flex flex-col items-center gap-1.5 p-3 rounded-xl transition-colors',
                            active
                              ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white'
                              : 'bg-gradient-to-r from-purple-50 to-indigo-50 text-purple-700'
                          )}
                        >
                          <Icon className="w-5 h-5" />
                          <span className="text-xs font-medium">{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </>
              )}

              {/* 管理者メニュー */}
              {adminMoreItems.length > 0 && (
                <>
                  <div className="mt-4 mb-2 px-1">
                    <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                      管理機能
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {adminMoreItems.map((item) => {
                      const Icon = item.icon;
                      const active = pathname.startsWith(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMoreMenuOpen(false)}
                          className={cn(
                            'flex flex-col items-center gap-1.5 p-3 rounded-xl transition-colors',
                            active ? 'bg-zinc-900 text-white' : 'bg-zinc-50 text-zinc-600 hover:bg-zinc-100'
                          )}
                        >
                          <Icon className="w-5 h-5" />
                          <span className="text-xs font-medium">{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </>
              )}

              {/* ユーザー情報・ログアウト */}
              <div className="mt-4 pt-4 border-t border-zinc-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {user.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt={user.name}
                        className="w-10 h-10 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-zinc-900 flex items-center justify-center text-white text-sm font-medium">
                        {user.name.charAt(0)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-900 truncate">{user.name}</p>
                      <p className="text-xs text-zinc-500 truncate">{user.email}</p>
                    </div>
                  </div>
                  <button
                    onClick={handleSignOut}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>ログアウト</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 固定ボトムナビ */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-zinc-200 md:hidden safe-bottom">
        <div className="flex items-center justify-around h-16">
          {mainNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item);

            if (item.href === '#more') {
              return (
                <button
                  key="more"
                  onClick={() => handleNavClick(item)}
                  className={cn(
                    'flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors',
                    active ? 'text-zinc-900' : 'text-zinc-400'
                  )}
                >
                  <Icon className={cn('w-6 h-6', active && 'text-zinc-900')} />
                  <span className="text-[10px] font-medium">{item.label}</span>
                </button>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => handleNavClick(item)}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors',
                  active ? 'text-zinc-900' : 'text-zinc-400'
                )}
              >
                <Icon className={cn('w-6 h-6', active && 'text-zinc-900')} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
