// ======== Google Sheets 連携ライブラリ ========
// 入居希望者データのインポート・同期

import { getAdminDb } from './firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { Prospect, ProspectStatus, CareLevel, Gender } from '@/types/prospect';

const DEFAULT_TENANT_ID = 'defaultTenant';

// 対象スプレッドシートID
const PROSPECT_SHEET_ID = process.env.PROSPECT_SHEET_ID || '1y00PmqtKRCsyrvaH8ydO3QbzVbFXGEVA2dpKOUDJMaY';

/**
 * 公開スプレッドシートは常に利用可能
 */
export function isGoogleSheetsConfigured(): boolean {
  return true; // 公開シートはAPI認証不要
}

/**
 * CSVをパースする
 */
function parseCSV(csv: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    const nextChar = csv[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        // エスケープされた引用符
        currentCell += '"';
        i++;
      } else if (char === '"') {
        // 引用符終了
        inQuotes = false;
      } else {
        currentCell += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentCell);
        currentCell = '';
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        currentRow.push(currentCell);
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
        if (char === '\r') i++; // Skip \n after \r
      } else if (char !== '\r') {
        currentCell += char;
      }
    }
  }

  // 最後のセルと行を追加
  if (currentCell || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
}

/**
 * 公開スプレッドシートからCSVとしてデータを取得
 * @param sheetId スプレッドシートID
 * @param gid シートのgid（デフォルトは0＝最初のシート）
 */
export async function getSheetData(
  sheetId: string = PROSPECT_SHEET_ID,
  gid: number = 0
): Promise<string[][] | null> {
  try {
    // 公開シートをCSVとしてエクスポート（gidで特定のシートを指定）
    const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;

    const response = await fetch(exportUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch sheet:', response.status, response.statusText);
      return null;
    }

    const csvText = await response.text();

    if (!csvText || csvText.includes('<!DOCTYPE html>')) {
      console.error('Sheet is not publicly accessible or does not exist');
      return null;
    }

    return parseCSV(csvText);
  } catch (error) {
    console.error('Google Sheets fetch error:', error);
    return null;
  }
}

/**
 * ステータス文字列を正規化
 * シートのステータス: 案件終了, 入居済, 初期提案, 面談・内覧日程調整, 入居検討中, 面談内覧日確定, 入居確定
 */
function normalizeStatus(value: string): ProspectStatus {
  const statusMap: Record<string, ProspectStatus> = {
    // 新規・初期
    '新規': '新規受付',
    '新規受付': '新規受付',
    '初期提案': '新規受付',
    // 折り返し
    '折返し': '折返し待ち',
    '折返し待ち': '折返し待ち',
    // 面談関連
    '面談設定': '面談設定済',
    '面談設定済': '面談設定済',
    '面談・内覧日程調整': '面談設定済',
    '面談内覧日確定': '面談設定済',
    // 見学関連
    '見学設定': '見学設定済',
    '見学設定済': '見学設定済',
    // 検討・申込
    '入居検討中': '申込中',
    '申込': '申込中',
    '申込中': '申込中',
    // 審査
    '審査': '審査中',
    '審査中': '審査中',
    // 入居確定
    '入居待ち': '入居待ち',
    '入居確定': '入居決定',
    '入居決定': '入居決定',
    '入居済': '入居決定',
    // 終了・見送り
    '見送り': '見送り',
    'クローズ': 'クローズ',
    '案件終了': 'クローズ',
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
 * 値が日付形式かどうかをチェック
 */
function looksLikeDate(value: string): boolean {
  if (!value) return false;
  const trimmed = value.trim();

  // 日付パターン
  const datePatterns = [
    /^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/,  // 2024/1/15, 2024-01-15
    /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/,  // 1/15/2024
    /^\d{1,2}月\d{1,2}日/,                // 1月15日
  ];

  return datePatterns.some(p => p.test(trimmed));
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
 * 実際のシート構造:
 * 社内No. | ステータス | ステータス備考 | 面談日時 | 入居場所 | 入居予定日 | 受信日時 |
 * 営業会社名 | 営業担当者名 | 顧客名 | 問い合わせ日 | 年齢 | 性別 | 介護度 | 費用 |
 * ADL状況 | ADL詳細 | 借金有無 | 現在状況 | エント希望 | キーパーソン | その他・備考 | 見学希望日
 */
interface ColumnMapping {
  internalNo?: number;          // 0: 社内No.
  status?: number;              // 1: ステータス
  statusNote?: number;          // 2: ステータス備考
  interviewDateTime?: number;   // 3: 面談日時
  desiredFacility?: number;     // 4: 入居場所
  desiredMoveInDate?: number;   // 5: 入居予定日
  receivedAt?: number;          // 6: 受信日時
  salesCompanyName?: number;    // 7: 営業会社名
  salesRepName?: number;        // 8: 営業担当者名
  customerName?: number;        // 9: 顧客名
  inquiryDate?: number;         // 10: 問い合わせ日
  age?: number;                 // 11: 年齢
  gender?: number;              // 12: 性別
  careLevel?: number;           // 13: 介護度
  budget?: number;              // 14: 費用
  adlSummary?: number;          // 15: ADL状況
  adlDetail?: number;           // 16: ADL詳細
  debtStatus?: number;          // 17: 借金有無
  currentSituation?: number;    // 18: 現在状況
  entertainmentWish?: number;   // 19: エント希望
  keyPerson?: number;           // 20: キーパーソン
  otherNotes?: number;          // 21: その他・備考
  tourRequestDate?: number;     // 22: 見学希望日
}

/**
 * ヘッダー行から列マッピングを自動検出
 * 優先度: 完全一致 > 部分一致
 */
export function detectColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};

  // 完全一致で優先的にマッチするパターン（キー項目）
  const exactPatterns: { key: keyof ColumnMapping; exact: string[] }[] = [
    { key: 'customerName', exact: ['顧客名', '氏名', 'お客様名'] },
    { key: 'internalNo', exact: ['社内no.', '社内no', 'no.'] },
    { key: 'status', exact: ['ステータス'] },
    { key: 'inquiryDate', exact: ['問い合わせ日', '問合せ日'] },
    { key: 'receivedAt', exact: ['受信日時'] },
  ];

  // まず完全一致でマッチ
  headers.forEach((header, index) => {
    const lowerHeader = header.toLowerCase().trim();
    for (const { key, exact } of exactPatterns) {
      if (exact.some((p) => lowerHeader === p)) {
        if (mapping[key] === undefined) {
          mapping[key] = index;
        }
        break;
      }
    }
  });

  // 部分一致でマッチ（完全一致で見つからなかったもののみ）
  const patterns: { key: keyof ColumnMapping; patterns: string[] }[] = [
    { key: 'internalNo', patterns: ['社内no', 'no.', '番号', 'id'] },
    { key: 'status', patterns: ['ステータス'] },
    { key: 'statusNote', patterns: ['ステータス備考'] },
    { key: 'interviewDateTime', patterns: ['面談日時'] },
    { key: 'desiredFacility', patterns: ['入居場所', '希望施設'] },
    { key: 'desiredMoveInDate', patterns: ['入居予定日'] },
    { key: 'receivedAt', patterns: ['受信日時', '受信'] },
    { key: 'salesCompanyName', patterns: ['営業会社名', '営業会社', '紹介会社'] },
    { key: 'salesRepName', patterns: ['営業担当者名', '営業担当'] },
    { key: 'customerName', patterns: ['顧客名', '氏名', 'お客様名'] }, // '名前'を除去（誤検出防止）
    { key: 'inquiryDate', patterns: ['問い合わせ日', '問合せ日', '受付日'] },
    { key: 'age', patterns: ['年齢'] },
    { key: 'gender', patterns: ['性別'] },
    { key: 'careLevel', patterns: ['介護度'] },
    { key: 'budget', patterns: ['費用', '予算'] },
    { key: 'adlSummary', patterns: ['adl状況', 'adl'] },
    { key: 'adlDetail', patterns: ['adl詳細'] },
    { key: 'debtStatus', patterns: ['借金有無', '借金'] },
    { key: 'currentSituation', patterns: ['現在状況', '現況'] },
    { key: 'entertainmentWish', patterns: ['エント希望', 'エント'] },
    { key: 'keyPerson', patterns: ['キーパーソン', 'kp'] },
    { key: 'otherNotes', patterns: ['その他・備考', 'その他', 'メモ'] }, // '備考'単体を除去（誤検出防止）
    { key: 'tourRequestDate', patterns: ['見学希望日'] },
  ];

  headers.forEach((header, index) => {
    const lowerHeader = header.toLowerCase().trim();
    for (const { key, patterns: patternList } of patterns) {
      if (mapping[key] === undefined && patternList.some((p) => lowerHeader.includes(p))) {
        mapping[key] = index;
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
  // 年齢が "80代" などの場合は数値部分だけ抽出
  const ageMatch = ageStr?.match(/(\d+)/);
  const age = ageMatch ? parseInt(ageMatch[1], 10) : undefined;

  const inquiryDateStr = getValue(mapping.inquiryDate);
  const inquiryDate = parseDate(inquiryDateStr || '');

  // 受信日時も日付としてパース
  const receivedAtStr = getValue(mapping.receivedAt);
  const receivedAt = parseDate(receivedAtStr?.split(' ')[0] || '') || inquiryDate || new Date();

  // 顧客名が日付形式の場合は無効とする
  const rawCustomerName = getValue(mapping.customerName);
  const customerName = rawCustomerName && !looksLikeDate(rawCustomerName) ? rawCustomerName : undefined;

  return {
    internalNo: getValue(mapping.internalNo) || `IMPORT-${rowIndex}`,
    status: normalizeStatus(getValue(mapping.status) || ''),
    statusNote: getValue(mapping.statusNote),
    customerName,
    age: isNaN(age || NaN) ? undefined : age,
    gender: normalizeGender(getValue(mapping.gender) || ''),
    careLevel: normalizeCareLevel(getValue(mapping.careLevel) || ''),
    budget: getValue(mapping.budget),
    adlSummary: getValue(mapping.adlSummary),
    adlDetail: getValue(mapping.adlDetail),
    debtStatus: getValue(mapping.debtStatus),
    currentSituation: getValue(mapping.currentSituation),
    desiredFacility: getValue(mapping.desiredFacility),
    desiredMoveInDate: getValue(mapping.desiredMoveInDate),
    interviewDateTime: getValue(mapping.interviewDateTime),
    salesCompanyName: getValue(mapping.salesCompanyName),
    salesRepName: getValue(mapping.salesRepName),
    inquiryDate: inquiryDateStr,
    entertainmentWish: getValue(mapping.entertainmentWish),
    keyPerson: getValue(mapping.keyPerson),
    otherNotes: getValue(mapping.otherNotes),
    tourRequestDate: getValue(mapping.tourRequestDate),
    receivedAt,
    source: 'google-sheets-import',
  };
}

/**
 * オブジェクトからundefined値を削除
 */
function removeUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const key in obj) {
    if (obj[key] !== undefined) {
      result[key] = obj[key];
    }
  }
  return result;
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
 * 年を取得（日付文字列から）
 */
function getYearFromDateString(value: string | undefined): number | undefined {
  if (!value) return undefined;

  // YYYY/M/D or YYYY-M-D 形式
  const match1 = value.match(/^(\d{4})[\/\-]/);
  if (match1) return parseInt(match1[1], 10);

  // M/D/YYYY 形式
  const match2 = value.match(/\/(\d{4})$/);
  if (match2) return parseInt(match2[1], 10);

  return undefined;
}

/**
 * スプレッドシートからProspectsをインポート
 * @param sheetId スプレッドシートID
 * @param range 範囲
 * @param dryRun ドライラン（テスト）モード
 * @param yearFilter 年フィルター（指定した年以降のデータのみインポート）
 */
export async function importProspectsFromSheet(
  sheetId: string = PROSPECT_SHEET_ID,
  range: string = 'A:Z',
  dryRun: boolean = false,
  yearFilter: number = 2026 // デフォルトで2026年以降のみ
): Promise<{
  success: boolean;
  totalRows: number;
  imported: number;
  skipped: number;
  duplicates: number;
  archived: number;
  errors: string[];
}> {
  const result = {
    success: false,
    totalRows: 0,
    imported: 0,
    skipped: 0,
    duplicates: 0,
    archived: 0, // 2025年以前のデータ
    errors: [] as string[],
  };

  try {
    const data = await getSheetData(sheetId);
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

        // 年フィルター: 問い合わせ日または受信日から年を取得
        const inquiryYear = getYearFromDateString(prospect.inquiryDate);
        const receivedYear = prospect.receivedAt?.getFullYear();
        const dataYear = inquiryYear || receivedYear;

        // 古いデータ（yearFilter未満）はアーカイブとしてスキップ
        if (dataYear && dataYear < yearFilter) {
          result.archived++;
          continue;
        }

        // 顧客名がない場合、代替情報を使用
        let displayName = prospect.customerName;
        if (!displayName) {
          // 社内No.から名前を生成
          if (prospect.internalNo && !prospect.internalNo.startsWith('IMPORT-')) {
            displayName = `案件${prospect.internalNo}`;
          } else if (prospect.salesRepName) {
            // 営業担当者名から
            displayName = `${prospect.salesRepName}案件`;
          }
        }

        // それでも識別できない場合はスキップ
        if (!displayName) {
          result.skipped++;
          continue;
        }

        // 顧客名を更新
        prospect.customerName = displayName;

        // 重複チェック
        const prospectKey = generateProspectKey(prospect);
        if (existingKeys.has(prospectKey)) {
          result.duplicates++;
          continue;
        }

        if (!dryRun) {
          // Firestoreに保存（undefined値を除去）
          const cleanedProspect = removeUndefined(prospect as Record<string, unknown>);
          const docData = {
            tenantId: DEFAULT_TENANT_ID,
            prospectKey,
            ...cleanedProspect,
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
