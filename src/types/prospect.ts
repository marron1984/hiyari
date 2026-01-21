// ======== 入居希望者管理の型定義 ========

// ステータス
export type ProspectStatus =
  | '新規受付'
  | '折返し待ち'
  | '面談設定済'
  | '見学設定済'
  | '申込中'
  | '審査中'
  | '入居待ち'
  | '入居決定'
  | '見送り'
  | 'クローズ';

export const PROSPECT_STATUSES: ProspectStatus[] = [
  '新規受付',
  '折返し待ち',
  '面談設定済',
  '見学設定済',
  '申込中',
  '審査中',
  '入居待ち',
  '入居決定',
  '見送り',
  'クローズ',
];

// 重要ステータス（LINE WORKS通知対象）
export const IMPORTANT_STATUSES: ProspectStatus[] = [
  '新規受付',
  '面談設定済',
  '見学設定済',
  '入居決定',
];

// 性別
export type Gender = '男性' | '女性' | '不明';

// 介護度
export type CareLevel =
  | '要支援1'
  | '要支援2'
  | '要介護1'
  | '要介護2'
  | '要介護3'
  | '要介護4'
  | '要介護5'
  | '自立'
  | '申請中'
  | '不明';

export const CARE_LEVELS: CareLevel[] = [
  '自立',
  '要支援1',
  '要支援2',
  '要介護1',
  '要介護2',
  '要介護3',
  '要介護4',
  '要介護5',
  '申請中',
  '不明',
];

// ADL項目
export interface ADLStatus {
  standing?: string;     // 立位
  bathing?: string;      // 入浴
  eating?: string;       // 食事
  toileting?: string;    // 排泄
  mobility?: string;     // 移動
  other?: string;        // その他
}

// 入居希望者（prospectsコレクション）
export interface Prospect {
  id: string;
  tenantId: string;

  // 基本情報
  internalNo?: string;          // 社内No
  status: ProspectStatus;
  statusNote?: string;          // ステータス備考
  assigneeId?: string;          // 担当者ID
  assigneeName?: string;        // 担当者名

  // 顧客情報
  customerName?: string;        // 顧客名
  age?: number;
  gender?: Gender;
  careLevel?: CareLevel;        // 介護度
  disabilityCategory?: string;  // 障害区分

  // 費用
  budget?: string;              // 費用（希望）
  budgetDetail?: string;        // 費用詳細
  monthlyBudget?: string;       // 月額希望

  // ADL
  adlSummary?: string;          // ADL状況
  adlDetail?: string;           // ADL詳細
  adl?: ADLStatus;              // ADL詳細項目

  // 状況
  debtStatus?: string;          // 借金有無
  currentSituation?: string;    // 現在状況
  currentAddress?: string;      // 現在のお住い・入院病院
  currentDetail?: string;       // 現在の詳細状況

  // 入居希望
  desiredFacility?: string;     // 入居場所（希望施設）
  desiredMoveInDate?: string;   // 入居予定日
  entertainmentWish?: string;   // エント希望
  tourRequestDate?: string;     // 見学希望日

  // 面談・連絡
  interviewDateTime?: string;   // 面談日時
  keyPerson?: string;           // キーパーソン
  otherNotes?: string;          // その他備考

  // 営業会社
  salesCompanyName?: string;    // 営業会社名
  salesRepName?: string;        // 営業担当者名
  salesRepContact?: string;     // ご連絡先

  // 問い合わせ
  inquiryDate?: string;         // 問い合わせ日
  receivedAt: Date;             // 受信日時

  // ソースと生データ
  source?: string;              // データソース（notta-email, notta-form, manual, etc）
  rawTranscript?: string;       // 文字起こし全文
  rawPayload?: Record<string, unknown>; // 抽出結果JSON

  // 重複判定
  prospectKey?: string;         // 重複判定キー
  duplicateOf?: string;         // 重複先のID
  duplicateCandidates?: string[]; // 重複候補のID配列

  // メタ
  createdAt: Date;
  updatedAt?: Date;
  createdBy?: string;
  createdByName?: string;
}

// 入居希望者作成フォーム
export interface ProspectFormData {
  customerName?: string;
  age?: number;
  gender?: Gender;
  careLevel?: CareLevel;
  budget?: string;
  adlSummary?: string;
  debtStatus?: string;
  currentSituation?: string;
  desiredFacility?: string;
  desiredMoveInDate?: string;
  tourRequestDate?: string;
  salesCompanyName?: string;
  salesRepName?: string;
  otherNotes?: string;
}

// Webhook受信ペイロード
export interface ProspectWebhookPayload {
  source: string;               // notta-email, notta-form, manual
  raw_transcript?: string;      // 文字起こし全文
  extracted: Record<string, unknown>; // 抽出結果
  meta?: {
    received_at?: string;
    call_id?: string;
    notta_url?: string;
    recording_url?: string;
  };
}

// ======== 部屋管理（roomsコレクション） ========

export type RoomStatus = '空室' | '予約' | '入居中' | '退去予定' | 'メンテナンス';

export const ROOM_STATUSES: RoomStatus[] = [
  '空室',
  '予約',
  '入居中',
  '退去予定',
  'メンテナンス',
];

export interface Room {
  id: string;
  tenantId: string;
  buildingName: string;         // 建物名
  roomNumber: string;           // 部屋番号
  status: RoomStatus;
  expectedCareLevel?: string;   // 入居想定介護度数
  note?: string;                // 備考
  createdAt: Date;
  updatedAt?: Date;
}

// ======== 入居状況（occupancyコレクション） ========

export type OccupancyStatus = '入居中' | '退去予定' | '契約済み（入居前）';

export const OCCUPANCY_STATUSES: OccupancyStatus[] = [
  '入居中',
  '退去予定',
  '契約済み（入居前）',
];

export interface Occupancy {
  id: string;
  tenantId: string;
  buildingName: string;         // 建物名
  roomNumber: string;           // 部屋番号
  roomStatus: OccupancyStatus;  // 部屋ステータス
  residentName?: string;        // 入居者氏名
  residentNameKana?: string;    // 氏名かな
  moveInDate?: string;          // 入居予定日
  expectedCareLevel?: string;   // 介護度（入居想定）
  note?: string;                // 備考
  prospectId?: string;          // 紐付けられた入居希望者ID
  createdAt: Date;
  updatedAt?: Date;
}

// ======== 監査ログ（auditLogsコレクション） ========

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'status_change'
  | 'assign'
  | 'merge'
  | 'notification_sent';

export interface AuditLog {
  id: string;
  tenantId: string;
  actor: string;                // 実行者ID
  actorName: string;            // 実行者名
  action: AuditAction;          // アクション種別
  entity: string;               // エンティティ種別（prospect, room, occupancy）
  entityId: string;             // エンティティID
  diff?: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };
  note?: string;                // 備考
  createdAt: Date;
}

// ======== 通知履歴（notificationLogsコレクション） ========

export interface NotificationLog {
  id: string;
  tenantId: string;
  prospectId: string;
  channel: 'lineworks' | 'email';
  message: string;
  sentAt: Date;
  status: 'sent' | 'failed';
  error?: string;
}

// ======== ステータス設定 ========

export const PROSPECT_STATUS_CONFIG: Record<ProspectStatus, {
  label: string;
  color: string;
  bgColor: string;
}> = {
  '新規受付': { label: '新規受付', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  '折返し待ち': { label: '折返し待ち', color: 'text-yellow-700', bgColor: 'bg-yellow-100' },
  '面談設定済': { label: '面談設定済', color: 'text-purple-700', bgColor: 'bg-purple-100' },
  '見学設定済': { label: '見学設定済', color: 'text-indigo-700', bgColor: 'bg-indigo-100' },
  '申込中': { label: '申込中', color: 'text-cyan-700', bgColor: 'bg-cyan-100' },
  '審査中': { label: '審査中', color: 'text-orange-700', bgColor: 'bg-orange-100' },
  '入居待ち': { label: '入居待ち', color: 'text-teal-700', bgColor: 'bg-teal-100' },
  '入居決定': { label: '入居決定', color: 'text-green-700', bgColor: 'bg-green-100' },
  '見送り': { label: '見送り', color: 'text-gray-600', bgColor: 'bg-gray-100' },
  'クローズ': { label: 'クローズ', color: 'text-gray-500', bgColor: 'bg-gray-50' },
};

// ======== ユーティリティ ========

/**
 * 重複判定キーを生成
 */
export function generateProspectKey(data: {
  customerName?: string;
  age?: number;
  inquiryDate?: string;
  salesCompanyName?: string;
  salesRepName?: string;
}): string {
  const parts = [
    data.customerName?.trim().toLowerCase() || '',
    data.age?.toString() || '',
    data.inquiryDate || '',
  ].filter(Boolean);
  return parts.join('|');
}

/**
 * 滞留日数を計算
 */
export function calculateDaysElapsed(receivedAt: Date): number {
  const now = new Date();
  const diff = now.getTime() - receivedAt.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}
