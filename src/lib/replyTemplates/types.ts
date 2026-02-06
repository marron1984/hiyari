/**
 * 返信テンプレート型定義
 *
 * Ticket 081: 定型メッセージ管理（空室問い合わせ返信テンプレ）
 */

/**
 * テンプレートカテゴリ
 */
export type ReplyTemplateCategory =
  | 'vacancy_reply'      // 空室問い合わせ返信
  | 'general_reply'      // 汎用返信
  | 'notification';      // 通知

/**
 * テンプレート変数
 */
export interface TemplateVariable {
  key: string;
  label: string;
  required: boolean;
  defaultValue?: string;
  description?: string;
}

/**
 * 返信テンプレート
 */
export interface ReplyTemplate {
  id: string;
  key: string;                      // 一意キー（vacancy_reply_first_contact など）
  name: string;                     // 表示名
  category: ReplyTemplateCategory;
  description?: string;             // 説明（用途など）
  subject?: string;                 // 件名（メール用）
  content: string;                  // 本文（Markdown）
  variablesJson: TemplateVariable[];
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  createdByUserId: string;
  updatedAt: string;
  updatedByUserId?: string;
}

/**
 * テンプレート作成リクエスト
 */
export interface CreateReplyTemplateRequest {
  key: string;
  name: string;
  category: ReplyTemplateCategory;
  description?: string;
  subject?: string;
  content: string;
  variablesJson?: TemplateVariable[];
  isActive?: boolean;
  sortOrder?: number;
}

/**
 * テンプレート更新リクエスト
 */
export interface UpdateReplyTemplateRequest {
  name?: string;
  description?: string;
  subject?: string;
  content?: string;
  variablesJson?: TemplateVariable[];
  isActive?: boolean;
  sortOrder?: number;
}

/**
 * テンプレートフィルタ
 */
export interface ReplyTemplateFilter {
  category?: ReplyTemplateCategory;
  activeOnly?: boolean;
  search?: string;
}

/**
 * 変数展開済みコンテンツ
 */
export interface ExpandedTemplate {
  subject?: string;
  content: string;
  missingVariables: string[];
}

/**
 * デフォルトの空室問い合わせ用変数
 */
export const VACANCY_REPLY_VARIABLES: TemplateVariable[] = [
  { key: 'name', label: 'お客様名', required: true, description: '問い合わせ者の名前' },
  { key: 'businessUnitName', label: '施設名', required: false, description: '事業所/施設の名前' },
  { key: 'buildingName', label: '建物名', required: false, description: '問い合わせ対象の建物名' },
  { key: 'availableFrom', label: '入居可能日', required: false, description: '入居可能日' },
  { key: 'priceRange', label: '価格帯', required: false, description: '月額料金の目安' },
  { key: 'contactWindow', label: '連絡可能時間', required: false, defaultValue: '平日 9:00〜18:00' },
  { key: 'phone', label: '電話番号', required: false, description: '担当者の電話番号' },
  { key: 'email', label: 'メールアドレス', required: false, description: '担当者のメールアドレス' },
  { key: 'ticketId', label: 'チケットID', required: false, description: '問い合わせ管理番号' },
  { key: 'staffName', label: '担当者名', required: false, description: '担当スタッフの名前' },
];

/**
 * カテゴリラベル
 */
export const REPLY_TEMPLATE_CATEGORY_LABELS: Record<ReplyTemplateCategory, string> = {
  vacancy_reply: '空室問い合わせ返信',
  general_reply: '汎用返信',
  notification: '通知',
};
