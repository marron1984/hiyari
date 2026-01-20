// ======== ポイントモジュール 型定義 ========

// ポイント付与理由
export type PointReason =
  | 'incident_submit'      // ヒヤリハット投稿
  | 'improvement_submit'   // 改善提案投稿
  | 'improvement_adopted'  // 改善採用
  | 'ringi_approved'       // 稟議承認
  | 'overtime_approved'    // 残業承認
  | 'manual_adjust';       // 管理者手動調整

// ポイント付与ルール（MVP固定）
export const POINT_RULES: Record<PointReason, { points: number; label: string }> = {
  incident_submit: { points: 1, label: 'ヒヤリハット投稿' },
  improvement_submit: { points: 1, label: '改善提案投稿' },
  improvement_adopted: { points: 5, label: '改善採用' },
  ringi_approved: { points: 1, label: '稟議承認' },
  overtime_approved: { points: 1, label: '残業申請承認' },
  manual_adjust: { points: 0, label: '管理者調整' }, // 可変
};

// ポイント履歴
export interface PointHistory {
  id: string;
  tenantId: string;
  userId: string;
  userName: string;
  branchId: string;
  reason: PointReason;
  points: number;          // プラス/マイナス
  targetId?: string;       // 関連するドキュメントID
  targetType?: string;     // incident/improvement/ringi/overtime
  description?: string;    // 詳細説明（手動調整時）
  createdBy: string;       // 付与者ID
  createdByName: string;   // 付与者名
  createdAt: Date;
}

// ユーザーポイントサマリー
export interface UserPointSummary {
  userId: string;
  userName: string;
  branchId: string;
  branchName?: string;
  totalPoints: number;
  // 内訳
  incidentPoints: number;
  improvementPoints: number;
  ringiPoints: number;
  overtimePoints: number;
  manualPoints: number;
}

// 月次ポイントサマリー
export interface MonthlyPointSummary {
  monthKey: string;        // YYYYMM
  userId: string;
  userName: string;
  branchId: string;
  totalPoints: number;
}

// ランキングエントリ
export interface PointRankingEntry {
  rank: number;
  userId: string;
  userName: string;
  branchId: string;
  branchName?: string;
  totalPoints: number;
}
