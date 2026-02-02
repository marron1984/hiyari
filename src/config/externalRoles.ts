/**
 * 外部関係者ロール定義
 *
 * 外部ユーザーは「できること少なめ」が正義
 * 各ロールは最小権限セットを定義し、個別例外は allowlist で管理
 */

// ========== 外部ロールID ==========

export type ExternalRoleId =
  | 'external_auditor'     // 監査閲覧
  | 'external_vendor'      // 業者
  | 'external_accountant'  // 会計士
  | 'external_lawyer'      // 士業
  | 'external_other';      // その他

// ========== アクセス可能セクション ==========

export type ExternalAllowedSection =
  | 'wbr'                  // WBR閲覧
  | 'executive_summary'    // 経営サマリー
  | 'business_summary'     // 事業別サマリー
  | 'alerts_summary'       // アラート統計
  | 'committees'           // 委員会議事録
  | 'training_reports'     // 研修報告
  | 'quality_risk'         // 品質・リスクレポート
  | 'repairs'              // 修繕チケット
  | 'tickets'              // チケット
  | 'receivables_summary'  // 未収集計
  | 'contracts'            // 契約書
  | 'agreements';          // 同意書

// ========== マスキング設定 ==========

export interface ExternalMaskingConfig {
  pii: boolean;      // 個人情報（名前、住所など）
  finance: boolean;  // 金銭情報（具体的金額）
  medical: boolean;  // 医療情報
  staff: boolean;    // 職員情報
}

// ========== エンティティアクセス設定 ==========

export interface ExternalEntityAccess {
  onlyAssigned?: boolean;  // 自分に関連するもののみ
  readOnly?: boolean;      // 読み取りのみ
  aggregateOnly?: boolean; // 集計のみ（個別レコード不可）
}

// ========== ロール定義 ==========

export interface ExternalRoleDefinition {
  id: ExternalRoleId;
  label: string;
  description: string;
  color: string;
  bgColor: string;

  /** 許可セクション */
  allowedSections: ExternalAllowedSection[];

  /** エンティティ別アクセス設定 */
  entityAccess: Partial<Record<string, ExternalEntityAccess>>;

  /** デフォルトマスキング設定 */
  defaultMasking: ExternalMaskingConfig;

  /** 最大有効期間（日）- 0は無期限 */
  maxValidityDays: number;
}

// ========== ロール定義マスタ ==========

export const EXTERNAL_ROLES: ExternalRoleDefinition[] = [
  {
    id: 'external_auditor',
    label: '監査閲覧',
    description: 'WBR、アラート統計、委員会議事録などの監査関連情報を閲覧',
    color: 'text-purple-700',
    bgColor: 'bg-purple-50',
    allowedSections: [
      'wbr',
      'executive_summary',
      'business_summary',
      'alerts_summary',
      'committees',
      'training_reports',
      'quality_risk',
    ],
    entityAccess: {
      alerts: { readOnly: true, aggregateOnly: true },
      incidents: { readOnly: true },
      committees: { readOnly: true },
      training: { readOnly: true },
    },
    defaultMasking: {
      pii: true,
      finance: true,
      medical: true,
      staff: true,
    },
    maxValidityDays: 365,
  },
  {
    id: 'external_vendor',
    label: '業者',
    description: '修繕・チケットの自分に関連するもののみ閲覧',
    color: 'text-orange-700',
    bgColor: 'bg-orange-50',
    allowedSections: ['repairs', 'tickets'],
    entityAccess: {
      repairs: { onlyAssigned: true, readOnly: true },
      tickets: { onlyAssigned: true, readOnly: true },
    },
    defaultMasking: {
      pii: true,
      finance: true,
      medical: true,
      staff: true,
    },
    maxValidityDays: 180,
  },
  {
    id: 'external_accountant',
    label: '会計士',
    description: '未収集計、財務サマリーの閲覧（個別明細はマスク）',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    allowedSections: ['receivables_summary', 'executive_summary', 'business_summary'],
    entityAccess: {
      receivables: { readOnly: true, aggregateOnly: true },
      collection: { readOnly: true, aggregateOnly: true },
    },
    defaultMasking: {
      pii: true,
      finance: false,  // 集計額は表示
      medical: true,
      staff: true,
    },
    maxValidityDays: 365,
  },
  {
    id: 'external_lawyer',
    label: '士業',
    description: '契約書、同意書の一部を閲覧',
    color: 'text-green-700',
    bgColor: 'bg-green-50',
    allowedSections: ['contracts', 'agreements'],
    entityAccess: {
      contracts: { readOnly: true },
      agreements: { readOnly: true },
    },
    defaultMasking: {
      pii: false,  // 契約関連では必要な場合あり
      finance: false,
      medical: true,
      staff: true,
    },
    maxValidityDays: 365,
  },
  {
    id: 'external_other',
    label: 'その他',
    description: '最小限の閲覧権限（個別設定必須）',
    color: 'text-zinc-700',
    bgColor: 'bg-zinc-50',
    allowedSections: [],  // デフォルトは何も見れない
    entityAccess: {},
    defaultMasking: {
      pii: true,
      finance: true,
      medical: true,
      staff: true,
    },
    maxValidityDays: 90,
  },
];

// ========== ユーティリティ関数 ==========

/**
 * ロールIDからロール定義を取得
 */
export function getExternalRole(roleId: ExternalRoleId): ExternalRoleDefinition | null {
  return EXTERNAL_ROLES.find((r) => r.id === roleId) ?? null;
}

/**
 * ロールでセクションにアクセス可能か
 */
export function canAccessSection(
  roleId: ExternalRoleId,
  section: ExternalAllowedSection,
  customAllowlist?: ExternalAllowedSection[]
): boolean {
  // カスタム許可リストがあればそちらを優先
  if (customAllowlist) {
    return customAllowlist.includes(section);
  }

  const role = getExternalRole(roleId);
  return role?.allowedSections.includes(section) ?? false;
}

/**
 * ロールでエンティティにアクセス可能か
 */
export function getEntityAccess(
  roleId: ExternalRoleId,
  entityType: string
): ExternalEntityAccess | null {
  const role = getExternalRole(roleId);
  return role?.entityAccess[entityType] ?? null;
}

/**
 * ロールのデフォルトマスキング設定を取得
 */
export function getDefaultMasking(roleId: ExternalRoleId): ExternalMaskingConfig {
  const role = getExternalRole(roleId);
  return role?.defaultMasking ?? {
    pii: true,
    finance: true,
    medical: true,
    staff: true,
  };
}

/**
 * ロールラベルを取得
 */
export function getExternalRoleLabel(roleId: ExternalRoleId): string {
  const role = getExternalRole(roleId);
  return role?.label ?? roleId;
}

/**
 * 全ロールの選択肢を取得
 */
export function getExternalRoleOptions(): Array<{ value: ExternalRoleId; label: string }> {
  return EXTERNAL_ROLES.map((r) => ({ value: r.id, label: r.label }));
}
