/**
 * ダッシュボードレイアウト（Server Component）
 *
 * Ticket 093: オンボーディングゲート追加
 * - staff/leader は必須文書署名が完了するまで /onboarding/contracts にリダイレクト
 * - ゲートはサーバーサイドで実行（Edge Runtime 制約回避）
 */

import { ReactNode } from 'react';
import { checkOnboardingGate } from '@/lib/onboarding';
import { DashboardClientLayout } from '@/components/layouts/DashboardClientLayout';

// headers() を使用するため動的レンダリングを強制
export const dynamic = 'force-dynamic';

interface DashboardLayoutProps {
  children: ReactNode;
}

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  // サーバーサイドでオンボーディングゲートをチェック
  // 未完了の場合は /onboarding/contracts にリダイレクト
  await checkOnboardingGate();

  return <DashboardClientLayout>{children}</DashboardClientLayout>;
}
