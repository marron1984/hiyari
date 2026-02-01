/**
 * 外部共有テンプレート定義
 *
 * 用途別に「表示セクション」「KPI許可リスト」「表現モード」を制御
 * 情報漏洩・誤共有を構造で防ぐ
 */

/**
 * テンプレートID
 */
export type ExternalTemplateId = 'bank' | 'investor' | 'audit';

/**
 * KPI表示モード
 * - exact: 具体数値を表示
 * - range: レンジ表示（「良好」「注意」など）
 * - directionOnly: 傾向のみ（「上昇中」「安定」など）
 */
export type ExternalDisplayMode = 'exact' | 'range' | 'directionOnly';

/**
 * 表示セクションID
 */
export type ExternalSectionId =
  | 'overview'
  | 'topPriorities'
  | 'kpiHighlights'
  | 'governance'
  | 'roadmap'
  | 'alertsSummary'
  | 'wbrProof'
  | 'notes';

/**
 * 外部共有テンプレート型
 */
export type ExternalShareTemplate = {
  id: ExternalTemplateId;
  label: string;
  description: string;

  /** KPI公開許可リスト（テンプレごと） */
  kpiAllowlist: string[];

  /** KPI値の表示モード（外部に具体値を出すか） */
  kpiDisplayMode: ExternalDisplayMode;

  /** 表示セクション（順序もここで決める） */
  sections: ExternalSectionId[];

  /** 文言トーン（文章生成に使う） */
  tone: 'conservative' | 'balanced' | 'assertive';

  /** セクション別の表示設定 */
  sectionConfig: Partial<Record<ExternalSectionId, SectionDisplayConfig>>;
};

/**
 * セクション表示設定
 */
export type SectionDisplayConfig = {
  /** セクションタイトル（上書き用） */
  title?: string;
  /** 最大表示件数 */
  maxItems?: number;
  /** 詳細レベル */
  detailLevel?: 'minimal' | 'standard' | 'detailed';
};

/**
 * テンプレート定義
 */
export const EXTERNAL_SHARE_TEMPLATES: ExternalShareTemplate[] = [
  {
    id: 'bank',
    label: '銀行向け',
    description: '運用の安定性・ガバナンス・リスク管理を中心に提示',
    kpiAllowlist: [
      'occupancy_rate',      // 入居率
      'prospect_conversion', // 成約率
      'avg_fatigue',         // 職員疲労度
      'turnover_risk_count', // 離職リスク
    ],
    kpiDisplayMode: 'range',
    sections: ['overview', 'governance', 'alertsSummary', 'kpiHighlights', 'roadmap', 'notes'],
    tone: 'conservative',
    sectionConfig: {
      overview: {
        title: '経営概況',
        detailLevel: 'standard',
      },
      governance: {
        title: 'ガバナンス・運用体制',
        maxItems: 4,
        detailLevel: 'detailed',
      },
      kpiHighlights: {
        title: '主要指標（安定性）',
        maxItems: 4,
        detailLevel: 'minimal',
      },
      roadmap: {
        title: '整備計画',
        maxItems: 3,
        detailLevel: 'minimal',
      },
      alertsSummary: {
        title: 'リスク管理状況',
        detailLevel: 'standard',
      },
      notes: {
        title: '補足事項',
      },
    },
  },
  {
    id: 'investor',
    label: '投資家向け',
    description: '成長ストーリー・優先順位・ロードマップの実行力を中心に提示',
    kpiAllowlist: [
      'occupancy_rate',      // 入居率
      'prospect_conversion', // 成約率
      'inquiry_count',       // 問合せ件数
      'avg_fatigue',         // 職員疲労度
    ],
    kpiDisplayMode: 'range',
    sections: ['overview', 'kpiHighlights', 'topPriorities', 'roadmap', 'governance', 'notes'],
    tone: 'assertive',
    sectionConfig: {
      overview: {
        title: 'エグゼクティブサマリー',
        detailLevel: 'detailed',
      },
      kpiHighlights: {
        title: '成長指標',
        maxItems: 5,
        detailLevel: 'standard',
      },
      topPriorities: {
        title: '戦略的優先事項',
        maxItems: 3,
        detailLevel: 'detailed',
      },
      roadmap: {
        title: '実行ロードマップ',
        maxItems: 5,
        detailLevel: 'standard',
      },
      governance: {
        title: '運営体制',
        maxItems: 2,
        detailLevel: 'minimal',
      },
      notes: {
        title: '投資家向け補足',
      },
    },
  },
  {
    id: 'audit',
    label: '監査向け',
    description: '証跡・運用・統制を中心に提示（数値よりプロセスとログ）',
    kpiAllowlist: [
      'avg_fatigue',         // 職員疲労度（労務管理）
      'turnover_risk_count', // 離職リスク
    ],
    kpiDisplayMode: 'directionOnly',
    sections: ['overview', 'wbrProof', 'alertsSummary', 'governance', 'roadmap', 'notes'],
    tone: 'balanced',
    sectionConfig: {
      overview: {
        title: '管理体制概要',
        detailLevel: 'standard',
      },
      wbrProof: {
        title: '週次レビュー実施証跡',
        maxItems: 8,
        detailLevel: 'detailed',
      },
      alertsSummary: {
        title: 'アラート対応状況',
        detailLevel: 'detailed',
      },
      governance: {
        title: '内部統制・承認フロー',
        maxItems: 4,
        detailLevel: 'detailed',
      },
      roadmap: {
        title: '改善計画',
        maxItems: 3,
        detailLevel: 'minimal',
      },
      notes: {
        title: '監査対応メモ',
      },
    },
  },
];

/**
 * テンプレートIDからテンプレートを取得
 */
export function getExternalShareTemplate(
  templateId: ExternalTemplateId
): ExternalShareTemplate {
  const template = EXTERNAL_SHARE_TEMPLATES.find((t) => t.id === templateId);
  if (!template) {
    // デフォルトは銀行向け
    return EXTERNAL_SHARE_TEMPLATES[0];
  }
  return template;
}

/**
 * テンプレートでKPIが許可されているかチェック
 */
export function isKpiAllowedByTemplate(
  kpiId: string,
  templateId: ExternalTemplateId
): boolean {
  const template = getExternalShareTemplate(templateId);
  return template.kpiAllowlist.includes(kpiId);
}

/**
 * テンプレートでセクションが表示可能かチェック
 */
export function isSectionVisibleByTemplate(
  sectionId: ExternalSectionId,
  templateId: ExternalTemplateId
): boolean {
  const template = getExternalShareTemplate(templateId);
  return template.sections.includes(sectionId);
}

/**
 * KPI値をテンプレートの表示モードに応じてフォーマット
 */
export function formatKpiValueByTemplate(
  value: number,
  unit: string,
  displayMode: ExternalDisplayMode,
  isHigherBetter: boolean = true
): string {
  switch (displayMode) {
    case 'exact':
      return `${value}${unit}`;

    case 'range':
      // レンジ表示
      if (isHigherBetter) {
        if (value >= 80) return '良好';
        if (value >= 60) return '標準';
        if (value >= 40) return '要注意';
        return '要改善';
      } else {
        // 低い方が良い指標（疲労度など）
        if (value <= 2) return '良好';
        if (value <= 3) return '標準';
        if (value <= 4) return '要注意';
        return '要改善';
      }

    case 'directionOnly':
      // 傾向のみ表示
      return '安定推移';

    default:
      return `${value}${unit}`;
  }
}

/**
 * テンプレート別の文言トーンに応じた表現を取得
 */
export function getToneBasedPhrase(
  tone: 'conservative' | 'balanced' | 'assertive',
  context: 'progress' | 'risk' | 'plan'
): string {
  const phrases: Record<string, Record<string, string>> = {
    conservative: {
      progress: '着実に進捗しております',
      risk: '継続的な改善に取り組んでおります',
      plan: '計画に基づき整備を進めております',
    },
    balanced: {
      progress: '順調に進捗しています',
      risk: '適切に管理しています',
      plan: '計画通り実行しています',
    },
    assertive: {
      progress: '力強く成長を続けています',
      risk: 'プロアクティブに対処しています',
      plan: '戦略的に推進しています',
    },
  };

  return phrases[tone]?.[context] ?? phrases.balanced[context];
}
