/**
 * 承認滞留スキャナー
 *
 * 承認待ちの滞留状況をチェックしてアラートを生成
 */

import type { CreateAlertRequest } from '../types';
import { generateFingerprint } from '../types';

// 閾値設定
const PENDING_COUNT_WARNING = 10;  // 10件以上で警告
const PENDING_COUNT_CRITICAL = 20; // 20件以上で重大
const AVG_LEAD_TIME_WARNING = 48;  // 48時間以上で警告
const AVG_LEAD_TIME_CRITICAL = 72; // 72時間以上で重大

/**
 * 承認滞留をスキャンしてアラートリクエストを生成
 */
export function scanApprovalBacklog(): CreateAlertRequest[] {
  const alerts: CreateAlertRequest[] = [];
  const today = new Date().toISOString().split('T')[0];

  // TODO: 実際の承認基盤と接続
  // 暫定：モックデータで検証
  const mockBacklogStats = getMockBacklogStats();

  // 件数チェック
  if (mockBacklogStats.pendingCount >= PENDING_COUNT_CRITICAL) {
    alerts.push({
      type: 'approval_backlog',
      sourceId: null,
      title: `承認待ち ${mockBacklogStats.pendingCount}件が滞留中`,
      message: `承認待ちの申請が${mockBacklogStats.pendingCount}件溜まっています。早急な対応が必要です。`,
      severity: 'critical',
      fingerprint: generateFingerprint('approval_backlog', 'count', today),
      meta: {
        pendingCount: mockBacklogStats.pendingCount,
        threshold: PENDING_COUNT_CRITICAL,
      },
    });
  } else if (mockBacklogStats.pendingCount >= PENDING_COUNT_WARNING) {
    alerts.push({
      type: 'approval_backlog',
      sourceId: null,
      title: `承認待ち ${mockBacklogStats.pendingCount}件が滞留中`,
      message: `承認待ちの申請が${mockBacklogStats.pendingCount}件あります。確認をお願いします。`,
      severity: 'warning',
      fingerprint: generateFingerprint('approval_backlog', 'count', today),
      meta: {
        pendingCount: mockBacklogStats.pendingCount,
        threshold: PENDING_COUNT_WARNING,
      },
    });
  }

  // 平均リードタイムチェック
  if (mockBacklogStats.avgLeadTimeHours >= AVG_LEAD_TIME_CRITICAL) {
    alerts.push({
      type: 'approval_backlog',
      sourceId: null,
      title: `平均承認時間が${Math.round(mockBacklogStats.avgLeadTimeHours)}時間に達しています`,
      message: `承認までの平均時間が${Math.round(mockBacklogStats.avgLeadTimeHours)}時間を超えています。ボトルネックの確認が必要です。`,
      severity: 'critical',
      fingerprint: generateFingerprint('approval_backlog', 'leadtime', today),
      meta: {
        avgLeadTimeHours: mockBacklogStats.avgLeadTimeHours,
        threshold: AVG_LEAD_TIME_CRITICAL,
      },
    });
  } else if (mockBacklogStats.avgLeadTimeHours >= AVG_LEAD_TIME_WARNING) {
    alerts.push({
      type: 'approval_backlog',
      sourceId: null,
      title: `平均承認時間が${Math.round(mockBacklogStats.avgLeadTimeHours)}時間`,
      message: `承認までの平均時間が長くなっています。`,
      severity: 'warning',
      fingerprint: generateFingerprint('approval_backlog', 'leadtime', today),
      meta: {
        avgLeadTimeHours: mockBacklogStats.avgLeadTimeHours,
        threshold: AVG_LEAD_TIME_WARNING,
      },
    });
  }

  return alerts;
}

/**
 * モック：承認滞留統計
 * TODO: 実際の承認基盤から取得
 */
function getMockBacklogStats(): {
  pendingCount: number;
  avgLeadTimeHours: number;
} {
  // デモ用：ランダムな値（本番では実データを使用）
  return {
    pendingCount: Math.floor(Math.random() * 25), // 0-24件
    avgLeadTimeHours: Math.random() * 80, // 0-80時間
  };
}
