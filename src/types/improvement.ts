// ======== 改善アイデアモジュール 型定義 ========

// 改善ステータス
export type ImprovementStatus = 'submitted' | 'reviewing' | 'adopted' | 'rejected';

// ステータス表示ラベル
export const IMPROVEMENT_STATUS_LABELS: Record<ImprovementStatus, string> = {
  submitted: '提案中',
  reviewing: '検討中',
  adopted: '採用',
  rejected: '不採用',
};

// ステータス表示色
export const IMPROVEMENT_STATUS_COLORS: Record<ImprovementStatus, { bg: string; text: string }> = {
  submitted: { bg: 'bg-blue-100', text: 'text-blue-700' },
  reviewing: { bg: 'bg-amber-100', text: 'text-amber-700' },
  adopted: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  rejected: { bg: 'bg-zinc-100', text: 'text-zinc-500' },
};

// カテゴリ
export type ImprovementCategory =
  | '業務効率化'
  | '安全対策'
  | '環境改善'
  | 'コスト削減'
  | 'サービス向上'
  | 'その他';

export const IMPROVEMENT_CATEGORIES: ImprovementCategory[] = [
  '業務効率化',
  '安全対策',
  '環境改善',
  'コスト削減',
  'サービス向上',
  'その他',
];

// ======== 改善アイデアデータ ========

export interface Improvement {
  id: string;
  tenantId: string;
  branchId: string;
  // 提案者
  authorId: string;
  authorName: string;
  // 内容
  title: string;
  category: ImprovementCategory;
  description: string;       // 提案内容・詳細
  expectedEffect?: string;   // 期待される効果
  attachmentUrls?: string[]; // 添付ファイルURL
  // 状態
  status: ImprovementStatus;
  // 採用情報
  adoptedBy?: string;
  adoptedByName?: string;
  adoptedAt?: Date;
  adoptionComment?: string;  // 採用コメント
  // 不採用情報
  rejectedBy?: string;
  rejectedByName?: string;
  rejectedAt?: Date;
  rejectionReason?: string;
  // いいね数
  likeCount: number;
  likedBy: string[];         // いいねしたユーザーID
  // コメント数
  commentCount: number;
  // タイムスタンプ
  createdAt: Date;
  updatedAt?: Date;
}

// コメント
export interface ImprovementComment {
  id: string;
  improvementId: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: Date;
}

// ======== フォーム入力値 ========

export interface ImprovementFormData {
  title: string;
  category: ImprovementCategory;
  description: string;
  expectedEffect?: string;
  attachments?: File[];
}

// ======== ポイントルール ========
export const IMPROVEMENT_POINTS = {
  submit: 1,      // 提案投稿: 1pt
  adopted: 5,     // 採用: 5pt
} as const;
