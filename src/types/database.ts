// ============================================================
// ええかいご 管理コンソール - Supabase Database Types
// ============================================================

// ユーザーロール（5段階階層）
// staff < service_chief < facility_manager < area_manager < hq < admin
export type UserRole = 'staff' | 'service_chief' | 'facility_manager' | 'area_manager' | 'hq' | 'admin';

export const USER_ROLES: { value: UserRole; label: string; description: string }[] = [
  { value: 'staff', label: 'スタッフ', description: '一般職員・申請者' },
  { value: 'service_chief', label: 'サ責', description: 'サービス提供責任者・一次承認' },
  { value: 'facility_manager', label: '拠点責任者', description: '二次承認' },
  { value: 'area_manager', label: '事業マネージャー', description: '三次承認' },
  { value: 'hq', label: '本部長兼副社長', description: '最終承認・全拠点参照' },
  { value: 'admin', label: '管理者', description: '全権限' },
];

// 承認フローで使用するロール
export type ApproverRole = 'service_chief' | 'facility_manager' | 'area_manager' | 'hq' | 'admin';

// 組織
export interface Organization {
  id: string;
  name: string;
  created_at: string;
}

// 事業所
export interface Facility {
  id: string;
  organization_id: string;
  name: string;
  created_at: string;
}

// プロファイル
export interface Profile {
  id: string;
  display_name: string;
  email: string;
  role: UserRole;
  organization_id: string | null;
  facility_id: string | null;
  area_id: string | null; // 事業マネージャー用：担当エリアID
  birthday: string | null;
  employment_type: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// 利用者
export interface Client {
  id: string;
  organization_id: string;
  facility_id: string;
  name: string;
  name_kana: string | null;
  birthday: string | null;
  care_level: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

// ============================================================
// 改善アイデア
// ============================================================

export type IdeaCategory =
  | '業務効率化'
  | '安全対策'
  | 'サービス向上'
  | 'コスト削減'
  | '環境改善'
  | 'その他';

export const IDEA_CATEGORIES: IdeaCategory[] = [
  '業務効率化',
  '安全対策',
  'サービス向上',
  'コスト削減',
  '環境改善',
  'その他',
];

export type IdeaDifficulty = 'low' | 'mid' | 'high';
export const IDEA_DIFFICULTIES: { value: IdeaDifficulty; label: string }[] = [
  { value: 'low', label: '簡単' },
  { value: 'mid', label: '普通' },
  { value: 'high', label: '難しい' },
];

export type IdeaCostLevel = 'zero' | 'small' | 'needs_review';
export const IDEA_COST_LEVELS: { value: IdeaCostLevel; label: string }[] = [
  { value: 'zero', label: 'コストゼロ' },
  { value: 'small', label: '少額' },
  { value: 'needs_review', label: '要検討' },
];

export type IdeaStatus = 'submitted' | 'under_review' | 'adopted' | 'implemented' | 'rejected';
export const IDEA_STATUSES: { value: IdeaStatus; label: string; color: string }[] = [
  { value: 'submitted', label: '提出済み', color: 'default' },
  { value: 'under_review', label: '検討中', color: 'info' },
  { value: 'adopted', label: '採用', color: 'success' },
  { value: 'implemented', label: '実装済み', color: 'success' },
  { value: 'rejected', label: '見送り', color: 'default' },
];

export interface ImprovementIdea {
  id: string;
  organization_id: string;
  facility_id: string;
  created_by: string;
  category: string;
  problem: string;
  idea: string;
  expected_effects: string[] | null;
  difficulty: IdeaDifficulty | null;
  cost_level: IdeaCostLevel | null;
  status: IdeaStatus;
  points_awarded: number;
  created_at: string;
  updated_at: string;
  // Joined data
  creator_name?: string;
  facility_name?: string;
}

export interface IdeaComment {
  id: string;
  idea_id: string;
  user_id: string;
  content: string;
  created_at: string;
  // Joined data
  user_name?: string;
}

export interface IdeaAttachment {
  id: string;
  idea_id: string;
  file_path: string;
  file_name: string;
  mime_type: string;
  file_size: number | null;
  uploaded_by: string;
  created_at: string;
}

// ============================================================
// 稟議
// ============================================================

export type ApprovalCategory =
  | '備品購入'
  | '設備修繕'
  | '人事関連'
  | '研修・教育'
  | 'イベント'
  | 'その他';

export const APPROVAL_CATEGORIES: ApprovalCategory[] = [
  '備品購入',
  '設備修繕',
  '人事関連',
  '研修・教育',
  'イベント',
  'その他',
];

export type ApprovalStatus =
  | 'submitted'
  | 'level1_pending'  // サ責承認待ち
  | 'level2_pending'  // 拠点責任者承認待ち
  | 'level3_pending'  // 事業マネージャー承認待ち
  | 'level4_pending'  // 本部長承認待ち
  | 'approved'
  | 'rejected'
  | 'returned';

export const APPROVAL_STATUSES: { value: ApprovalStatus; label: string; color: string }[] = [
  { value: 'submitted', label: '申請中', color: 'default' },
  { value: 'level1_pending', label: 'サ責承認待ち', color: 'warning' },
  { value: 'level2_pending', label: '拠点責任者承認待ち', color: 'warning' },
  { value: 'level3_pending', label: '事業マネージャー承認待ち', color: 'warning' },
  { value: 'level4_pending', label: '本部長承認待ち', color: 'warning' },
  { value: 'approved', label: '承認済み', color: 'success' },
  { value: 'rejected', label: '却下', color: 'danger' },
  { value: 'returned', label: '差戻し', color: 'info' },
];

// 承認レベルとロールのマッピング
export const APPROVAL_LEVEL_ROLES: { status: ApprovalStatus; role: ApproverRole }[] = [
  { status: 'level1_pending', role: 'service_chief' },
  { status: 'level2_pending', role: 'facility_manager' },
  { status: 'level3_pending', role: 'area_manager' },
  { status: 'level4_pending', role: 'hq' },
];

export type ApprovalActionType = 'submit' | 'approve' | 'return' | 'reject';

export interface Approval {
  id: string;
  organization_id: string;
  facility_id: string;
  applicant_id: string;
  title: string;
  description: string;
  amount: number | null;
  category: string;
  desired_due_date: string | null;
  status: ApprovalStatus;
  current_approver_role: ApproverRole | null;
  points_awarded: number;
  created_at: string;
  updated_at: string;
  // Joined data
  applicant_name?: string;
  facility_name?: string;
}

export interface ApprovalAction {
  id: string;
  approval_id: string;
  actor_id: string;
  action_type: ApprovalActionType;
  from_status: string;
  to_status: string;
  comment: string | null;
  created_at: string;
  // Joined data
  actor_name?: string;
  actor_role?: UserRole;
}

export interface ApprovalAttachment {
  id: string;
  approval_id: string;
  file_path: string;
  file_name: string;
  mime_type: string;
  file_size: number | null;
  uploaded_by: string;
  created_at: string;
}

// ============================================================
// ポイント
// ============================================================

export type PointSourceType =
  | 'incident_report'
  | 'idea_submission'
  | 'idea_adopted'
  | 'idea_implemented'
  | 'approval_submission'
  | 'approval_approved'
  | 'bonus'
  | 'adjustment';

export const POINT_SOURCE_LABELS: Record<PointSourceType, string> = {
  incident_report: 'ヒヤリハット報告',
  idea_submission: '改善アイデア投稿',
  idea_adopted: '改善アイデア採用',
  idea_implemented: '改善アイデア実装',
  approval_submission: '稟議申請',
  approval_approved: '稟議承認',
  bonus: 'ボーナス',
  adjustment: '調整',
};

export interface PointLedger {
  id: string;
  organization_id: string;
  user_id: string;
  source_type: PointSourceType;
  source_id: string | null;
  points: number;
  reason: string;
  created_at: string;
  // Joined data
  user_name?: string;
}

// ============================================================
// 誕生日
// ============================================================

export interface BirthdayImportLog {
  id: string;
  organization_id: string;
  uploaded_by: string;
  file_path: string;
  file_name: string;
  target_type: 'clients' | 'profiles';
  total_rows: number;
  success_rows: number;
  failed_rows: number;
  import_details: ImportDetail[] | null;
  imported_at: string;
}

export interface ImportDetail {
  row_number: number;
  name: string;
  birthday: string | null;
  status: 'success' | 'failed' | 'skipped';
  matched_id?: string;
  error?: string;
}

export interface BirthdayAlertSettings {
  id: string;
  organization_id: string;
  days_before: number;
  notify_time: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface BirthdayAlert {
  id: string;
  name: string;
  birthday: string;
  type: 'client' | 'profile';
  facility_id: string;
  facility_name?: string;
  days_until: number;
}

// ============================================================
// 設定
// ============================================================

export interface Settings {
  id: string;
  organization_id: string;
  scoring_rules: ScoringRule[];
  visibility_mode: 'all' | 'facility' | 'self';
  exclude_fraud_from_ranking: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScoringRule {
  key: string;
  label: string;
  points: number;
  condition: string;
  enabled: boolean;
}

// ============================================================
// 統計
// ============================================================

export interface MonthlyUserStats {
  user_id: string;
  user_name: string;
  facility_id: string;
  facility_name?: string;
  month: string;
  total_points: number;
  incident_count: number;
  idea_count: number;
  approval_count: number;
}

export interface MonthlyFacilityStats {
  facility_id: string;
  facility_name: string;
  month: string;
  total_points: number;
  active_users: number;
  incident_count: number;
  idea_count: number;
}

// ============================================================
// フォーム入力
// ============================================================

export interface IdeaFormData {
  category: IdeaCategory;
  problem: string;
  idea: string;
  expected_effects: string[];
  difficulty: IdeaDifficulty;
  cost_level: IdeaCostLevel;
}

export interface ApprovalFormData {
  title: string;
  description: string;
  amount?: number;
  category: ApprovalCategory;
  desired_due_date?: string;
}

// ============================================================
// PDF解析
// ============================================================

export interface ExtractedPerson {
  name: string;
  birthday: string | null;
  original_birthday_text?: string;
  confidence: number;
}

export interface ParsedPdfResult {
  persons: ExtractedPerson[];
  raw_text: string;
  page_count: number;
}
