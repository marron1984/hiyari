'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getChaosViewLevel, hasMinRole } from '@/lib/auth';
import { RoleHomePage } from '@/components/roleHome';
import { Card, CardContent } from '@/components/ui';
import { LaunchModeDashboard } from '@/components/launchMode';
import { LAUNCH_MODE } from '@/config/launchMode';
import type { AppRole } from '@/config/appRoles';
import type { UserRole } from '@/types';
import {
  Shield,
  MessageSquare,
  BookOpen,
  HelpCircle,
  ArrowRight,
  Eye,
} from 'lucide-react';

/**
 * Task 053: UserRole → AppRole マッピング
 *
 * 旧UserRole（user/leader/admin/system_admin）を
 * 新AppRole（staff/leader/manager/executive/admin/auditor）に変換
 */
function mapUserRoleToAppRole(userRole: UserRole, email?: string): AppRole {
  // 特定のexecメールは executive
  const EXEC_EMAILS = ['yoshida@aska-g.com'];
  if (email && EXEC_EMAILS.includes(email)) {
    return 'executive';
  }

  switch (userRole) {
    case 'system_admin':
      return 'admin';
    case 'admin':
      return 'manager';  // 旧admin → manager（管理職）
    case 'leader':
      return 'leader';
    case 'user':
    default:
      return 'staff';
  }
}

/**
 * 有効なAppRoleかどうかをチェック
 */
function isValidAppRole(role: string): role is AppRole {
  return ['admin', 'executive', 'manager', 'leader', 'staff', 'auditor'].includes(role);
}

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

/**
 * AppRole → ナビ設定キー
 */
type NavConfigKey = 'staff' | 'manager' | 'exec';

function appRoleToNavKey(role: AppRole): NavConfigKey {
  switch (role) {
    case 'admin':
    case 'executive':
      return 'exec';
    case 'manager':
    case 'leader':
      return 'manager';
    case 'staff':
    case 'auditor':
    default:
      return 'staff';
  }
}

const ROLE_NAV_CONFIG: Record<NavConfigKey, RoleNavConfig> = {
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
 * ダッシュボードコンテンツ（useSearchParamsを使用）
 */
function DashboardContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();

  // Task 053: asRole パラメータ取得（admin限定プレビュー用）
  const asRoleParam = searchParams.get('asRole');

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

  // ユーザーの実際のAppRoleを取得
  const actualAppRole: AppRole = mapUserRoleToAppRole(user.role, user.email);

  // Task 053: admin または system_admin のみ asRole パラメータを有効化
  const isSystemAdmin = hasMinRole(user.role, 'admin');
  let effectiveAppRole: AppRole = actualAppRole;
  let isPreviewMode = false;

  if (isSystemAdmin && asRoleParam && isValidAppRole(asRoleParam)) {
    effectiveAppRole = asRoleParam;
    isPreviewMode = true;
  }

  // ナビ設定用キー
  const navKey = appRoleToNavKey(effectiveAppRole);

  // ロール別ナビ設定を取得
  const navConfig = ROLE_NAV_CONFIG[navKey];

  // アイコンカラー設定
  const iconColor = navKey === 'staff' ? 'text-green-600' : navKey === 'manager' ? 'text-blue-600' : 'text-purple-600';
  const borderColor = navKey === 'staff' ? 'border-green-200' : navKey === 'manager' ? 'border-blue-200' : 'border-purple-200';
  const primaryBg = navKey === 'staff' ? 'bg-green-600 hover:bg-green-700' : navKey === 'manager' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-purple-600 hover:bg-purple-700';
  const noteColor = navKey === 'staff' ? 'border-green-100' : navKey === 'manager' ? 'border-blue-100' : 'border-purple-100';

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Task 053: プレビューモード表示 */}
      {isPreviewMode && (
        <div className="mb-4 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
          <Eye className="w-4 h-4 text-amber-600" />
          <span className="text-sm text-amber-700">
            <span className="font-medium">{effectiveAppRole}</span> としてプレビュー中
          </span>
          <Link
            href="/dashboard"
            className="ml-auto text-xs text-amber-600 hover:text-amber-800 underline"
          >
            プレビュー終了
          </Link>
        </div>
      )}

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

      {/* Task 053: 役職別ホーム（RoleHomePage） - asRoleをpreviewRoleとして渡す */}
      <RoleHomePage
        userRole={actualAppRole}
        userId={user.id}
        previewRole={isPreviewMode ? effectiveAppRole : undefined}
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
          {navKey === 'exec' && (
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

/**
 * /dashboard - 役職別ホーム
 *
 * Task 053: Role Home を /dashboard に完全接続
 * - getEffectiveRole(asRole) を使って role を確定
 * - asRole は admin のみ有効（URLクエリ ?asRole=staff 等）
 *
 * Launch Mode: NEXT_PUBLIC_LAUNCH_MODE=true の場合、4機能専用UIを表示
 */
export default function DashboardPage() {
  // Launch Mode の場合は専用ダッシュボードを表示
  if (LAUNCH_MODE) {
    return <LaunchModeDashboard />;
  }

  return (
    <Suspense
      fallback={
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900" />
              <p className="text-sm text-zinc-500">読み込み中...</p>
            </div>
          </div>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
