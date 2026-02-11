/**
 * KPI ストア (Firestore版)
 *
 * KPI定義とデータポイントの管理
 * KPI_METADATAは静的マスタ、データポイントはFirestoreに永続化
 */

import { getAdminDb } from '@/lib/firebase-admin';
import type {
  KPIMetadata,
  KPITimeSeries,
  KPIDataPoint,
  KPIHighlight,
  KPISummary,
  KPICategory,
} from './types';
import { KPI_METADATA } from './mock-data';

const KPI_POINTS_COLLECTION = 'kpi_data_points';

function now(): string {
  return new Date().toISOString();
}

/**
 * 全KPI定義を取得
 */
export async function listKpiDefinitions(options?: {
  category?: KPICategory;
  externalOnly?: boolean;
}): Promise<KPIMetadata[]> {
  let result = [...KPI_METADATA];

  if (options?.category) {
    result = result.filter((k) => k.category === options.category);
  }

  if (options?.externalOnly) {
    result = result.filter((k) => k.isExternalAllowed);
  }

  return result;
}

/**
 * KPI定義を取得
 */
export async function getKpiDefinition(kpiId: string): Promise<KPIMetadata | null> {
  return KPI_METADATA.find((k) => k.id === kpiId) ?? null;
}

/**
 * KPI時系列データを取得
 */
export async function getKpiTimeSeries(
  kpiId: string,
  options?: {
    startDate?: string;
    endDate?: string;
    limit?: number;
  }
): Promise<KPITimeSeries | null> {
  const definition = await getKpiDefinition(kpiId);
  if (!definition) return null;

  const db = getAdminDb();
  let query: FirebaseFirestore.Query = db
    .collection(KPI_POINTS_COLLECTION)
    .where('kpiId', '==', kpiId)
    .orderBy('date', 'asc');

  if (options?.startDate) {
    query = query.where('date', '>=', options.startDate);
  }
  if (options?.endDate) {
    query = query.where('date', '<=', options.endDate);
  }

  const snap = await query.get();
  let points: KPIDataPoint[] = snap.docs.map((doc) => {
    const data = doc.data();
    return {
      date: data.date ?? '',
      value: data.value ?? null,
    };
  });

  // リミット（最新N件）
  if (options?.limit && points.length > options.limit) {
    points = points.slice(-options.limit);
  }

  return { kpiId, points };
}

/**
 * KPIデータポイントを追加
 */
export async function addKpiPoint(
  kpiId: string,
  point: { date: string; value: number | null; source?: string }
): Promise<{ success: boolean; error?: string }> {
  const definition = await getKpiDefinition(kpiId);
  if (!definition) {
    return { success: false, error: `KPI not found: ${kpiId}` };
  }

  const db = getAdminDb();
  const docId = `${kpiId}_${point.date}`;
  await db.collection(KPI_POINTS_COLLECTION).doc(docId).set(
    {
      kpiId,
      date: point.date,
      value: point.value,
      source: point.source ?? null,
      updatedAt: now(),
    },
    { merge: true }
  );

  return { success: true };
}

/**
 * KPIハイライト一覧を取得（ダッシュボード用）
 */
export async function getKpiHighlights(options?: {
  category?: KPICategory;
  externalOnly?: boolean;
  limit?: number;
}): Promise<KPIHighlight[]> {
  const definitions = await listKpiDefinitions({
    category: options?.category,
    externalOnly: options?.externalOnly,
  });

  const highlights: KPIHighlight[] = [];

  for (const def of definitions) {
    const timeSeries = await getKpiTimeSeries(def.id, { limit: 7 });
    if (!timeSeries || timeSeries.points.length === 0) continue;

    const points = timeSeries.points;
    const currentPoint = points[points.length - 1];
    const previousPoint = points.length > 1 ? points[points.length - 2] : null;

    const currentValue = currentPoint.value;
    const previousValue = previousPoint?.value ?? null;

    // 変化率計算
    let changePercent: number | null = null;
    let trend: 'up' | 'down' | 'flat' = 'flat';

    if (currentValue !== null && previousValue !== null && previousValue !== 0) {
      changePercent = ((currentValue - previousValue) / previousValue) * 100;
      changePercent = Math.round(changePercent * 10) / 10;

      if (changePercent > 1) trend = 'up';
      else if (changePercent < -1) trend = 'down';
    }

    // ステータス判定
    let status: 'good' | 'warning' | 'critical' | 'neutral' = 'neutral';

    if (currentValue !== null && def.thresholds) {
      const { warning, critical } = def.thresholds;

      if (def.direction === 'higher_is_better') {
        if (critical !== undefined && currentValue < critical) {
          status = 'critical';
        } else if (warning !== undefined && currentValue < warning) {
          status = 'warning';
        } else {
          status = 'good';
        }
      } else {
        if (critical !== undefined && currentValue > critical) {
          status = 'critical';
        } else if (warning !== undefined && currentValue > warning) {
          status = 'warning';
        } else {
          status = 'good';
        }
      }
    }

    highlights.push({
      kpiId: def.id,
      name: def.name,
      currentValue,
      previousValue,
      unit: def.unit,
      changePercent,
      trend,
      status,
      category: def.category,
      dashboardPath: def.dashboardPath,
    });
  }

  if (options?.limit) {
    return highlights.slice(0, options.limit);
  }

  return highlights;
}

/**
 * KPIサマリー統計を取得
 */
export async function getKpiSummary(): Promise<KPISummary> {
  const definitions = await listKpiDefinitions();
  const byCategory: Record<string, number> = {};

  let withData = 0;
  let externalAllowed = 0;

  const db = getAdminDb();

  for (const def of definitions) {
    byCategory[def.category] = (byCategory[def.category] || 0) + 1;

    // データあり判定
    const snap = await db
      .collection(KPI_POINTS_COLLECTION)
      .where('kpiId', '==', def.id)
      .limit(1)
      .get();
    if (!snap.empty) {
      withData++;
    }

    if (def.isExternalAllowed) {
      externalAllowed++;
    }
  }

  return {
    total: definitions.length,
    withData,
    externalAllowed,
    byCategory,
  };
}

/**
 * 全KPIの時系列データを一括取得（異常検知cron用）
 */
export async function getAllKpiTimeSeries(days: number = 30): Promise<KPITimeSeries[]> {
  const definitions = await listKpiDefinitions();
  const result: KPITimeSeries[] = [];

  for (const def of definitions) {
    const ts = await getKpiTimeSeries(def.id, { limit: days });
    if (ts && ts.points.length > 0) {
      result.push(ts);
    }
  }

  return result;
}

/**
 * 外部共有用KPIデータを取得
 */
export async function getExternalKpiData(kpiIds?: string[]): Promise<{
  highlights: KPIHighlight[];
  summary: { total: number; categories: string[] };
}> {
  let highlights = await getKpiHighlights({ externalOnly: true });

  if (kpiIds && kpiIds.length > 0) {
    highlights = highlights.filter((h) => kpiIds.includes(h.kpiId));
  }

  const categories = [...new Set(highlights.map((h) => h.category))];

  return {
    highlights,
    summary: {
      total: highlights.length,
      categories,
    },
  };
}
