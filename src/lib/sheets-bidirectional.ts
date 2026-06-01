// ======== Google Sheets 双方向同期ライブラリ ========
// Service Account認証を使った双方向同期

import { google, sheets_v4 } from 'googleapis';
import { getAdminDb } from './firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { toDate } from './date';
import type {
  SyncEntity,
  SyncDirection,
  SheetSyncStatus,
  SyncResult,
  SyncError,
  SyncLog,
  SyncPreview,
  SyncPreviewRow,
  BidirectionalSyncOptions,
  SheetsConnectionConfig,
  ServiceAccountCredentials,
} from '@/types/sheets-sync';

const DEFAULT_TENANT_ID = 'defaultTenant';

// ======== Service Account 認証 ========

let sheetsClient: sheets_v4.Sheets | null = null;

/**
 * Service Account認証情報を取得
 */
function getServiceAccountCredentials(): ServiceAccountCredentials | null {
  const credentialsJson = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT;
  if (!credentialsJson) {
    console.warn('GOOGLE_SHEETS_SERVICE_ACCOUNT environment variable is not set');
    return null;
  }

  try {
    return JSON.parse(credentialsJson) as ServiceAccountCredentials;
  } catch (error) {
    console.error('Failed to parse service account credentials:', error);
    return null;
  }
}

/**
 * Google Sheets APIクライアントを取得
 */
export async function getSheetsClient(): Promise<sheets_v4.Sheets | null> {
  if (sheetsClient) {
    return sheetsClient;
  }

  const credentials = getServiceAccountCredentials();
  if (!credentials) {
    return null;
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: credentials.client_email,
        private_key: credentials.private_key.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    sheetsClient = google.sheets({ version: 'v4', auth });
    return sheetsClient;
  } catch (error) {
    console.error('Failed to create Sheets client:', error);
    return null;
  }
}

/**
 * Service Account認証が設定されているか
 */
export function isServiceAccountConfigured(): boolean {
  return !!getServiceAccountCredentials();
}

/**
 * Service Accountのメールアドレスを取得
 */
export function getServiceAccountEmail(): string | null {
  const credentials = getServiceAccountCredentials();
  return credentials?.client_email || null;
}

// ======== シート操作 ========

/**
 * スプレッドシートのメタデータを取得
 */
export async function getSpreadsheetMetadata(spreadsheetId: string): Promise<{
  title: string;
  sheets: { title: string; sheetId: number }[];
} | null> {
  const client = await getSheetsClient();
  if (!client) return null;

  try {
    const response = await client.spreadsheets.get({
      spreadsheetId,
      fields: 'properties.title,sheets.properties',
    });

    const title = response.data.properties?.title || '';
    const sheets = (response.data.sheets || []).map((s) => ({
      title: s.properties?.title || '',
      sheetId: s.properties?.sheetId || 0,
    }));

    return { title, sheets };
  } catch (error) {
    console.error('Failed to get spreadsheet metadata:', error);
    return null;
  }
}

/**
 * シートのデータを取得
 */
export async function getSheetDataWithAuth(
  spreadsheetId: string,
  range: string
): Promise<string[][] | null> {
  const client = await getSheetsClient();
  if (!client) return null;

  try {
    const response = await client.spreadsheets.values.get({
      spreadsheetId,
      range,
      valueRenderOption: 'FORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING',
    });

    return (response.data.values as string[][]) || [];
  } catch (error) {
    console.error('Failed to get sheet data:', error);
    return null;
  }
}

/**
 * シートにデータを書き込み
 */
export async function updateSheetData(
  spreadsheetId: string,
  range: string,
  values: (string | number | null)[][]
): Promise<boolean> {
  const client = await getSheetsClient();
  if (!client) return false;

  try {
    await client.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });
    return true;
  } catch (error) {
    console.error('Failed to update sheet data:', error);
    return false;
  }
}

/**
 * シートに行を追加
 */
export async function appendSheetRows(
  spreadsheetId: string,
  sheetName: string,
  values: (string | number | null)[][]
): Promise<boolean> {
  const client = await getSheetsClient();
  if (!client) return false;

  try {
    await client.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:Z`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values },
    });
    return true;
  } catch (error) {
    console.error('Failed to append sheet rows:', error);
    return false;
  }
}

// ======== 列マッピング ========

/**
 * 必須列の定義
 */
const REQUIRED_COLUMNS = {
  hub_id: ['hub_id', 'hubid', 'dhp-hub id', 'dhp_hub_id'],
  updated_at: ['updated_at', 'updatedat', '更新日時', '最終更新'],
  sync_status: ['sync_status', 'syncstatus', '同期状態', '同期ステータス'],
};

/**
 * エンティティごとの列マッピング
 */
const ENTITY_COLUMNS: Record<SyncEntity, Record<string, string[]>> = {
  prospects: {
    internalNo: ['社内no', 'no.', '番号', 'internal_no'],
    status: ['ステータス', 'status'],
    customerName: ['顧客名', '氏名', 'name', 'customer_name'],
    receivedAt: ['受信日時', 'received_at'],
    salesCompanyName: ['営業会社名', '紹介会社', 'sales_company'],
    salesRepName: ['営業担当者名', '営業担当', 'sales_rep'],
    age: ['年齢', 'age'],
    gender: ['性別', 'gender'],
    careLevel: ['介護度', 'care_level'],
    desiredFacility: ['入居場所', '希望施設', 'facility'],
  },
  sales: {
    prospectId: ['prospect_id', '案件id'],
    stage: ['ステージ', 'stage', '進捗'],
    probability: ['確度', 'probability'],
    expectedCloseDate: ['成約予定日', 'expected_close'],
    assignedTo: ['担当者', 'assigned_to'],
    notes: ['備考', 'notes', 'メモ'],
  },
  applications: {
    applicationType: ['申請種別', 'type', 'application_type'],
    applicantName: ['申請者', 'applicant'],
    status: ['ステータス', 'status'],
    submittedAt: ['申請日時', 'submitted_at'],
    approvedAt: ['承認日時', 'approved_at'],
    approvedBy: ['承認者', 'approved_by'],
  },
};

/**
 * ヘッダー行から列インデックスを検出
 */
export function detectColumnIndices(
  headers: string[],
  entity: SyncEntity
): { required: Record<string, number>; entity: Record<string, number> } {
  const result = {
    required: {} as Record<string, number>,
    entity: {} as Record<string, number>,
  };

  const lowerHeaders = headers.map((h) => h.toLowerCase().trim());

  // 必須列を検出
  for (const [key, patterns] of Object.entries(REQUIRED_COLUMNS)) {
    for (let i = 0; i < lowerHeaders.length; i++) {
      if (patterns.some((p) => lowerHeaders[i].includes(p))) {
        result.required[key] = i;
        break;
      }
    }
  }

  // エンティティ固有の列を検出
  const entityColumns = ENTITY_COLUMNS[entity];
  for (const [key, patterns] of Object.entries(entityColumns)) {
    for (let i = 0; i < lowerHeaders.length; i++) {
      if (patterns.some((p) => lowerHeaders[i].includes(p))) {
        result.entity[key] = i;
        break;
      }
    }
  }

  return result;
}

// ======== 日付変換 ========

/**
 * 日付文字列をDateに変換
 */
function parseSheetDate(value: string | undefined): Date | null {
  if (!value) return null;

  // ISO形式
  const isoMatch = value.match(/^\d{4}-\d{2}-\d{2}/);
  if (isoMatch) {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }

  // YYYY/MM/DD形式
  const slashMatch = value.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (slashMatch) {
    return new Date(
      parseInt(slashMatch[1]),
      parseInt(slashMatch[2]) - 1,
      parseInt(slashMatch[3])
    );
  }

  return null;
}

/**
 * DateをISO文字列に変換
 */
function formatDateForSheet(date: Date | Timestamp | null): string {
  if (!date) return '';
  const d = toDate(date);
  if (!d) return '';
  return d.toISOString().split('T')[0] + ' ' + d.toTimeString().split(' ')[0];
}

// ======== 同期ロジック ========

/**
 * 双方向同期のプレビューを生成
 */
export async function generateSyncPreview(
  options: BidirectionalSyncOptions
): Promise<SyncPreview | null> {
  const { entity, spreadsheetId, sheetName, gid } = options;

  // シートデータを取得
  const sheetData = await getSheetDataWithAuth(spreadsheetId, `${sheetName}!A:Z`);
  if (!sheetData || sheetData.length < 2) {
    return null;
  }

  const headers = sheetData[0];
  const columnIndices = detectColumnIndices(headers, entity);

  // 必須列のチェック
  if (columnIndices.required.hub_id === undefined) {
    console.error('hub_id column not found');
    return null;
  }

  // Firestoreからエンティティデータを取得
  const db = getAdminDb();
  const collectionName = getCollectionName(entity);
  const snapshot = await db
    .collection(collectionName)
    .where('tenantId', '==', DEFAULT_TENANT_ID)
    .get();

  const hubDataMap = new Map<string, { id: string; data: Record<string, unknown>; updatedAt: Date | null }>();
  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    hubDataMap.set(doc.id, {
      id: doc.id,
      data,
      updatedAt: toDate(data.updatedAt) || toDate(data.createdAt) || null,
    });
  });

  // プレビュー生成
  const preview: SyncPreview = {
    toImport: 0,
    toExport: 0,
    toCreate: 0,
    conflicts: 0,
    unchanged: 0,
    rows: [],
  };

  const processedHubIds = new Set<string>();

  // シート行を処理
  for (let i = 1; i < sheetData.length; i++) {
    const row = sheetData[i];
    if (!row || row.every((cell) => !cell?.trim())) continue;

    const hubId = row[columnIndices.required.hub_id]?.trim() || null;
    const sheetUpdatedAt = parseSheetDate(row[columnIndices.required.updated_at]);

    const previewRow: SyncPreviewRow = {
      rowIndex: i + 1, // 1-indexed for display
      hubId,
      action: 'SKIP',
      sheetData: rowToObject(row, headers),
    };

    if (!hubId) {
      // 新規行（hub_idが空）
      previewRow.action = 'CREATE';
      previewRow.reason = 'hub_id未設定 - HUBに新規作成';
      preview.toCreate++;
    } else if (hubDataMap.has(hubId)) {
      // 既存レコード
      processedHubIds.add(hubId);
      const hubRecord = hubDataMap.get(hubId)!;
      previewRow.hubData = hubRecord.data;

      const hubUpdatedAt = hubRecord.updatedAt;

      if (!sheetUpdatedAt || !hubUpdatedAt) {
        // 日付不明 - HUB優先
        previewRow.action = 'EXPORT';
        previewRow.reason = '日付不明 - HUB優先でエクスポート';
        preview.toExport++;
      } else if (sheetUpdatedAt > hubUpdatedAt) {
        // シートが新しい
        previewRow.action = 'IMPORT';
        previewRow.reason = 'シートが新しい - HUBにインポート';
        preview.toImport++;
      } else if (hubUpdatedAt > sheetUpdatedAt) {
        // HUBが新しい
        previewRow.action = 'EXPORT';
        previewRow.reason = 'HUBが新しい - シートにエクスポート';
        preview.toExport++;
      } else {
        // 同じ
        previewRow.action = 'SKIP';
        previewRow.reason = '変更なし';
        preview.unchanged++;
      }
    } else {
      // hub_idはあるがHUBに存在しない
      previewRow.action = 'CREATE';
      previewRow.reason = 'HUBに存在しない - 新規作成';
      preview.toCreate++;
    }

    preview.rows.push(previewRow);
  }

  // HUBにあってシートにない行
  for (const [hubId, record] of hubDataMap) {
    if (!processedHubIds.has(hubId)) {
      preview.rows.push({
        rowIndex: -1, // 新規行
        hubId,
        action: 'EXPORT',
        reason: 'シートに存在しない - 新規行として追加',
        sheetData: {},
        hubData: record.data,
      });
      preview.toExport++;
    }
  }

  return preview;
}

/**
 * 行データをオブジェクトに変換
 */
function rowToObject(row: string[], headers: string[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  headers.forEach((header, i) => {
    if (row[i] !== undefined && row[i] !== '') {
      obj[header] = row[i];
    }
  });
  return obj;
}

/**
 * エンティティ名からコレクション名を取得
 */
function getCollectionName(entity: SyncEntity): string {
  const map: Record<SyncEntity, string> = {
    prospects: 'prospects',
    sales: 'salesPipeline',
    applications: 'applications',
  };
  return map[entity];
}

/**
 * 双方向同期を実行
 */
export async function executeBidirectionalSync(
  options: BidirectionalSyncOptions,
  executedBy: string,
  executedByName: string
): Promise<SyncResult> {
  const startedAt = new Date();
  const { entity, spreadsheetId, sheetName, dryRun = false } = options;
  const conflictResolution = options.conflictResolution || 'HUB_WINS';

  const result: SyncResult = {
    success: false,
    entity,
    direction: 'BIDIRECTIONAL',
    rowsProcessed: 0,
    rowsCreated: 0,
    rowsUpdated: 0,
    rowsSkipped: 0,
    rowsConflict: 0,
    errors: [],
    startedAt,
    completedAt: new Date(),
  };

  try {
    // シートデータを取得
    const sheetData = await getSheetDataWithAuth(spreadsheetId, `${sheetName}!A:Z`);
    if (!sheetData || sheetData.length < 2) {
      result.errors.push({ message: 'シートデータが空です', code: 'EMPTY_SHEET' });
      return result;
    }

    const headers = sheetData[0];
    const columnIndices = detectColumnIndices(headers, entity);

    // 必須列のチェック
    const hubIdCol = columnIndices.required.hub_id;
    const updatedAtCol = columnIndices.required.updated_at;
    const syncStatusCol = columnIndices.required.sync_status;

    if (hubIdCol === undefined) {
      result.errors.push({ message: 'hub_id列が見つかりません', code: 'MISSING_COLUMN' });
      return result;
    }

    const db = getAdminDb();
    const collectionName = getCollectionName(entity);

    // Firestoreからエンティティデータを取得
    const snapshot = await db
      .collection(collectionName)
      .where('tenantId', '==', DEFAULT_TENANT_ID)
      .get();

    const hubDataMap = new Map<string, { id: string; data: Record<string, unknown>; updatedAt: Date | null }>();
    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      hubDataMap.set(doc.id, {
        id: doc.id,
        data,
        updatedAt: toDate(data.updatedAt) || toDate(data.createdAt) || null,
      });
    });

    const processedHubIds = new Set<string>();
    const sheetUpdates: { range: string; values: (string | number | null)[][] }[] = [];
    const newSheetRows: (string | number | null)[][] = [];

    // シート行を処理
    for (let i = 1; i < sheetData.length; i++) {
      const row = sheetData[i];
      if (!row || row.every((cell) => !cell?.trim())) {
        result.rowsSkipped++;
        continue;
      }

      result.rowsProcessed++;

      const hubId = row[hubIdCol]?.trim() || null;
      const sheetUpdatedAt = updatedAtCol !== undefined ? parseSheetDate(row[updatedAtCol]) : null;

      try {
        if (!hubId) {
          // 新規行 - HUBに作成
          if (!dryRun) {
            const newData = sheetRowToFirestoreData(row, headers, columnIndices.entity, entity);
            const docRef = await db.collection(collectionName).add({
              ...newData,
              tenantId: DEFAULT_TENANT_ID,
              source: 'google-sheets-sync',
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });

            // シートにhub_idを書き戻し
            if (hubIdCol !== undefined) {
              sheetUpdates.push({
                range: `${sheetName}!${columnToLetter(hubIdCol)}${i + 1}`,
                values: [[docRef.id]],
              });
            }
            if (syncStatusCol !== undefined) {
              sheetUpdates.push({
                range: `${sheetName}!${columnToLetter(syncStatusCol)}${i + 1}`,
                values: [['SYNCED']],
              });
            }
            if (updatedAtCol !== undefined) {
              sheetUpdates.push({
                range: `${sheetName}!${columnToLetter(updatedAtCol)}${i + 1}`,
                values: [[formatDateForSheet(new Date())]],
              });
            }
          }
          result.rowsCreated++;
        } else if (hubDataMap.has(hubId)) {
          // 既存レコード
          processedHubIds.add(hubId);
          const hubRecord = hubDataMap.get(hubId)!;
          const hubUpdatedAt = hubRecord.updatedAt;

          let action: 'IMPORT' | 'EXPORT' | 'SKIP' = 'SKIP';

          if (!sheetUpdatedAt || !hubUpdatedAt) {
            // 日付不明 - 競合解決ルールに従う
            action = conflictResolution === 'SHEET_WINS' ? 'IMPORT' : 'EXPORT';
            result.rowsConflict++;
          } else if (sheetUpdatedAt > hubUpdatedAt) {
            action = 'IMPORT';
          } else if (hubUpdatedAt > sheetUpdatedAt) {
            action = 'EXPORT';
          }

          if (action === 'IMPORT' && !dryRun) {
            // シート → HUB
            const updateData = sheetRowToFirestoreData(row, headers, columnIndices.entity, entity);
            await db.collection(collectionName).doc(hubId).update({
              ...updateData,
              updatedAt: FieldValue.serverTimestamp(),
            });
            result.rowsUpdated++;
          } else if (action === 'EXPORT' && !dryRun) {
            // HUB → シート
            const rowData = firestoreDataToSheetRow(hubRecord.data, headers, columnIndices);
            sheetUpdates.push({
              range: `${sheetName}!A${i + 1}:${columnToLetter(headers.length - 1)}${i + 1}`,
              values: [rowData],
            });
            result.rowsUpdated++;
          } else {
            result.rowsSkipped++;
          }
        } else {
          // hub_idはあるがHUBに存在しない - HUBに作成
          if (!dryRun) {
            const newData = sheetRowToFirestoreData(row, headers, columnIndices.entity, entity);
            await db.collection(collectionName).doc(hubId).set({
              ...newData,
              tenantId: DEFAULT_TENANT_ID,
              source: 'google-sheets-sync',
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
          result.rowsCreated++;
        }
      } catch (rowError) {
        result.errors.push({
          rowIndex: i + 1,
          hubId: hubId || undefined,
          message: rowError instanceof Error ? rowError.message : '処理エラー',
          code: 'ROW_ERROR',
        });
      }
    }

    // HUBにあってシートにない行を追加
    for (const [hubId, record] of hubDataMap) {
      if (!processedHubIds.has(hubId)) {
        const rowData = firestoreDataToSheetRow(record.data, headers, columnIndices);
        rowData[hubIdCol] = hubId; // hub_idを設定
        if (syncStatusCol !== undefined) rowData[syncStatusCol] = 'SYNCED';
        if (updatedAtCol !== undefined) rowData[updatedAtCol] = formatDateForSheet(record.updatedAt);
        newSheetRows.push(rowData);
        result.rowsCreated++;
      }
    }

    // シートに書き込み
    if (!dryRun) {
      // 個別セル更新
      for (const update of sheetUpdates) {
        await updateSheetData(spreadsheetId, update.range, update.values);
      }

      // 新規行追加
      if (newSheetRows.length > 0) {
        await appendSheetRows(spreadsheetId, sheetName, newSheetRows);
      }

      // 同期ログを保存
      await saveSyncLog({
        tenantId: DEFAULT_TENANT_ID,
        entity,
        direction: 'BIDIRECTIONAL',
        spreadsheetId,
        sheetName,
        result: {
          success: true,
          rowsProcessed: result.rowsProcessed,
          rowsCreated: result.rowsCreated,
          rowsUpdated: result.rowsUpdated,
          rowsSkipped: result.rowsSkipped,
          rowsConflict: result.rowsConflict,
          errorCount: result.errors.length,
        },
        executedBy,
        executedByName,
        startedAt,
        completedAt: new Date(),
        createdAt: new Date(),
      });
    }

    result.success = true;
  } catch (error) {
    result.errors.push({
      message: error instanceof Error ? error.message : '同期エラー',
      code: 'SYNC_ERROR',
    });
  }

  result.completedAt = new Date();
  return result;
}

/**
 * シート行をFirestoreデータに変換
 */
function sheetRowToFirestoreData(
  row: string[],
  headers: string[],
  entityColumnIndices: Record<string, number>,
  entity: SyncEntity
): Record<string, unknown> {
  const data: Record<string, unknown> = {};

  for (const [fieldName, colIndex] of Object.entries(entityColumnIndices)) {
    const value = row[colIndex]?.trim();
    if (value !== undefined && value !== '') {
      // 日付フィールドの変換
      if (fieldName.includes('At') || fieldName.includes('Date')) {
        const date = parseSheetDate(value);
        if (date) data[fieldName] = date;
      } else if (fieldName === 'age' || fieldName === 'probability') {
        const num = parseInt(value, 10);
        if (!isNaN(num)) data[fieldName] = num;
      } else {
        data[fieldName] = value;
      }
    }
  }

  return data;
}

/**
 * FirestoreデータをシートRowに変換
 */
function firestoreDataToSheetRow(
  data: Record<string, unknown>,
  headers: string[],
  columnIndices: { required: Record<string, number>; entity: Record<string, number> }
): (string | number | null)[] {
  const row: (string | number | null)[] = new Array(headers.length).fill('');

  // エンティティ列
  for (const [fieldName, colIndex] of Object.entries(columnIndices.entity)) {
    const value = data[fieldName];
    if (value !== undefined && value !== null) {
      if (value instanceof Date || (value as Timestamp)?.toDate) {
        row[colIndex] = formatDateForSheet(value as Date | Timestamp);
      } else {
        row[colIndex] = String(value);
      }
    }
  }

  // sync_status
  if (columnIndices.required.sync_status !== undefined) {
    row[columnIndices.required.sync_status] = 'SYNCED';
  }

  // updated_at
  if (columnIndices.required.updated_at !== undefined) {
    const updatedAt = toDate(data.updatedAt) || toDate(data.createdAt);
    row[columnIndices.required.updated_at] = formatDateForSheet(updatedAt);
  }

  return row;
}

/**
 * 列インデックスをアルファベットに変換
 */
function columnToLetter(index: number): string {
  let result = '';
  let n = index;
  while (n >= 0) {
    result = String.fromCharCode((n % 26) + 65) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

// ======== 同期ログ ========

/**
 * 同期ログを保存
 */
async function saveSyncLog(log: SyncLog): Promise<string> {
  const db = getAdminDb();
  const docRef = await db.collection('syncLogs').add({
    ...log,
    createdAt: FieldValue.serverTimestamp(),
  });
  return docRef.id;
}

/**
 * 最近の同期ログを取得
 */
export async function getRecentSyncLogs(
  entity?: SyncEntity,
  limit: number = 10
): Promise<SyncLog[]> {
  const db = getAdminDb();
  let query = db
    .collection('syncLogs')
    .where('tenantId', '==', DEFAULT_TENANT_ID)
    .orderBy('createdAt', 'desc')
    .limit(limit);

  if (entity) {
    query = query.where('entity', '==', entity);
  }

  const snapshot = await query.get();
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    startedAt: toDate(doc.data().startedAt) || new Date(),
    completedAt: toDate(doc.data().completedAt) || new Date(),
    createdAt: toDate(doc.data().createdAt) || new Date(),
  })) as SyncLog[];
}

// ======== 接続設定 ========

/**
 * 接続設定を保存
 */
export async function saveConnectionConfig(
  config: Omit<SheetsConnectionConfig, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const db = getAdminDb();
  const docRef = db.collection('sheetsConnectionConfigs').doc(config.tenantId);

  await docRef.set({
    ...config,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return docRef.id;
}

/**
 * 接続設定を取得
 */
export async function getConnectionConfig(): Promise<SheetsConnectionConfig | null> {
  const db = getAdminDb();
  const docRef = db.collection('sheetsConnectionConfigs').doc(DEFAULT_TENANT_ID);
  const doc = await docRef.get();

  if (!doc.exists) return null;

  const data = doc.data()!;
  return {
    id: doc.id,
    ...data,
    lastSyncAt: toDate(data.lastSyncAt),
    createdAt: toDate(data.createdAt) || new Date(),
    updatedAt: toDate(data.updatedAt) || new Date(),
  } as SheetsConnectionConfig;
}

/**
 * 接続テスト
 */
export async function testConnection(spreadsheetId: string): Promise<{
  success: boolean;
  spreadsheetName?: string;
  sheets?: { title: string; sheetId: number }[];
  error?: string;
}> {
  if (!isServiceAccountConfigured()) {
    return { success: false, error: 'Service Account が設定されていません' };
  }

  const metadata = await getSpreadsheetMetadata(spreadsheetId);
  if (!metadata) {
    return { success: false, error: 'スプレッドシートにアクセスできません。共有設定を確認してください。' };
  }

  return {
    success: true,
    spreadsheetName: metadata.title,
    sheets: metadata.sheets,
  };
}
