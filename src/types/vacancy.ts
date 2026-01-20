// ======== 空室管理の型定義 ========

// 施設（facilitiesコレクション）
export interface Facility {
  id: string;
  name: string;
  area?: string;
  capacity?: number; // 定員
  isActive: boolean;
  tenantId: string;
  createdAt: Date;
  updatedAt?: Date;
}

// 空室状態（vacancyStatusコレクション、docId = facilityId）
export interface VacancyStatus {
  facilityId: string;
  vacantCount: number;
  note?: string;
  updatedAt: Date;
  updatedBy: string;      // uid
  updatedByName: string;  // 表示用
}

// 空室変更ログ（vacancyEventsコレクション、append-only）
export interface VacancyEvent {
  id: string;
  facilityId: string;
  before: {
    vacantCount: number;
    note?: string;
  };
  after: {
    vacantCount: number;
    note?: string;
  };
  changedBy: string;      // uid
  changedByName: string;  // 表示用
  changedAt: Date;
}

// 施設 + 空室状態を結合した表示用
export interface FacilityWithVacancy {
  facility: Facility;
  vacancy: VacancyStatus | null;
}
