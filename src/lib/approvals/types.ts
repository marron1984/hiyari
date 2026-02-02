/**
 * 稟議フロー管理の型定義
 *
 * - approval_flows: フロー定義（誰が・何段階で・どの条件で）
 * - approval_flow_steps: 承認ステップ
 * - approval_requests: 申請インスタンス
 * - approval_actions: 監査ログ
 */

import type { AppRole } from '@/config/appRoles';

/**
 * 申請タイプ
 * Task 040: share_issue（外部共有発行承認）追加
 */
export type RequestType = 'expense' | 'overtime' | 'generic' | 'share_issue';

/**
 * フローステータス
 */
export type FlowStatus = 'draft' | 'published' | 'archived';

/**
 * 承認者タイプ
 */
export type ApproverType = 'role' | 'user';

/**
 * 承認要件（複数承認者の場合）
 */
export type RequiredApproval = 'all' | 'any';

/**
 * 申請ステータス
 */
export type RequestStatus =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'returned'
  | 'cancelled';

/**
 * アクションタイプ
 */
export type ActionType =
  | 'submit'
  | 'approve'
  | 'reject'
  | 'return'
  | 'cancel'
  | 'comment';

/**
 * フロー条件（金額条件など）
 */
export interface FlowCondition {
  minAmount?: number;
  maxAmount?: number;
  [key: string]: unknown;
}

/**
 * 申請メタ情報
 */
export interface RequestMeta {
  amount?: number;
  targetMonth?: string;
  hasAttachment?: boolean;
  [key: string]: unknown;
}

// ========================================
// 1) approval_flows（フロー定義）
// ========================================

export interface ApprovalFlow {
  id: string;
  name: string;
  requestType: RequestType;
  status: FlowStatus;
  version: number;
  description: string | null;
  conditionJson: FlowCondition | null;
  steps: ApprovalFlowStep[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateApprovalFlowRequest {
  name: string;
  requestType: RequestType;
  description?: string;
  conditionJson?: FlowCondition;
  steps?: CreateApprovalFlowStepRequest[];
}

export interface UpdateApprovalFlowRequest {
  name?: string;
  description?: string;
  conditionJson?: FlowCondition;
}

// ========================================
// 2) approval_flow_steps（承認ステップ）
// ========================================

export interface ApprovalFlowStep {
  id: string;
  flowId: string;
  stepOrder: number;
  approverType: ApproverType;
  approverRole: AppRole | null;
  approverUserId: string | null;
  approverUserName?: string;
  required: RequiredApproval;
  createdAt: string;
  updatedAt: string;
}

export interface CreateApprovalFlowStepRequest {
  stepOrder: number;
  approverType: ApproverType;
  approverRole?: AppRole;
  approverUserId?: string;
  required?: RequiredApproval;
}

export interface UpdateApprovalFlowStepRequest {
  stepOrder?: number;
  approverType?: ApproverType;
  approverRole?: AppRole | null;
  approverUserId?: string | null;
  required?: RequiredApproval;
}

// ========================================
// 3) approval_requests（申請インスタンス）
// ========================================

export interface ApprovalRequest {
  id: string;
  requestType: RequestType;
  entityId: string | null;
  requesterUserId: string;
  requesterUserName?: string;
  flowId: string;
  flowName?: string;
  status: RequestStatus;
  currentStepOrder: number;
  title: string;
  summary: string | null;
  metaJson: RequestMeta | null;
  submittedAt: string | null;
  decidedAt: string | null;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateApprovalRequestRequest {
  requestType: RequestType;
  entityId?: string;
  title: string;
  summary?: string;
  meta?: RequestMeta;
}

export interface ApprovalRequestListItem extends ApprovalRequest {
  currentStepInfo?: {
    approverType: ApproverType;
    approverRole: AppRole | null;
    approverUserId: string | null;
  };
}

// ========================================
// 4) approval_actions（監査ログ）
// ========================================

export interface ApprovalAction {
  id: string;
  requestId: string;
  stepOrder: number;
  actorUserId: string;
  actorUserName?: string;
  action: ActionType;
  note: string | null;
  createdAt: string;
}

export interface CreateApprovalActionRequest {
  note?: string;
}

// ========================================
// ヘルパー型
// ========================================

export interface ApprovalFlowFilter {
  requestType?: RequestType;
  status?: FlowStatus;
  limit?: number;
  offset?: number;
}

export interface ApprovalRequestFilter {
  requestType?: RequestType;
  status?: RequestStatus;
  requesterUserId?: string;
  limit?: number;
  offset?: number;
}

/**
 * 承認可能判定の結果
 */
export interface CanApproveResult {
  canApprove: boolean;
  reason?: string;
  step?: ApprovalFlowStep;
}

/**
 * フロー選択結果
 */
export interface SelectFlowResult {
  flow: ApprovalFlow | null;
  reason?: string;
}
