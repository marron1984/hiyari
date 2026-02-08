'use client';

import Link from 'next/link';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { Users, Building2, Clock, CheckCircle, Sparkles, ChevronRight, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { LAUNCH_MODE } from '@/config/launchMode';

// Launch Mode が無効な場合は /dashboard へリダイレクト
// Note: クライアントコンポーネントでのリダイレクトは useEffect で処理

/**
 * Launch Mode 専用トップページ
 *
 * 4機能のみを大きなカードで表示
 * - 入居希望 (Prospects)
 * - 空室 (Vacancies)
 * - 打刻 (Attendance)
 * - 承認 (Approvals)
 */

interface FeatureCard {
  id: string;
  href: string;
  label: string;
  labelEn: string;
  description: string;
  icon: React.ElementType;
  theme: {
    bg: string;
    border: string;
    hover: string;
    iconBg: string;
    iconColor: string;
  };
}

const FEATURE_CARDS: FeatureCard[] = [
  {
    id: 'prospects',
    href: '/dashboard/prospects',
    label: '入居希望',
    labelEn: 'Prospects',
    description: '入居希望者の管理・対応',
    icon: Users,
    theme: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      hover: 'hover:bg-blue-100 hover:border-blue-400 hover:shadow-blue-100',
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
    },
  },
  {
    id: 'vacancy',
    href: '/dashboard/vacancy',
    label: '空室',
    labelEn: 'Vacancies',
    description: '空室状況の確認・管理',
    icon: Building2,
    theme: {
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      hover: 'hover:bg-emerald-100 hover:border-emerald-400 hover:shadow-emerald-100',
      iconBg: 'bg-emerald-100',
      iconColor: 'text-emerald-600',
    },
  },
  {
    id: 'attendance',
    href: '/attendance',
    label: '打刻',
    labelEn: 'Attendance',
    description: '出退勤の記録・確認',
    icon: Clock,
    theme: {
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      hover: 'hover:bg-amber-100 hover:border-amber-400 hover:shadow-amber-100',
      iconBg: 'bg-amber-100',
      iconColor: 'text-amber-600',
    },
  },
  {
    id: 'approvals',
    href: '/dashboard/approvals',
    label: '承認',
    labelEn: 'Approvals',
    description: '申請の確認・承認',
    icon: CheckCircle,
    theme: {
      bg: 'bg-violet-50',
      border: 'border-violet-200',
      hover: 'hover:bg-violet-100 hover:border-violet-400 hover:shadow-violet-100',
      iconBg: 'bg-violet-100',
      iconColor: 'text-violet-600',
    },
  },
];

export default function LaunchPage() {
  const { user, signOut, loading } = useAuth();

  // Launch Mode が無効な場合は /dashboard へリダイレクト
  if (!LAUNCH_MODE) {
    redirect('/dashboard');
  }

  // ローディング中
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900" />
          <p className="text-sm text-slate-500">読み込み中...</p>
        </div>
      </div>
    );
  }

  // 未認証の場合は認証ページへ
  if (!user) {
    redirect('/auth/signin');
  }

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex flex-col">
      {/* ミニマルヘッダー */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/launch" className="flex items-center gap-2">
              <Image
                src="/logo-icon.svg"
                alt="AA-HUB"
                width={28}
                height={28}
                className="h-7 w-7"
              />
              <span className="text-base font-bold text-slate-900">AA-HUB</span>
            </Link>
            <span className="px-2.5 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Launch Mode
            </span>
          </div>

          {/* ユーザーメニュー */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600 hidden sm:block">
              {user.name || user.email?.split('@')[0]}
            </span>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">ログアウト</span>
            </button>
          </div>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="flex-1 flex flex-col justify-center py-8 px-4">
        <div className="max-w-4xl mx-auto w-full">
          {/* 挨拶 */}
          <div className="text-center mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 mb-2">
              こんにちは、{user.name || user.email?.split('@')[0]}さん
            </h1>
            <p className="text-slate-500">
              ご利用いただける機能をお選びください
            </p>
          </div>

          {/* 4機能カード */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            {FEATURE_CARDS.map((card) => {
              const Icon = card.icon;
              return (
                <Link
                  key={card.id}
                  href={card.href}
                  className={`group block p-6 sm:p-8 rounded-2xl border-2 transition-all duration-200 ${card.theme.bg} ${card.theme.border} ${card.theme.hover} hover:shadow-xl hover:-translate-y-1`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-14 h-14 sm:w-16 sm:h-16 ${card.theme.iconBg} rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform`}>
                      <Icon className={`w-7 h-7 sm:w-8 sm:h-8 ${card.theme.iconColor}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="text-xl sm:text-2xl font-bold text-slate-800 group-hover:text-slate-900">
                          {card.label}
                        </h2>
                        <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-600 group-hover:translate-x-1 transition-all flex-shrink-0" />
                      </div>
                      <p className="text-sm text-slate-600 mt-1">
                        {card.description}
                      </p>
                      <p className="text-xs text-slate-400 mt-2 font-medium uppercase tracking-wider">
                        {card.labelEn}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* 補足情報 */}
          <div className="mt-8 p-4 bg-slate-100 rounded-xl text-center">
            <p className="text-sm text-slate-500">
              その他の機能は順次追加予定です。ご不便をおかけしますがお待ちください。
            </p>
          </div>
        </div>
      </main>

      {/* フッター */}
      <footer className="py-4 text-center border-t border-slate-200">
        <p className="text-xs text-slate-400">
          お困りの際は管理者までお問い合わせください
        </p>
      </footer>
    </div>
  );
}
