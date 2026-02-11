/**
 * 品質・リスク横断サマリーAPI
 *
 * 複数ドメインからの集計データを統合して返す
 */

import { NextResponse } from 'next/server';
import * as alertsRepo from '@/lib/alerts/repo.firestore';
import * as complaintsRepo from '@/lib/complaints/repo.firestore';
import * as trainingRepo from '@/lib/training/repo.firestore';
import * as receivablesRepo from '@/lib/receivables/repo.firestore';
import * as collectionRepo from '@/lib/collection/repo';
import * as correctiveActionsRepo from '@/lib/correctiveActions/repo.firestore';
import * as licensesRepo from '@/lib/licenses/repo.firestore';
import * as repairsRepo from '@/lib/repairs/repo.firestore';
import type { ViewerContext } from '@/lib/complaints/types';

// 今週の開始日（月曜日）を取得
function getWeekStart(): Date {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + mondayOffset);
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
}

// 横断サマリー型
export interface QualityRiskSummary {
  generatedAt: string;
  alerts: {
    criticalOpen: number;
    warningOpen: number;
    url: string;
  };
  complaints: {
    highOpen: number;
    criticalOpen: number;
    overdue: number;
    url: string;
  };
  incidents: {
    thisWeek: number;
    severeThisWeek: number;
    url: string;
  };
  correctiveActions: {
    criticalOpen: number;
    overdue: number;
    doneThisWeek: number;
    url: string;
  };
  training: {
    overdue: number;
    sessionsDoneThisWeek: number;
    url: string;
  };
  licenses: {
    expired: number;
    expiring30: number;
    url: string;
  };
  repairs: {
    highRiskOpen: number;
    overdue: number;
    url: string;
  };
  inventory: {
    lowStock: number;
    url: string;
  };
  receivables: {
    overdueTotal: number;
    aging60Count: number;
    url: string;
  };
  collectionFlow: {
    overdueSteps: number;
    url: string;
  };
}

export async function GET() {
  try {
    // モックViewer（管理者権限）
    const viewer: ViewerContext = {
      userId: 'system',
      role: 'executive',
    };

    // ========== アラート ==========
    const alertStats = await alertsRepo.getAlertStatsAsync();
    const alertsAll = await alertsRepo.listAlertsAsync({ status: 'open' });
    const warningOpen = alertsAll.alerts.filter((a) => a.severity === 'warning').length;

    // ========== クレーム ==========
    const complaintStats = await complaintsRepo.getStats(viewer);
    const criticalComplaints = await complaintsRepo.scanCriticalOpen();
    const complaintsResult = await complaintsRepo.listComplaints(viewer, {});
    const highComplaints = complaintsResult
      .complaints.filter(
        (c) =>
          c.severity === 'high' &&
          ['new', 'triaging', 'investigating', 'responding'].includes(c.status)
      );

    // ========== 研修 ==========
    const overdueTraining = await trainingRepo.overdueAssignmentsScan();
    const weekStart = getWeekStart();
    const allSessions = await trainingRepo.listSessions({});
    const sessionsDoneThisWeek = allSessions.filter(
      (s) =>
        s.status === 'done' &&
        s.scheduledAt &&
        new Date(s.scheduledAt) >= weekStart
    ).length;

    // ========== 未収 ==========
    const receivableStats = await receivablesRepo.getStats(viewer);

    // ========== 回収フロー ==========
    const collectionStats = collectionRepo.getStats(viewer);

    // ========== 事故・ヒヤリ ==========
    // インシデントモジュールはFirestoreのhiyari_reportsコレクションから直接集計
    let incidentsThisWeek = 0;
    let severIncidentsThisWeek = 0;
    try {
      const { getAdminDb } = await import('@/lib/firebase-admin');
      const db = getAdminDb();
      const incidentSnap = await db.collection('hiyari_reports')
        .where('createdAt', '>=', weekStart.toISOString())
        .get();
      incidentsThisWeek = incidentSnap.size;
      severIncidentsThisWeek = incidentSnap.docs.filter(
        (d) => d.data().riskLevel === 'L3' || d.data().riskLevel === 'L4'
      ).length;
    } catch (e) {
      console.error('[quality-risk] incidents scan error:', e);
    }

    // ========== 是正措置 ==========
    const caStats = await correctiveActionsRepo.getStats(viewer);
    const correctiveActionsStats = {
      criticalOpen: caStats.criticalOpen,
      overdue: caStats.overdue,
      doneThisWeek: caStats.completedThisMonth, // 今月完了を代用
    };

    // ========== 資格 ==========
    const licRaw = await licensesRepo.getStats(viewer);
    const licenseStats = {
      expired: licRaw?.expired ?? 0,
      expiring30: licRaw?.expiring30 ?? 0,
    };

    // ========== 修繕 ==========
    const repairRaw = await repairsRepo.getStats(viewer);
    const repairStats = {
      highRiskOpen: repairRaw.highRiskOpen,
      overdue: repairRaw.overdue,
    };

    // ========== 在庫 ==========
    // 在庫モジュールは個別コレクションから直接集計
    let inventoryLowStock = 0;
    try {
      const { getAdminDb } = await import('@/lib/firebase-admin');
      const db = getAdminDb();
      const invSnap = await db.collection('inventory_items').get();
      inventoryLowStock = invSnap.docs.filter((d) => {
        const data = d.data();
        return data.currentStock < data.minStock;
      }).length;
    } catch (e) {
      console.error('[quality-risk] inventory scan error:', e);
    }
    const inventoryStats = { lowStock: inventoryLowStock };

    // ========== レスポンス構築 ==========
    const summary: QualityRiskSummary = {
      generatedAt: new Date().toISOString(),
      alerts: {
        criticalOpen: alertStats.criticalOpen,
        warningOpen,
        url: '/dashboard/alerts',
      },
      complaints: {
        highOpen: highComplaints.length,
        criticalOpen: criticalComplaints.length,
        overdue: complaintStats.overdue,
        url: '/dashboard/complaints',
      },
      incidents: {
        thisWeek: incidentsThisWeek,
        severeThisWeek: severIncidentsThisWeek,
        url: '/admin/incidents',
      },
      correctiveActions: {
        criticalOpen: correctiveActionsStats.criticalOpen,
        overdue: correctiveActionsStats.overdue,
        doneThisWeek: correctiveActionsStats.doneThisWeek,
        url: '/dashboard/corrective-actions',
      },
      training: {
        overdue: overdueTraining.length,
        sessionsDoneThisWeek,
        url: '/dashboard/training',
      },
      licenses: {
        expired: licenseStats.expired,
        expiring30: licenseStats.expiring30,
        url: '/dashboard/certifications',
      },
      repairs: {
        highRiskOpen: repairStats.highRiskOpen,
        overdue: repairStats.overdue,
        url: '/dashboard/repair-tickets',
      },
      inventory: {
        lowStock: inventoryStats.lowStock,
        url: '/dashboard/inventory',
      },
      receivables: {
        overdueTotal: receivableStats?.overdueTotal ?? 0,
        aging60Count:
          receivableStats
            ? Object.entries(receivableStats.agingBuckets)
                .filter(([key]) => key === '61-90' || key === '90+')
                .reduce((sum, [, val]) => sum + (typeof val === 'number' ? 1 : 0), 0)
            : 0,
        url: '/dashboard/receivables',
      },
      collectionFlow: {
        overdueSteps: collectionStats?.overdueSteps ?? 0,
        url: '/dashboard/collection-flow',
      },
    };

    // aging60Countを正しく計算（件数ベース）
    if (receivableStats) {
      const receivablesAll = await receivablesRepo.listReceivables(viewer, { agingMinDays: 60 });
      summary.receivables.aging60Count = receivablesAll.total;
    }

    return NextResponse.json(summary);
  } catch (error) {
    console.error('Quality-Risk Summary Error:', error);
    return NextResponse.json(
      { error: '品質・リスクサマリーの取得に失敗しました' },
      { status: 500 }
    );
  }
}
