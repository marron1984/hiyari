// ======== 仕訳テンプレート ライブラリ ========

import { getAdminDb } from './firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type {
  AccountingTemplate,
  CreateAccountingTemplateInput,
  UpdateAccountingTemplateInput,
  TemplateMatchResult,
  JournalEntry,
  JournalEntryDetail,
} from '@/types/accounting-template';
import { ACCOUNTING_TEMPLATES_COLLECTION } from '@/types/accounting-template';
import type { Payment } from '@/types/payment';

const DEFAULT_TENANT_ID = 'defaultTenant';

// ======== ヘルパー ========

function toDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  return undefined;
}

function removeUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const key in obj) {
    if (obj[key] !== undefined) {
      result[key] = obj[key];
    }
  }
  return result;
}

function docToTemplate(doc: FirebaseFirestore.DocumentSnapshot): AccountingTemplate {
  const data = doc.data()!;
  return {
    id: doc.id,
    tenantId: data.tenantId,
    name: data.name,
    description: data.description,
    matchCondition: data.matchCondition || {},
    priority: data.priority || 0,
    entries: data.entries || [],
    descriptionTemplate: data.descriptionTemplate || { template: '' },
    freeeSettings: data.freeeSettings,
    isActive: data.isActive ?? true,
    createdBy: data.createdBy,
    createdByName: data.createdByName,
    createdAt: toDate(data.createdAt) || new Date(),
    updatedAt: toDate(data.updatedAt) || new Date(),
  };
}

// ======== CRUD ========

/**
 * テンプレート一覧を取得
 */
export async function getAccountingTemplates(
  options: { activeOnly?: boolean } = {}
): Promise<AccountingTemplate[]> {
  const db = getAdminDb();
  let query = db
    .collection(ACCOUNTING_TEMPLATES_COLLECTION)
    .where('tenantId', '==', DEFAULT_TENANT_ID)
    .orderBy('priority', 'desc')
    .orderBy('createdAt', 'desc');

  if (options.activeOnly) {
    query = query.where('isActive', '==', true);
  }

  const snapshot = await query.get();
  return snapshot.docs.map(docToTemplate);
}

/**
 * テンプレートを取得
 */
export async function getAccountingTemplate(templateId: string): Promise<AccountingTemplate | null> {
  const db = getAdminDb();
  const doc = await db.collection(ACCOUNTING_TEMPLATES_COLLECTION).doc(templateId).get();

  if (!doc.exists) {
    return null;
  }

  return docToTemplate(doc);
}

/**
 * テンプレートを作成
 */
export async function createAccountingTemplate(
  input: CreateAccountingTemplateInput,
  createdBy?: string,
  createdByName?: string
): Promise<AccountingTemplate> {
  const db = getAdminDb();

  const data = removeUndefined({
    tenantId: DEFAULT_TENANT_ID,
    name: input.name,
    description: input.description,
    matchCondition: input.matchCondition,
    priority: input.priority,
    entries: input.entries,
    descriptionTemplate: input.descriptionTemplate,
    freeeSettings: input.freeeSettings,
    isActive: input.isActive ?? true,
    createdBy,
    createdByName,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const docRef = await db.collection(ACCOUNTING_TEMPLATES_COLLECTION).add(data);

  return {
    id: docRef.id,
    tenantId: DEFAULT_TENANT_ID,
    name: input.name,
    description: input.description,
    matchCondition: input.matchCondition,
    priority: input.priority,
    entries: input.entries,
    descriptionTemplate: input.descriptionTemplate,
    freeeSettings: input.freeeSettings,
    isActive: input.isActive ?? true,
    createdBy,
    createdByName,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * テンプレートを更新
 */
export async function updateAccountingTemplate(
  templateId: string,
  input: UpdateAccountingTemplateInput
): Promise<void> {
  const db = getAdminDb();

  const data = removeUndefined({
    name: input.name,
    description: input.description,
    matchCondition: input.matchCondition,
    priority: input.priority,
    entries: input.entries,
    descriptionTemplate: input.descriptionTemplate,
    freeeSettings: input.freeeSettings,
    isActive: input.isActive,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await db.collection(ACCOUNTING_TEMPLATES_COLLECTION).doc(templateId).update(data);
}

/**
 * テンプレートを削除
 */
export async function deleteAccountingTemplate(templateId: string): Promise<void> {
  const db = getAdminDb();
  await db.collection(ACCOUNTING_TEMPLATES_COLLECTION).doc(templateId).delete();
}

// ======== マッチング ========

/**
 * 支払いに対してテンプレートをマッチング
 */
export async function matchAccountingTemplate(
  payment: Payment,
  branchId?: string,
  purpose?: string
): Promise<TemplateMatchResult> {
  const templates = await getAccountingTemplates({ activeOnly: true });

  if (templates.length === 0) {
    return {
      matched: false,
      reason: '有効な仕訳テンプレートが登録されていません',
    };
  }

  // 優先度順にチェック
  for (const template of templates) {
    const condition = template.matchCondition;

    // 支払方法チェック
    if (condition.paymentMethods && condition.paymentMethods.length > 0) {
      if (!condition.paymentMethods.includes(payment.paymentMethod)) {
        continue;
      }
    }

    // 金額範囲チェック
    if (condition.amountMin !== undefined && payment.amount < condition.amountMin) {
      continue;
    }
    if (condition.amountMax !== undefined && payment.amount > condition.amountMax) {
      continue;
    }

    // 部署チェック
    if (condition.branchIds && condition.branchIds.length > 0) {
      if (!branchId || !condition.branchIds.includes(branchId)) {
        continue;
      }
    }

    // 目的キーワードチェック
    if (condition.purposeKeywords && condition.purposeKeywords.length > 0) {
      if (!purpose) {
        continue;
      }
      const purposeLower = purpose.toLowerCase();
      const hasKeyword = condition.purposeKeywords.some(
        (kw) => purposeLower.includes(kw.toLowerCase())
      );
      if (!hasKeyword) {
        continue;
      }
    }

    // 取引先名キーワードチェック
    if (condition.payeeKeywords && condition.payeeKeywords.length > 0) {
      const payeeNameLower = payment.payeeName.toLowerCase();
      const hasKeyword = condition.payeeKeywords.some(
        (kw) => payeeNameLower.includes(kw.toLowerCase())
      );
      if (!hasKeyword) {
        continue;
      }
    }

    // マッチ
    console.log('[AccountingTemplate] テンプレートマッチ', {
      paymentId: payment.id,
      templateId: template.id,
      templateName: template.name,
    });

    return {
      matched: true,
      template,
    };
  }

  // マッチなし
  return {
    matched: false,
    reason: '条件に一致する仕訳テンプレートが見つかりません',
  };
}

// ======== 仕訳データ生成 ========

/**
 * 摘要を生成
 */
export function generateDescription(
  template: AccountingTemplate,
  payment: Payment,
  additionalData?: {
    purpose?: string;
    invoiceNumber?: string;
  }
): string {
  let description = template.descriptionTemplate.template;

  // 変数を置換
  const replacements: Record<string, string> = {
    '{payeeName}': payment.payeeName,
    '{amount}': payment.amount.toLocaleString(),
    '{date}': new Date().toLocaleDateString('ja-JP'),
    '{purpose}': additionalData?.purpose || '',
    '{invoiceNumber}': additionalData?.invoiceNumber || '',
  };

  for (const [key, value] of Object.entries(replacements)) {
    description = description.replace(new RegExp(key, 'g'), value);
  }

  // 余分な空白を整理
  description = description.replace(/\s+/g, ' ').trim();

  return description;
}

/**
 * 仕訳データを生成
 */
export function generateJournalEntry(
  template: AccountingTemplate,
  payment: Payment,
  additionalData?: {
    purpose?: string;
    invoiceNumber?: string;
    partnerId?: number;
  }
): JournalEntry {
  const description = generateDescription(template, payment, additionalData);

  // 明細を生成
  const details = template.entries.map((entry) => {
    // 金額計算
    let amount: number;
    if (entry.amount !== undefined) {
      amount = entry.amount;
    } else if (entry.amountPercentage !== undefined) {
      amount = Math.round(payment.amount * (entry.amountPercentage / 100));
    } else {
      amount = payment.amount;
    }

    return {
      accountItemId: entry.accountItem.accountItemId,
      taxCode: entry.accountItem.taxCode,
      amount,
      description: entry.description,
      itemId: entry.itemId,
      sectionId: entry.sectionId,
      tagIds: entry.tagIds,
    };
  });

  // 決済情報
  const payments = template.freeeSettings?.walletableId
    ? [
        {
          amount: payment.amount,
          fromWalletableId: template.freeeSettings.walletableId,
          fromWalletableType: template.freeeSettings.walletableType || 'bank_account' as const,
          date: new Date().toISOString().split('T')[0],
        },
      ]
    : undefined;

  return {
    issueDate: new Date().toISOString().split('T')[0],
    type: 'expense',
    partnerId: additionalData?.partnerId,
    partnerName: payment.payeeName,
    details,
    payments,
    description,
  };
}

// ======== シードデータ ========

/**
 * デフォルトテンプレートを作成
 */
export async function seedDefaultTemplates(): Promise<void> {
  const existing = await getAccountingTemplates();
  if (existing.length > 0) {
    console.log('[AccountingTemplate] テンプレートが既に存在するためスキップ');
    return;
  }

  const defaultTemplates: CreateAccountingTemplateInput[] = [
    {
      name: '一般経費（消耗品費）',
      description: '10万円未満の消耗品・備品購入',
      matchCondition: {
        amountMax: 100000,
        purposeKeywords: ['消耗品', '備品', '文房具', 'オフィス用品'],
      },
      priority: 10,
      entries: [
        {
          entryType: 'debit',
          accountItem: { accountItemId: 303, accountItemName: '消耗品費', taxCode: 5 },
        },
        {
          entryType: 'credit',
          accountItem: { accountItemId: 202, accountItemName: '未払金' },
        },
      ],
      descriptionTemplate: {
        template: '{date} {payeeName} {purpose}',
      },
      isActive: true,
    },
    {
      name: '外注費',
      description: '外部委託・業務委託費用',
      matchCondition: {
        purposeKeywords: ['外注', '委託', '開発', 'デザイン', 'コンサル'],
      },
      priority: 20,
      entries: [
        {
          entryType: 'debit',
          accountItem: { accountItemId: 302, accountItemName: '外注費', taxCode: 5 },
        },
        {
          entryType: 'credit',
          accountItem: { accountItemId: 202, accountItemName: '未払金' },
        },
      ],
      descriptionTemplate: {
        template: '{date} {payeeName} 業務委託費',
      },
      isActive: true,
    },
    {
      name: '通信費',
      description: '通信・インターネット関連費用',
      matchCondition: {
        purposeKeywords: ['通信', '電話', 'インターネット', 'Wi-Fi', 'サーバー'],
      },
      priority: 15,
      entries: [
        {
          entryType: 'debit',
          accountItem: { accountItemId: 304, accountItemName: '通信費', taxCode: 5 },
        },
        {
          entryType: 'credit',
          accountItem: { accountItemId: 202, accountItemName: '未払金' },
        },
      ],
      descriptionTemplate: {
        template: '{date} {payeeName} 通信費',
      },
      isActive: true,
    },
    {
      name: '地代家賃',
      description: '賃料・共益費',
      matchCondition: {
        purposeKeywords: ['賃料', '家賃', '共益費', 'オフィス賃貸'],
      },
      priority: 25,
      entries: [
        {
          entryType: 'debit',
          accountItem: { accountItemId: 309, accountItemName: '地代家賃', taxCode: 5 },
        },
        {
          entryType: 'credit',
          accountItem: { accountItemId: 202, accountItemName: '未払金' },
        },
      ],
      descriptionTemplate: {
        template: '{date} {payeeName} 賃料',
      },
      isActive: true,
    },
    {
      name: 'デフォルト（雑費）',
      description: '他のテンプレートに一致しない場合',
      matchCondition: {},
      priority: 0, // 最低優先度
      entries: [
        {
          entryType: 'debit',
          accountItem: { accountItemId: 314, accountItemName: '雑費', taxCode: 5 },
        },
        {
          entryType: 'credit',
          accountItem: { accountItemId: 202, accountItemName: '未払金' },
        },
      ],
      descriptionTemplate: {
        template: '{date} {payeeName}への支払い',
      },
      isActive: true,
    },
  ];

  for (const template of defaultTemplates) {
    await createAccountingTemplate(template, 'system', 'システム');
  }

  console.log('[AccountingTemplate] デフォルトテンプレートを作成しました');
}
