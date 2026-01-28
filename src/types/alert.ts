// ======== アラート 型定義 ========

export type AlertType = 'BIRTHDAY' | 'DOC_EXPIRY' | 'DOC_MISSING' | 'CUSTOM';
export type AlertTargetType = 'RESIDENT' | 'EMPLOYEE';
export type AlertStatus = 'OPEN' | 'DONE' | 'SNOOZED';
export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface Alert {
  id: string;
  tenantId: string;
  alertType: AlertType;
  targetType: AlertTargetType;
  targetId: string;
  targetName: string;

  // アラート情報
  title: string;
  message?: string;
  fireDate: Date;
  severity: AlertSeverity;
  status: AlertStatus;

  // 対応情報
  handledBy?: string;
  handledByName?: string;
  handledAt?: Date;
  note?: string;

  // メタ
  createdAt: Date;
  updatedAt?: Date;
}

export interface BirthdayAlertItem {
  id: string;
  type: 'RESIDENT' | 'EMPLOYEE';
  name: string;
  birthDate: Date;
  age: number;
  daysUntil: number;
  facilityName?: string;
  department?: string;
}

// アラート設定
export const ALERT_TYPE_CONFIG: Record<AlertType, { label: string; icon: string; color: string }> = {
  BIRTHDAY: { label: '誕生日', icon: 'cake', color: 'text-pink-500' },
  DOC_EXPIRY: { label: '書類期限', icon: 'file-warning', color: 'text-yellow-500' },
  DOC_MISSING: { label: '書類未回収', icon: 'file-x', color: 'text-red-500' },
  CUSTOM: { label: 'その他', icon: 'bell', color: 'text-blue-500' },
};

export const ALERT_STATUS_CONFIG: Record<AlertStatus, { label: string; color: string; bgColor: string }> = {
  OPEN: { label: '未対応', color: 'text-red-600', bgColor: 'bg-red-50' },
  DONE: { label: '対応済', color: 'text-green-600', bgColor: 'bg-green-50' },
  SNOOZED: { label: 'スヌーズ', color: 'text-yellow-600', bgColor: 'bg-yellow-50' },
};
