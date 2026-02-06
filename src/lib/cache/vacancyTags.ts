/**
 * 空室情報キャッシュタグ管理
 *
 * Ticket 076: /vacancies のキャッシュ戦略
 *
 * Next.js App Router の revalidateTag を使用して
 * 空室情報の更新時にキャッシュを即時無効化する
 */

import { revalidateTag } from 'next/cache';

// ========== タグ定義 ==========

/**
 * 全空室情報のキャッシュタグ
 */
export const VACANCY_TAG = 'vacancies';

/**
 * キャッシュプロファイル（Next.js 16+）
 * - 'default': 標準のキャッシュ動作
 */
const CACHE_PROFILE = 'default';

/**
 * 事業単位別のキャッシュタグを生成
 */
export function getVacancyTagForBusinessUnit(businessUnitId: string): string {
  return `vacancies:${businessUnitId}`;
}

// ========== キャッシュ無効化 ==========

/**
 * 全空室キャッシュを無効化
 */
export function revalidateAllVacancies(): void {
  try {
    revalidateTag(VACANCY_TAG, CACHE_PROFILE);
  } catch (error) {
    // revalidateTag はサーバーコンポーネント/Route Handler でのみ使用可能
    // クライアントから呼ばれた場合は無視
    console.warn('[VacancyCache] revalidateTag called outside server context:', error);
  }
}

/**
 * 特定事業単位の空室キャッシュを無効化
 */
export function revalidateVacanciesForBusinessUnit(businessUnitId: string): void {
  try {
    revalidateTag(getVacancyTagForBusinessUnit(businessUnitId), CACHE_PROFILE);
    // 全体キャッシュも無効化（公開ページは全事業を表示するため）
    revalidateTag(VACANCY_TAG, CACHE_PROFILE);
  } catch (error) {
    console.warn('[VacancyCache] revalidateTag called outside server context:', error);
  }
}

// ========== fetch用オプション ==========

/**
 * 公開空室取得用のfetchオプション
 *
 * - 60秒のTTL（ISR的動作）
 * - tagsでrevalidate可能
 */
export function getPublicVacanciesFetchOptions(businessUnitId?: string): RequestInit & { next: { revalidate: number; tags: string[] } } {
  const tags = [VACANCY_TAG];
  if (businessUnitId) {
    tags.push(getVacancyTagForBusinessUnit(businessUnitId));
  }

  return {
    next: {
      revalidate: 60, // 60秒TTL
      tags,
    },
  };
}
