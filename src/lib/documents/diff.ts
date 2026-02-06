/**
 * 文書差分生成
 *
 * Ticket 096: 契約改訂時の差分表示
 *
 * 入力: oldContent, newContent
 * 出力: 変更点サマリー + 詳細差分
 */

// ========== 型定義 ==========

/**
 * 差分の種類
 */
export type DiffType = 'added' | 'removed' | 'unchanged';

/**
 * 行単位の差分
 */
export interface LineDiff {
  type: DiffType;
  content: string;
  lineNumber?: number;
}

/**
 * セクション（見出し）単位の差分
 */
export interface SectionDiff {
  title: string;
  type: 'added' | 'removed' | 'modified' | 'unchanged';
  changes: string[];
}

/**
 * 差分結果
 */
export interface DiffResult {
  /** 変更点サマリー（箇条書き、上位10件） */
  summary: string[];
  /** 詳細差分（行単位） */
  lineDiffs: LineDiff[];
  /** セクション単位の差分 */
  sectionDiffs: SectionDiff[];
  /** 統計 */
  stats: {
    addedLines: number;
    removedLines: number;
    unchangedLines: number;
    addedSections: number;
    removedSections: number;
    modifiedSections: number;
  };
  /** 変更があるか */
  hasChanges: boolean;
}

// ========== ユーティリティ ==========

/**
 * テキストを行に分割
 */
function splitLines(text: string): string[] {
  return text.split('\n');
}

/**
 * 見出し行かどうかを判定（Markdown）
 */
function isHeading(line: string): boolean {
  return /^#{1,6}\s/.test(line.trim());
}

/**
 * 見出しのタイトルを抽出
 */
function extractHeadingTitle(line: string): string {
  return line.replace(/^#{1,6}\s*/, '').trim();
}

/**
 * セクションに分割（見出しで区切る）
 */
function splitIntoSections(text: string): Map<string, string[]> {
  const lines = splitLines(text);
  const sections = new Map<string, string[]>();
  let currentSection = '__intro__';
  let currentLines: string[] = [];

  for (const line of lines) {
    if (isHeading(line)) {
      // 前のセクションを保存
      if (currentLines.length > 0 || currentSection !== '__intro__') {
        sections.set(currentSection, currentLines);
      }
      currentSection = extractHeadingTitle(line);
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }

  // 最後のセクションを保存
  if (currentLines.length > 0) {
    sections.set(currentSection, currentLines);
  }

  return sections;
}

// ========== 差分アルゴリズム（簡易版） ==========

/**
 * LCS（最長共通部分列）ベースの差分計算
 * 簡易版：行単位で比較
 */
function computeLineDiff(oldLines: string[], newLines: string[]): LineDiff[] {
  const diffs: LineDiff[] = [];

  // 簡易的な差分計算（本番では npm diff ライブラリ推奨）
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);

  let oldIdx = 0;
  let newIdx = 0;

  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    const oldLine = oldLines[oldIdx];
    const newLine = newLines[newIdx];

    if (oldIdx >= oldLines.length) {
      // 新規追加
      diffs.push({ type: 'added', content: newLine, lineNumber: newIdx + 1 });
      newIdx++;
    } else if (newIdx >= newLines.length) {
      // 削除
      diffs.push({ type: 'removed', content: oldLine, lineNumber: oldIdx + 1 });
      oldIdx++;
    } else if (oldLine === newLine) {
      // 変更なし
      diffs.push({ type: 'unchanged', content: newLine, lineNumber: newIdx + 1 });
      oldIdx++;
      newIdx++;
    } else if (!newSet.has(oldLine) && !oldSet.has(newLine)) {
      // 両方とも見つからない場合は置換
      diffs.push({ type: 'removed', content: oldLine, lineNumber: oldIdx + 1 });
      diffs.push({ type: 'added', content: newLine, lineNumber: newIdx + 1 });
      oldIdx++;
      newIdx++;
    } else if (!newSet.has(oldLine)) {
      // 旧行が新しい方にない = 削除
      diffs.push({ type: 'removed', content: oldLine, lineNumber: oldIdx + 1 });
      oldIdx++;
    } else {
      // 新行が旧い方にない = 追加
      diffs.push({ type: 'added', content: newLine, lineNumber: newIdx + 1 });
      newIdx++;
    }
  }

  return diffs;
}

// ========== メイン関数 ==========

/**
 * 文書の差分を生成
 */
export function generateDiff(oldContent: string, newContent: string): DiffResult {
  // 空チェック
  if (!oldContent && !newContent) {
    return {
      summary: [],
      lineDiffs: [],
      sectionDiffs: [],
      stats: {
        addedLines: 0,
        removedLines: 0,
        unchangedLines: 0,
        addedSections: 0,
        removedSections: 0,
        modifiedSections: 0,
      },
      hasChanges: false,
    };
  }

  // 行に分割
  const oldLines = splitLines(oldContent || '');
  const newLines = splitLines(newContent || '');

  // 行単位の差分を計算
  const lineDiffs = computeLineDiff(oldLines, newLines);

  // 統計を計算
  const stats = {
    addedLines: lineDiffs.filter((d) => d.type === 'added').length,
    removedLines: lineDiffs.filter((d) => d.type === 'removed').length,
    unchangedLines: lineDiffs.filter((d) => d.type === 'unchanged').length,
    addedSections: 0,
    removedSections: 0,
    modifiedSections: 0,
  };

  // セクション単位の差分を計算
  const oldSections = splitIntoSections(oldContent || '');
  const newSections = splitIntoSections(newContent || '');
  const sectionDiffs: SectionDiff[] = [];

  // 新しいセクションをチェック
  const allSectionTitles = new Set([...oldSections.keys(), ...newSections.keys()]);

  for (const title of allSectionTitles) {
    const oldSection = oldSections.get(title);
    const newSection = newSections.get(title);

    if (!oldSection && newSection) {
      // 新規追加
      sectionDiffs.push({
        title,
        type: 'added',
        changes: [`「${title}」セクションが追加されました`],
      });
      stats.addedSections++;
    } else if (oldSection && !newSection) {
      // 削除
      sectionDiffs.push({
        title,
        type: 'removed',
        changes: [`「${title}」セクションが削除されました`],
      });
      stats.removedSections++;
    } else if (oldSection && newSection) {
      const oldText = oldSection.join('\n');
      const newText = newSection.join('\n');
      if (oldText !== newText) {
        // 変更あり
        sectionDiffs.push({
          title,
          type: 'modified',
          changes: [`「${title}」セクションが変更されました`],
        });
        stats.modifiedSections++;
      } else {
        // 変更なし
        sectionDiffs.push({
          title,
          type: 'unchanged',
          changes: [],
        });
      }
    }
  }

  // サマリーを生成（上位10件）
  const summary: string[] = [];

  // 新規セクション
  for (const diff of sectionDiffs.filter((d) => d.type === 'added')) {
    if (summary.length < 10) {
      summary.push(`【新設】${diff.title}`);
    }
  }

  // 変更セクション
  for (const diff of sectionDiffs.filter((d) => d.type === 'modified')) {
    if (summary.length < 10) {
      summary.push(`【変更】${diff.title}`);
    }
  }

  // 削除セクション
  for (const diff of sectionDiffs.filter((d) => d.type === 'removed')) {
    if (summary.length < 10) {
      summary.push(`【削除】${diff.title}`);
    }
  }

  // サマリーが空の場合
  if (summary.length === 0 && stats.addedLines + stats.removedLines > 0) {
    summary.push(`${stats.addedLines}行追加、${stats.removedLines}行削除`);
  }

  const hasChanges = stats.addedLines > 0 || stats.removedLines > 0;

  return {
    summary,
    lineDiffs,
    sectionDiffs: sectionDiffs.filter((d) => d.type !== 'unchanged'),
    stats,
    hasChanges,
  };
}

/**
 * 差分をHTMLにフォーマット
 */
export function formatDiffAsHtml(lineDiffs: LineDiff[]): string {
  const lines = lineDiffs.map((diff) => {
    const content = escapeHtml(diff.content);
    switch (diff.type) {
      case 'added':
        return `<div class="diff-added bg-green-50 text-green-800 px-2">+ ${content}</div>`;
      case 'removed':
        return `<div class="diff-removed bg-red-50 text-red-800 px-2">- ${content}</div>`;
      default:
        return `<div class="diff-unchanged text-zinc-600 px-2">  ${content}</div>`;
    }
  });
  return lines.join('\n');
}

/**
 * HTMLエスケープ
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
