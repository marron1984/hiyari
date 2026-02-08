/**
 * Launch Mode 設定
 *
 * 先行カットオーバー用：4機能のみ公開（入居希望／空室／打刻／承認）
 *
 * デフォルト: true（本番カットオーバー状態）
 * 全機能を開放する場合: NEXT_PUBLIC_LAUNCH_MODE=false を設定
 */

export const LAUNCH_MODE = process.env.NEXT_PUBLIC_LAUNCH_MODE !== 'false';

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
