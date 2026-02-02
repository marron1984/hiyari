/**
 * 承認可能判定ロジック
 *
 * ユーザーが申請を承認/却下/差戻しできるかを判定
 */

import type { AppRole } from '@/config/appRoles';
import type {
  ApprovalRequest,
  ApprovalFlowStep,
  CanApproveResult,
} from './types';
import { getApprovalFlow } from './flowRepo';

/**
 * ユーザーが申請を承認できるか判定
 *
 * @param userRole ユーザーのロール
 * @param userId ユーザーID
 * @param request 申請
 * @returns 承認可能判定結果
 */
export function canApprove(
  userRole: AppRole,
  userId: string,
  request: ApprovalRequest
): CanApproveResult {
  // pending状態のみ承認可能
  if (request.status !== 'pending') {
    return {
      canApprove: false,
      reason: '承認待ち状態の申請のみ承認可能です',
    };
  }

  // フロー取得
  const flow = getApprovalFlow(request.flowId);
  if (!flow) {
    return {
      canApprove: false,
      reason: 'フローが見つかりません',
    };
  }

  // 現在のステップ取得
  const currentStep = flow.steps.find(
    (s) => s.stepOrder === request.currentStepOrder
  );
  if (!currentStep) {
    return {
      canApprove: false,
      reason: '現在の承認ステップが見つかりません',
    };
  }

  // 承認者判定
  if (currentStep.approverType === 'role') {
    // ロールベースの承認
    if (currentStep.approverRole === userRole) {
      return { canApprove: true, step: currentStep };
    }

    // admin は全てのロール承認を代行可能
    if (userRole === 'admin') {
      return { canApprove: true, step: currentStep };
    }

    return {
      canApprove: false,
      reason: `このステップは「${currentStep.approverRole}」ロールの承認が必要です`,
      step: currentStep,
    };
  }

  if (currentStep.approverType === 'user') {
    // ユーザー指定の承認
    if (currentStep.approverUserId === userId) {
      return { canApprove: true, step: currentStep };
    }

    // admin は全てのユーザー承認を代行可能
    if (userRole === 'admin') {
      return { canApprove: true, step: currentStep };
    }

    return {
      canApprove: false,
      reason: '指定された承認者のみ承認可能です',
      step: currentStep,
    };
  }

  return {
    canApprove: false,
    reason: '不明な承認者タイプです',
  };
}

/**
 * ユーザーが申請にアクセスできるか判定
 *
 * アクセス可能：
 * - 申請者本人
 * - 現在の承認者
 * - 過去に承認/却下/差戻しを行った人
 * - admin
 */
export function canViewRequest(
  userRole: AppRole,
  userId: string,
  request: ApprovalRequest,
  actions?: { actorUserId: string }[]
): boolean {
  // admin は全て閲覧可能
  if (userRole === 'admin') {
    return true;
  }

  // 申請者本人
  if (request.requesterUserId === userId) {
    return true;
  }

  // 現在の承認者（pending状態の場合）
  if (request.status === 'pending') {
    const approveResult = canApprove(userRole, userId, request);
    if (approveResult.canApprove) {
      return true;
    }
  }

  // 過去に関わった承認者
  if (actions) {
    for (const action of actions) {
      if (action.actorUserId === userId) {
        return true;
      }
    }
  }

  return false;
}

/**
 * ユーザーが申請を取消できるか判定
 */
export function canCancel(userId: string, request: ApprovalRequest): boolean {
  // 申請者本人のみ
  if (request.requesterUserId !== userId) {
    return false;
  }

  // draft/pending のみ
  if (request.status !== 'draft' && request.status !== 'pending') {
    return false;
  }

  return true;
}

/**
 * 承認待ち申請を取得（ユーザーが承認可能なもの）
 */
export function filterApprovableRequests(
  userRole: AppRole,
  userId: string,
  requests: ApprovalRequest[]
): ApprovalRequest[] {
  return requests.filter((r) => {
    const result = canApprove(userRole, userId, r);
    return result.canApprove;
  });
}
