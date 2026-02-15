// ======== 書類管理 型定義 ========

// 所有者種別
export type DocumentOwnerType = 'RESIDENT' | 'EMPLOYEE' | 'PARTNER' | 'ORG';

// 書類カテゴリ
export type DocumentCategory =
  | 'NYUKYO'    // 入居関連
  | 'OPS'       // 運用
  | 'CARE'      // 介護サービス
  | 'HR'        // 労務
  | 'AUDIT'     // 監査・委員会
  | 'CONTRACT'  // 対外契約
  | 'FINANCE';  // 金銭

// 書類ステータス
export type DocumentStatus =
  | 'MISSING'          // 未回収
  | 'SUBMITTED'        // 回収済
  | 'EXPIRED'          // 期限切れ
  | 'RENEWAL_PENDING'; // 更新待ち

// イベント種別
export type DocumentEventType =
  | 'CREATE'
  | 'UPLOAD'
  | 'REPLACE'
  | 'STATUS_CHANGE'
  | 'DUE_CHANGE';

// ======== 書類テンプレート ========
export interface DocumentTemplate {
  id: string;
  key: string;                    // doc_type識別子
  name: string;                   // 表示名
  category: DocumentCategory;
  ownerType: DocumentOwnerType;
  required: boolean;              // 必須かどうか
  validityDays?: number;          // 有効期限（日数）
  dueRule?: string;               // 期限ルール（例: '入居日+30日'）
  signedRequired: boolean;        // 署名要否
  description?: string;
  templateFileUrl?: string;       // 雛形ファイルURL
  templateFileName?: string;      // 雛形ファイル名
  createdAt: Date;
  updatedAt?: Date;
}

// ======== 書類 ========
export interface Document {
  id: string;
  tenantId: string;
  ownerType: DocumentOwnerType;
  ownerId: string;
  ownerName?: string;             // 表示用
  docType: string;                // doc_type key
  docTypeName?: string;           // 表示用
  title?: string;                 // カスタムタイトル（任意）
  status: DocumentStatus;
  dueDate?: Date;                 // 期限日
  issuedDate?: Date;              // 発行日
  signedRequired: boolean;
  signedAt?: Date;
  fileUrl?: string;
  fileName?: string;
  fileMime?: string;
  fileSize?: number;
  version: number;
  tags?: string[];
  uploadedBy?: string;
  uploadedByName?: string;
  uploadedAt?: Date;
  createdAt: Date;
  updatedAt?: Date;
}

// ======== 書類イベント（履歴） ========
export interface DocumentEvent {
  id: string;
  documentId: string;
  eventType: DocumentEventType;
  prevJson?: Record<string, unknown>;
  nextJson?: Record<string, unknown>;
  actorId: string;
  actorName?: string;
  createdAt: Date;
}

// ======== 書類サマリー（集計用） ========
export interface DocumentSummary {
  total: number;
  missing: number;
  submitted: number;
  expired: number;
  renewalPending: number;
  dueSoon: number;    // 30日以内期限
}

// ======== フィルター ========
export interface DocumentFilter {
  ownerType?: DocumentOwnerType;
  ownerId?: string;
  category?: DocumentCategory;
  status?: DocumentStatus;
  dueDaysWithin?: number;
  search?: string;
}

// ======== ステータス設定 ========
export const DOCUMENT_STATUS_CONFIG: Record<DocumentStatus, {
  label: string;
  color: string;
  bgColor: string;
}> = {
  MISSING: {
    label: '未回収',
    color: 'text-red-700',
    bgColor: 'bg-red-100',
  },
  SUBMITTED: {
    label: '回収済',
    color: 'text-green-700',
    bgColor: 'bg-green-100',
  },
  EXPIRED: {
    label: '期限切れ',
    color: 'text-orange-700',
    bgColor: 'bg-orange-100',
  },
  RENEWAL_PENDING: {
    label: '更新待ち',
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-100',
  },
};

export const DOCUMENT_CATEGORY_CONFIG: Record<DocumentCategory, {
  label: string;
  color: string;
}> = {
  NYUKYO: { label: '入居', color: 'text-blue-600' },
  OPS: { label: '運用', color: 'text-purple-600' },
  CARE: { label: '介護', color: 'text-pink-600' },
  HR: { label: '労務', color: 'text-green-600' },
  AUDIT: { label: '監査', color: 'text-orange-600' },
  CONTRACT: { label: '契約', color: 'text-indigo-600' },
  FINANCE: { label: '金銭', color: 'text-red-600' },
};

export const DOCUMENT_OWNER_TYPE_CONFIG: Record<DocumentOwnerType, {
  label: string;
}> = {
  RESIDENT: { label: '入居者' },
  EMPLOYEE: { label: '従業員' },
  PARTNER: { label: '取引先' },
  ORG: { label: '事業所共通' },
};
