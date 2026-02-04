/**
 * 監査ビュー 横断ログ 型定義
 *
 * Implementation Ticket 064
 * - 複数ソースのログを統一フォーマットで表示
 * - 監査対応と内部統制の説明が即答できる状態にする
 */

import type { AppRole } from '@/config/appRoles';

// =========================================
// ソース定義
// =========================================

/** 監査ログソース */
export type AuditSource =
  | 'approvals'      // 承認ワークフロー
  | 'documents'      // 文書管理
  | 'templates'      // テンプレート管理
  | 'agreements'     // 同意書管理
  | 'esign'          // 電子署名
  | 'shares'         // 外部共有
  | 'external'       // 外部アカウント
  | 'ai_vp'          // AI副社長設定
  | 'backfill'       // スコープバックフィル
  | 'ops'            // 運用ジョブ
  | 'tickets'        // チケット
  | 'contracts'      // 契約
  | 'licenses'       // 資格
  | 'complaints';    // クレーム

/** 重要度 */
export type AuditSeverity = 'info' | 'warning' | 'critical';

/** ターゲットタイプ */
export type AuditTargetType =
  | 'application'
  | 'document'
  | 'template'
  | 'consent'
  | 'esign_record'
  | 'share'
  | 'external_user'
  | 'ai_vp_config'
  | 'business_unit'
  | 'ticket'
  | 'contract'
  | 'license'
  | 'complaint'
  | 'ops_job'
  | 'setting'
  | null;

// =========================================
// 共通エントリ
// =========================================

/**
 * 監査エントリ（正規化された共通フォーマット）
 */
export interface AuditEntry {
  id: string;
  source: AuditSource;
  action: string;
  severity: AuditSeverity;
  actorUserId: string | null;
  actorName: string | null;
  occurredAt: string;
  targetType: AuditTargetType;
  targetId: string | null;
  summary: string;
  metaJson: Record<string, unknown> | null;
}

// =========================================
// フィルタ
// =========================================

export interface AuditLogFilter {
  from?: string;           // ISO日時
  to?: string;             // ISO日時
  source?: AuditSource;
  sources?: AuditSource[]; // 複数選択
  severity?: AuditSeverity;
  actorUserId?: string;
  targetType?: AuditTargetType;
  targetId?: string;
  q?: string;              // summary検索
  limit?: number;
  offset?: number;
}

export interface AuditLogResult {
  items: AuditEntry[];
  total: number;
}

// =========================================
// 設定
// =========================================

export const AUDIT_SOURCE_CONFIG: Record<AuditSource, { label: string; color: string; bgColor: string }> = {
  approvals: { label: '承認', color: 'text-blue-700', bgColor: 'bg-blue-50' },
  documents: { label: '文書', color: 'text-green-700', bgColor: 'bg-green-50' },
  templates: { label: 'テンプレート', color: 'text-teal-700', bgColor: 'bg-teal-50' },
  agreements: { label: '同意書', color: 'text-purple-700', bgColor: 'bg-purple-50' },
  esign: { label: '署名', color: 'text-indigo-700', bgColor: 'bg-indigo-50' },
  shares: { label: '共有', color: 'text-orange-700', bgColor: 'bg-orange-50' },
  external: { label: '外部', color: 'text-amber-700', bgColor: 'bg-amber-50' },
  ai_vp: { label: 'AI副社長', color: 'text-violet-700', bgColor: 'bg-violet-50' },
  backfill: { label: 'バックフィル', color: 'text-zinc-700', bgColor: 'bg-zinc-50' },
  ops: { label: '運用', color: 'text-cyan-700', bgColor: 'bg-cyan-50' },
  tickets: { label: 'チケット', color: 'text-sky-700', bgColor: 'bg-sky-50' },
  contracts: { label: '契約', color: 'text-rose-700', bgColor: 'bg-rose-50' },
  licenses: { label: '資格', color: 'text-emerald-700', bgColor: 'bg-emerald-50' },
  complaints: { label: 'クレーム', color: 'text-red-700', bgColor: 'bg-red-50' },
};

export const AUDIT_SEVERITY_CONFIG: Record<AuditSeverity, { label: string; color: string; bgColor: string; borderColor: string }> = {
  info: { label: '情報', color: 'text-zinc-700', bgColor: 'bg-zinc-50', borderColor: 'border-zinc-200' },
  warning: { label: '注意', color: 'text-amber-700', bgColor: 'bg-amber-50', borderColor: 'border-amber-200' },
  critical: { label: '重要', color: 'text-red-700', bgColor: 'bg-red-50', borderColor: 'border-red-200' },
};

// =========================================
// RBAC
// =========================================

/**
 * 監査ログ閲覧権限
 * - admin/auditor のみアクセス可能
 * - 将来的に manager は自組織範囲のみに制限可能
 */
export function canViewAuditLog(role: AppRole): boolean {
  return ['admin', 'auditor'].includes(role);
}

/**
 * CSV出力権限
 */
export function canExportAuditLog(role: AppRole): boolean {
  return ['admin', 'auditor'].includes(role);
}

// =========================================
// ユーティリティ
// =========================================

/**
 * アクションに基づいて重要度を推定
 */
export function inferSeverity(action: string, source: AuditSource): AuditSeverity {
  // Critical actions
  const criticalActions = [
    'delete', 'void', 'revoke', 'disable', 'reject', 'expire',
    'force_close', 'reset', 'rollback'
  ];
  if (criticalActions.some((a) => action.toLowerCase().includes(a))) {
    return 'critical';
  }

  // Warning actions
  const warningActions = [
    'decline', 'return', 'escalate', 'overdue', 'fail', 'error',
    'suspend', 'update', 'change'
  ];
  if (warningActions.some((a) => action.toLowerCase().includes(a))) {
    return 'warning';
  }

  // Critical sources
  if (source === 'external' || source === 'shares') {
    if (['login', 'access', 'view'].some((a) => action.toLowerCase().includes(a))) {
      return 'warning';
    }
  }

  return 'info';
}

/**
 * PIIをマスク
 */
export function maskPII(text: string | null): string | null {
  if (!text) return null;
  // メールアドレスをマスク
  const masked = text.replace(/[\w.-]+@[\w.-]+\.\w+/g, '***@***.***');
  // 電話番号をマスク
  return masked.replace(/\d{2,4}-\d{2,4}-\d{4}/g, '***-****-****');
}
