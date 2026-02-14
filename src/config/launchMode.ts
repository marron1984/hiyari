/**
 * Launch Mode 設定
 *
 * 本番オープン済み：全機能開放（デフォルト false）
 * 一時的に機能を制限したい場合: NEXT_PUBLIC_LAUNCH_MODE=true を設定
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
