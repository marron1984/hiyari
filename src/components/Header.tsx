'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import { Settings, Sparkles } from 'lucide-react';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { RoleSwitcher } from '@/components/navigation/RoleSwitcher';
import { LAUNCH_MODE } from '@/config/launchMode';

export function Header() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <header className="bg-white/80 backdrop-blur-lg border-b border-zinc-200/80 sticky top-0 z-50">
      <div className="px-4">
        <div className="flex justify-between h-14">
          {/* Logo */}
          <div className="flex items-center gap-3">
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
            {/* Launch Mode バッジ */}
            {LAUNCH_MODE && (
              <div className="hidden md:flex px-2.5 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Launch Mode
              </div>
            )}
          </div>

          {/* Right section */}
          <div className="flex items-center gap-2">
            {/* Role Switcher (Admin only) */}
            <RoleSwitcher />

            {/* Notification Settings (gear icon) */}
            <Link
              href="/dashboard/notification-settings"
              className="p-2 rounded-xl hover:bg-zinc-100 transition-colors"
              aria-label="通知設定"
            >
              <Settings className="w-5 h-5 text-zinc-600" />
            </Link>

            {/* Notification Bell */}
            <NotificationBell />
          </div>
        </div>
      </div>
    </header>
  );
}
