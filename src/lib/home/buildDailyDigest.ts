/**
 * Daily Digest ビルダー
 *
 * Implementation Ticket 060: 朝イチダイジェスト通知（055）と Role Home（059）を連動
 *
 * 毎朝の「今日のTop3」＋主要リスクのダイジェスト通知を生成
 * - buildTodayTop3 と同じロジックを使用（重複実装しない）
 * - 主要リスク（critical/warning openアラート）を要約
 * - fingerprint による冪等性（同日二重送信しない）
 */

import type { AppRole } from '@/config/appRoles';
import type { AlertSeverity } from '@/lib/alerts/types';
import { listAlerts, getAlertStats } from '@/lib/alerts/repo';
import { buildTodayTop3, formatTop3AsText, type TodayTop3Result } from './buildTodayTop3';

// ========== 型定義 ==========

export interface RiskSummary {
  criticalCount: number;
  warningCount: number;
  topItems: Array<{
    title: string;
    severity: AlertSeverity;
    type: string;
  }>;
}

export interface DailyDigest {
  date: string;        // YYYY-MM-DD
  role: AppRole;
  title: string;
  lines: string[];     // 1行ずつ（通知本文用）
  url: string;         // /dashboard
  fingerprint: string; // digest:{role}:{YYYY-MM-DD}
  top3: TodayTop3Result;
  risks: RiskSummary;
  generatedAt: string;
}

// ========== メイン関数 ==========

/**
 * 役職別のダイジェストを生成
 *
 * @param role 役職
 * @param userId ユーザーID
 * @param date 対象日（省略時は今日）
 */
export function buildDailyDigest(
  role: AppRole,
  userId: string,
  date: Date = new Date()
): DailyDigest {
  const dateStr = date.toISOString().slice(0, 10);

  // 1. Top3を取得
  const top3 = buildTodayTop3(role, userId);

  // 2. 主要リスクを取得
  const risks = buildRiskSummary();

  // 3. ダイジェスト本文を生成
  const lines = buildDigestLines(top3, risks, role);

  // 4. タイトル生成
  const title = buildDigestTitle(top3, risks);

  // 5. fingerprint 生成（冪等性のため）
  const fingerprint = `digest:${role}:${dateStr}`;

  return {
    date: dateStr,
    role,
    title,
    lines,
    url: '/dashboard',
    fingerprint,
    top3,
    risks,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * 複数ロール向けにダイジェストを一括生成
 */
export function buildDailyDigestForRoles(
  roles: AppRole[],
  userIdsByRole: Map<AppRole, string>,
  date: Date = new Date()
): Map<AppRole, DailyDigest> {
  const results = new Map<AppRole, DailyDigest>();

  for (const role of roles) {
    const userId = userIdsByRole.get(role) || 'system';
    results.set(role, buildDailyDigest(role, userId, date));
  }

  return results;
}

// ========== 内部ヘルパー ==========

/**
 * 主要リスクサマリーを生成
 */
function buildRiskSummary(): RiskSummary {
  const stats = getAlertStats();

  // criticalとwarningのオープンアラートを取得
  const { alerts: criticalAlerts } = listAlerts({
    status: 'open',
    severity: 'critical',
    limit: 5,
  });

  const { alerts: warningAlerts } = listAlerts({
    status: 'open',
    severity: 'warning',
    limit: 5,
  });

  // 上位アイテムをマージ
  const topItems = [
    ...criticalAlerts.map(a => ({
      title: a.title,
      severity: 'critical' as AlertSeverity,
      type: a.type,
    })),
    ...warningAlerts.slice(0, 3).map(a => ({
      title: a.title,
      severity: 'warning' as AlertSeverity,
      type: a.type,
    })),
  ].slice(0, 5);

  return {
    criticalCount: stats.criticalOpen,
    warningCount: stats.open - stats.criticalOpen,
    topItems,
  };
}

/**
 * ダイジェストのタイトルを生成
 */
function buildDigestTitle(top3: TodayTop3Result, risks: RiskSummary): string {
  const parts: string[] = [];

  // 重大リスクがある場合は強調
  if (risks.criticalCount > 0) {
    parts.push(`重大${risks.criticalCount}件`);
  }

  // Top3の件数
  if (top3.items.length > 0) {
    const criticalTop3 = top3.items.filter(i => i.severity === 'critical').length;
    if (criticalTop3 > 0 && !parts.length) {
      parts.push(`要対応${top3.items.length}件`);
    }
  }

  if (parts.length > 0) {
    return `朝イチダイジェスト（${parts.join('・')}）`;
  }

  return '朝イチダイジェスト';
}

/**
 * ダイジェスト本文の行を生成
 */
function buildDigestLines(
  top3: TodayTop3Result,
  risks: RiskSummary,
  role: AppRole
): string[] {
  const lines: string[] = [];
  const dateStr = new Date().toLocaleDateString('ja-JP', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });

  // ヘッダー
  lines.push(`${dateStr} の朝イチダイジェスト`);
  lines.push('');

  // 今日のTop3
  lines.push('【今日のTop3】');
  if (top3.items.length === 0) {
    lines.push('  特になし');
  } else {
    const top3Lines = formatTop3AsText(top3);
    top3Lines.forEach(line => lines.push(`  ${line}`));
  }
  lines.push('');

  // 主要リスク
  if (risks.criticalCount > 0 || risks.warningCount > 0) {
    lines.push('【主要リスク】');

    if (risks.criticalCount > 0) {
      lines.push(`  重大アラート: ${risks.criticalCount}件`);
    }
    if (risks.warningCount > 0) {
      lines.push(`  警告アラート: ${risks.warningCount}件`);
    }

    // 上位アイテムのタイトル
    if (risks.topItems.length > 0) {
      lines.push('');
      lines.push('  主な項目:');
      risks.topItems.slice(0, 3).forEach(item => {
        const mark = item.severity === 'critical' ? '!' : '>';
        lines.push(`    [${mark}] ${item.title}`);
      });
    }
    lines.push('');
  }

  // フッター
  lines.push('詳細は /dashboard でご確認ください');

  return lines;
}

// ========== 通知用ヘルパー ==========

/**
 * ダイジェストを通知メッセージに変換
 */
export function formatDigestAsMessage(digest: DailyDigest): string {
  return digest.lines.join('\n');
}

/**
 * ダイジェストを短縮メッセージに変換（プッシュ通知用）
 */
export function formatDigestAsShortMessage(digest: DailyDigest): string {
  const parts: string[] = [];

  // Top3の最初のアイテム
  if (digest.top3.items.length > 0) {
    parts.push(digest.top3.items[0].title);
  }

  // リスク件数
  if (digest.risks.criticalCount > 0) {
    parts.push(`重大${digest.risks.criticalCount}件`);
  } else if (digest.risks.warningCount > 0) {
    parts.push(`警告${digest.risks.warningCount}件`);
  }

  if (parts.length === 0) {
    return '本日の重要タスクはありません';
  }

  return parts.join(' / ');
}

/**
 * ダイジェストが空かどうか判定
 */
export function isDigestEmpty(digest: DailyDigest): boolean {
  return (
    digest.top3.items.length === 0 &&
    digest.risks.criticalCount === 0 &&
    digest.risks.warningCount === 0
  );
}

// ========== エクスポート用 ==========

export {
  buildTodayTop3,
  formatTop3AsText,
  type TodayTop3Result,
  type TodayTop3Item,
} from './buildTodayTop3';
