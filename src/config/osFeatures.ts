/**
 * AA-HUB OS Feature Map 定義
 *
 * 設計思想：
 * 「完成したら表示」ではなく「存在したら表示」
 * 経営者が全体像を一望できる状態を作る
 *
 * 未実装ページも必ずルーティングを作成する
 */

// 機能ステータス
export type OSFeatureStatus = 'active' | 'developing' | 'planned' | 'hidden';

// ステータス設定
export const OS_FEATURE_STATUS_CONFIG: Record<
  OSFeatureStatus,
  { label: string; emoji: string; color: string; bgColor: string; borderColor: string }
> = {
  active: {
    label: '運用中',
    emoji: '🟢',
    color: 'text-green-700',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
  },
  developing: {
    label: '開発中',
    emoji: '🟡',
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
  },
  planned: {
    label: '未着手',
    emoji: '🔴',
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
  },
  hidden: {
    label: '非公開',
    emoji: '⚫',
    color: 'text-zinc-700',
    bgColor: 'bg-zinc-100',
    borderColor: 'border-zinc-300',
  },
};

// 機能定義
export interface OSFeature {
  id: string;
  name: string;
  category: string;
  status: OSFeatureStatus;
  description: string;
  path: string;
  owner?: string; // 担当（人 or AI）
  // 経営優先度スコア（1-5）
  priority?: number; // 経営優先度：経営への影響度
  roi?: number; // 投資対効果：開発工数に対するリターン
  risk?: number; // 放置リスク：未実装のまま放置した場合の損失
}

// 複合スコア計算（priority + roi + risk の合計、最大15）
export function calculateCompositeScore(feature: OSFeature): number {
  const p = feature.priority ?? 0;
  const r = feature.roi ?? 0;
  const k = feature.risk ?? 0;
  return p + r + k;
}

// カテゴリ定義
export interface OSCategory {
  id: string;
  name: string;
  description: string;
  icon: string; // lucide icon name
}

// カテゴリ一覧（固定）
export const OS_CATEGORIES: OSCategory[] = [
  { id: 'core', name: '経営OS（Core）', description: '経営の中枢機能', icon: 'Activity' },
  { id: 'document', name: '文書・契約', description: '文書と契約の管理', icon: 'FileText' },
  { id: 'people', name: '人・権限', description: 'アカウントと権限管理', icon: 'Users' },
  { id: 'communication', name: '周知・コミュニケーション', description: '情報共有と通知', icon: 'Bell' },
  { id: 'approval', name: '申請・稟議', description: '申請と承認フロー', icon: 'ClipboardCheck' },
  { id: 'operation', name: '業務管理', description: '日常業務の管理', icon: 'ListTodo' },
  { id: 'education', name: '教育・ガバナンス', description: '研修と委員会', icon: 'GraduationCap' },
  { id: 'risk', name: 'リスク・品質', description: '事故報告と品質管理', icon: 'ShieldAlert' },
  { id: 'family', name: '利用者・家族', description: '家族連絡と対応', icon: 'Heart' },
  { id: 'finance', name: '未収・財務補助', description: '未収管理と回収', icon: 'Wallet' },
];

// 機能一覧（静的定義）
export const OS_FEATURES: OSFeature[] = [
  // ========== 経営OS（Core） ==========
  {
    id: 'dashboard',
    name: 'ダッシュボード',
    category: 'core',
    status: 'active',
    description: 'KPIサマリーとAI副社長の概要を表示',
    path: '/dashboard',
    owner: 'AI',
    priority: 5,
    roi: 5,
    risk: 5,
  },
  {
    id: 'wbr',
    name: 'KPI / WBR',
    category: 'core',
    status: 'active',
    description: '週次ビジネスレビュー',
    path: '/dashboard/wbr',
    priority: 5,
    roi: 5,
    risk: 4,
  },
  {
    id: 'kpi-dashboard',
    name: 'KPIダッシュボード',
    category: 'core',
    status: 'active',
    description: 'KPI一覧と推移の可視化',
    path: '/dashboard/kpi',
    priority: 5,
    roi: 5,
    risk: 4,
  },
  {
    id: 'kpi-dictionary',
    name: 'KPI辞書',
    category: 'core',
    status: 'active',
    description: 'KPI定義と計算ロジックの一覧',
    path: '/dashboard/kpi-dictionary',
    priority: 4,
    roi: 4,
    risk: 3,
  },
  {
    id: 'business-summary',
    name: '事業別サマリー',
    category: 'core',
    status: 'planned',
    description: '事業ごとの業績サマリー',
    path: '/dashboard/business-summary',
    priority: 5,
    roi: 4,
    risk: 3,
  },
  {
    id: 'alert-center',
    name: 'アラートセンター',
    category: 'core',
    status: 'active',
    description: '全アラートの一元管理',
    path: '/dashboard/alerts',
    priority: 5,
    roi: 5,
    risk: 5,
  },
  {
    id: 'ai-vp',
    name: 'AI副社長（意思決定支援）',
    category: 'core',
    status: 'active',
    description: 'AI副社長による経営支援',
    path: '/admin/ai-vp',
    owner: 'AI',
    priority: 5,
    roi: 5,
    risk: 5,
  },
  {
    id: 'executive-summary',
    name: '経営サマリー',
    category: 'core',
    status: 'active',
    description: '経営会議用1枚サマリー自動生成',
    path: '/dashboard/executive-summary',
    owner: 'AI',
    priority: 5,
    roi: 5,
    risk: 4,
  },
  {
    id: 'os-map',
    name: 'OSマップ（司令塔）',
    category: 'core',
    status: 'active',
    description: '全機能の可視化マップ',
    path: '/dashboard/os-map',
    priority: 4,
    roi: 4,
    risk: 3,
  },
  {
    id: 'decision-os',
    name: '判断と責任のOS',
    category: 'core',
    status: 'active',
    description: '判断フローと責任の可視化',
    path: '/dashboard/os/decision',
    priority: 5,
    roi: 4,
    risk: 4,
  },
  {
    id: 'knowledge-hub',
    name: '知識ハブ',
    category: 'core',
    status: 'active',
    description: '公式ドキュメント・AI参照',
    path: '/dashboard/knowledge',
    priority: 4,
    roi: 5,
    risk: 3,
  },

  // ========== 文書・契約 ==========
  {
    id: 'documents',
    name: '文書管理',
    category: 'document',
    status: 'active',
    description: '書類の一元管理',
    path: '/dashboard/docs',
    priority: 4,
    roi: 4,
    risk: 4,
  },
  {
    id: 'contracts',
    name: '契約書管理',
    category: 'document',
    status: 'planned',
    description: '契約書の管理と期限アラート',
    path: '/dashboard/contracts',
    priority: 5,
    roi: 4,
    risk: 5,
  },
  {
    id: 'consent-forms',
    name: '同意書管理',
    category: 'document',
    status: 'planned',
    description: '同意書の取得状況管理',
    path: '/dashboard/consent',
    priority: 4,
    roi: 3,
    risk: 5,
  },
  {
    id: 'doc-templates',
    name: 'テンプレート管理',
    category: 'document',
    status: 'active',
    description: '文書テンプレートの管理',
    path: '/dashboard/docs/templates',
    priority: 3,
    roi: 4,
    risk: 2,
  },
  {
    id: 'esign-log',
    name: '電子署名ログ',
    category: 'document',
    status: 'planned',
    description: '電子署名の履歴管理',
    path: '/dashboard/esign-log',
    priority: 2,
    roi: 2,
    risk: 2,
  },

  // ========== 人・権限 ==========
  {
    id: 'users',
    name: 'アカウント管理',
    category: 'people',
    status: 'active',
    description: 'ユーザーアカウントの管理',
    path: '/admin/users',
    priority: 5,
    roi: 4,
    risk: 5,
  },
  {
    id: 'roles',
    name: '権限ロール管理',
    category: 'people',
    status: 'active',
    description: '権限とロールの設定（RBAC）',
    path: '/admin/roles',
    priority: 4,
    roi: 3,
    risk: 4,
  },
  {
    id: 'org-tree',
    name: '組織ツリー',
    category: 'people',
    status: 'planned',
    description: '組織構造の可視化',
    path: '/admin/org-tree',
    priority: 3,
    roi: 3,
    risk: 2,
  },
  {
    id: 'external-accounts',
    name: '外部関係者アカウント',
    category: 'people',
    status: 'planned',
    description: '外部関係者のアクセス管理',
    path: '/admin/external-accounts',
    priority: 2,
    roi: 2,
    risk: 3,
  },
  {
    id: 'employees',
    name: '従業員管理',
    category: 'people',
    status: 'active',
    description: '従業員情報の管理',
    path: '/admin/employees',
    priority: 5,
    roi: 4,
    risk: 5,
  },

  // ========== 周知・コミュニケーション ==========
  {
    id: 'announcements',
    name: '周知事項',
    category: 'communication',
    status: 'active',
    description: '全体周知の管理（既読管理付き）',
    path: '/dashboard/announcements',
    priority: 4,
    roi: 4,
    risk: 4,
  },
  {
    id: 'read-status',
    name: '既読管理',
    category: 'communication',
    status: 'active',
    description: '既読状況の追跡と既読率分析',
    path: '/dashboard/read-status',
    priority: 3,
    roi: 3,
    risk: 3,
  },
  {
    id: 'handover',
    name: '申し送り',
    category: 'communication',
    status: 'active',
    description: 'シフト間の申し送り',
    path: '/dashboard/handover',
    priority: 5,
    roi: 4,
    risk: 5,
  },
  {
    id: 'notification-center',
    name: '通知センター',
    category: 'communication',
    status: 'planned',
    description: '全通知の一元管理',
    path: '/dashboard/notifications',
    priority: 3,
    roi: 3,
    risk: 2,
  },
  {
    id: 'fukusha-ask',
    name: 'ふくしゃに聞く',
    category: 'communication',
    status: 'active',
    description: 'AI副社長への質問箱',
    path: '/dashboard/ai-vp/ask',
    owner: 'AI',
    priority: 5,
    roi: 5,
    risk: 4,
  },

  // ========== 申請・稟議 ==========
  {
    id: 'expense',
    name: '経費申請',
    category: 'approval',
    status: 'active',
    description: '経費精算の申請',
    path: '/dashboard/applications/expense/new',
    priority: 4,
    roi: 4,
    risk: 3,
  },
  {
    id: 'overtime',
    name: '残業申請',
    category: 'approval',
    status: 'active',
    description: '残業の事前申請',
    path: '/dashboard/applications/overtime/new',
    priority: 4,
    roi: 3,
    risk: 4,
  },
  {
    id: 'ringi',
    name: '稟議フロー管理',
    category: 'approval',
    status: 'active',
    description: '稟議の申請と承認',
    path: '/dashboard/approvals',
    priority: 5,
    roi: 4,
    risk: 5,
  },
  {
    id: 'approval-routes',
    name: '承認ルート設定',
    category: 'approval',
    status: 'active',
    description: '承認フローの設定',
    path: '/admin/approval-routes',
    priority: 4,
    roi: 3,
    risk: 4,
  },
  {
    id: 'approval-flow',
    name: '承認フロー管理',
    category: 'approval',
    status: 'active',
    description: '承認フローの作成・編集・公開',
    path: '/dashboard/approval-flow',
    priority: 4,
    roi: 4,
    risk: 4,
  },
  {
    id: 'approval-log',
    name: '承認ログ',
    category: 'approval',
    status: 'active',
    description: '承認履歴の横断検索・監査ビュー',
    path: '/dashboard/approval-log',
    priority: 3,
    roi: 3,
    risk: 3,
  },
  {
    id: 'return-management',
    name: '差戻し管理',
    category: 'approval',
    status: 'planned',
    description: '差戻し案件の管理',
    path: '/dashboard/returns',
    priority: 3,
    roi: 2,
    risk: 3,
  },

  // ========== 業務管理 ==========
  {
    id: 'ai-todos',
    name: 'AIタスク管理',
    category: 'operation',
    status: 'active',
    description: 'AIからの提案タスク',
    path: '/dashboard/ai/todos',
    owner: 'AI',
    priority: 4,
    roi: 5,
    risk: 3,
  },
  {
    id: 'tickets',
    name: 'チケット管理',
    category: 'operation',
    status: 'active',
    description: '問い合わせ・対応チケットの管理',
    path: '/dashboard/tickets',
    priority: 4,
    roi: 4,
    risk: 3,
  },
  {
    id: 'repair-tickets',
    name: '修繕チケット',
    category: 'operation',
    status: 'planned',
    description: '修繕依頼の管理',
    path: '/dashboard/repair-tickets',
    priority: 3,
    roi: 3,
    risk: 3,
  },
  {
    id: 'inventory',
    name: '備品在庫管理',
    category: 'operation',
    status: 'planned',
    description: '備品の在庫管理',
    path: '/dashboard/inventory',
    priority: 2,
    roi: 2,
    risk: 2,
  },
  {
    id: 'checkin',
    name: 'チェックイン',
    category: 'operation',
    status: 'active',
    description: 'コンディションチェックイン',
    path: '/dashboard/os/checkin',
    priority: 4,
    roi: 4,
    risk: 4,
  },
  {
    id: 'team-condition',
    name: 'チームコンディション',
    category: 'operation',
    status: 'active',
    description: 'チームの状態可視化',
    path: '/dashboard/os/team',
    priority: 4,
    roi: 4,
    risk: 4,
  },

  // ========== 教育・ガバナンス ==========
  {
    id: 'training',
    name: '研修管理',
    category: 'education',
    status: 'planned',
    description: '研修の計画と実施管理',
    path: '/dashboard/training',
    priority: 4,
    roi: 3,
    risk: 4,
  },
  {
    id: 'certifications',
    name: '資格管理',
    category: 'education',
    status: 'planned',
    description: '資格の取得状況管理',
    path: '/dashboard/certifications',
    priority: 3,
    roi: 2,
    risk: 4,
  },
  {
    id: 'committees',
    name: '委員会管理',
    category: 'education',
    status: 'planned',
    description: '委員会の運営管理',
    path: '/dashboard/committees',
    priority: 3,
    roi: 2,
    risk: 3,
  },
  {
    id: 'meeting-minutes',
    name: '議事録',
    category: 'education',
    status: 'planned',
    description: '会議議事録の管理',
    path: '/dashboard/meeting-minutes',
    priority: 2,
    roi: 2,
    risk: 2,
  },
  {
    id: 'training-reports',
    name: '研修実施報告',
    category: 'education',
    status: 'planned',
    description: '研修実施の報告管理',
    path: '/dashboard/training-reports',
    priority: 2,
    roi: 2,
    risk: 3,
  },
  {
    id: 'yoshida-learning',
    name: '吉田式学習',
    category: 'education',
    status: 'active',
    description: 'ケーススタディ学習',
    path: '/dashboard/ai-vp/yoshida-learning',
    owner: 'AI',
    priority: 4,
    roi: 5,
    risk: 3,
  },

  // ========== リスク・品質 ==========
  {
    id: 'incidents',
    name: '事故報告',
    category: 'risk',
    status: 'active',
    description: '事故の報告と管理',
    path: '/admin/incidents',
    priority: 5,
    roi: 4,
    risk: 5,
  },
  {
    id: 'hiyari',
    name: 'ヒヤリハット',
    category: 'risk',
    status: 'active',
    description: 'ヒヤリハット報告',
    path: '/admin/incidents',
    priority: 5,
    roi: 5,
    risk: 5,
  },
  {
    id: 'complaints',
    name: 'クレーム対応',
    category: 'risk',
    status: 'planned',
    description: 'クレームの記録と対応',
    path: '/dashboard/complaints',
    priority: 5,
    roi: 4,
    risk: 5,
  },
  {
    id: 'corrective-actions',
    name: '是正措置管理',
    category: 'risk',
    status: 'planned',
    description: '是正措置の追跡',
    path: '/dashboard/corrective-actions',
    priority: 4,
    roi: 4,
    risk: 5,
  },
  {
    id: 'human-risk',
    name: 'ヒューマンリスク分析',
    category: 'risk',
    status: 'active',
    description: '人的リスクの分析',
    path: '/dashboard/ai-vp/human-risk',
    owner: 'AI',
    priority: 5,
    roi: 5,
    risk: 5,
  },

  // ========== 利用者・家族 ==========
  {
    id: 'family-contact-log',
    name: '家族連絡ログ',
    category: 'family',
    status: 'planned',
    description: '家族への連絡履歴',
    path: '/dashboard/family-contact',
    priority: 4,
    roi: 3,
    risk: 4,
  },
  {
    id: 'key-person',
    name: 'キーパーソン管理',
    category: 'family',
    status: 'planned',
    description: 'キーパーソンの情報管理',
    path: '/dashboard/key-person',
    priority: 4,
    roi: 3,
    risk: 4,
  },
  {
    id: 'contact-history',
    name: '連絡履歴',
    category: 'family',
    status: 'planned',
    description: '全連絡の履歴管理',
    path: '/dashboard/contact-history',
    priority: 3,
    roi: 2,
    risk: 3,
  },
  {
    id: 'residents',
    name: '入居者管理',
    category: 'family',
    status: 'active',
    description: '入居者情報の管理',
    path: '/dashboard/residents',
    priority: 5,
    roi: 5,
    risk: 5,
  },
  {
    id: 'prospects',
    name: '見学・問合せ',
    category: 'family',
    status: 'active',
    description: '見学予約と問合せ管理',
    path: '/dashboard/prospects',
    priority: 5,
    roi: 5,
    risk: 4,
  },

  // ========== 未収・財務補助 ==========
  {
    id: 'receivables',
    name: '未収管理',
    category: 'finance',
    status: 'planned',
    description: '未収金の管理',
    path: '/dashboard/receivables',
    priority: 5,
    roi: 5,
    risk: 5,
  },
  {
    id: 'collection-flow',
    name: '回収フロー',
    category: 'finance',
    status: 'planned',
    description: '回収プロセスの管理',
    path: '/dashboard/collection-flow',
    priority: 4,
    roi: 4,
    risk: 4,
  },
  {
    id: 'dunning-history',
    name: '督促履歴',
    category: 'finance',
    status: 'planned',
    description: '督促の履歴管理',
    path: '/dashboard/dunning-history',
    priority: 3,
    roi: 3,
    risk: 3,
  },
  {
    id: 'financial-ai',
    name: '財務AI分析',
    category: 'finance',
    status: 'active',
    description: 'AIによる財務分析',
    path: '/admin/financial-ai',
    owner: 'AI',
    priority: 5,
    roi: 5,
    risk: 4,
  },
  {
    id: 'accounting-templates',
    name: '仕訳テンプレート',
    category: 'finance',
    status: 'active',
    description: '会計仕訳のテンプレート',
    path: '/admin/accounting-templates',
    priority: 3,
    roi: 4,
    risk: 2,
  },
];

// カテゴリ別に機能を取得
export function getFeaturesByCategory(categoryId: string): OSFeature[] {
  return OS_FEATURES.filter((f) => f.category === categoryId);
}

// ステータス別に機能数を取得
export function getFeatureCountByStatus(): Record<OSFeatureStatus, number> {
  return {
    active: OS_FEATURES.filter((f) => f.status === 'active').length,
    developing: OS_FEATURES.filter((f) => f.status === 'developing').length,
    planned: OS_FEATURES.filter((f) => f.status === 'planned').length,
    hidden: OS_FEATURES.filter((f) => f.status === 'hidden').length,
  };
}

// カテゴリ別ステータスサマリーを取得
export function getCategorySummary(categoryId: string): Record<OSFeatureStatus, number> {
  const features = getFeaturesByCategory(categoryId);
  return {
    active: features.filter((f) => f.status === 'active').length,
    developing: features.filter((f) => f.status === 'developing').length,
    planned: features.filter((f) => f.status === 'planned').length,
    hidden: features.filter((f) => f.status === 'hidden').length,
  };
}

// 未実装（planned）の機能一覧を取得
export function getPlannedFeatures(): OSFeature[] {
  return OS_FEATURES.filter((f) => f.status === 'planned');
}

// 経営優先度スコアで並び替え（高い順）
export function getFeaturesSortedByPriority(features: OSFeature[]): OSFeature[] {
  return [...features].sort((a, b) => calculateCompositeScore(b) - calculateCompositeScore(a));
}

// 未着手機能を経営優先度順で取得（開発優先順位リスト）
export function getPlannedFeaturesByPriority(): OSFeature[] {
  return getFeaturesSortedByPriority(getPlannedFeatures());
}
