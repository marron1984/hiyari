// ======== AI副社長・申請承認補助コメント型定義 ========

/**
 * AI承認補助コメント
 */
export interface AiApprovalComment {
  id?: string;
  tenantId: string;
  applicationId: string;
  applicationType: 'EXPENSE' | 'OVERTIME';
  promptVersion: string;           // プロンプトバージョン
  // AI出力
  similarApprovalRate: number;     // 類似承認率（%）
  similarRejectionRate: number;    // 類似否認率（%）
  referenceCaseIds: string[];      // 参考ケースID（最大3）
  missingInfo: string[];           // 不足情報
  cautions: string[];              // 注意点（最大2）
  rawResponse?: string;            // AI生レスポンス
  // メタデータ
  createdAt: Date;
  createdBy: 'system' | string;    // systemまたはユーザーID
  isRegenerated?: boolean;         // 再生成フラグ
}

/**
 * AI入力用の申請履歴
 */
export interface ApprovalHistoryItem {
  applicationId: string;
  finalDecision: 'approved' | 'rejected';
  approveReasonCode?: string;
  amount?: number;
  reasonText?: string;
  baseId?: string;
  createdAt: string;
  decidedBy?: string;
}

/**
 * AI入力JSON
 */
export interface AiApprovalCommentInput {
  application: {
    id: string;
    type: 'EXPENSE' | 'OVERTIME';
    baseId: string;
    applicantId: string;
    applicantName: string;
    amount?: number;
    reasonText: string;
    datetimeRange?: {
      date?: string;
      startTime?: string;
      endTime?: string;
    };
    category?: string;
    attachmentsMeta?: {
      hasReceipts: boolean;
      receiptCount: number;
    };
    createdAt: string;
  };
  history: ApprovalHistoryItem[];
}

/**
 * AI出力JSON
 */
export interface AiApprovalCommentOutput {
  similarApprovalRate: number;
  similarRejectionRate: number;
  referenceCaseIds: string[];
  missingInfo: string[];
  cautions: string[];
}

/**
 * プロンプトバージョン
 */
export const AI_APPROVAL_COMMENT_PROMPT_VERSION = 'v1.0.0';
