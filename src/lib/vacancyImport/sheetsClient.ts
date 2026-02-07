/**
 * Google Sheets クライアント
 *
 * Service Account 認証で Sheets API v4 を使用。
 * 環境変数:
 *   GOOGLE_SERVICE_ACCOUNT_JSON — JSON キーファイルの中身
 *   VACANCY_SHEET_ID — スプレッドシートID（デフォルトあり）
 *   VACANCY_SHEET_TAB — タブ名（デフォルト: 入居状況）
 */

import { google } from 'googleapis';

const DEFAULT_SHEET_ID = '1y00PmqtKRCsyrvaH8ydO3QbzVbFXGEVA2dpKOUDJMaY';
const DEFAULT_TAB_NAME = '入居状況';

function getAuth() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!json) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set');
  const creds = JSON.parse(json);
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
}

export interface SheetRow {
  /** 0-indexed row values (A=0, B=1, ...) */
  values: string[];
  /** 1-indexed row number in the sheet */
  rowNumber: number;
}

/**
 * スプレッドシートの全行を取得（1行目はヘッダ）
 * @returns ヘッダ行 + データ行
 */
export async function fetchSheetRows(): Promise<{
  headers: string[];
  rows: SheetRow[];
}> {
  const sheetId = process.env.VACANCY_SHEET_ID || DEFAULT_SHEET_ID;
  const tabName = process.env.VACANCY_SHEET_TAB || DEFAULT_TAB_NAME;

  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tabName}!A:ZZ`,
  });

  const rawRows = res.data.values ?? [];
  if (rawRows.length === 0) return { headers: [], rows: [] };

  const headers = rawRows[0].map((v: unknown) => String(v ?? '').trim());
  const rows: SheetRow[] = rawRows.slice(1).map((row, i) => ({
    values: row.map((v: unknown) => String(v ?? '').trim()),
    rowNumber: i + 2, // 1-indexed, skip header
  }));

  return { headers, rows };
}
