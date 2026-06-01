/**
 * Launch Mode 設定
 *
 * false = 全機能公開（通常運用）
 * true  = 制限付き公開（段階的カットオーバー用）
 *
 * 環境変数 NEXT_PUBLIC_LAUNCH_MODE=true で再度有効化可能
 */

export const LAUNCH_MODE = process.env.NEXT_PUBLIC_LAUNCH_MODE === 'true';

/**
 * Launch Mode が有効かどうかを判定
 */
export function isLaunchMode(): boolean {
  return LAUNCH_MODE;
}

/**
 * 環境表示用ラベル
 */
export function getEnvironmentLabel(): 'Production' | 'Preview' | 'Development' {
  if (process.env.VERCEL_ENV === 'production') return 'Production';
  if (process.env.VERCEL_ENV === 'preview') return 'Preview';
  return 'Development';
}
