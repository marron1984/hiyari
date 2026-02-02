/**
 * 同意書リスク検知
 *
 * 期限切れ・期限接近の同意書をスキャンし、アラートを生成
 */

import { scanExpiringConsents, scanExpiredConsents, getAgreementTypeById } from './repo';
import type { CreateAlertRequest } from '@/lib/alerts/types';

/**
 * 同意書リスクを検知してアラートリクエストを生成
 */
export function detectAgreementRisks(): CreateAlertRequest[] {
  const alerts: CreateAlertRequest[] = [];
  const todayStr = new Date().toISOString().split('T')[0];

  const expiredConsents = scanExpiredConsents();
  const expiringConsents = scanExpiringConsents();

  // 期限切れアラート
  if (expiredConsents.length > 0) {
    // 件数に応じてseverityを変える
    const severity = expiredConsents.length >= 5 ? 'critical' : 'warning';

    // タイプ別の集計
    const byType: Record<string, number> = {};
    for (const consent of expiredConsents) {
      const agreementType = getAgreementTypeById(consent.agreementTypeId);
      const typeName = agreementType?.title ?? '不明';
      byType[typeName] = (byType[typeName] ?? 0) + 1;
    }

    const typeDetails = Object.entries(byType)
      .map(([name, count]) => `${name}: ${count}件`)
      .join('、');

    alerts.push({
      type: 'agreement_risk',
      severity,
      title: `同意書期限切れ: ${expiredConsents.length}件`,
      message: `${expiredConsents.length}件の同意書が期限切れです。\n内訳: ${typeDetails}\n\n早急に更新対応が必要です。`,
      fingerprint: `agreement:expired:${todayStr}`,
      assignedRole: 'manager',
      meta: {
        expiredCount: expiredConsents.length,
        byType,
        url: '/dashboard/consent?tab=expired',
      },
    });
  }

  // 期限接近アラート（期限切れとは別に）
  if (expiringConsents.length > 0) {
    // 期限接近は info または warning
    const severity = expiringConsents.length >= 10 ? 'warning' : 'info';

    // タイプ別の集計
    const byType: Record<string, number> = {};
    for (const consent of expiringConsents) {
      const agreementType = getAgreementTypeById(consent.agreementTypeId);
      const typeName = agreementType?.title ?? '不明';
      byType[typeName] = (byType[typeName] ?? 0) + 1;
    }

    const typeDetails = Object.entries(byType)
      .map(([name, count]) => `${name}: ${count}件`)
      .join('、');

    alerts.push({
      type: 'agreement_risk',
      severity,
      title: `同意書期限接近: ${expiringConsents.length}件`,
      message: `${expiringConsents.length}件の同意書の期限が近づいています。\n内訳: ${typeDetails}\n\n計画的な更新対応を推奨します。`,
      fingerprint: `agreement:expiring:${todayStr}`,
      assignedRole: 'manager',
      meta: {
        expiringCount: expiringConsents.length,
        byType,
        url: '/dashboard/consent?tab=expiring',
      },
    });
  }

  // 必須同意の期限切れ（特に重要なもの）
  const criticalKeys = ['privacy_consent', 'service_agreement'];
  const criticalExpired = expiredConsents.filter((c) => {
    const agreementType = getAgreementTypeById(c.agreementTypeId);
    return agreementType && criticalKeys.includes(agreementType.key);
  });

  if (criticalExpired.length > 0) {
    // 必須同意の期限切れは常にcritical
    alerts.push({
      type: 'agreement_risk',
      severity: 'critical',
      title: `必須同意書の期限切れ: ${criticalExpired.length}件`,
      message: `個人情報同意書またはサービス利用契約の期限が切れている利用者がいます。\n\n法的リスクがあるため、最優先で対応してください。`,
      fingerprint: `agreement:critical_expired:${todayStr}`,
      assignedRole: 'manager',
      meta: {
        criticalExpiredCount: criticalExpired.length,
        criticalKeys,
        url: '/dashboard/consent?tab=expired',
      },
    });
  }

  return alerts;
}
