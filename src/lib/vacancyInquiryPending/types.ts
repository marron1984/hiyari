/**
 * 空室問い合わせ pending（本人確認待ち）型定義
 *
 * Ticket 076: 空室問い合わせの軽量本人確認
 *
 * 本人確認が完了するまで tickets を作成しない
 */

// ========== ステータス ==========

export type PendingStatus = 'pending' | 'verified' | 'expired';

export const PENDING_STATUS_CONFIG: Record<PendingStatus, { label: string; color: string }> = {
  pending: { label: '確認待ち', color: 'text-yellow-600' },
  verified: { label: '確認済み', color: 'text-green-600' },
  expired: { label: '期限切れ', color: 'text-gray-500' },
};

// ========== メインエンティティ ==========

/**
 * 問い合わせ pending（本人確認待ち）
 */
export interface VacancyInquiryPending {
  id: string;
  businessUnitId: string;
  vacancyUnitId: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactName: string | null;
  desiredMoveIn: string | null;
  conditionsJson: Record<string, unknown>;
  memo: string | null;
  ref: string | null;
  refName: string | null;
  tokenHash: string;
  expiresAt: string;
  status: PendingStatus;
  createdAt: string;
  ipHint: string | null;
  userAgent: string | null;
  verifiedAt: string | null;
  verifiedIpHint: string | null;
  ticketId: string | null;
}

// ========== リクエスト型 ==========

export interface CreatePendingRequest {
  businessUnitId: string;
  vacancyUnitId?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactName?: string;
  desiredMoveIn?: string;
  conditionsJson?: Record<string, unknown>;
  memo?: string;
  ref?: string;
  refName?: string;
}

export interface PendingListFilter {
  status?: PendingStatus;
  businessUnitId?: string;
  limit?: number;
  offset?: number;
}

// ========== 確認ログ ==========

export interface InquiryVerifyLog {
  id: string;
  pendingId: string;
  verifiedAt: string;
  ipHint: string | null;
  userAgent: string | null;
}

// ========== 設定 ==========

/** トークン有効期限（分） */
export const TOKEN_EXPIRY_MINUTES = 30;

/** 同一IPからの連続送信制限（秒） */
export const RATE_LIMIT_SECONDS = 300; // 5分

/** トークンバイト長 */
export const TOKEN_BYTES = 32;
