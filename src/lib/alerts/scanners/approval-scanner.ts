/**
 * 承認滞留スキャナー
 *
 * 承認待ちの滞留状況をチェックしてアラートを生成
 * 実データソース（approvals/requestRepo）から取得
 */

import type { CreateAlertRequest } from '../types';
import { generateFingerprint } from '../types';
import {
  countPendingRequests,
  getOldestPendingRequest,
} from '@/lib/approvals/requestRepo.firestore';

// 閾値設定
const PENDING_COUNT_WARNING = 10;  // 10件以上で警告
const PENDING_COUNT_CRITICAL = 20; // 20件以上で重大
const AVG_LEAD_TIME_WARNING = 48;  // 48時間以上で警告
const AVG_LEAD_TIME_CRITICAL = 72; // 72時間以上で重大

/**
 * 承認滞留をスキャンしてアラートリクエストを生成
 */
export async function scanApprovalBacklog(): Promise<CreateAlertRequest[]> {
  const alerts: CreateAlertRequest[] = [];
  const today = new Date().toISOString().split('T')[0];

  const backlogStats = await getBacklogStats();

  // 件数チェック
  if (backlogStats.pendingCount >= PENDING_COUNT_CRITICAL) {
    alerts.push({
      type: 'approval_backlog',
      sourceId: null,
      title: `承認待ち ${backlogStats.pendingCount}件が滞留中`,
      message: `承認待ちの申請が${backlogStats.pendingCount}件溜まっています。早急な対応が必要です。`,
      severity: 'critical',
      fingerprint: generateFingerprint('approval_backlog', 'count', today),
      meta: {
        pendingCount: backlogStats.pendingCount,
        threshold: PENDING_COUNT_CRITICAL,
      },
    });
  } else if (backlogStats.pendingCount >= PENDING_COUNT_WARNING) {
    alerts.push({
      type: 'approval_backlog',
      sourceId: null,
      title: `承認待ち ${backlogStats.pendingCount}件が滞留中`,
      message: `承認待ちの申請が${backlogStats.pendingCount}件あります。確認をお願いします。`,
      severity: 'warning',
      fingerprint: generateFingerprint('approval_backlog', 'count', today),
      meta: {
        pendingCount: backlogStats.pendingCount,
        threshold: PENDING_COUNT_WARNING,
      },
    });
  }

  // 平均リードタイムチェック
  if (backlogStats.avgLeadTimeHours >= AVG_LEAD_TIME_CRITICAL) {
    alerts.push({
      type: 'approval_backlog',
      sourceId: null,
      title: `平均承認時間が${Math.round(backlogStats.avgLeadTimeHours)}時間に達しています`,
      message: `承認までの平均時間が${Math.round(backlogStats.avgLeadTimeHours)}時間を超えています。ボトルネックの確認が必要です。`,
      severity: 'critical',
      fingerprint: generateFingerprint('approval_backlog', 'leadtime', today),
      meta: {
        avgLeadTimeHours: backlogStats.avgLeadTimeHours,
        threshold: AVG_LEAD_TIME_CRITICAL,
      },
    });
  } else if (backlogStats.avgLeadTimeHours >= AVG_LEAD_TIME_WARNING) {
    alerts.push({
      type: 'approval_backlog',
      sourceId: null,
      title: `平均承認時間が${Math.round(backlogStats.avgLeadTimeHours)}時間`,
      message: `承認までの平均時間が長くなっています。`,
      severity: 'warning',
      fingerprint: generateFingerprint('approval_backlog', 'leadtime', today),
      meta: {
        avgLeadTimeHours: backlogStats.avgLeadTimeHours,
        threshold: AVG_LEAD_TIME_WARNING,
      },
    });
  }

  return alerts;
}

/**
 * 実データから承認滞留統計を算出
 */
async function getBacklogStats(): Promise<{
  pendingCount: number;
  avgLeadTimeHours: number;
}> {
  try {
    const pendingCount = await countPendingRequests();

    // 最古の承認待ちからリードタイムを推定
    let avgLeadTimeHours = 0;
    const oldest = await getOldestPendingRequest();
    if (oldest && oldest.createdAt) {
      const createdAt = new Date(oldest.createdAt);
      const now = new Date();
      const hoursElapsed = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
      // 最古のリクエストの待ち時間を平均の概算として使用
      // （実際の平均はより短いが、最古が長いほど問題の兆候）
      avgLeadTimeHours = hoursElapsed;
    }

    return { pendingCount, avgLeadTimeHours };
  } catch (e) {
    console.error('[approval-scanner] backlog stats error:', e);
    return { pendingCount: 0, avgLeadTimeHours: 0 };
  }
}
