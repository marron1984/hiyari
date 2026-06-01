// ======== Google Sheets 双方向同期 型定義 ========

/**
 * 同期対象エンティティ
 */
export type SyncEntity = 'prospects' | 'sales' | 'applications';

/**
 * 同期方向
 */
export type SyncDirection = 'IMPORT' | 'EXPORT' | 'BIDIRECTIONAL';

/**
 * 同期ステータス（Sheets側の列）
 */
export type SheetSyncStatus =
  | 'SYNCED'      // 同期済み
  | 'SYNCING'     // 同期中
  | 'PENDING'     // 同期待ち
  | 'CONFLICT'    // 競合（HUB優先で解決）
  | 'ERROR';      // エラー

/**
 * シート設定
 */
export interface SheetConfig {
  id: string;
  spreadsheetId: string;
  sheetName: string;
  gid: number;
  entity: SyncEntity;
  columnMapping: ColumnMapping;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 列マッピング定義
 */
export interface ColumnMapping {
  // 必須列
  hubId: number;          // DHPハブ ID列
  updatedAt: number;      // 更新日時列
  syncStatus: number;     // 同期ステータス列

  // エンティティ固有の列（動的）
  [key: string]: number;
}

/**
 * 入居希望者（prospects）シート列マッピング
 */
export interface ProspectColumnMapping extends ColumnMapping {
  internalNo: number;
  status: number;
  customerName: number;
  receivedAt: number;
  salesCompanyName: number;
  salesRepName: number;
  age: number;
  gender: number;
  careLevel: number;
}

/**
 * 営業進捗（sales）シート列マッピング
 */
export interface SalesColumnMapping extends ColumnMapping {
  prospectId: number;
  stage: number;
  probability: number;
  expectedCloseDate: number;
  assignedTo: number;
  notes: number;
}

/**
 * 申請一覧（applications）シート列マッピング
 */
export interface ApplicationColumnMapping extends ColumnMapping {
  applicationType: number;
  applicantName: number;
  status: number;
  submittedAt: number;
  approvedAt: number;
  approvedBy: number;
}

/**
 * 同期行データ
 */
export interface SyncRowData {
  rowIndex: number;
  hubId: string | null;
  sheetUpdatedAt: Date | null;
  hubUpdatedAt: Date | null;
  syncStatus: SheetSyncStatus;
  data: Record<string, unknown>;
}

/**
 * 同期結果
 */
export interface SyncResult {
  success: boolean;
  entity: SyncEntity;
  direction: SyncDirection;
  rowsProcessed: number;
  rowsCreated: number;
  rowsUpdated: number;
  rowsSkipped: number;
  rowsConflict: number;
  errors: SyncError[];
  startedAt: Date;
  completedAt: Date;
}

/**
 * 同期エラー
 */
export interface SyncError {
  rowIndex?: number;
  hubId?: string;
  message: string;
  code: string;
}

/**
 * 同期ログ（Firestore保存用）
 */
export interface SyncLog {
  id?: string;
  tenantId: string;
  entity: SyncEntity;
  direction: SyncDirection;
  spreadsheetId: string;
  sheetName: string;
  result: {
    success: boolean;
    rowsProcessed: number;
    rowsCreated: number;
    rowsUpdated: number;
    rowsSkipped: number;
    rowsConflict: number;
    errorCount: number;
  };
  executedBy: string;
  executedByName: string;
  startedAt: Date;
  completedAt: Date;
  createdAt: Date;
}

/**
 * シート接続設定（Firestore保存用）
 */
export interface SheetsConnectionConfig {
  id?: string;
  tenantId: string;
  spreadsheetId: string;
  spreadsheetName: string;
  serviceAccountEmail: string;
  sheets: {
    entity: SyncEntity;
    sheetName: string;
    gid: number;
    isActive: boolean;
  }[];
  lastSyncAt: Date | null;
  isConnected: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 双方向同期オプション
 */
export interface BidirectionalSyncOptions {
  entity: SyncEntity;
  spreadsheetId: string;
  sheetName: string;
  gid: number;
  dryRun?: boolean;
  conflictResolution?: 'HUB_WINS' | 'SHEET_WINS' | 'NEWER_WINS';
}

/**
 * 同期プレビュー
 */
export interface SyncPreview {
  toImport: number;      // Sheets → HUB
  toExport: number;      // HUB → Sheets
  toCreate: number;      // 新規作成
  conflicts: number;     // 競合
  unchanged: number;     // 変更なし
  rows: SyncPreviewRow[];
}

/**
 * 同期プレビュー行
 */
export interface SyncPreviewRow {
  rowIndex: number;
  hubId: string | null;
  action: 'IMPORT' | 'EXPORT' | 'CREATE' | 'CONFLICT' | 'SKIP';
  reason?: string;
  sheetData: Record<string, unknown>;
  hubData?: Record<string, unknown>;
}

/**
 * Service Account認証情報（環境変数から取得）
 */
export interface ServiceAccountCredentials {
  type: 'service_account';
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}
