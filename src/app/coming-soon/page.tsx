'use client';

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { Users, Building2, Clock, CheckCircle, ArrowLeft } from 'lucide-react';
import { LAUNCH_NAV_ITEMS } from '@/config/launchRoutes';

const iconMap: Record<string, React.ElementType> = {
  Users,
  Building2,
  Clock,
  CheckCircle,
};

export default function ComingSoonPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        {/* メインカード */}
        <div className="bg-white rounded-2xl shadow-xl p-8 md:p-12 text-center">
          {/* アイコン */}
          <div className="w-20 h-20 mx-auto mb-6 bg-slate-100 rounded-full flex items-center justify-center">
            <svg
              className="w-10 h-10 text-slate-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
              />
            </svg>
          </div>

          {/* タイトル */}
          <h1 className="text-3xl md:text-4xl font-bold text-slate-800 mb-4">
            準備中
          </h1>

          {/* 説明文 */}
          <p className="text-slate-600 text-lg mb-8 leading-relaxed">
            この機能は現在開発中です。
            <br className="hidden sm:block" />
            先行公開中の機能をご利用ください。
          </p>

          {/* 区切り線 */}
          <div className="border-t border-slate-200 my-8" />

          {/* 利用可能な機能 */}
          <p className="text-sm text-slate-500 mb-6 font-medium">
            ご利用いただける機能
          </p>

          {/* 4機能ボタン */}
          <div className="grid grid-cols-2 gap-4">
            {LAUNCH_NAV_ITEMS.map((item) => {
              const Icon = iconMap[item.icon] || Users;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex flex-col items-center p-6 bg-slate-50 hover:bg-blue-50 rounded-xl transition-all duration-200 border border-slate-200 hover:border-blue-300 hover:shadow-md"
                >
                  <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center mb-3 shadow-sm group-hover:shadow group-hover:bg-blue-100 transition-all">
                    <Icon className="w-6 h-6 text-slate-600 group-hover:text-blue-600 transition-colors" />
                  </div>
                  <span className="font-semibold text-slate-700 group-hover:text-blue-700 transition-colors">
                    {item.label}
                  </span>
                  <span className="text-xs text-slate-400 mt-1">
                    {item.description}
                  </span>
                </Link>
              );
            })}
          </div>

          {/* ホームへ戻る */}
          <div className="mt-8 pt-6 border-t border-slate-200">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>ホームに戻る</span>
            </Link>
          </div>
        </div>

        {/* フッター */}
        <p className="text-center text-sm text-slate-400 mt-6">
          順次機能を追加していきます。ご理解のほどお願いいたします。
        </p>
      </div>
    </div>
  );
}
