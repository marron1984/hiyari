/**
 * Ticket 133: blocked理由コード別 推奨アクションテンプレート
 *
 * blockedReasonCode → 具体的な改善アクション（最大3つ）を提示
 */

import type { BlockedReasonCode } from '@/lib/correctiveActions/types';

export interface BlockedActionTemplate {
  label: string;
  advices: string[];
}

/**
 * 理由コード別の推奨アクションテンプレ
 */
export const BLOCKED_ACTION_TEMPLATES: Record<BlockedReasonCode, BlockedActionTemplate> = {
  waiting_customer: {
    label: '相手待ち',
    advices: [
      '期限付きフォローアップ（3日/7日）を設定する',
      '代替案を提示し、返答を促す',
      '未返信の場合の自動リマインドを設定する',
    ],
  },
  waiting_documents: {
    label: '書類待ち',
    advices: [
      '必要書類チェックリストを送付する',
      '書類未提出の期限を設定し通知する',
      '不備時の差戻しテンプレートを用意する',
    ],
  },
  waiting_internal_approval: {
    label: '社内承認待ち',
    advices: [
      '承認者を明確化し直接連絡する',
      '承認SLA（24h/48h）を設定する',
      '承認滞留アラートを強化する',
    ],
  },
  waiting_vendor: {
    label: '業者待ち',
    advices: [
      '業者の対応期限を再確認する',
      '代替業者の見積もりを並行取得する',
      'エスカレーション先の担当者を特定する',
    ],
  },
  resource_shortage: {
    label: '人手不足',
    advices: [
      'タスクを分割し他メンバーに委譲する',
      'シフト/アサインの再調整を行う',
      '外注候補をリストアップする',
    ],
  },
  unclear_requirement: {
    label: '要件不明',
    advices: [
      '5W1Hテンプレートで再ヒアリングする',
      '必須情報の入力フォームを追加する',
      '不明点をチケット化し担当者を割り当てる',
    ],
  },
  system_issue: {
    label: 'システム問題',
    advices: [
      '再現手順を整理しテンプレート化する',
      '影響範囲と暫定回避策を文書化する',
      '開発チケットを発行し対応を依頼する',
    ],
  },
  other: {
    label: 'その他',
    advices: [
      '具体的なブロック要因を特定する',
      '関係者とミーティングを設定する',
      '期限付きの対応計画を作成する',
    ],
  },
};

/**
 * 理由コードから推奨アクション（最大maxCount件）を取得
 */
export function getAdvicesForReasonCode(
  code: string,
  maxCount: number = 3
): string[] {
  const template = BLOCKED_ACTION_TEMPLATES[code as BlockedReasonCode];
  if (!template) return [];
  return template.advices.slice(0, maxCount);
}
