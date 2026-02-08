'use client';

import Link from 'next/link';
import { Users, Building2, Clock, CheckCircle, Sparkles, ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { LAUNCH_NAV_ITEMS } from '@/config/launchRoutes';
import { getEnvironmentLabel } from '@/config/launchMode';

const iconMap: Record<string, React.ElementType> = {
  Users,
  Building2,
  Clock,
  CheckCircle,
};

// カラーテーマ（各機能）
const colorThemes: Record<string, { bg: string; hover: string; icon: string; border: string }> = {
  '/dashboard/prospects': {
    bg: 'bg-blue-50',
    hover: 'hover:bg-blue-100 hover:border-blue-300',
    icon: 'text-blue-600',
    border: 'border-blue-200',
  },
  '/dashboard/vacancy': {
    bg: 'bg-emerald-50',
    hover: 'hover:bg-emerald-100 hover:border-emerald-300',
    icon: 'text-emerald-600',
    border: 'border-emerald-200',
  },
  '/attendance': {
    bg: 'bg-amber-50',
    hover: 'hover:bg-amber-100 hover:border-amber-300',
    icon: 'text-amber-600',
    border: 'border-amber-200',
  },
  '/dashboard/approvals': {
    bg: 'bg-violet-50',
    hover: 'hover:bg-violet-100 hover:border-violet-300',
    icon: 'text-violet-600',
    border: 'border-violet-200',
  },
};

/**
 * Launch Mode ダッシュボード
 *
 * 先行公開4機能（入居希望・空室・打刻・承認）に特化したUI
 */
export function LaunchModeDashboard() {
  const { user } = useAuth();
  const envLabel = getEnvironmentLabel();

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900" />
          <p className="text-sm text-slate-500">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* ヘッダーエリア */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold text-slate-800">
                  こんにちは、{user.name || user.email?.split('@')[0]}さん
                </h1>
              </div>
              <p className="text-slate-500 text-sm">
                今日も一日よろしくお願いします
              </p>
            </div>

            {/* 環境バッジ */}
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded-full">
                {envLabel}
              </span>
              <span className="px-2.5 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Launch Mode
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* セクションタイトル */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-slate-700">
            ご利用いただける機能
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            業務に必要な機能をお選びください
          </p>
        </div>

        {/* 4機能カード */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {LAUNCH_NAV_ITEMS.map((item) => {
            const Icon = iconMap[item.icon] || Users;
            const theme = colorThemes[item.href] || colorThemes['/dashboard/prospects'];

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group block p-6 rounded-2xl border-2 transition-all duration-200 ${theme.bg} ${theme.border} ${theme.hover} hover:shadow-lg hover:-translate-y-0.5`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className={`w-14 h-14 bg-white rounded-xl flex items-center justify-center shadow-sm group-hover:shadow transition-shadow`}>
                      <Icon className={`w-7 h-7 ${theme.icon}`} />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-slate-800 mb-1 group-hover:text-slate-900">
                        {item.label}
                      </h3>
                      <p className="text-sm text-slate-600">
                        {item.description}
                      </p>
                      <p className="text-xs text-slate-400 mt-2 font-medium">
                        {item.labelEn}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-slate-600 group-hover:translate-x-1 transition-all" />
                </div>
              </Link>
            );
          })}
        </div>

        {/* 補足情報 */}
        <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-slate-200 rounded-lg flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5 text-slate-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-700 mb-1">
                その他の機能について
              </h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                現在、先行公開として上記4機能をご利用いただけます。
                その他の機能は順次追加していく予定です。
                ご不便をおかけしますが、今しばらくお待ちください。
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* フッター */}
      <div className="border-t border-slate-200 bg-white mt-auto">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <p className="text-center text-xs text-slate-400">
            お困りの際は管理者までお問い合わせください
          </p>
        </div>
      </div>
    </div>
  );
}
