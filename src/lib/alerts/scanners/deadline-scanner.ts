/**
 * 期限超過スキャナー
 *
 * 契約期限・タスク期限などの超過をチェックしてアラートを生成
 */

import type { CreateAlertRequest } from '../types';
import { generateFingerprint } from '../types';

/**
 * 期限超過をスキャンしてアラートリクエストを生成
 */
export function scanDeadlines(): CreateAlertRequest[] {
  const alerts: CreateAlertRequest[] = [];
  const today = new Date().toISOString().split('T')[0];

  // TODO: 実際のデータソースと接続
  // 暫定：モックデータで検証
  const overdueItems = getMockOverdueItems();

  for (const item of overdueItems) {
    const severity = item.daysOverdue >= 7
      ? 'critical'
      : item.daysOverdue >= 3
        ? 'warning'
        : 'info';

    alerts.push({
      type: 'deadline_overdue',
      sourceId: item.id,
      title: `${item.entityType}: ${item.name}が期限超過`,
      message: `${item.name}の期限が${item.daysOverdue}日超過しています。対応が必要です。`,
      severity,
      fingerprint: generateFingerprint('deadline_overdue', item.id, today),
      meta: {
        entityType: item.entityType,
        entityId: item.id,
        name: item.name,
        deadline: item.deadline,
        daysOverdue: item.daysOverdue,
      },
    });
  }

  return alerts;
}

/**
 * 期限超過アイテム
 */
interface OverdueItem {
  id: string;
  entityType: '契約' | 'タスク' | '資格' | '研修';
  name: string;
  deadline: string;
  daysOverdue: number;
}

/**
 * モック：期限超過アイテム
 * TODO: 実際のデータソースから取得
 */
function getMockOverdueItems(): OverdueItem[] {
  // デモ用：ランダムな期限超過アイテムを生成
  const items: OverdueItem[] = [];

  // 契約期限超過（ランダムで0-2件）
  const contractCount = Math.floor(Math.random() * 3);
  for (let i = 0; i < contractCount; i++) {
    items.push({
      id: `contract_${i + 1}`,
      entityType: '契約',
      name: `入居契約 ${100 + i}号`,
      deadline: getRandomPastDate(14),
      daysOverdue: Math.floor(Math.random() * 14) + 1,
    });
  }

  // 資格期限超過（ランダムで0-3件）
  const certCount = Math.floor(Math.random() * 4);
  for (let i = 0; i < certCount; i++) {
    items.push({
      id: `cert_${i + 1}`,
      entityType: '資格',
      name: `介護福祉士（${getRandomName()}）`,
      deadline: getRandomPastDate(30),
      daysOverdue: Math.floor(Math.random() * 30) + 1,
    });
  }

  return items;
}

/**
 * ランダムな過去日付を生成
 */
function getRandomPastDate(maxDaysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - Math.floor(Math.random() * maxDaysAgo) - 1);
  return date.toISOString().split('T')[0];
}

/**
 * ランダムな名前
 */
function getRandomName(): string {
  const names = ['山田太郎', '田中花子', '佐藤一郎', '鈴木美咲', '高橋健二'];
  return names[Math.floor(Math.random() * names.length)];
}
