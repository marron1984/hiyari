/**
 * Scope Guardrail & Unclassified Monitoring
 *
 * Implementation Ticket 033: 未分類ガードレールと監視アラート
 *
 * このモジュールは以下の機能を提供します:
 * - ガードレール: manager/leader作成時のbusinessUnitId必須化
 * - 検知: businessUnitId未分類レコードの検出
 * - アラート: 未分類検出時のアラートセンター連携
 * - 通知: 未分類検出時の通知センター連携
 * - WBR: 週次レビューへの未分類件数表示
 */

// Types
export * from './types';

// Guardrail validation
export {
  validateBusinessUnitGuardrail,
  validateApiGuardrail,
  canCreateUnclassified,
  getGuardrailErrorMessage,
} from './guardrail';

// Detection
export {
  detectUnclassifiedTickets,
  detectUnclassifiedRepairs,
  detectUnclassifiedCorrectiveActions,
  detectAllUnclassified,
  getUnclassifiedCounts,
  hasUnclassifiedRecords,
  getDetectionSummaryMessage,
  ENTITY_TYPE_LABELS,
} from './detectUnclassifiedBusinessUnit';

// Alert integration
export {
  createUnclassifiedAlerts,
  createUnclassifiedSummaryAlert,
} from './createUnclassifiedAlerts';

// Notification integration
export {
  createUnclassifiedNotificationInput,
  createUnclassifiedNotifications,
  shouldSendUnclassifiedNotification,
  getNotificationPriority,
} from './notifyUnclassified';
