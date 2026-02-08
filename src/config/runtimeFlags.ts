/**
 * ランタイムフラグ
 *
 * 本番環境での seed/デモデータ生成を防止するフラグ
 */

/** 本番環境か判定 */
export const isProduction = process.env.NODE_ENV === 'production';

/** デモモードが有効か（NEXT_PUBLIC_DEMO_MODE=true のみ） */
export const isDemoEnabled = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

/** デモ seed が許可されるか（本番でないかつデモモード有効の場合のみ） */
export const allowDemoSeed = !isProduction || isDemoEnabled;

/**
 * デモ seed ガード
 * 本番で seed が走らないことを保証
 */
export function guardDemoSeed(context: string): boolean {
  if (!allowDemoSeed) {
    console.warn(`[RuntimeFlags] Demo seed blocked in production: ${context}`);
    return false;
  }
  return true;
}
