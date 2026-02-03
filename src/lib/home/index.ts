/**
 * Home モジュール
 *
 * Implementation Ticket 060: 朝イチダイジェスト通知（055）と Role Home（059）を連動
 *
 * 役職別ホーム機能の共通ロジックをエクスポート
 */

// Today's Top3
export {
  buildTodayTop3,
  buildTodayTop3ForRoles,
  formatTop3AsText,
  formatTop3AsSummary,
  type TodayTop3Item,
  type TodayTop3Result,
} from './buildTodayTop3';

// Daily Digest
export {
  buildDailyDigest,
  buildDailyDigestForRoles,
  formatDigestAsMessage,
  formatDigestAsShortMessage,
  isDigestEmpty,
  type DailyDigest,
  type RiskSummary,
} from './buildDailyDigest';

// Morning Digest Sender
export {
  sendMorningDigest,
  sendMorningDigestForRole,
  previewMorningDigest,
  type SendDigestOptions,
  type SendDigestResult,
} from './sendMorningDigest';
