// ======== 共通申請エンジン 型定義 ========
// AA-HUB AI副社長 統合業務基盤

import { z } from 'zod';

// ======== 基本型 ========

/**
 * 申請種別
 */
export type RequestType =
  | 'ringi'           // 稟議
  | 'expense'         // 経費精算
  | 'payroll'         // 給与関連（手当・控除・修正）
  | 'vendor_payment'; // 臨時支払（業者支払等）

export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  ringi: '稟議',
  expense: '経費精算',
  payroll: '給与関連',
  vendor_payment: '臨時支払',
};

/**
 * 承認ステータス
 */
export type ApprovalStatus =
  | 'draft'                       // 下書き
  | 'submitted'                   // 申請済み
  | 'manager_approved'            // 拠点長承認
  | 'admin_approved'              // 管理者承認
  | 'ai_vp_reviewed'              // AI副社長レビュー済み
  | 'final_approved_by_yoshida'   // 吉田最終決裁
  | 'executed'                    // 実行済み
  | 'rejected'                    // 却下
  | 'returned';                   // 差し戻し

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  draft: '下書き',
  submitted: '申請済み',
  manager_approved: '拠点長承認',
  admin_approved: '管理者承認',
  ai_vp_reviewed: 'AIレビュー済',
  final_approved_by_yoshida: '最終決裁済',
  executed: '実行済み',
  rejected: '却下',
  returned: '差し戻し',
};

export const APPROVAL_STATUS_COLORS: Record<ApprovalStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  submitted: 'bg-blue-100 text-blue-700',
  manager_approved: 'bg-cyan-100 text-cyan-700',
  admin_approved: 'bg-indigo-100 text-indigo-700',
  ai_vp_reviewed: 'bg-purple-100 text-purple-700',
  final_approved_by_yoshida: 'bg-green-100 text-green-700',
  executed: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  returned: 'bg-orange-100 text-orange-700',
};

/**
 * 税区分
 */
export type TaxType =
  | 'inclusive_10'    // 税込10%
  | 'inclusive_8'     // 税込8%（軽減）
  | 'exclusive_10'    // 税抜10%
  | 'exclusive_8'     // 税抜8%（軽減）
  | 'exempt'          // 非課税
  | 'not_applicable'; // 対象外

export const TAX_TYPE_LABELS: Record<TaxType, string> = {
  inclusive_10: '税込10%',
  inclusive_8: '税込8%（軽減）',
  exclusive_10: '税抜10%',
  exclusive_8: '税抜8%（軽減）',
  exempt: '非課税',
  not_applicable: '対象外',
};

/**
 * 緊急度
 */
export type UrgencyLevel = 'low' | 'mid' | 'high' | 'critical';

export const URGENCY_LEVEL_LABELS: Record<UrgencyLevel, string> = {
  low: '低',
  mid: '中',
  high: '高',
  critical: '緊急',
};

/**
 * リスクレベル
 */
export type RiskLevel = 'low' | 'mid' | 'high';

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  low: '低',
  mid: '中',
  high: '高',
};

// ======== 申請モデル ========

/**
 * 添付ファイル
 */
export interface Attachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: Date;
  uploadedBy: string;
}

/**
 * 支払先情報
 */
export interface PaymentTarget {
  type: 'bank' | 'cash' | 'card' | 'other';
  bankName?: string;
  branchName?: string;
  accountType?: 'ordinary' | 'current' | 'savings';
  accountNumber?: string;
  accountHolder?: string;
  note?: string;
}

/**
 * 共通申請
 */
export interface Request {
  id: string;
  tenantId: string;

  // 申請種別
  requestType: RequestType;
  requestNumber: string;  // 自動採番（例: RQ-2026-0001）

  // 申請者情報
  applicantId: string;
  applicantName: string;
  applicantDepartment: string;
  applicantBranchId: string;

  // 申請内容
  title: string;
  description: string;
  category: string;
  amount: number;
  taxType: TaxType;
  taxAmount: number;
  totalAmount: number;

  // 支払情報
  paymentTarget?: PaymentTarget;
  paymentDate?: Date;
  paymentMethod?: 'transfer' | 'cash' | 'card';

  // 添付
  attachments: Attachment[];

  // 承認
  status: ApprovalStatus;
  currentApproverRole?: string;
  approvalRouteId?: string;

  // AI副社長
  aiVpReview?: AiVpReviewResult;
  aiVpAutoApproved: boolean;
  approvalKeyId?: string;

  // メタ
  urgency: UrgencyLevel;
  isEmergency: boolean;
  relatedRequestIds: string[];
  tags: string[];

  // 監査
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
  submittedAt?: Date;
  completedAt?: Date;
}

/**
 * AI副社長レビュー結果
 */
export interface AiVpReviewResult {
  reviewedAt: Date;
  modelVersion: string;

  // 整形結果
  formattedSummary: string;
  extractedKeyPoints: string[];

  // 判断支援
  recommendation: 'approve' | 'reject' | 'return' | 'escalate';
  confidence: number;
  reasoning: string;
  attentionPoints: string[];
  suggestedConditions: string[];

  // 類似案件
  similarCases: SimilarCase[];

  // 不足情報
  missingFields: string[];
  validationWarnings: string[];

  // メタ
  processingTimeMs: number;
  tokenUsage: { input: number; output: number };
}

/**
 * 類似案件
 */
export interface SimilarCase {
  requestId: string;
  requestNumber: string;
  title: string;
  amount: number;
  status: ApprovalStatus;
  decidedAt: Date;
  similarity: number;
}

// ======== 承認ルート ========

/**
 * 承認ステップ
 */
export interface ApprovalStep {
  order: number;
  role: 'manager' | 'admin' | 'ai_vp' | 'yoshida';
  roleLabel: string;
  isRequired: boolean;
  canSkip: boolean;
  skipCondition?: string;
  timeoutHours?: number;
}

/**
 * 承認ルート条件
 */
export interface ApprovalRouteCondition {
  requestTypes?: RequestType[];
  minAmount?: number;
  maxAmount?: number;
  branchIds?: string[];
  categories?: string[];
  isEmergency?: boolean;
}

/**
 * 承認ルート
 */
export interface ApprovalRoute {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  priority: number;  // 低い値が優先
  condition: ApprovalRouteCondition;
  steps: ApprovalStep[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ======== 承認ログ ========

/**
 * 承認アクション
 */
export type ApprovalAction =
  | 'submit'
  | 'approve'
  | 'reject'
  | 'return'
  | 'escalate'
  | 'ai_review'
  | 'auto_approve'
  | 'execute'
  | 'cancel';

export const APPROVAL_ACTION_LABELS: Record<ApprovalAction, string> = {
  submit: '申請',
  approve: '承認',
  reject: '却下',
  return: '差し戻し',
  escalate: 'エスカレーション',
  ai_review: 'AIレビュー',
  auto_approve: '自動承認',
  execute: '実行',
  cancel: '取消',
};

/**
 * 承認ログ（append-only）
 */
export interface ApprovalLog {
  id: string;
  tenantId: string;
  requestId: string;
  requestNumber: string;

  action: ApprovalAction;
  fromStatus: ApprovalStatus;
  toStatus: ApprovalStatus;

  actorId: string;
  actorName: string;
  actorRole: string;
  isAiVp: boolean;

  comment?: string;
  conditions?: string[];

  createdAt: Date;
}

// ======== 承認キー（自動承認条件） ========

/**
 * 承認キー
 */
export interface ApprovalKey {
  id: string;
  tenantId: string;
  name: string;
  description: string;

  // 条件
  allowedTypes: RequestType[];
  maxAmount: number;
  riskLevel: RiskLevel;
  scope: string[];  // 部門・ブランチID
  categories: string[];
  excludeCategories: string[];
  requiresPastApproval: boolean;  // 過去承認実績必須

  // 有効期間
  validFrom: Date;
  validUntil: Date;
  isActive: boolean;

  // メタ
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
}

// ======== 支払バッチ ========

/**
 * 支払バッチステータス
 */
export type PaymentBatchStatus =
  | 'draft'
  | 'confirmed'
  | 'transfer_scheduled'
  | 'executed'
  | 'failed';

export const PAYMENT_BATCH_STATUS_LABELS: Record<PaymentBatchStatus, string> = {
  draft: '作成中',
  confirmed: '確定',
  transfer_scheduled: '振込予約済',
  executed: '実行済',
  failed: '失敗',
};

/**
 * 支払種別
 */
export type PaymentType = 'payroll' | 'expense' | 'vendor';

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  payroll: '給与',
  expense: '経費',
  vendor: '業者支払',
};

/**
 * 支払明細
 */
export interface PaymentItem {
  id: string;
  batchId: string;
  requestId?: string;
  paymentType: PaymentType;

  // 支払先
  payeeName: string;
  bankCode: string;
  bankName: string;
  branchCode: string;
  branchName: string;
  accountType: 'ordinary' | 'current' | 'savings';
  accountNumber: string;
  accountHolder: string;

  // 金額
  amount: number;
  fee: number;
  memo: string;

  // ステータス
  status: 'pending' | 'scheduled' | 'executed' | 'failed';
  errorMessage?: string;
  transferId?: string;  // GMO API振込ID

  createdAt: Date;
}

/**
 * 支払バッチ
 */
export interface PaymentBatch {
  id: string;
  tenantId: string;
  batchNumber: string;  // 自動採番（例: PB-2026-01-001）

  paymentDate: Date;
  status: PaymentBatchStatus;

  // 集計
  itemCount: number;
  totalAmount: number;
  totalFee: number;

  // 確定
  confirmedAt?: Date;
  confirmedBy?: string;

  // 振込予約
  transferScheduledAt?: Date;
  gmoTransactionId?: string;

  // 実行
  executedAt?: Date;
  executedBy?: string;

  // メタ
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
}

// ======== 振込記録 ========

/**
 * 振込記録（変更不可）
 */
export interface TransferRecord {
  id: string;
  tenantId: string;
  batchId: string;
  itemId: string;

  // GMO API
  gmoTransactionId: string;
  gmoStatus: string;
  gmoResponse: Record<string, unknown>;

  // 結果
  status: 'success' | 'failed' | 'pending';
  errorCode?: string;
  errorMessage?: string;

  // 監査
  scheduledAt: Date;
  executedAt?: Date;
  createdAt: Date;
}

// ======== コンディションスコア ========

/**
 * 行動メトリクス
 */
export interface BehaviorMetrics {
  avgResponseTimeMinutes: number;
  avgReadTimeMinutes: number;
  postingFrequencyPerDay: number;
  nightActivityRatio: number;  // 22時-6時の活動割合
  reactionDeclineRatio: number;
  lastActiveAt: Date;
}

/**
 * コンディションスコア
 */
export interface ConditionScore {
  id: string;
  tenantId: string;
  userId: string;
  userName: string;

  // スコア
  score: number;  // 0-100
  previousScore: number;
  trend: 'up' | 'down' | 'stable';

  // メトリクス
  metrics: BehaviorMetrics;

  // アラート
  alertLevel: 'none' | 'watch' | 'warning' | 'critical';
  alertTriggeredAt?: Date;

  // 対応
  taskDistributed: boolean;
  loadReduced: boolean;
  yoshidaNotified: boolean;

  // メタ
  calculatedAt: Date;
  periodStart: Date;
  periodEnd: Date;
}

// ======== Google Tasks連携 ========

/**
 * タスク種別
 */
export type TaskSyncType =
  | 'pending_final_approval'
  | 'pending_expense_approval'
  | 'pending_transfer_execution'
  | 'deadline_alert';

/**
 * タスク同期記録
 */
export interface TaskSyncRecord {
  id: string;
  tenantId: string;
  requestId: string;
  taskType: TaskSyncType;

  // Google Tasks
  googleTaskId: string;
  googleTaskListId: string;
  taskTitle: string;
  taskNotes: string;
  dueDate?: Date;

  // ステータス
  isCompleted: boolean;
  completedAt?: Date;

  // メタ
  createdAt: Date;
  updatedAt: Date;
}

// ======== Zodスキーマ ========

export const RequestTypeSchema = z.enum(['ringi', 'expense', 'payroll', 'vendor_payment']);
export const ApprovalStatusSchema = z.enum([
  'draft', 'submitted', 'manager_approved', 'admin_approved',
  'ai_vp_reviewed', 'final_approved_by_yoshida', 'executed',
  'rejected', 'returned'
]);
export const TaxTypeSchema = z.enum([
  'inclusive_10', 'inclusive_8', 'exclusive_10', 'exclusive_8',
  'exempt', 'not_applicable'
]);
export const UrgencyLevelSchema = z.enum(['low', 'mid', 'high', 'critical']);
export const RiskLevelSchema = z.enum(['low', 'mid', 'high']);

export const PaymentTargetSchema = z.object({
  type: z.enum(['bank', 'cash', 'card', 'other']),
  bankName: z.string().optional(),
  branchName: z.string().optional(),
  accountType: z.enum(['ordinary', 'current', 'savings']).optional(),
  accountNumber: z.string().optional(),
  accountHolder: z.string().optional(),
  note: z.string().optional(),
});

export const RequestInputSchema = z.object({
  requestType: RequestTypeSchema,
  title: z.string().min(1).max(200),
  description: z.string().max(10000),
  category: z.string(),
  amount: z.number().min(0),
  taxType: TaxTypeSchema,
  paymentTarget: PaymentTargetSchema.optional(),
  paymentDate: z.string().optional(),  // ISO date
  urgency: UrgencyLevelSchema.default('mid'),
  isEmergency: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
});

// ======== ユーティリティ ========

/**
 * 申請番号を生成
 */
export function generateRequestNumber(prefix: string = 'RQ'): string {
  const now = new Date();
  const year = now.getFullYear();
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${prefix}-${year}-${random}`;
}

/**
 * バッチ番号を生成
 */
export function generateBatchNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `PB-${year}-${month}-${random}`;
}

/**
 * 税額計算
 */
export function calculateTax(amount: number, taxType: TaxType): { taxAmount: number; totalAmount: number } {
  switch (taxType) {
    case 'inclusive_10':
      return { taxAmount: Math.floor(amount * 10 / 110), totalAmount: amount };
    case 'inclusive_8':
      return { taxAmount: Math.floor(amount * 8 / 108), totalAmount: amount };
    case 'exclusive_10':
      const tax10 = Math.floor(amount * 0.1);
      return { taxAmount: tax10, totalAmount: amount + tax10 };
    case 'exclusive_8':
      const tax8 = Math.floor(amount * 0.08);
      return { taxAmount: tax8, totalAmount: amount + tax8 };
    case 'exempt':
    case 'not_applicable':
      return { taxAmount: 0, totalAmount: amount };
  }
}

/**
 * 次の承認ステータスを取得
 */
export function getNextApprovalStatus(
  current: ApprovalStatus,
  route: ApprovalRoute
): ApprovalStatus | null {
  const statusOrder: ApprovalStatus[] = [
    'draft',
    'submitted',
    'manager_approved',
    'admin_approved',
    'ai_vp_reviewed',
    'final_approved_by_yoshida',
    'executed',
  ];

  const currentIndex = statusOrder.indexOf(current);
  if (currentIndex === -1 || currentIndex >= statusOrder.length - 1) {
    return null;
  }

  // ルートに基づいてスキップ判定
  const nextStatus = statusOrder[currentIndex + 1];

  // ルートのステップを確認してスキップ可能か判定
  const step = route.steps.find(s => {
    if (nextStatus === 'manager_approved') return s.role === 'manager';
    if (nextStatus === 'admin_approved') return s.role === 'admin';
    if (nextStatus === 'ai_vp_reviewed') return s.role === 'ai_vp';
    if (nextStatus === 'final_approved_by_yoshida') return s.role === 'yoshida';
    return false;
  });

  if (step?.canSkip) {
    return getNextApprovalStatus(nextStatus, route);
  }

  return nextStatus;
}
