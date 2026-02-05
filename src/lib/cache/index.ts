/**
 * キャッシュユーティリティ
 *
 * Ticket 076: キャッシュ戦略
 */

export {
  VACANCY_TAG,
  getVacancyTagForBusinessUnit,
  revalidateAllVacancies,
  revalidateVacanciesForBusinessUnit,
  getPublicVacanciesFetchOptions,
} from './vacancyTags';
