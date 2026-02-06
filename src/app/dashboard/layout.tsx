/**
 * ダッシュボードレイアウト（Server Component）
 *
 * Ticket 093: オンボーディングゲート追加
 * - staff/leader は必須文書署名が完了するまで /onboarding/contracts にリダイレクト
 * - ゲートはサーバーサイドで実行（Edge Runtime 制約回避）
 *
 * Ticket 110: アクセス遮断ゲート追加
 * - terminated のユーザーは /terminated にリダイレクト
 */

import { ReactNode } from 'react';
import { checkOnboardingGate } from '@/lib/onboarding';
import { checkAccessBlockedGate } from '@/lib/hr';
import { DashboardClientLayout } from '@/components/layouts/DashboardClientLayout';

// headers() を使用するため動的レンダリングを強制
export const dynamic = 'force-dynamic';

interface DashboardLayoutProps {
  children: ReactNode;
}

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  // Ticket 110: アクセス遮断ゲートを最初にチェック
  // terminated のユーザーは /terminated にリダイレクト
  await checkAccessBlockedGate();

  // サーバーサイドでオンボーディングゲートをチェック
  // 未完了の場合は /onboarding/contracts にリダイレクト
  await checkOnboardingGate();

  return <DashboardClientLayout>{children}</DashboardClientLayout>;
}
