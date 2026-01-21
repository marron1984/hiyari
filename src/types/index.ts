// ユーザーロール
// user: 一般スタッフ
// leader: リーダー（自事業所の承認権限）
// admin: 管理者（全事業所の承認権限）
// system_admin: システム管理者（テナント設定権限）
export type UserRole = 'user' | 'leader' | 'admin' | 'system_admin';

// ロール階層（数値が大きいほど権限が高い）
export const ROLE_LEVELS: Record<UserRole, number> = {
  user: 0,
  leader: 1,
  admin: 2,
  system_admin: 3,
};

// 職種
export type JobType =
  | '介護職'
  | '看護職'
  | '相談員'
  | '機能訓練指導員'
  | '管理者'
  | '事務職'
  | 'その他';

export const JOB_TYPES: JobType[] = [
  '介護職',
  '看護職',
  '相談員',
  '機能訓練指導員',
  '管理者',
  '事務職',
  'その他',
];

// 時間帯
export type TimeSlot = '早朝' | '日中' | '夕方' | '夜勤';

export const TIME_SLOTS: { value: TimeSlot; label: string; range: string }[] = [
  { value: '早朝', label: '早朝', range: '5:00-9:00' },
  { value: '日中', label: '日中', range: '9:00-18:00' },
  { value: '夕方', label: '夕方', range: '18:00-22:00' },
  { value: '夜勤', label: '夜勤', range: '22:00-5:00' },
];

// カテゴリ
export type Category =
  | '転倒転落'
  | '誤嚥食事'
  | '服薬'
  | '入浴'
  | '移乗移動'
  | '認知症関連'
  | '医療連携'
  | '記録伝達'
  | '感染衛生'
  | 'その他';

export const CATEGORIES: Category[] = [
  '転倒転落',
  '誤嚥食事',
  '服薬',
  '入浴',
  '移乗移動',
  '認知症関連',
  '医療連携',
  '記録伝達',
  '感染衛生',
  'その他',
];

// 場所
export type Location = '居室' | '食堂' | '浴室' | '廊下' | '玄関' | '送迎車' | 'その他';

export const LOCATIONS: Location[] = [
  '居室',
  '食堂',
  '浴室',
  '廊下',
  '玄関',
  '送迎車',
  'その他',
];

// 重大度
export type Severity = 1 | 2 | 3 | 4 | 5;

export const SEVERITY_LABELS: Record<Severity, string> = {
  1: 'ヒヤリのみ（実害なし）',
  2: '軽微な影響',
  3: '中程度の影響',
  4: '重大な影響',
  5: '深刻な影響',
};

// スコア内訳
export interface ScoreBreakdownItem {
  key: string;
  label: string;
  points: number;
}

// ユーザー
export interface User {
  id: string;
  name: string;
  email: string;
  photoURL?: string;
  role: UserRole;
  branchId: string;
  jobType: JobType;
  tenantId: string;
  createdAt: Date;
  updatedAt?: Date;
}

// 事業所
export interface Branch {
  id: string;
  name: string;
  tenantId: string;
  headcount: number;
  createdAt: Date;
}

// インシデント（ヒヤリハット）
export interface Incident {
  id: string;
  tenantId: string;
  branchId: string;
  userId: string;
  userName?: string;
  date: string; // YYYY-MM-DD
  timeSlot: TimeSlot;
  jobType: JobType;
  category: Category;
  severity: Severity;
  body: string;
  action?: string;
  prevention?: string;
  location?: Location;
  tags?: string[];
  imageUrls?: string[];
  hasImage: boolean;
  bodyLength: number;
  totalLength: number;
  scoreTotal: number;
  scoreBreakdown: ScoreBreakdownItem[];
  fraudFlag: boolean;
  fraudReason?: string;
  createdAt: Date;
  updatedAt?: Date;
}

// スコアリングルール
export interface ScoringRule {
  key: string;
  label: string;
  points: number;
  condition: string;
  enabled: boolean;
}

// 設定
export interface Settings {
  id: string;
  tenantId: string;
  scoringRules: ScoringRule[];
  visibilityMode: 'all' | 'branch' | 'self';
  domainAllowList: string[];
  excludeFraudFromRanking: boolean;
  updatedAt: Date;
}

// デフォルトのスコアリングルール
export const DEFAULT_SCORING_RULES: ScoringRule[] = [
  { key: 'base', label: '投稿基本点', points: 10, condition: '投稿1件', enabled: true },
  { key: 'len300', label: '本文300文字以上', points: 5, condition: '本文が300文字以上', enabled: true },
  { key: 'len600', label: '本文600文字以上', points: 10, condition: '本文が600文字以上', enabled: true },
  { key: 'severity4', label: '重大度4以上', points: 5, condition: '重大度が4以上', enabled: true },
  { key: 'action', label: '回避行動あり', points: 5, condition: '回避行動が入力されている', enabled: true },
  { key: 'prevention', label: '再発防止提案あり', points: 10, condition: '再発防止提案が入力されている', enabled: true },
  { key: 'image', label: '画像添付あり', points: 5, condition: '画像が添付されている', enabled: true },
];

// 月次統計（ユーザー）
export interface MonthlyUserStats {
  userId: string;
  userName: string;
  branchId: string;
  branchName?: string;
  points: number;
  count: number;
  suggestionsCount: number; // 再発防止提案ありの件数
  totalBodyLength: number;
  avgBodyLength: number;
}

// 月次統計（事業所）
export interface MonthlyBranchStats {
  branchId: string;
  branchName: string;
  points: number;
  count: number;
  headcount: number;
  postRate: number; // count / headcount
  suggestionsCount: number;
}

// フォーム入力値
export interface IncidentFormData {
  date: string;
  timeSlot: TimeSlot;
  branchId: string;
  jobType: JobType;
  category: Category;
  severity: Severity;
  body: string;
  action?: string;
  prevention?: string;
  location?: Location;
  tags?: string[];
  images?: File[];
}

// ランキング期間
export interface RankingPeriod {
  year: number;
  month: number;
  key: string; // yyyyMM
}

// 勤怠関連の型をre-export
export * from './attendance';

// 稟議関連の型をre-export
export * from './ringi';

// 改善アイデア関連の型をre-export
export * from './improvement';

// ポイント関連の型をre-export
export * from './points';

// 空室管理関連の型をre-export
export * from './vacancy';

// インサイト関連の型をre-export
export * from './insight';

// 入居希望者管理関連の型をre-export
export * from './prospect';
