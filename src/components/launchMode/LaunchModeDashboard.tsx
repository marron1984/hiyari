'use client';

import Link from 'next/link';
import {
  Users,
  Building2,
  Clock,
  CheckCircle,
  ChevronRight,
  Bell,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { LAUNCH_NAV_ITEMS } from '@/config/launchRoutes';

const iconMap: Record<string, React.ElementType> = {
  Users,
  Building2,
  Clock,
  CheckCircle,
};

// カードデザインテーマ
const cardThemes: Record<
  string,
  {
    gradient: string;
    iconBg: string;
    iconColor: string;
    hoverBorder: string;
    accentBar: string;
  }
> = {
  '/dashboard/prospects': {
    gradient: 'from-blue-50 to-blue-100/50',
    iconBg: 'bg-blue-500',
    iconColor: 'text-white',
    hoverBorder: 'hover:border-blue-300',
    accentBar: 'bg-blue-500',
  },
  '/dashboard/vacancy': {
    gradient: 'from-emerald-50 to-emerald-100/50',
    iconBg: 'bg-emerald-500',
    iconColor: 'text-white',
    hoverBorder: 'hover:border-emerald-300',
    accentBar: 'bg-emerald-500',
  },
  '/attendance': {
    gradient: 'from-amber-50 to-amber-100/50',
    iconBg: 'bg-amber-500',
    iconColor: 'text-white',
    hoverBorder: 'hover:border-amber-300',
    accentBar: 'bg-amber-500',
  },
  '/dashboard/approvals': {
    gradient: 'from-violet-50 to-violet-100/50',
    iconBg: 'bg-violet-500',
    iconColor: 'text-white',
    hoverBorder: 'hover:border-violet-300',
    accentBar: 'bg-violet-500',
  },
};

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return 'お疲れさまです';
  if (hour < 11) return 'おはようございます';
  if (hour < 14) return 'こんにちは';
  if (hour < 18) return 'お疲れさまです';
  return 'お疲れさまです';
}

function formatDate(): string {
  const now = new Date();
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const weekday = weekdays[now.getDay()];
  return `${month}月${day}日（${weekday}）`;
}

/**
 * Launch Mode ダッシュボード
 *
 * 先行公開4機能（入居希望・空室・打刻・承認）に特化したUI
 * スマホ・ウェブ両対応のモダンデザイン
 */
export function LaunchModeDashboard() {
  const { user } = useAuth();

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900" />
          <p className="text-sm text-zinc-500">読み込み中...</p>
        </div>
      </div>
    );
  }

  const greeting = getGreeting();
  const dateStr = formatDate();
  const displayName = user.name || user.email?.split('@')[0];

  return (
    <div className="min-h-screen bg-zinc-50 pb-24 md:pb-8">
      {/* ヘッダーエリア */}
      <div className="bg-white">
        <div className="max-w-3xl mx-auto px-4 pt-6 pb-5">
          {/* 日付 */}
          <p className="text-xs font-medium text-zinc-400 mb-1">
            {dateStr}
          </p>

          {/* 挨拶 */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-zinc-900">
                {greeting}、{displayName}さん
              </h1>
              <p className="text-sm text-zinc-500 mt-0.5">
                今日も一日よろしくお願いします
              </p>
            </div>

            {/* 通知アイコン（デスクトップのみ - モバイルはヘッダーにある） */}
            <Link
              href="/dashboard/notifications"
              className="hidden md:flex w-10 h-10 items-center justify-center rounded-full bg-zinc-100 hover:bg-zinc-200 transition-colors"
            >
              <Bell className="w-5 h-5 text-zinc-600" />
            </Link>
          </div>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="max-w-3xl mx-auto px-4 py-5">
        {/* 4機能カード */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {LAUNCH_NAV_ITEMS.map((item) => {
            const Icon = iconMap[item.icon] || Users;
            const theme = cardThemes[item.href] || cardThemes['/dashboard/prospects'];

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group relative block overflow-hidden rounded-2xl border border-zinc-200 bg-white transition-all duration-200 ${theme.hoverBorder} hover:shadow-md active:scale-[0.98]`}
              >
                {/* 左アクセントバー */}
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${theme.accentBar}`} />

                <div className="flex items-center gap-4 p-4 pl-5">
                  {/* アイコン */}
                  <div
                    className={`w-12 h-12 rounded-xl ${theme.iconBg} flex items-center justify-center flex-shrink-0 shadow-sm`}
                  >
                    <Icon className={`w-6 h-6 ${theme.iconColor}`} />
                  </div>

                  {/* テキスト */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold text-zinc-900 group-hover:text-zinc-800">
                      {item.label}
                    </h3>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {item.description}
                    </p>
                  </div>

                  {/* 矢印 */}
                  <ChevronRight className="w-5 h-5 text-zinc-300 group-hover:text-zinc-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                </div>
              </Link>
            );
          })}
        </div>

        {/* お知らせエリア */}
        <div className="mt-5 bg-white rounded-2xl border border-zinc-200 p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-zinc-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Bell className="w-4 h-4 text-zinc-500" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-700">
                ご利用ガイド
              </h3>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                現在、上記4つの機能をご利用いただけます。
                その他の機能は順次追加予定です。
                操作でお困りの際は管理者までお問い合わせください。
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
