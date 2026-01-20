// ======== 連携提案（デイリーインサイト）の型定義 ========

// インサイトの種類
export type InsightType =
  | 'vacancy_full'       // 満室 → 他施設提案
  | 'vacancy_available'  // 空きあり → 営業促進
  | 'low_occupancy'      // 低稼働 → 入居促進
  | 'custom';            // カスタム提案

// インサイトの優先度
export type InsightPriority = 'high' | 'medium' | 'low';

// デイリーインサイト（dailyInsightsコレクション）
export interface DailyInsight {
  id: string;
  tenantId: string;
  type: InsightType;
  priority: InsightPriority;
  title: string;           // 例: "パシフィック満室！"
  message: string;         // 例: "入居先探しの問い合わせに提案しましょう"
  facilityId?: string;     // 関連施設（ある場合）
  facilityName?: string;
  actionUrl?: string;      // 詳細リンク
  isActive: boolean;
  expiresAt?: Date;        // 有効期限
  createdBy: string;       // uid
  createdByName: string;
  createdAt: Date;
  updatedAt?: Date;
}

// インサイト作成フォーム
export interface InsightFormData {
  type: InsightType;
  priority: InsightPriority;
  title: string;
  message: string;
  facilityId?: string;
  expiresAt?: string;      // ISO日付文字列
}

// インサイトタイプのラベル
export const INSIGHT_TYPE_LABELS: Record<InsightType, string> = {
  vacancy_full: '満室情報',
  vacancy_available: '空室情報',
  low_occupancy: '稼働率低下',
  custom: 'カスタム',
};

// 優先度のラベルと色
export const INSIGHT_PRIORITY_CONFIG: Record<InsightPriority, { label: string; color: string; bg: string }> = {
  high: { label: '重要', color: 'text-red-700', bg: 'bg-red-50' },
  medium: { label: '通常', color: 'text-blue-700', bg: 'bg-blue-50' },
  low: { label: '参考', color: 'text-gray-600', bg: 'bg-gray-50' },
};
