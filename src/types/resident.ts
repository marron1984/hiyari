// ======== 入居者管理の型定義 ========

import type { CareLevel, Gender } from './prospect';

// 入居者ステータス
export type ResidentStatus = '入居中' | '退去予定' | '退去済' | '一時外出';

// 入居者（residentsコレクション）
export interface Resident {
  id: string;
  tenantId: string;

  // 基本情報
  name: string;
  nameKana?: string;
  birthDate?: Date | string;
  age?: number;
  gender?: Gender;
  careLevel?: CareLevel;

  // 入居情報
  facilityId?: string;
  facilityName?: string;
  roomNumber?: string;
  moveInDate?: Date | string;
  moveOutPlannedDate?: Date | string;

  // 契約情報
  contractType?: string;
  monthlyFee?: number;

  // キーパーソン
  keyPersonName?: string;
  keyPersonRelation?: string;
  keyPersonContact?: string;

  // 紹介元情報
  salesCompanyName?: string;
  salesRepName?: string;
  prospectId?: string;

  // ステータス
  status: ResidentStatus;
  statusNote?: string;

  // メタ
  source?: string;
  externalId?: string;
  createdAt: Date;
  updatedAt?: Date;
  syncedAt?: Date;
}

// 入居者フィルター
export interface ResidentFilter {
  facilityId?: string;
  status?: ResidentStatus;
  birthMonth?: number;
  hasMissingDocs?: boolean;
  search?: string;
}

// 書類統計付き入居者
export interface ResidentWithDocStats extends Resident {
  docStats: {
    total: number;
    missing: number;
    submitted: number;
    expired: number;
  };
  upcomingBirthday?: boolean;
  daysUntilBirthday?: number;
}

// 入居者サマリー（ダッシュボード用）
export interface ResidentSummary {
  totalCount: number;
  byFacility: Record<string, number>;
  byStatus: Record<ResidentStatus, number>;
  byCareLevel: Record<string, number>;
}

// 年齢計算
export function calculateAge(birthDate: Date): number {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

// 誕生日までの日数計算
export function getDaysUntilBirthday(birthDate: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const thisYearBirthday = new Date(
    today.getFullYear(),
    birthDate.getMonth(),
    birthDate.getDate()
  );
  thisYearBirthday.setHours(0, 0, 0, 0);

  // 今年の誕生日が過ぎていたら来年で計算
  if (thisYearBirthday < today) {
    thisYearBirthday.setFullYear(today.getFullYear() + 1);
  }

  const diffTime = thisYearBirthday.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// 誕生日が近いか判定
export function isBirthdayWithinDays(birthDate: Date, days: number): boolean {
  return getDaysUntilBirthday(birthDate) <= days;
}

// ステータス設定
export const RESIDENT_STATUS_CONFIG: Record<ResidentStatus, { label: string; color: string; bgColor: string }> = {
  '入居中': { label: '入居中', color: 'text-green-600', bgColor: 'bg-green-50' },
  '退去予定': { label: '退去予定', color: 'text-yellow-600', bgColor: 'bg-yellow-50' },
  '退去済': { label: '退去済', color: 'text-gray-500', bgColor: 'bg-gray-100' },
  '一時外出': { label: '一時外出', color: 'text-blue-600', bgColor: 'bg-blue-50' },
};
