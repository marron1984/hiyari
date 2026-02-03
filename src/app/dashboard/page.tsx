'use client';

import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { getChaosViewLevel } from '@/lib/auth';
import { RoleHomePage } from '@/components/roleHome';
import { Card, CardContent } from '@/components/ui';
import type { AppRole } from '@/config/appRoles';
import {
  Shield,
  MessageSquare,
  BookOpen,
  HelpCircle,
  ArrowRight,
} from 'lucide-react';

/**
 * ロール別OSナビ設定
 *
 * 思想：
 * - 新人は「安心して聞ける」ことが最優先
 * - 管理者は「一人で抱えない」ことが最優先
 * - 経営は「判断が組織に残る」ことが最優先
 */
interface RoleNavConfig {
  title: string;
  subtitle: string;
  description: string;
  primaryAction: { label: string; href?: string; external?: boolean };
  secondaryAction: { label: string; href: string };
  note: string;
  bgGradient: string;
  iconBg: string;
}

type DashboardRole = 'staff' | 'manager' | 'exec';

const ROLE_NAV_CONFIG: Record<DashboardRole, RoleNavConfig> = {
  staff: {
    title: 'わからないことは、聞いて大丈夫',
    subtitle: '安心して相談できる場所',
    description: '判断に迷ったら、すぐにここで聞いてください。\n「聞くこと」は正しい行動です。一人で悩まないでください。',
    primaryAction: {
      label: 'ふくしゃに聞く',
      href: '/dashboard/ai-vp/ask',
    },
    secondaryAction: {
      label: '公式ドキュメントを見る',
      href: '/dashboard/knowledge',
    },
    note: '質問は誰にも見られません。安心して聞いてください。',
    bgGradient: 'from-green-50 to-emerald-50',
    iconBg: 'bg-green-100',
  },
  manager: {
    title: '判断を一人で抱えない',
    subtitle: '迷ったら止めて、上に返す',
    description: '管理者でも判断に迷うことはあります。\n抱え込まず、経営に返すことが正しい責任の取り方です。',
    primaryAction: {
      label: 'ふくしゃに相談する',
      href: '/dashboard/ai-vp/ask',
    },
    secondaryAction: {
      label: '判断と責任のOSを見る',
      href: '/dashboard/os/decision',
    },
    note: '相談した事実は、あなたの評価を下げません。むしろ正しい行動です。',
    bgGradient: 'from-blue-50 to-indigo-50',
    iconBg: 'bg-blue-100',
  },
  exec: {
    title: '判断を組織の資産にする',
    subtitle: '経営判断は、記録して残す',
    description: '最終判断は経営の責任です。その判断を記録し、\n組織の知恵として残すことで、次の判断を助けます。',
    primaryAction: {
      label: '判断相談Inboxを見る',
      href: '/admin/ai-vp/ask-inbox',
    },
    secondaryAction: {
      label: 'OSマップで全体を見る',
      href: '/dashboard/os-map',
    },
    note: '判断ログは組織のOS資産になります。評価ではなく、知恵の蓄積です。',
    bgGradient: 'from-purple-50 to-violet-50',
    iconBg: 'bg-purple-100',
  },
};

/**
 * DashboardRole → AppRole 変換
 */
function toAppRole(role: DashboardRole): AppRole {
  switch (role) {
    case 'exec':
      return 'executive';
    case 'manager':
      return 'manager';
    case 'staff':
    default:
      return 'staff';
  }
}

export default function DashboardPage() {
  const { user } = useAuth();

  // 役割判定
  const viewLevel = user ? getChaosViewLevel(user.role, user.email) : 'self';
  const role: DashboardRole = viewLevel === 'all' ? 'exec' : viewLevel === 'team' ? 'manager' : 'staff';
  const appRole = toAppRole(role);

  // ユーザーがまだロードされていない場合
  if (!user) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900" />
            <p className="text-sm text-zinc-500">読み込み中...</p>
          </div>
        </div>
      </div>
    );
  }

  // ロール別ナビ設定を取得
  const navConfig = ROLE_NAV_CONFIG[role];

  // アイコンカラー設定
  const iconColor = role === 'staff' ? 'text-green-600' : role === 'manager' ? 'text-blue-600' : 'text-purple-600';
  const borderColor = role === 'staff' ? 'border-green-200' : role === 'manager' ? 'border-blue-200' : 'border-purple-200';
  const primaryBg = role === 'staff' ? 'bg-green-600 hover:bg-green-700' : role === 'manager' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-purple-600 hover:bg-purple-700';
  const noteColor = role === 'staff' ? 'border-green-100' : role === 'manager' ? 'border-blue-100' : 'border-purple-100';

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* OSナビ（ロール別最上段固定導線） */}
      <Card className={`mb-6 bg-gradient-to-br ${navConfig.bgGradient} ${borderColor} shadow-sm`}>
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <div className={`p-3 ${navConfig.iconBg} rounded-xl flex-shrink-0`}>
              <HelpCircle className={`w-6 h-6 ${iconColor}`} />
            </div>
            <div className="flex-1">
              <p className={`text-xs font-medium ${iconColor} mb-1`}>{navConfig.subtitle}</p>
              <h2 className="text-lg font-bold text-zinc-800 mb-2">
                {navConfig.title}
              </h2>
              <p className="text-sm text-zinc-600 mb-4 leading-relaxed whitespace-pre-line">
                {navConfig.description}
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link href={navConfig.primaryAction.href || '#'}>
                  <button className={`w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 ${primaryBg} text-white font-medium rounded-lg transition-colors`}>
                    <MessageSquare className="w-4 h-4" />
                    {navConfig.primaryAction.label}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </Link>
                <Link href={navConfig.secondaryAction.href}>
                  <button className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-zinc-50 text-zinc-700 font-medium rounded-lg border border-zinc-300 transition-colors">
                    <BookOpen className="w-4 h-4" />
                    {navConfig.secondaryAction.label}
                  </button>
                </Link>
              </div>
              <div className={`mt-4 pt-3 border-t ${noteColor}`}>
                <p className="text-xs text-zinc-500">
                  {navConfig.note}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 支援目的の注意文 */}
      <Card className="mb-6 bg-zinc-50 border-zinc-200">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-zinc-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-zinc-600">
              これは支援のための仕組みです。評価や査定のためではありません。
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 役職別ホーム（RoleHomePage） */}
      <RoleHomePage
        userRole={appRole}
        userId={user.id}
      />

      {/* フッター */}
      <div className="mt-8 pt-6 border-t border-zinc-200">
        <div className="flex items-center justify-center gap-4 text-sm text-zinc-400">
          <Link href="/dashboard/os/checkin" className="hover:text-zinc-600">
            チェックイン
          </Link>
          <span>・</span>
          <Link href="/dashboard/approvals" className="hover:text-zinc-600">
            稟議
          </Link>
          <span>・</span>
          <Link href="/dashboard/os/team" className="hover:text-zinc-600">
            チーム
          </Link>
          <span>・</span>
          <Link href="/dashboard/knowledge" className="hover:text-zinc-600">
            知識ハブ
          </Link>
          {role === 'exec' && (
            <>
              <span>・</span>
              <Link href="/dashboard/os-map" className="hover:text-zinc-600">
                OSマップ
              </Link>
              <span>・</span>
              <Link href="/admin/ai-vp" className="hover:text-zinc-600">
                AI副社長
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
