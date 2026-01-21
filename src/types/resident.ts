// ======== 入居者管理の型定義 ========

import type { CareLevel, Gender } from './prospect';

// 入居者（residentsコレクション）
export interface Resident {
  id: string;
  tenantId: string;

  // 基本情報
  name: string;
  age?: number;
  gender?: Gender;
  careLevel?: CareLevel;

  // 入居情報
  facilityId?: string;
  facilityName?: string;
  roomNumber?: string;
  moveInDate?: Date | string;

  // 契約情報
  contractType?: string; // 契約種別
  monthlyFee?: number;   // 月額費用

  // 紹介元情報
  salesCompanyName?: string;
  salesRepName?: string;
  prospectId?: string; // 紐づくprospectのID

  // ステータス
  status: ResidentStatus;
  statusNote?: string;

  // メタ
  source?: string; // 'google-sheets-sync', 'manual' など
  externalId?: string; // スプレッドシートの社内No.など
  createdAt: Date;
  updatedAt?: Date;
  syncedAt?: Date; // 最終同期日時
}

export type ResidentStatus = '入居中' | '退去予定' | '退去済' | '一時外出';

// 入居者サマリー（ダッシュボード用）
export interface ResidentSummary {
  totalCount: number;
  byFacility: Record<string, number>;
  byStatus: Record<ResidentStatus, number>;
  byCareLevel: Record<string, number>;
}
