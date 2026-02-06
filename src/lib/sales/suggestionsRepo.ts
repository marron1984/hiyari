/**
 * leadScore提案リポジトリ
 *
 * Ticket 124: インメモリ + ファイル永続化
 */

import type { LeadScoreSuggestion, SuggestionStatus } from './types';

// ======== ストレージ ========

let suggestionsStore: LeadScoreSuggestion[] = [];
let isInitialized = false;

function isServer(): boolean {
  return typeof window === 'undefined';
}

function getFilePath(): string | null {
  if (!isServer()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    return path.join(process.cwd(), '.data', 'lead_score_suggestions.json');
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
      if (Array.isArray(data.suggestions)) {
        suggestionsStore = data.suggestions;
      }
    }

    isInitialized = true;
  } catch (error) {
    console.error('[LeadScoreSuggestions] Failed to load:', error);
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
      suggestions: suggestionsStore.slice(-100), // 最新100件
      savedAt: new Date().toISOString(),
    };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('[LeadScoreSuggestions] Failed to save:', error);
  }
}

// ======== 公開関数 ========

/**
 * 全ての提案を取得（新しい順）
 */
export function getSuggestions(limit: number = 50): LeadScoreSuggestion[] {
  initializeStorage();
  return suggestionsStore
    .sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime())
    .slice(0, limit);
}

/**
 * IDで提案を取得
 */
export function getSuggestionById(id: string): LeadScoreSuggestion | null {
  initializeStorage();
  return suggestionsStore.find((s) => s.id === id) || null;
}

/**
 * 提案を保存
 */
export function saveSuggestion(suggestion: LeadScoreSuggestion): void {
  initializeStorage();
  suggestionsStore.push(suggestion);
  saveStorage();
}

/**
 * 提案のステータスを更新
 */
export function updateSuggestionStatus(
  id: string,
  status: SuggestionStatus,
  userId: string
): LeadScoreSuggestion | null {
  initializeStorage();

  const suggestion = suggestionsStore.find((s) => s.id === id);
  if (!suggestion) return null;

  suggestion.status = status;
  suggestion.actedByUserId = userId;
  suggestion.actedAt = new Date().toISOString();

  saveStorage();
  return suggestion;
}

/**
 * open状態の提案数を取得
 */
export function getOpenSuggestionCount(): number {
  initializeStorage();
  return suggestionsStore.filter((s) => s.status === 'open').length;
}
