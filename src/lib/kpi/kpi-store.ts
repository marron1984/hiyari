/**
 * KPI ストア
 *
 * KPI定義とデータポイントの管理
 * インメモリストレージ（本番ではDBに置き換え）
 */

import type {
  KPIMetadata,
  KPITimeSeries,
  KPIDataPoint,
  KPIHighlight,
  KPISummary,
  KPICategory,
} from './types';
import { KPI_METADATA, getMockKPITimeSeries } from './mock-data';

// インメモリストレージ
let kpiDefinitions: KPIMetadata[] = [...KPI_METADATA];
const kpiPointsStore = new Map<string, KPIDataPoint[]>();

// 初期化フラグ
let isInitialized = false;

/**
 * ストアを初期化（モックデータをロード）
 */
export function initializeKpiStore(): void {
  if (isInitialized) return;

  // モック時系列データをポイントストアにロード
  const mockTimeSeries = getMockKPITimeSeries();
  for (const ts of mockTimeSeries) {
    kpiPointsStore.set(ts.kpiId, ts.points);
  }

  isInitialized = true;
}

/**
 * 全KPI定義を取得
 */
export function listKpiDefinitions(options?: {
  category?: KPICategory;
  externalOnly?: boolean;
}): KPIMetadata[] {
  initializeKpiStore();

  let result = [...kpiDefinitions];

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
export function getKpiDefinition(kpiId: string): KPIMetadata | null {
  initializeKpiStore();
  return kpiDefinitions.find((k) => k.id === kpiId) ?? null;
}

/**
 * KPI時系列データを取得
 */
export function getKpiTimeSeries(
  kpiId: string,
  options?: {
    startDate?: string;
    endDate?: string;
    limit?: number;
  }
): KPITimeSeries | null {
  initializeKpiStore();

  const definition = getKpiDefinition(kpiId);
  if (!definition) return null;

  let points = kpiPointsStore.get(kpiId) ?? [];

  // 日付フィルター
  if (options?.startDate) {
    points = points.filter((p) => p.date >= options.startDate!);
  }
  if (options?.endDate) {
    points = points.filter((p) => p.date <= options.endDate!);
  }

  // ソート（昇順）
  points = [...points].sort((a, b) => a.date.localeCompare(b.date));

  // リミット（最新N件）
  if (options?.limit && points.length > options.limit) {
    points = points.slice(-options.limit);
  }

  return {
    kpiId,
    points,
  };
}

/**
 * KPIデータポイントを追加
 */
export function addKpiPoint(
  kpiId: string,
  point: { date: string; value: number | null; source?: string }
): { success: boolean; error?: string } {
  initializeKpiStore();

  const definition = getKpiDefinition(kpiId);
  if (!definition) {
    return { success: false, error: `KPI not found: ${kpiId}` };
  }

  // 既存ポイントを取得または初期化
  let points = kpiPointsStore.get(kpiId);
  if (!points) {
    points = [];
    kpiPointsStore.set(kpiId, points);
  }

  // 同じ日付のデータがあれば上書き
  const existingIndex = points.findIndex((p) => p.date === point.date);
  if (existingIndex >= 0) {
    points[existingIndex] = { date: point.date, value: point.value };
  } else {
    points.push({ date: point.date, value: point.value });
    // ソート維持
    points.sort((a, b) => a.date.localeCompare(b.date));
  }

  return { success: true };
}

/**
 * KPIハイライト一覧を取得（ダッシュボード用）
 */
export function getKpiHighlights(options?: {
  category?: KPICategory;
  externalOnly?: boolean;
  limit?: number;
}): KPIHighlight[] {
  initializeKpiStore();

  const definitions = listKpiDefinitions({
    category: options?.category,
    externalOnly: options?.externalOnly,
  });

  const highlights: KPIHighlight[] = [];

  for (const def of definitions) {
    const timeSeries = getKpiTimeSeries(def.id, { limit: 7 });
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
        // 高いほど良い
        if (critical !== undefined && currentValue < critical) {
          status = 'critical';
        } else if (warning !== undefined && currentValue < warning) {
          status = 'warning';
        } else {
          status = 'good';
        }
      } else {
        // 低いほど良い
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

  // リミット適用
  if (options?.limit) {
    return highlights.slice(0, options.limit);
  }

  return highlights;
}

/**
 * KPIサマリー統計を取得
 */
export function getKpiSummary(): KPISummary {
  initializeKpiStore();

  const definitions = listKpiDefinitions();
  const byCategory: Record<string, number> = {};

  let withData = 0;
  let externalAllowed = 0;

  for (const def of definitions) {
    // カテゴリ別カウント
    byCategory[def.category] = (byCategory[def.category] || 0) + 1;

    // データあり判定
    const points = kpiPointsStore.get(def.id);
    if (points && points.length > 0) {
      withData++;
    }

    // 外部共有可
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
 * 外部共有用KPIデータを取得
 */
export function getExternalKpiData(kpiIds?: string[]): {
  highlights: KPIHighlight[];
  summary: { total: number; categories: string[] };
} {
  initializeKpiStore();

  let highlights = getKpiHighlights({ externalOnly: true });

  // 指定されたKPIのみフィルター
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
