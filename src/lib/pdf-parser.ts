// ============================================================
// PDF解析ユーティリティ - 誕生日抽出
// ============================================================

import { ExtractedPerson, ParsedPdfResult } from '@/types/database';

// 和暦変換マッピング
const WAREKI_MAP: Record<string, number> = {
  '明治': 1868,
  'M': 1868,
  '大正': 1912,
  'T': 1912,
  '昭和': 1925,
  'S': 1925,
  '平成': 1989,
  'H': 1989,
  '令和': 2019,
  'R': 2019,
};

// 日付パターン（正規表現）
const DATE_PATTERNS = [
  // YYYY/MM/DD or YYYY-MM-DD
  /(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})日?/g,
  // 和暦: 昭和XX年MM月DD日
  /(明治|大正|昭和|平成|令和)(\d{1,2})年(\d{1,2})月(\d{1,2})日/g,
  // 略式和暦: S10.1.20, H5/3/15
  /([MTSHR])(\d{1,2})[\.\/](\d{1,2})[\.\/](\d{1,2})/gi,
  // MM/DD/YYYY (alternative format)
  /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/g,
];

// 名前パターン（日本語）
const NAME_PATTERNS = [
  // 漢字の名前（姓名間にスペースがある場合）
  /([一-龯ぁ-んァ-ヶ]{1,10})\s+([一-龯ぁ-んァ-ヶ]{1,10})/g,
  // 漢字の名前（連続）
  /([一-龯]{2,6})/g,
  // カタカナ名
  /([ァ-ヶー]{2,20})/g,
];

// PDFテキストから人物と誕生日を抽出
export function extractPersonsFromText(text: string): ExtractedPerson[] {
  const persons: ExtractedPerson[] = [];
  const lines = text.split('\n').filter((line) => line.trim());

  // 行ごとに解析
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = lines[i + 1] || '';
    const prevLine = lines[i - 1] || '';

    // 日付を検索
    const dates = extractDates(line);

    // 名前を検索（同じ行または前後の行）
    const names = extractNames(line) || extractNames(prevLine) || extractNames(nextLine);

    if (dates.length > 0 && names.length > 0) {
      // 最初に見つかった名前と日付をペアリング
      const name = names[0];
      const birthday = dates[0];

      // 重複チェック
      const exists = persons.some(
        (p) => p.name === name || (p.birthday === birthday.normalized && p.name === name)
      );

      if (!exists) {
        persons.push({
          name,
          birthday: birthday.normalized,
          original_birthday_text: birthday.original,
          confidence: calculateConfidence(name, birthday.normalized, line),
        });
      }
    }
  }

  // 表形式の解析（行に複数の情報がある場合）
  const tablePersons = parseTableFormat(text);
  for (const person of tablePersons) {
    const exists = persons.some((p) => p.name === person.name);
    if (!exists) {
      persons.push(person);
    }
  }

  return persons;
}

// 日付抽出
function extractDates(text: string): { normalized: string; original: string }[] {
  const results: { normalized: string; original: string }[] = [];

  // YYYY/MM/DD or YYYY-MM-DD
  const pattern1 = /(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})日?/g;
  let match;
  while ((match = pattern1.exec(text)) !== null) {
    const normalized = normalizeDate(
      parseInt(match[1]),
      parseInt(match[2]),
      parseInt(match[3])
    );
    if (normalized) {
      results.push({ normalized, original: match[0] });
    }
  }

  // 和暦: 昭和XX年MM月DD日
  const pattern2 = /(明治|大正|昭和|平成|令和)(\d{1,2})年(\d{1,2})月(\d{1,2})日/g;
  while ((match = pattern2.exec(text)) !== null) {
    const baseYear = WAREKI_MAP[match[1]];
    if (baseYear) {
      const year = baseYear + parseInt(match[2]) - 1;
      const normalized = normalizeDate(year, parseInt(match[3]), parseInt(match[4]));
      if (normalized) {
        results.push({ normalized, original: match[0] });
      }
    }
  }

  // 略式和暦: S10.1.20, H5/3/15
  const pattern3 = /([MTSHR])(\d{1,2})[\.\/](\d{1,2})[\.\/](\d{1,2})/gi;
  while ((match = pattern3.exec(text)) !== null) {
    const baseYear = WAREKI_MAP[match[1].toUpperCase()];
    if (baseYear) {
      const year = baseYear + parseInt(match[2]) - 1;
      const normalized = normalizeDate(year, parseInt(match[3]), parseInt(match[4]));
      if (normalized) {
        results.push({ normalized, original: match[0] });
      }
    }
  }

  return results;
}

// 名前抽出
function extractNames(text: string): string[] {
  const names: string[] = [];

  // 漢字名（姓名間にスペース）
  const pattern1 = /([一-龯ぁ-んァ-ヶ]{1,10})\s+([一-龯ぁ-んァ-ヶ]{1,10})/g;
  let match;
  while ((match = pattern1.exec(text)) !== null) {
    const fullName = `${match[1]} ${match[2]}`;
    if (isValidName(fullName)) {
      names.push(fullName);
    }
  }

  // 特定のラベルの後の名前
  const labelPatterns = [
    /氏名[：:]\s*([一-龯ぁ-んァ-ヶ\s]{2,20})/g,
    /名前[：:]\s*([一-龯ぁ-んァ-ヶ\s]{2,20})/g,
    /利用者名[：:]\s*([一-龯ぁ-んァ-ヶ\s]{2,20})/g,
    /職員名[：:]\s*([一-龯ぁ-んァ-ヶ\s]{2,20})/g,
  ];

  for (const pattern of labelPatterns) {
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1].trim();
      if (isValidName(name) && !names.includes(name)) {
        names.push(name);
      }
    }
  }

  return names;
}

// 名前の妥当性チェック
function isValidName(name: string): boolean {
  // 最低2文字
  if (name.replace(/\s/g, '').length < 2) return false;

  // 数字のみは除外
  if (/^\d+$/.test(name)) return false;

  // 一般的な非名前の単語を除外
  const excludeWords = ['氏名', '名前', '生年月日', '住所', '電話', '年齢', '性別'];
  if (excludeWords.some((word) => name.includes(word))) return false;

  return true;
}

// 日付正規化 (YYYY-MM-DD形式)
function normalizeDate(year: number, month: number, day: number): string | null {
  // バリデーション
  if (year < 1900 || year > new Date().getFullYear()) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  // 月の日数チェック
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day > daysInMonth) return null;

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// 信頼度計算
function calculateConfidence(name: string, birthday: string, context: string): number {
  let confidence = 0.5;

  // 名前が漢字のみの場合、信頼度アップ
  if (/^[一-龯\s]+$/.test(name)) {
    confidence += 0.1;
  }

  // 日付が現実的な範囲（1920-2020）の場合、信頼度アップ
  const year = parseInt(birthday.substring(0, 4));
  if (year >= 1920 && year <= 2020) {
    confidence += 0.1;
  }

  // コンテキストに「生年月日」などのラベルがある場合
  if (/生年月日|誕生日|birthday/i.test(context)) {
    confidence += 0.2;
  }

  // 名前と日付が同じ行にある場合
  if (context.includes(name) && context.includes(birthday.replace(/-/g, ''))) {
    confidence += 0.1;
  }

  return Math.min(confidence, 1.0);
}

// 表形式の解析
function parseTableFormat(text: string): ExtractedPerson[] {
  const persons: ExtractedPerson[] = [];
  const lines = text.split('\n');

  // タブやスペースで区切られた表形式を検出
  for (const line of lines) {
    const cells = line.split(/[\t\s]{2,}|[|｜]/);

    if (cells.length >= 2) {
      let name: string | null = null;
      let birthday: string | null = null;
      let originalDate: string | null = null;

      for (const cell of cells) {
        const trimmed = cell.trim();

        // 名前候補
        if (!name && isValidName(trimmed) && /[一-龯ぁ-んァ-ヶ]/.test(trimmed)) {
          name = trimmed;
        }

        // 日付候補
        if (!birthday) {
          const dates = extractDates(trimmed);
          if (dates.length > 0) {
            birthday = dates[0].normalized;
            originalDate = dates[0].original;
          }
        }
      }

      if (name && birthday) {
        persons.push({
          name,
          birthday,
          original_birthday_text: originalDate || undefined,
          confidence: 0.7,
        });
      }
    }
  }

  return persons;
}

// PDF解析結果の整形
export function formatParsedResult(
  text: string,
  pageCount: number
): ParsedPdfResult {
  const persons = extractPersonsFromText(text);

  return {
    persons,
    raw_text: text,
    page_count: pageCount,
  };
}

// PDFからテキストを抽出（pdfjs-distを使用する場合）
export async function extractTextFromPdfBuffer(buffer: ArrayBuffer): Promise<string> {
  // Note: This is a placeholder. In production, use pdfjs-dist or similar library.
  // For the MVP, we'll use a simple text extraction approach.

  try {
    // pdfjs-distを動的インポート（クライアントサイドのみ）
    if (typeof window !== 'undefined') {
      const pdfjsLib = await import('pdfjs-dist');

      // PDFJSのワーカーを設定
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
      let fullText = '';

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: { str?: string }) => item.str || '')
          .join(' ');
        fullText += pageText + '\n';
      }

      return fullText;
    }

    return '';
  } catch (error) {
    console.error('PDF extraction error:', error);
    throw new Error('PDFの解析に失敗しました');
  }
}
