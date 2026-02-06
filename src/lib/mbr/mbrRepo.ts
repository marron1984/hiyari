/**
 * MBR (Monthly Business Review) リポジトリ
 *
 * Ticket 126: インメモリ + ファイル永続化
 */

import type { Mbr } from './types';

// ======== ストレージ ========

let mbrStore: Mbr[] = [];
let isInitialized = false;

function isServer(): boolean {
  return typeof window === 'undefined';
}

function getFilePath(): string | null {
  if (!isServer()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    return path.join(process.cwd(), '.data', 'mbr_reports.json');
  } catch {
    return null;
  }
}

function initializeStorage(): void {
  if (isInitialized) return;

  if (!isServer()) {
    isInitialized = true;
    return;
  }

  const filePath = getFilePath();
  if (!filePath) {
    isInitialized = true;
    return;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (Array.isArray(data.reports)) {
        mbrStore = data.reports;
      }
    }

    isInitialized = true;
  } catch (error) {
    console.error('[MBR] Failed to load:', error);
    isInitialized = true;
  }
}

function saveStorage(): void {
  if (!isServer()) return;

  const filePath = getFilePath();
  if (!filePath) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    const data = {
      reports: mbrStore.slice(-24), // 最新24件（2年分）
      savedAt: new Date().toISOString(),
    };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('[MBR] Failed to save:', error);
  }
}

// ======== 公開関数 ========

/**
 * MBR一覧を取得（新しい順）
 */
export function listMbrs(limit: number = 12): Mbr[] {
  initializeStorage();
  return [...mbrStore]
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, limit);
}

/**
 * IDでMBRを取得
 */
export function getMbrById(id: string): Mbr | null {
  initializeStorage();
  return mbrStore.find((m) => m.id === id) || null;
}

/**
 * 月でMBRを取得（最新のもの）
 */
export function getMbrByMonth(month: string): Mbr | null {
  initializeStorage();
  const matches = mbrStore
    .filter((m) => m.month === month)
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  return matches[0] || null;
}

/**
 * MBRを保存
 */
export function saveMbr(mbr: Mbr): void {
  initializeStorage();
  mbrStore.push(mbr);
  saveStorage();
}

/**
 * 全MBRをクリア（テスト用）
 */
export function clearAllMbrs(): void {
  mbrStore = [];
  isInitialized = false;
}
