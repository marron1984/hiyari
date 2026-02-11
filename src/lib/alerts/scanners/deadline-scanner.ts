/**
 * 期限超過スキャナー
 *
 * 契約期限・資格期限・研修期限の超過をチェックしてアラートを生成
 * 実データソース（contracts, licenses, training）から取得
 */

import type { CreateAlertRequest } from '../types';
import { generateFingerprint } from '../types';
import { scanExpiringContracts } from '@/lib/contracts/repo.firestore';
import { scanExpired as scanExpiredLicenses } from '@/lib/licenses/repo.firestore';
import { overdueAssignmentsScan } from '@/lib/training/repo.firestore';

/**
 * 期限超過アイテム
 */
interface OverdueItem {
  id: string;
  entityType: '契約' | 'タスク' | '資格' | '研修';
  name: string;
  deadline: string;
  daysOverdue: number;
}

/**
 * 期限超過をスキャンしてアラートリクエストを生成
 */
export async function scanDeadlines(): Promise<CreateAlertRequest[]> {
  const alerts: CreateAlertRequest[] = [];
  const today = new Date().toISOString().split('T')[0];

  const overdueItems = await getOverdueItems();

  for (const item of overdueItems) {
    const severity = item.daysOverdue >= 7
      ? 'critical'
      : item.daysOverdue >= 3
        ? 'warning'
        : 'info';

    alerts.push({
      type: 'deadline_overdue',
      sourceId: item.id,
      title: `${item.entityType}: ${item.name}が期限超過`,
      message: `${item.name}の期限が${item.daysOverdue}日超過しています。対応が必要です。`,
      severity,
      fingerprint: generateFingerprint('deadline_overdue', item.id, today),
      meta: {
        entityType: item.entityType,
        entityId: item.id,
        name: item.name,
        deadline: item.deadline,
        daysOverdue: item.daysOverdue,
      },
    });
  }

  return alerts;
}

/**
 * 実データソースから期限超過アイテムを収集
 */
async function getOverdueItems(): Promise<OverdueItem[]> {
  const items: OverdueItem[] = [];
  const now = new Date();

  // 1. 契約期限超過（daysUntilEnd <= 0 の契約）
  try {
    const expiringContracts = await scanExpiringContracts(90);
    for (const info of expiringContracts) {
      if (info.daysUntilEnd <= 0) {
        items.push({
          id: info.contract.id,
          entityType: '契約',
          name: info.contract.name || `契約 ${info.contract.id}`,
          deadline: info.contract.endAt || '',
          daysOverdue: Math.abs(info.daysUntilEnd),
        });
      }
    }
  } catch (e) {
    console.error('[deadline-scanner] contracts scan error:', e);
  }

  // 2. 資格期限超過
  try {
    const expiredLicenses = await scanExpiredLicenses();
    for (const li of expiredLicenses) {
      const expiresAt = li.userLicense.expiresAt;
      const daysOverdue = expiresAt
        ? Math.floor((now.getTime() - new Date(expiresAt).getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      if (daysOverdue > 0) {
        items.push({
          id: li.userLicense.id,
          entityType: '資格',
          name: `${li.licenseType.name}（${li.user.name ?? '不明'}）`,
          deadline: expiresAt || '',
          daysOverdue,
        });
      }
    }
  } catch (e) {
    console.error('[deadline-scanner] licenses scan error:', e);
  }

  // 3. 研修期限超過
  try {
    const overdueTraining = await overdueAssignmentsScan();
    for (const a of overdueTraining) {
      const dueAt = a.dueAt;
      const daysOverdue = dueAt
        ? Math.floor((now.getTime() - new Date(dueAt).getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      if (daysOverdue > 0) {
        items.push({
          id: a.id,
          entityType: '研修',
          name: (a as { sessionName?: string }).sessionName || `研修 ${a.sessionId}`,
          deadline: dueAt || '',
          daysOverdue,
        });
      }
    }
  } catch (e) {
    console.error('[deadline-scanner] training scan error:', e);
  }

  return items;
}
