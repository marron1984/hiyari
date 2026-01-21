// ======== Google Sheets 連携ライブラリ ========
// 入居希望者データのインポート・同期

import { google } from 'googleapis';
import { getAdminDb } from './firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { Prospect, ProspectStatus, CareLevel, Gender } from '@/types/prospect';

const DEFAULT_TENANT_ID = 'defaultTenant';

// Google Sheets API設定
const GOOGLE_SHEETS_CLIENT_EMAIL = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
const GOOGLE_SHEETS_PRIVATE_KEY = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n');

// 対象スプレッドシートID
const PROSPECT_SHEET_ID = process.env.PROSPECT_SHEET_ID || '1y00PmqtKRCsyrvaH8ydO3QbzVbFXGEVA2dpKOUDJMaY';

/**
 * Google Sheets APIが設定されているかチェック
 */
export function isGoogleSheetsConfigured(): boolean {
  return !!(GOOGLE_SHEETS_CLIENT_EMAIL && GOOGLE_SHEETS_PRIVATE_KEY);
}

/**
 * Google Sheets APIクライアントを取得
 */
function getSheetsClient() {
  if (!isGoogleSheetsConfigured()) {
    console.warn('Google Sheets credentials not configured');
    return null;
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: GOOGLE_SHEETS_CLIENT_EMAIL,
      private_key: GOOGLE_SHEETS_PRIVATE_KEY,
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  return google.sheets({ version: 'v4', auth });
}

/**
 * スプレッドシートのデータを取得
 */
export async function getSheetData(
  sheetId: string = PROSPECT_SHEET_ID,
  range: string = 'A:Z'
): Promise<string[][] | null> {
  const sheets = getSheetsClient();
  if (!sheets) return null;

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range,
    });

    return response.data.values || [];
  } catch (error) {
    console.error('Google Sheets read error:', error);
    return null;
  }
}

/**
 * ステータス文字列を正規化
 */
function normalizeStatus(value: string): ProspectStatus {
  const statusMap: Record<string, ProspectStatus> = {
    '新規': '新規受付',
    '新規受付': '新規受付',
    '折返し': '折返し待ち',
    '折返し待ち': '折返し待ち',
    '面談設定': '面談設定済',
    '面談設定済': '面談設定済',
    '見学設定': '見学設定済',
    '見学設定済': '見学設定済',
    '申込': '申込中',
    '申込中': '申込中',
    '審査': '審査中',
    '審査中': '審査中',
    '入居待ち': '入居待ち',
    '入居決定': '入居決定',
    '見送り': '見送り',
    'クローズ': 'クローズ',
  };

  return statusMap[value?.trim()] || '新規受付';
}

/**
 * 介護度を正規化
 */
function normalizeCareLevel(value: string): CareLevel | undefined {
  const careLevelMap: Record<string, CareLevel> = {
    '自立': '自立',
    '要支援1': '要支援1',
    '要支援2': '要支援2',
    '要介護1': '要介護1',
    '要介護2': '要介護2',
    '要介護3': '要介護3',
    '要介護4': '要介護4',
    '要介護5': '要介護5',
    '申請中': '申請中',
  };

  return careLevelMap[value?.trim()] || undefined;
}

/**
 * 性別を正規化
 */
function normalizeGender(value: string): Gender | undefined {
  if (!value) return undefined;
  const v = value.trim();
  if (v === '男' || v === '男性') return '男性';
  if (v === '女' || v === '女性') return '女性';
  return '不明';
}

/**
 * 日付文字列をDateに変換
 */
function parseDate(value: string): Date | undefined {
  if (!value) return undefined;

  // 様々な形式に対応
  const formats = [
    // 2024/1/15
    /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/,
    // 2024-01-15
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
    // 1/15/2024
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
  ];

  for (const format of formats) {
    const match = value.match(format);
    if (match) {
      if (format === formats[2]) {
        // MM/DD/YYYY形式
        return new Date(parseInt(match[3]), parseInt(match[1]) - 1, parseInt(match[2]));
      }
      // YYYY/MM/DD または YYYY-MM-DD形式
      return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
    }
  }

  return undefined;
}

/**
 * スプレッドシートの列マッピング定義
 * 実際のシート構造に合わせて調整が必要
 */
interface ColumnMapping {
  internalNo?: number;          // 社内No
  status?: number;              // ステータス
  customerName?: number;        // 顧客名
  age?: number;                 // 年齢
  gender?: number;              // 性別
  careLevel?: number;           // 介護度
  budget?: number;              // 費用
  adlSummary?: number;          // ADL
  debtStatus?: number;          // 借金有無
  currentSituation?: number;    // 現在状況
  desiredFacility?: number;     // 希望施設
  desiredMoveInDate?: number;   // 入居予定日
  interviewDateTime?: number;   // 面談日時
  salesCompanyName?: number;    // 営業会社
  salesRepName?: number;        // 営業担当
  salesRepContact?: number;     // 連絡先
  inquiryDate?: number;         // 問い合わせ日
  otherNotes?: number;          // 備考
}

/**
 * ヘッダー行から列マッピングを自動検出
 */
export function detectColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};

  const patterns: { key: keyof ColumnMapping; patterns: string[] }[] = [
    { key: 'internalNo', patterns: ['社内no', 'no', '番号', 'id'] },
    { key: 'status', patterns: ['ステータス', '状態', 'status'] },
    { key: 'customerName', patterns: ['顧客名', '氏名', '名前', 'お客様名'] },
    { key: 'age', patterns: ['年齢', '年'] },
    { key: 'gender', patterns: ['性別', '男女'] },
    { key: 'careLevel', patterns: ['介護度', '要介護', '介護'] },
    { key: 'budget', patterns: ['費用', '予算', '希望費用'] },
    { key: 'adlSummary', patterns: ['adl', '日常生活', '生活動作'] },
    { key: 'debtStatus', patterns: ['借金', '負債'] },
    { key: 'currentSituation', patterns: ['現在状況', '現況'] },
    { key: 'desiredFacility', patterns: ['希望施設', '入居希望', '施設名'] },
    { key: 'desiredMoveInDate', patterns: ['入居予定', '入居希望日'] },
    { key: 'interviewDateTime', patterns: ['面談', '面談日'] },
    { key: 'salesCompanyName', patterns: ['営業会社', '紹介会社'] },
    { key: 'salesRepName', patterns: ['営業担当', '担当者', '営業者'] },
    { key: 'salesRepContact', patterns: ['連絡先', '電話', 'tel'] },
    { key: 'inquiryDate', patterns: ['問い合わせ', '問合せ日', '受付日'] },
    { key: 'otherNotes', patterns: ['備考', 'メモ', 'その他'] },
  ];

  headers.forEach((header, index) => {
    const lowerHeader = header.toLowerCase().trim();
    for (const { key, patterns: patternList } of patterns) {
      if (patternList.some((p) => lowerHeader.includes(p))) {
        if (mapping[key] === undefined) {
          mapping[key] = index;
        }
        break;
      }
    }
  });

  return mapping;
}

/**
 * 行データをProspectオブジェクトに変換
 */
function rowToProspect(
  row: string[],
  mapping: ColumnMapping,
  rowIndex: number
): Partial<Prospect> {
  const getValue = (colIndex?: number) => {
    if (colIndex === undefined) return undefined;
    return row[colIndex]?.trim() || undefined;
  };

  const ageStr = getValue(mapping.age);
  const age = ageStr ? parseInt(ageStr, 10) : undefined;

  const inquiryDateStr = getValue(mapping.inquiryDate);
  const inquiryDate = parseDate(inquiryDateStr || '');

  return {
    internalNo: getValue(mapping.internalNo) || `IMPORT-${rowIndex}`,
    status: normalizeStatus(getValue(mapping.status) || ''),
    customerName: getValue(mapping.customerName),
    age: isNaN(age || NaN) ? undefined : age,
    gender: normalizeGender(getValue(mapping.gender) || ''),
    careLevel: normalizeCareLevel(getValue(mapping.careLevel) || ''),
    budget: getValue(mapping.budget),
    adlSummary: getValue(mapping.adlSummary),
    debtStatus: getValue(mapping.debtStatus),
    currentSituation: getValue(mapping.currentSituation),
    desiredFacility: getValue(mapping.desiredFacility),
    desiredMoveInDate: getValue(mapping.desiredMoveInDate),
    interviewDateTime: getValue(mapping.interviewDateTime),
    salesCompanyName: getValue(mapping.salesCompanyName),
    salesRepName: getValue(mapping.salesRepName),
    salesRepContact: getValue(mapping.salesRepContact),
    inquiryDate: inquiryDateStr,
    otherNotes: getValue(mapping.otherNotes),
    receivedAt: inquiryDate || new Date(),
    source: 'google-sheets-import',
  };
}

/**
 * 重複キーを生成（顧客名+年齢+営業会社）
 */
function generateProspectKey(prospect: Partial<Prospect>): string {
  const parts = [
    prospect.customerName?.trim().toLowerCase() || '',
    prospect.age?.toString() || '',
    prospect.salesCompanyName?.trim().toLowerCase() || '',
  ].filter(Boolean);
  return parts.join('|');
}

/**
 * スプレッドシートからProspectsをインポート
 */
export async function importProspectsFromSheet(
  sheetId: string = PROSPECT_SHEET_ID,
  range: string = 'A:Z',
  dryRun: boolean = false
): Promise<{
  success: boolean;
  totalRows: number;
  imported: number;
  skipped: number;
  duplicates: number;
  errors: string[];
}> {
  const result = {
    success: false,
    totalRows: 0,
    imported: 0,
    skipped: 0,
    duplicates: 0,
    errors: [] as string[],
  };

  try {
    const data = await getSheetData(sheetId, range);
    if (!data || data.length === 0) {
      result.errors.push('シートからデータを取得できませんでした');
      return result;
    }

    // ヘッダー行を検出
    const headers = data[0];
    const mapping = detectColumnMapping(headers);

    if (Object.keys(mapping).length === 0) {
      result.errors.push('列マッピングを検出できませんでした');
      return result;
    }

    result.totalRows = data.length - 1;

    // 既存のProspectsを取得して重複チェック用のMapを作成
    const existingSnapshot = await getAdminDb()
      .collection('prospects')
      .where('tenantId', '==', DEFAULT_TENANT_ID)
      .get();

    const existingKeys = new Map<string, string>();
    existingSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      if (data.prospectKey) {
        existingKeys.set(data.prospectKey, doc.id);
      }
    });

    // データ行を処理
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row || row.every((cell) => !cell?.trim())) {
        result.skipped++;
        continue;
      }

      try {
        const prospect = rowToProspect(row, mapping, i);

        // 顧客名がない場合はスキップ
        if (!prospect.customerName) {
          result.skipped++;
          continue;
        }

        // 重複チェック
        const prospectKey = generateProspectKey(prospect);
        if (existingKeys.has(prospectKey)) {
          result.duplicates++;
          continue;
        }

        if (!dryRun) {
          // Firestoreに保存
          const docData = {
            tenantId: DEFAULT_TENANT_ID,
            prospectKey,
            ...prospect,
            createdAt: FieldValue.serverTimestamp(),
            receivedAt: prospect.receivedAt || new Date(),
          };

          await getAdminDb().collection('prospects').add(docData);
          existingKeys.set(prospectKey, 'new');
        }

        result.imported++;
      } catch (rowError) {
        result.errors.push(`行${i + 1}: ${rowError instanceof Error ? rowError.message : '処理エラー'}`);
      }
    }

    result.success = true;
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : 'インポートエラー');
  }

  return result;
}

/**
 * インポート履歴を保存
 */
export async function saveImportLog(
  sheetId: string,
  result: {
    totalRows: number;
    imported: number;
    skipped: number;
    duplicates: number;
    errors: string[];
  },
  importedBy: string,
  importedByName: string
): Promise<string> {
  const logData = {
    tenantId: DEFAULT_TENANT_ID,
    source: 'google-sheets',
    sheetId,
    result,
    importedBy,
    importedByName,
    createdAt: FieldValue.serverTimestamp(),
  };

  const docRef = await getAdminDb().collection('importLogs').add(logData);
  return docRef.id;
}

/**
 * 最新のインポート履歴を取得
 */
export async function getRecentImportLogs(limit: number = 10): Promise<Array<{
  id: string;
  sheetId: string;
  result: {
    totalRows: number;
    imported: number;
    skipped: number;
    duplicates: number;
    errors: string[];
  };
  importedByName: string;
  createdAt: Date;
}>> {
  const snapshot = await getAdminDb()
    .collection('importLogs')
    .where('tenantId', '==', DEFAULT_TENANT_ID)
    .where('source', '==', 'google-sheets')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      sheetId: data.sheetId,
      result: data.result,
      importedByName: data.importedByName,
      createdAt: data.createdAt?.toDate() || new Date(),
    };
  });
}
