/**
 * フロー選択ロジック
 *
 * requestType + meta（amount等）から適切なpublishedフローを選択
 */

import type {
  ApprovalFlow,
  RequestType,
  RequestMeta,
  SelectFlowResult,
} from './types';
import { listApprovalFlows } from './flowRepo';

/**
 * 申請に適用するフローを選択
 *
 * ロジック：
 * 1. requestTypeが一致するpublishedフローを取得
 * 2. conditionJson（minAmount/maxAmount等）でフィルタ
 * 3. 条件が複数マッチする場合は最も条件が厳しいものを優先
 */
export function selectFlowForRequest(
  requestType: RequestType,
  meta?: RequestMeta
): SelectFlowResult {
  // publishedのみ取得
  const { flows } = listApprovalFlows({
    requestType,
    status: 'published',
  });

  if (flows.length === 0) {
    return {
      flow: null,
      reason: `申請タイプ「${requestType}」に対応するフローがありません`,
    };
  }

  // 条件でフィルタ
  const matchingFlows: ApprovalFlow[] = [];

  for (const flow of flows) {
    if (isFlowConditionMatched(flow, meta)) {
      matchingFlows.push(flow);
    }
  }

  if (matchingFlows.length === 0) {
    // 条件にマッチするものがなければ、条件なしのフローを探す
    const noConditionFlow = flows.find((f) => !f.conditionJson);
    if (noConditionFlow) {
      return { flow: noConditionFlow };
    }
    return {
      flow: null,
      reason: '条件に合致するフローがありません',
    };
  }

  if (matchingFlows.length === 1) {
    return { flow: matchingFlows[0] };
  }

  // 複数マッチの場合、最も条件が厳しいもの（maxAmountが小さい等）を優先
  const sorted = sortBySpecificity(matchingFlows, meta);
  return { flow: sorted[0] };
}

/**
 * フロー条件がメタ情報にマッチするか判定
 */
function isFlowConditionMatched(flow: ApprovalFlow, meta?: RequestMeta): boolean {
  const condition = flow.conditionJson;

  // 条件がなければ常にマッチ
  if (!condition) {
    return true;
  }

  // 金額条件
  if (condition.minAmount !== undefined || condition.maxAmount !== undefined) {
    const amount = meta?.amount;

    // 金額情報がない場合は条件なしフローのみマッチ
    if (amount === undefined) {
      return false;
    }

    // minAmountチェック
    if (condition.minAmount !== undefined && amount < condition.minAmount) {
      return false;
    }

    // maxAmountチェック
    if (condition.maxAmount !== undefined && amount > condition.maxAmount) {
      return false;
    }
  }

  return true;
}

/**
 * 条件の厳密さでソート（より具体的な条件を優先）
 */
function sortBySpecificity(flows: ApprovalFlow[], meta?: RequestMeta): ApprovalFlow[] {
  return [...flows].sort((a, b) => {
    const aSpecificity = calculateSpecificity(a, meta);
    const bSpecificity = calculateSpecificity(b, meta);
    return bSpecificity - aSpecificity; // 高いほど優先
  });
}

/**
 * 条件の厳密さスコアを計算
 */
function calculateSpecificity(flow: ApprovalFlow, meta?: RequestMeta): number {
  const condition = flow.conditionJson;
  if (!condition) {
    return 0;
  }

  let score = 0;

  // 条件が多いほど厳密
  if (condition.minAmount !== undefined) score += 1;
  if (condition.maxAmount !== undefined) score += 1;

  // 範囲が狭いほど厳密（金額条件の場合）
  if (condition.minAmount !== undefined && condition.maxAmount !== undefined) {
    const range = condition.maxAmount - condition.minAmount;
    // 範囲が狭いほどスコアを追加
    score += Math.max(0, 10 - Math.log10(range + 1));
  }

  return score;
}
