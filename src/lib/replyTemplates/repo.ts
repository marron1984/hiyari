/**
 * 返信テンプレート リポジトリ
 *
 * Ticket 081: 定型メッセージ管理
 */

import type {
  ReplyTemplate,
  CreateReplyTemplateRequest,
  UpdateReplyTemplateRequest,
  ReplyTemplateFilter,
  ExpandedTemplate,
  TemplateVariable,
} from './types';
import { VACANCY_REPLY_VARIABLES } from './types';

// ========== インメモリストア ==========

const templatesStore = new Map<string, ReplyTemplate>();
let idCounter = 1;

function generateId(): string {
  return `rptpl_${String(idCounter++).padStart(4, '0')}`;
}

function now(): string {
  return new Date().toISOString();
}

// ========== 一覧取得 ==========

export function listReplyTemplates(filter: ReplyTemplateFilter = {}): ReplyTemplate[] {
  let items = Array.from(templatesStore.values());

  // カテゴリフィルタ
  if (filter.category) {
    items = items.filter(t => t.category === filter.category);
  }

  // アクティブのみ
  if (filter.activeOnly) {
    items = items.filter(t => t.isActive);
  }

  // 検索
  if (filter.search) {
    const q = filter.search.toLowerCase();
    items = items.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.key.toLowerCase().includes(q) ||
      (t.description?.toLowerCase().includes(q) ?? false)
    );
  }

  // ソート
  items.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ja'));

  return items;
}

// ========== 単一取得 ==========

export function getReplyTemplateById(id: string): ReplyTemplate | null {
  return templatesStore.get(id) ?? null;
}

export function getReplyTemplateByKey(key: string): ReplyTemplate | null {
  for (const template of templatesStore.values()) {
    if (template.key === key) {
      return template;
    }
  }
  return null;
}

// ========== 作成 ==========

export function createReplyTemplate(
  request: CreateReplyTemplateRequest,
  actorUserId: string
): ReplyTemplate {
  const timestamp = now();

  const template: ReplyTemplate = {
    id: generateId(),
    key: request.key,
    name: request.name,
    category: request.category,
    description: request.description,
    subject: request.subject,
    content: request.content,
    variablesJson: request.variablesJson ?? [],
    isActive: request.isActive ?? true,
    sortOrder: request.sortOrder ?? 0,
    createdAt: timestamp,
    createdByUserId: actorUserId,
    updatedAt: timestamp,
  };

  templatesStore.set(template.id, template);
  return template;
}

// ========== 更新 ==========

export function updateReplyTemplate(
  id: string,
  request: UpdateReplyTemplateRequest,
  actorUserId: string
): ReplyTemplate | null {
  const existing = templatesStore.get(id);
  if (!existing) return null;

  const updated: ReplyTemplate = {
    ...existing,
    name: request.name ?? existing.name,
    description: request.description !== undefined ? request.description : existing.description,
    subject: request.subject !== undefined ? request.subject : existing.subject,
    content: request.content ?? existing.content,
    variablesJson: request.variablesJson ?? existing.variablesJson,
    isActive: request.isActive ?? existing.isActive,
    sortOrder: request.sortOrder ?? existing.sortOrder,
    updatedAt: now(),
    updatedByUserId: actorUserId,
  };

  templatesStore.set(id, updated);
  return updated;
}

// ========== 削除 ==========

export function deleteReplyTemplate(id: string): boolean {
  return templatesStore.delete(id);
}

// ========== 変数展開 ==========

/**
 * テンプレートの変数を展開
 *
 * @param template - テンプレート
 * @param variables - 変数値のマップ
 * @returns 展開済みコンテンツ
 */
export function expandTemplate(
  template: ReplyTemplate,
  variables: Record<string, string>
): ExpandedTemplate {
  const missingVariables: string[] = [];

  // 変数展開関数
  const expand = (text: string): string => {
    return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      if (variables[key] !== undefined && variables[key] !== '') {
        return variables[key];
      }

      // 必須変数が欠けている場合
      const varDef = template.variablesJson.find(v => v.key === key);
      if (varDef?.required) {
        missingVariables.push(key);
      }

      // デフォルト値があれば使用
      if (varDef?.defaultValue) {
        return varDef.defaultValue;
      }

      return match; // そのまま残す
    });
  };

  return {
    subject: template.subject ? expand(template.subject) : undefined,
    content: expand(template.content),
    missingVariables,
  };
}

/**
 * テンプレートで使用されている変数を抽出
 */
export function extractVariables(content: string): string[] {
  const matches = content.match(/\{\{(\w+)\}\}/g) || [];
  const keys = matches.map(m => m.replace(/\{\{|\}\}/g, ''));
  return Array.from(new Set(keys));
}

// ========== シードデータ ==========

export function seedReplyTemplatesIfEmpty(): void {
  if (templatesStore.size > 0) return;

  const seeds: CreateReplyTemplateRequest[] = [
    {
      key: 'vacancy_reply_first_contact',
      name: '初回連絡（ファーストコンタクト）',
      category: 'vacancy_reply',
      description: '空室問い合わせへの初回返信。施設の概要と次のステップを案内。',
      subject: '【{{businessUnitName}}】空室のお問い合わせありがとうございます',
      content: `{{name}}様

この度は{{businessUnitName}}への空室のお問い合わせをいただき、誠にありがとうございます。

お問い合わせいただきました{{buildingName}}につきまして、ご案内させていただきます。

【空室状況】
- 入居可能日：{{availableFrom}}
- 月額費用目安：{{priceRange}}

ご見学やより詳しいご説明をご希望の場合は、お気軽にお申し付けください。

【ご連絡先】
電話：{{phone}}
メール：{{email}}
対応時間：{{contactWindow}}

ご不明な点がございましたら、お気軽にお問い合わせください。

担当：{{staffName}}`,
      variablesJson: VACANCY_REPLY_VARIABLES,
      sortOrder: 1,
    },
    {
      key: 'vacancy_reply_need_more_info',
      name: '追加情報の確認',
      category: 'vacancy_reply',
      description: '入居条件の確認など、追加情報が必要な場合の返信。',
      subject: '【{{businessUnitName}}】ご確認のお願い',
      content: `{{name}}様

お問い合わせいただきありがとうございます。

ご入居のご検討にあたり、以下の点を確認させていただけますでしょうか。

1. ご入居予定者様の介護度
2. 特別な医療ケアの有無
3. ご希望の入居時期

上記をご確認の上、ご返信いただけますと幸いです。

ご不明な点がございましたら、お気軽にお問い合わせください。

担当：{{staffName}}
電話：{{phone}}`,
      variablesJson: VACANCY_REPLY_VARIABLES,
      sortOrder: 2,
    },
    {
      key: 'vacancy_reply_schedule_tour',
      name: '見学日程の調整',
      category: 'vacancy_reply',
      description: '施設見学の日程調整用の返信。',
      subject: '【{{businessUnitName}}】見学日程のご案内',
      content: `{{name}}様

この度はご見学のご希望をいただき、ありがとうございます。

{{buildingName}}のご見学について、下記日程でご案内可能です。

【見学可能日程】
※ご希望の日時を2〜3候補お知らせください

【所要時間】
約1時間程度

【当日お持ちいただくもの】
特にございませんが、ご質問事項をメモしていただくとスムーズです。

ご都合の良い日時をお知らせください。
調整の上、改めてご連絡させていただきます。

担当：{{staffName}}
電話：{{phone}}`,
      variablesJson: VACANCY_REPLY_VARIABLES,
      sortOrder: 3,
    },
    {
      key: 'vacancy_reply_reject',
      name: 'お断り（条件不一致）',
      category: 'vacancy_reply',
      description: '入居条件が合わない場合のお断りの返信。',
      subject: '【{{businessUnitName}}】お問い合わせの件',
      content: `{{name}}様

この度は{{businessUnitName}}へのお問い合わせをいただき、誠にありがとうございます。

ご検討いただきましたところ、誠に恐れ入りますが、現時点ではご希望に沿えるお部屋のご用意が難しい状況でございます。

今後、ご希望に合う空室が出た際には、改めてご案内させていただきたく存じます。

何かご不明な点がございましたら、お気軽にお問い合わせください。

担当：{{staffName}}`,
      variablesJson: VACANCY_REPLY_VARIABLES,
      sortOrder: 4,
    },
    {
      key: 'vacancy_reply_waitlist',
      name: 'キャンセル待ち登録',
      category: 'vacancy_reply',
      description: '現在満室でキャンセル待ち登録を案内する返信。',
      subject: '【{{businessUnitName}}】キャンセル待ちのご案内',
      content: `{{name}}様

この度は{{businessUnitName}}へのお問い合わせをいただき、誠にありがとうございます。

{{buildingName}}につきましては、現在満室となっております。

ご希望の場合、キャンセル待ちとしてご登録いただくことが可能です。
空室が出ましたら、優先的にご連絡させていただきます。

【キャンセル待ち登録】
ご希望の場合は、以下をお知らせください。
- お名前
- ご連絡先
- ご入居予定者様の情報

何かご不明な点がございましたら、お気軽にお問い合わせください。

担当：{{staffName}}
電話：{{phone}}`,
      variablesJson: VACANCY_REPLY_VARIABLES,
      sortOrder: 5,
    },
  ];

  for (const seed of seeds) {
    createReplyTemplate(seed, 'system');
  }
}

// 初期化
seedReplyTemplatesIfEmpty();
