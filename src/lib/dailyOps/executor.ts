/**
 * 日次オペレーション実行エンジン
 *
 * Implementation Ticket 045: 監視＆滞留防止の自動運用
 *
 * - 各ステップは fail-soft（1つ失敗しても他は続行）
 * - 冪等（同日fingerprintで重複アラートを作成しない）
 * - warning以上のみ通知（ノイズ抑制）
 */

import type {
  DailyOpsStepName,
  DailyOpsStepResult,
  DailyOpsOptions,
  DailyOpsResult,
  NoiseSeverityThreshold,
} from './types';
import { getTodayDateString, generateDailyFingerprint } from './types';
import {
  startRun,
  addStepResult,
  finishRun,
  hasSuccessfulRunToday,
} from './repo';
import { createAlert, createAlertsFromScan } from '@/lib/alerts/repo';
import type { CreateAlertRequest, AlertSeverity } from '@/lib/alerts/types';
import { create as createNotification } from '@/lib/notifications/repo';
import { OPS_FAILURE_NOTIFICATION } from '@/config/opsSchedule';

// ========== スキャナーインポート ==========

import { scanKpiAnomalies } from '@/lib/alerts/scanners/kpi-scanner';
import { scanApprovalBacklog } from '@/lib/alerts/scanners/approval-scanner';
import { createUnclassifiedAlerts, getUnclassifiedCounts } from '@/lib/scope/createUnclassifiedAlerts';
import { createUnclassifiedScopeNotification } from '@/lib/notifications/repo';
import { scanExpired as scanExpiredLicenses, scanExpiring as scanExpiringLicenses } from '@/lib/licenses/repo';
import { getOverdueTickets, getTicketStats } from '@/lib/tickets/repo';
import { scanHighRiskOpen as scanHighRiskRepairs, getStats as getRepairsStats } from '@/lib/repairs/repo';
import { getStats as getCorrectiveActionsStats } from '@/lib/correctiveActions/repo';
import { scanOverdueSteps as scanOverdueCollectionSteps } from '@/lib/collection/repo';
import { scanMbrActionsOverdue, buildMbrOverdueAlert } from './scanMbrActionsOverdue';
import { scanExpiredConsents, getStats as getAgreementsStats, getAgreementTypeById } from '@/lib/agreements/repo';
import { scanExpiringContracts, scanDecisionOverdueContracts } from '@/lib/contracts/repo';
import type { ViewerContext } from '@/lib/business/types';

// ========== 重要度フィルタ ==========

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

function meetsSeverityThreshold(
  severity: AlertSeverity,
  threshold: NoiseSeverityThreshold
): boolean {
  return SEVERITY_ORDER[severity] >= SEVERITY_ORDER[threshold];
}

// ========== システムエラーアラート作成 ==========

/**
 * システムエラーアラートを作成（Ticket 067: 失敗時の復旧導線強化）
 *
 * - manager/admin へ通知（immediate）
 * - Ops Report に「失敗ステップ名」が見える
 */
function createSystemErrorAlert(
  stepName: DailyOpsStepName,
  errorMessage: string,
  date: string
): void {
  const fingerprint = `daily_ops:${stepName}:${date}`;

  createAlert({
    type: 'system_error',
    sourceId: stepName,
    title: `日次オペ失敗: ${stepName}`,
    message: `${errorMessage}\n\n日付: ${date}\nステップ: ${stepName}\n\n復旧方法: /api/cron/daily-ops?steps=${stepName}&force=true`,
    severity: 'critical',
    fingerprint,
    meta: {
      opsType: 'daily',
      stepName,
      date,
      errorMessage,
      // 通知対象ロール（Ticket 067）
      notifyRoles: OPS_FAILURE_NOTIFICATION.targetRoles,
      // 復旧用URL
      retryUrl: `/api/cron/daily-ops?steps=${stepName}&force=true`,
    },
  });
}

// ========== 各スキャンステップ ==========

/**
 * 未分類スコープスキャン（Task 033）
 */
async function runUnclassifiedScan(
  options: DailyOpsOptions,
  date: string
): Promise<DailyOpsStepResult> {
  const start = Date.now();
  const stepName: DailyOpsStepName = 'unclassified_scan';

  try {
    if (options.dryRun) {
      const counts = getUnclassifiedCounts();
      return {
        name: stepName,
        ok: true,
        alertsCreated: 0,
        alertsSkipped: counts.total,
        notificationsCreated: 0,
        durationMs: Date.now() - start,
      };
    }

    const result = createUnclassifiedAlerts();

    // 通知作成（warning以上の場合のみ）
    let notificationsCreated = 0;
    if (
      result.created > 0 &&
      meetsSeverityThreshold('warning', options.notificationThreshold ?? 'warning')
    ) {
      const counts = getUnclassifiedCounts();
      const notification = createUnclassifiedScopeNotification(counts);
      if (notification) notificationsCreated = 1;
    }

    return {
      name: stepName,
      ok: true,
      alertsCreated: result.created,
      alertsSkipped: result.skipped,
      notificationsCreated,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!options.dryRun) {
      createSystemErrorAlert(stepName, errorMessage, date);
    }
    return {
      name: stepName,
      ok: false,
      alertsCreated: 0,
      alertsSkipped: 0,
      notificationsCreated: 0,
      errorMessage,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * KPI異常スキャン（Task 010）
 */
async function runKpiAnomalyScan(
  options: DailyOpsOptions,
  date: string
): Promise<DailyOpsStepResult> {
  const start = Date.now();
  const stepName: DailyOpsStepName = 'kpi_anomaly_scan';

  try {
    const alerts = scanKpiAnomalies();

    if (options.dryRun) {
      return {
        name: stepName,
        ok: true,
        alertsCreated: 0,
        alertsSkipped: alerts.length,
        notificationsCreated: 0,
        durationMs: Date.now() - start,
      };
    }

    // warning以上のアラートのみ作成
    const filteredAlerts = alerts.filter((a) =>
      meetsSeverityThreshold(a.severity, options.notificationThreshold ?? 'warning')
    );

    const result = createAlertsFromScan(filteredAlerts);

    return {
      name: stepName,
      ok: true,
      alertsCreated: result.created,
      alertsSkipped: result.skipped + (alerts.length - filteredAlerts.length),
      notificationsCreated: 0, // KPIアラートは別途Webhook通知
      durationMs: Date.now() - start,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!options.dryRun) {
      createSystemErrorAlert(stepName, errorMessage, date);
    }
    return {
      name: stepName,
      ok: false,
      alertsCreated: 0,
      alertsSkipped: 0,
      notificationsCreated: 0,
      errorMessage,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * 資格期限スキャン（Task 014）
 */
async function runLicensesScan(
  options: DailyOpsOptions,
  date: string
): Promise<DailyOpsStepResult> {
  const start = Date.now();
  const stepName: DailyOpsStepName = 'licenses_scan';

  try {
    const expired = scanExpiredLicenses();
    const expiring = scanExpiringLicenses(30);

    const alerts: CreateAlertRequest[] = [];

    // 期限切れ（critical）
    for (const item of expired) {
      alerts.push({
        type: 'deadline_overdue',
        sourceId: item.userLicense.id,
        title: `資格期限切れ: ${item.user.name} - ${item.licenseType.name}`,
        message: `${item.user.name}の${item.licenseType.name}が期限切れです。早急に更新が必要です。`,
        severity: 'critical',
        fingerprint: generateDailyFingerprint('license_expired', item.userLicense.id, date),
        meta: {
          userId: item.user.id,
          userName: item.user.name,
          licenseTypeId: item.licenseType.id,
          licenseTypeName: item.licenseType.name,
          expiresAt: item.userLicense.expiresAt,
        },
      });
    }

    // 期限間近（warning）
    for (const item of expiring) {
      alerts.push({
        type: 'deadline_overdue',
        sourceId: item.userLicense.id,
        title: `資格更新要: ${item.user.name} - ${item.licenseType.name}`,
        message: `${item.user.name}の${item.licenseType.name}の期限が近づいています（${item.userLicense.expiresAt}まで）。`,
        severity: 'warning',
        fingerprint: generateDailyFingerprint('license_expiring', item.userLicense.id, date),
        meta: {
          userId: item.user.id,
          userName: item.user.name,
          licenseTypeId: item.licenseType.id,
          licenseTypeName: item.licenseType.name,
          expiresAt: item.userLicense.expiresAt,
        },
      });
    }

    if (options.dryRun) {
      return {
        name: stepName,
        ok: true,
        alertsCreated: 0,
        alertsSkipped: alerts.length,
        notificationsCreated: 0,
        durationMs: Date.now() - start,
      };
    }

    // warning以上のみ作成
    const filteredAlerts = alerts.filter((a) =>
      meetsSeverityThreshold(a.severity, options.notificationThreshold ?? 'warning')
    );

    const result = createAlertsFromScan(filteredAlerts);

    return {
      name: stepName,
      ok: true,
      alertsCreated: result.created,
      alertsSkipped: result.skipped + (alerts.length - filteredAlerts.length),
      notificationsCreated: 0,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!options.dryRun) {
      createSystemErrorAlert(stepName, errorMessage, date);
    }
    return {
      name: stepName,
      ok: false,
      alertsCreated: 0,
      alertsSkipped: 0,
      notificationsCreated: 0,
      errorMessage,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * 契約期限スキャン（Task 026）
 * 契約リポジトリから期限間近・更新判断超過の契約を検出
 */
async function runContractsScan(
  options: DailyOpsOptions,
  date: string
): Promise<DailyOpsStepResult> {
  const start = Date.now();
  const stepName: DailyOpsStepName = 'contracts_scan';

  try {
    const alerts: CreateAlertRequest[] = [];

    // 期限間近の契約（30日以内）
    const expiringContracts = scanExpiringContracts(30);
    for (const info of expiringContracts) {
      const severity: AlertSeverity =
        info.daysUntilEnd <= 7 ? 'critical' : 'warning';

      alerts.push({
        type: 'deadline_overdue',
        sourceId: info.contract.id,
        title: `契約期限間近: ${info.contract.name}`,
        message: `${info.contract.name}（${info.contract.counterpartyName}）の契約が${info.daysUntilEnd}日後に満了します。`,
        severity,
        fingerprint: generateDailyFingerprint('contract_expiring', info.contract.id, date),
        meta: {
          contractId: info.contract.id,
          contractName: info.contract.name,
          counterpartyName: info.contract.counterpartyName,
          daysUntilEnd: info.daysUntilEnd,
          endAt: info.contract.endAt,
        },
      });
    }

    // 更新判断期限超過の契約
    const overdueContracts = scanDecisionOverdueContracts();
    for (const contract of overdueContracts) {
      alerts.push({
        type: 'deadline_overdue',
        sourceId: contract.id,
        title: `契約更新判断超過: ${contract.name}`,
        message: `${contract.name}の更新判断期限が超過しています。早急に対応してください。`,
        severity: 'critical',
        fingerprint: generateDailyFingerprint('contract_decision_overdue', contract.id, date),
        meta: {
          contractId: contract.id,
          contractName: contract.name,
          counterpartyName: contract.counterpartyName,
          renewalDecisionDueAt: contract.renewalDecisionDueAt,
        },
      });
    }

    if (options.dryRun) {
      return {
        name: stepName,
        ok: true,
        alertsCreated: 0,
        alertsSkipped: alerts.length,
        notificationsCreated: 0,
        durationMs: Date.now() - start,
      };
    }

    const filteredAlerts = alerts.filter((a) =>
      meetsSeverityThreshold(a.severity, options.notificationThreshold ?? 'warning')
    );

    const result = createAlertsFromScan(filteredAlerts);

    return {
      name: stepName,
      ok: true,
      alertsCreated: result.created,
      alertsSkipped: result.skipped + (alerts.length - filteredAlerts.length),
      notificationsCreated: 0,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!options.dryRun) {
      createSystemErrorAlert(stepName, errorMessage, date);
    }
    return {
      name: stepName,
      ok: false,
      alertsCreated: 0,
      alertsSkipped: 0,
      notificationsCreated: 0,
      errorMessage,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * 同意書期限スキャン（Task 024）
 */
async function runAgreementsScan(
  options: DailyOpsOptions,
  date: string
): Promise<DailyOpsStepResult> {
  const start = Date.now();
  const stepName: DailyOpsStepName = 'agreements_scan';

  try {
    const expiredConsents = scanExpiredConsents();

    const alerts: CreateAlertRequest[] = [];

    for (const consent of expiredConsents) {
      const agreementType = getAgreementTypeById(consent.agreementTypeId);
      const typeName = agreementType?.title ?? consent.agreementTypeId;
      const subjectName = consent.subjectName;

      alerts.push({
        type: 'agreement_risk',
        sourceId: consent.id,
        title: `同意書期限切れ: ${subjectName} - ${typeName}`,
        message: `${subjectName}の${typeName}が期限切れです。更新が必要です。`,
        severity: 'warning',
        fingerprint: generateDailyFingerprint('agreement_expired', consent.id, date),
        meta: {
          consentId: consent.id,
          subjectId: consent.subjectId,
          subjectName: subjectName,
          agreementTypeName: typeName,
          validUntil: consent.validUntil,
        },
      });
    }

    if (options.dryRun) {
      return {
        name: stepName,
        ok: true,
        alertsCreated: 0,
        alertsSkipped: alerts.length,
        notificationsCreated: 0,
        durationMs: Date.now() - start,
      };
    }

    const filteredAlerts = alerts.filter((a) =>
      meetsSeverityThreshold(a.severity, options.notificationThreshold ?? 'warning')
    );

    const result = createAlertsFromScan(filteredAlerts);

    return {
      name: stepName,
      ok: true,
      alertsCreated: result.created,
      alertsSkipped: result.skipped + (alerts.length - filteredAlerts.length),
      notificationsCreated: 0,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!options.dryRun) {
      createSystemErrorAlert(stepName, errorMessage, date);
    }
    return {
      name: stepName,
      ok: false,
      alertsCreated: 0,
      alertsSkipped: 0,
      notificationsCreated: 0,
      errorMessage,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * チケット滞留スキャン（Task 010/002）
 */
async function runTicketsBacklogScan(
  options: DailyOpsOptions,
  date: string
): Promise<DailyOpsStepResult> {
  const start = Date.now();
  const stepName: DailyOpsStepName = 'tickets_backlog_scan';

  try {
    const overdueTickets = getOverdueTickets();

    const alerts: CreateAlertRequest[] = [];

    for (const ticket of overdueTickets) {
      // 期限超過日数で重要度を判定
      const dueDate = new Date(ticket.dueAt!);
      const today = new Date();
      const daysOverdue = Math.floor(
        (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      const severity: AlertSeverity =
        daysOverdue >= 7 ? 'critical' : daysOverdue >= 3 ? 'warning' : 'info';

      alerts.push({
        type: 'ticket_backlog',
        sourceId: ticket.id,
        title: `チケット期限超過: ${ticket.title}`,
        message: `チケット「${ticket.title}」が${daysOverdue}日間期限を超過しています。`,
        severity,
        fingerprint: generateDailyFingerprint('ticket_overdue', ticket.id, date),
        meta: {
          ticketId: ticket.id,
          title: ticket.title,
          priority: ticket.priority,
          dueAt: ticket.dueAt,
          daysOverdue,
          assigneeUserId: ticket.assigneeUserId,
        },
      });
    }

    if (options.dryRun) {
      return {
        name: stepName,
        ok: true,
        alertsCreated: 0,
        alertsSkipped: alerts.length,
        notificationsCreated: 0,
        durationMs: Date.now() - start,
      };
    }

    const filteredAlerts = alerts.filter((a) =>
      meetsSeverityThreshold(a.severity, options.notificationThreshold ?? 'warning')
    );

    const result = createAlertsFromScan(filteredAlerts);

    return {
      name: stepName,
      ok: true,
      alertsCreated: result.created,
      alertsSkipped: result.skipped + (alerts.length - filteredAlerts.length),
      notificationsCreated: 0,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!options.dryRun) {
      createSystemErrorAlert(stepName, errorMessage, date);
    }
    return {
      name: stepName,
      ok: false,
      alertsCreated: 0,
      alertsSkipped: 0,
      notificationsCreated: 0,
      errorMessage,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * 修繕リスクスキャン（Task 011/002）
 */
async function runRepairsRiskScan(
  options: DailyOpsOptions,
  date: string
): Promise<DailyOpsStepResult> {
  const start = Date.now();
  const stepName: DailyOpsStepName = 'repairs_risk_scan';

  try {
    const highRiskRepairs = scanHighRiskRepairs();

    const alerts: CreateAlertRequest[] = [];

    for (const repair of highRiskRepairs) {
      const severity: AlertSeverity =
        repair.safetyRisk === 'high' ? 'critical' : 'warning';

      alerts.push({
        type: 'deadline_overdue',
        sourceId: repair.id,
        title: `修繕リスク: ${repair.title}`,
        message: `修繕「${repair.title}」は高リスク（${repair.safetyRisk}）です。早急な対応が必要です。`,
        severity,
        fingerprint: generateDailyFingerprint('repair_risk', repair.id, date),
        meta: {
          repairId: repair.id,
          title: repair.title,
          safetyRisk: repair.safetyRisk,
          status: repair.status,
          location: repair.location,
        },
      });
    }

    if (options.dryRun) {
      return {
        name: stepName,
        ok: true,
        alertsCreated: 0,
        alertsSkipped: alerts.length,
        notificationsCreated: 0,
        durationMs: Date.now() - start,
      };
    }

    const filteredAlerts = alerts.filter((a) =>
      meetsSeverityThreshold(a.severity, options.notificationThreshold ?? 'warning')
    );

    const result = createAlertsFromScan(filteredAlerts);

    return {
      name: stepName,
      ok: true,
      alertsCreated: result.created,
      alertsSkipped: result.skipped + (alerts.length - filteredAlerts.length),
      notificationsCreated: 0,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!options.dryRun) {
      createSystemErrorAlert(stepName, errorMessage, date);
    }
    return {
      name: stepName,
      ok: false,
      alertsCreated: 0,
      alertsSkipped: 0,
      notificationsCreated: 0,
      errorMessage,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * 是正措置遅延スキャン（Task 017/002）
 */
async function runCorrectiveActionsScan(
  options: DailyOpsOptions,
  date: string
): Promise<DailyOpsStepResult> {
  const start = Date.now();
  const stepName: DailyOpsStepName = 'corrective_actions_scan';

  try {
    // 統計から遅延状況を取得
    const systemViewer: ViewerContext = { userId: 'system', role: 'admin' };
    const stats = getCorrectiveActionsStats(systemViewer);

    const alerts: CreateAlertRequest[] = [];

    // 未完了件数が多い場合にアラート
    if (stats && stats.overdue > 0) {
      const severity: AlertSeverity =
        stats.overdue >= 5 ? 'critical' : 'warning';

      alerts.push({
        type: 'deadline_overdue',
        sourceId: null,
        title: `是正措置遅延: ${stats.overdue}件`,
        message: `${stats.overdue}件の是正措置が期限を超過しています。`,
        severity,
        fingerprint: generateDailyFingerprint('ca_overdue_summary', 'all', date),
        meta: {
          overdueCount: stats.overdue,
          openCount: stats.open,
        },
      });
    }

    if (options.dryRun) {
      return {
        name: stepName,
        ok: true,
        alertsCreated: 0,
        alertsSkipped: alerts.length,
        notificationsCreated: 0,
        durationMs: Date.now() - start,
      };
    }

    const filteredAlerts = alerts.filter((a) =>
      meetsSeverityThreshold(a.severity, options.notificationThreshold ?? 'warning')
    );

    const result = createAlertsFromScan(filteredAlerts);

    return {
      name: stepName,
      ok: true,
      alertsCreated: result.created,
      alertsSkipped: result.skipped + (alerts.length - filteredAlerts.length),
      notificationsCreated: 0,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!options.dryRun) {
      createSystemErrorAlert(stepName, errorMessage, date);
    }
    return {
      name: stepName,
      ok: false,
      alertsCreated: 0,
      alertsSkipped: 0,
      notificationsCreated: 0,
      errorMessage,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * 回収フロー遅延スキャン（Task 021）
 */
async function runCollectionFlowScan(
  options: DailyOpsOptions,
  date: string
): Promise<DailyOpsStepResult> {
  const start = Date.now();
  const stepName: DailyOpsStepName = 'collection_flow_scan';

  try {
    const overdueSteps = scanOverdueCollectionSteps();

    const alerts: CreateAlertRequest[] = [];

    for (const info of overdueSteps) {
      const severity: AlertSeverity =
        info.overdueDays >= 14 ? 'critical' : info.overdueDays >= 7 ? 'warning' : 'info';

      const flowId = info.stepLog.receivableId;
      const stepName = info.step?.actionType ?? `ステップ${info.stepLog.stepOrder}`;

      alerts.push({
        type: 'collection_flow_risk',
        sourceId: flowId,
        title: `回収フロー遅延: ${stepName}`,
        message: `回収フローステップ「${stepName}」が${info.overdueDays}日遅延しています。`,
        severity,
        fingerprint: generateDailyFingerprint('collection_step_overdue', flowId, date),
        meta: {
          receivableId: info.stepLog.receivableId,
          stepLogId: info.stepLog.id,
          stepName,
          overdueDays: info.overdueDays,
        },
      });
    }

    if (options.dryRun) {
      return {
        name: stepName,
        ok: true,
        alertsCreated: 0,
        alertsSkipped: alerts.length,
        notificationsCreated: 0,
        durationMs: Date.now() - start,
      };
    }

    const filteredAlerts = alerts.filter((a) =>
      meetsSeverityThreshold(a.severity, options.notificationThreshold ?? 'warning')
    );

    const result = createAlertsFromScan(filteredAlerts);

    return {
      name: stepName,
      ok: true,
      alertsCreated: result.created,
      alertsSkipped: result.skipped + (alerts.length - filteredAlerts.length),
      notificationsCreated: 0,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!options.dryRun) {
      createSystemErrorAlert(stepName, errorMessage, date);
    }
    return {
      name: stepName,
      ok: false,
      alertsCreated: 0,
      alertsSkipped: 0,
      notificationsCreated: 0,
      errorMessage,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * MBR改善タスク期限超過スキャン（Ticket 130）
 */
async function runMbrActionsOverdueScan(
  options: DailyOpsOptions,
  date: string
): Promise<DailyOpsStepResult> {
  const start = Date.now();
  const stepName: DailyOpsStepName = 'mbr_actions_overdue_scan';

  try {
    const overdueItems = scanMbrActionsOverdue();
    const alertRequest = buildMbrOverdueAlert(overdueItems, date);

    if (!alertRequest) {
      return {
        name: stepName,
        ok: true,
        alertsCreated: 0,
        alertsSkipped: 0,
        notificationsCreated: 0,
        durationMs: Date.now() - start,
      };
    }

    if (options.dryRun) {
      return {
        name: stepName,
        ok: true,
        alertsCreated: 0,
        alertsSkipped: 1,
        notificationsCreated: 0,
        durationMs: Date.now() - start,
      };
    }

    // 重要度フィルタ
    if (!meetsSeverityThreshold(alertRequest.severity, options.notificationThreshold ?? 'warning')) {
      return {
        name: stepName,
        ok: true,
        alertsCreated: 0,
        alertsSkipped: 1,
        notificationsCreated: 0,
        durationMs: Date.now() - start,
      };
    }

    const result = createAlertsFromScan([alertRequest]);

    // 通知作成（manager/admin向け）
    let notificationsCreated = 0;
    if (result.created > 0) {
      const notifFingerprint = `notif:mbr_overdue:${date}`;
      const overdue7Count = overdueItems.filter((i) => i.overdueDays >= 7).length;
      const notifSeverity = overdue7Count > 0 ? 'critical' : 'warning';

      const notifResult = createNotification({
        tenantId: 'default',
        userId: 'role:manager',
        type: 'mbr_action_overdue' as Parameters<typeof createNotification>[0]['type'],
        title: 'MBR改善タスク 期限超過',
        message: alertRequest.message,
        severity: notifSeverity,
        fingerprint: notifFingerprint,
        url: '/dashboard/corrective-actions?sourceType=mbr_focus&overdue=true',
        metadata: {
          targetRole: 'manager',
          detectedAt: new Date().toISOString(),
        },
      });
      if (notifResult.isNew) notificationsCreated++;
    }

    return {
      name: stepName,
      ok: true,
      alertsCreated: result.created,
      alertsSkipped: result.skipped,
      notificationsCreated,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!options.dryRun) {
      createSystemErrorAlert(stepName, errorMessage, date);
    }
    return {
      name: stepName,
      ok: false,
      alertsCreated: 0,
      alertsSkipped: 0,
      notificationsCreated: 0,
      errorMessage,
      durationMs: Date.now() - start,
    };
  }
}

// ========== ステップ実行マップ ==========

const STEP_EXECUTORS: Record<
  DailyOpsStepName,
  (options: DailyOpsOptions, date: string) => Promise<DailyOpsStepResult>
> = {
  unclassified_scan: runUnclassifiedScan,
  kpi_anomaly_scan: runKpiAnomalyScan,
  licenses_scan: runLicensesScan,
  contracts_scan: runContractsScan,
  agreements_scan: runAgreementsScan,
  tickets_backlog_scan: runTicketsBacklogScan,
  repairs_risk_scan: runRepairsRiskScan,
  corrective_actions_scan: runCorrectiveActionsScan,
  collection_flow_scan: runCollectionFlowScan,
  mbr_actions_overdue_scan: runMbrActionsOverdueScan,
};

const DEFAULT_STEPS: DailyOpsStepName[] = [
  'unclassified_scan',
  'kpi_anomaly_scan',
  'licenses_scan',
  'contracts_scan',
  'agreements_scan',
  'tickets_backlog_scan',
  'repairs_risk_scan',
  'corrective_actions_scan',
  'collection_flow_scan',
  'mbr_actions_overdue_scan',
];

// ========== メイン実行関数 ==========

/**
 * 日次オペレーションを実行
 */
export async function executeDailyOps(
  options: DailyOpsOptions = {}
): Promise<DailyOpsResult> {
  const date = getTodayDateString();
  const isDryRun = options.dryRun === true;

  // 同日既に成功している場合はスキップ（force=trueでない限り、dryRunモードでは常に実行）
  if (!isDryRun && !options.force && hasSuccessfulRunToday(date)) {
    return {
      run: {
        id: '',
        date,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        ok: true,
        steps: [],
        totalAlertsCreated: 0,
        totalAlertsSkipped: 0,
        totalNotifications: 0,
      },
      skipped: true,
      reason: '同日に既に実行済みです',
    };
  }

  // 実行開始（dryRunモードでは記録しない）
  const run = isDryRun
    ? {
        id: `dryrun_${Date.now()}`,
        date,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        ok: true,
        steps: [] as DailyOpsStepResult[],
        totalAlertsCreated: 0,
        totalAlertsSkipped: 0,
        totalNotifications: 0,
      }
    : startRun(date);
  const stepsToRun = options.steps ?? DEFAULT_STEPS;

  let hasError = false;
  const stepResults: DailyOpsStepResult[] = [];

  // 各ステップを順番に実行
  for (const stepName of stepsToRun) {
    const executor = STEP_EXECUTORS[stepName];
    if (!executor) {
      console.warn(`[DailyOps] Unknown step: ${stepName}`);
      continue;
    }

    console.log(`[DailyOps] Running step: ${stepName}${isDryRun ? ' (preview)' : ''}`);
    const result = await executor(options, date);
    stepResults.push(result);

    if (!isDryRun) {
      addStepResult(run.id, result);
    }

    if (!result.ok) {
      hasError = true;
      console.error(`[DailyOps] Step failed: ${stepName} - ${result.errorMessage}`);
    } else {
      console.log(
        `[DailyOps] Step completed: ${stepName} - created: ${result.alertsCreated}, skipped: ${result.alertsSkipped}`
      );
    }
  }

  // 実行完了
  if (isDryRun) {
    // dryRunモードでは記録せずに結果を構築
    const totalAlertsCreated = stepResults.reduce((sum, s) => sum + s.alertsCreated, 0);
    const totalAlertsSkipped = stepResults.reduce((sum, s) => sum + s.alertsSkipped, 0);
    const totalNotifications = stepResults.reduce((sum, s) => sum + s.notificationsCreated, 0);

    return {
      run: {
        id: run.id,
        date,
        startedAt: run.startedAt,
        finishedAt: new Date().toISOString(),
        ok: !hasError,
        steps: stepResults,
        totalAlertsCreated,
        totalAlertsSkipped,
        totalNotifications,
        errorMessage: hasError ? '一部ステップでエラーが発生しました' : undefined,
      },
      skipped: false,
    };
  }

  const finishedRun = finishRun(
    run.id,
    !hasError,
    hasError ? '一部ステップでエラーが発生しました' : undefined
  );

  return {
    run: finishedRun ?? run,
    skipped: false,
  };
}

/**
 * プレビュー実行（dryRun）
 */
export async function previewDailyOps(
  options: Omit<DailyOpsOptions, 'dryRun'> = {}
): Promise<DailyOpsResult> {
  return executeDailyOps({ ...options, dryRun: true });
}
