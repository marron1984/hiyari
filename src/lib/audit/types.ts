/**
 * 監査ビュー 型定義
 *
 * Ticket 064-final: 横断監査ビュー
 *
 * 複数ソースのログを統合して監査・トラブル対応に対応
 */

import type { AppRole } from '@/config/appRoles';

// ========== ソース ==========

export type AuditSource =
  | 'approval_actions'
  | 'agreement_events'
  | 'shares_access'
  | 'external_audit'
  | 'ai_vp_settings'
  | 'scope_backfill'
  | 'daily_ops'
  | 'weekly_ops'
  | 'e_sign_events'
  | 'onboarding_events'
  | 'collection_events';

export const AUDIT_SOURCE_LABELS: Record<AuditSource, string> = {
  approval_actions: '承認アクション',
  agreement_events: '同意書イベント',
  shares_access: '外部共有アクセス',
  external_audit: '外部アカウント',
  ai_vp_settings: 'AI VP設定',
  scope_backfill: 'スコープ一括',
  daily_ops: '日次オペ',
  weekly_ops: '週次オペ',
  e_sign_events: '電子署名',
  onboarding_events: 'オンボーディング',
  collection_events: '督促フロー',
};

// ========== 重要度 ==========

export type AuditSeverity = 'info' | 'warning' | 'critical';

export const AUDIT_SEVERITY_CONFIG: Record<AuditSeverity, {
  label: string;
  color: string;
  bgColor: string;
}> = {
  info: { label: '情報', color: 'text-blue-700', bgColor: 'bg-blue-50' },
  warning: { label: '警告', color: 'text-amber-700', bgColor: 'bg-amber-50' },
  critical: { label: '重大', color: 'text-red-700', bgColor: 'bg-red-50' },
};

// ========== 統合エントリ ==========

export interface AuditEntry {
  id: string;
  occurredAt: string;           // ISO timestamp
  source: AuditSource;
  action: string;
  severity: AuditSeverity;
  actorUserId: string | null;
  actorName: string | null;
  targetType: string | null;
  targetId: string | null;
  summary: string;
  metaJson: string | null;      // JSON string for details
}

// ========== クエリフィルタ ==========

export interface AuditQueryFilter {
  from?: string;              // ISO or YYYY-MM-DD
  to?: string;                // ISO or YYYY-MM-DD
  source?: AuditSource | AuditSource[];
  severity?: AuditSeverity | AuditSeverity[];
  actorUserId?: string;
  targetType?: string;
  targetId?: string;
  q?: string;                 // summary検索
  limit?: number;
  offset?: number;
}

// ========== レスポンス ==========

export interface AuditQueryResult {
  items: AuditEntry[];
  total: number;
}

// ========== RBAC ==========

/**
 * 監査ビューにアクセス可能か
 */
export function canAccessAuditView(role: AppRole): boolean {
  return ['admin', 'auditor'].includes(role);
}

/**
 * CSVエクスポート可能か
 */
export function canExportAuditCsv(role: AppRole): boolean {
  return ['admin', 'auditor'].includes(role);
}

// ========== ユーティリティ ==========

/**
 * 日付文字列をISO形式に正規化
 */
export function normalizeDate(dateStr: string, end: boolean = false): string {
  // YYYY-MM-DD形式の場合
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    if (end) {
      return `${dateStr}T23:59:59.999Z`;
    }
    return `${dateStr}T00:00:00.000Z`;
  }
  // 既にISO形式
  return dateStr;
}

/**
 * PIIをマスク（名前など）
 */
export function maskPII(text: string | null): string | null {
  if (!text) return null;
  if (text.length <= 2) return '***';
  return text.charAt(0) + '*'.repeat(text.length - 2) + text.charAt(text.length - 1);
}
