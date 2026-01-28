// ======== 書類テンプレート（doc_type）マスターデータ ========
import { DocumentTemplate, DocumentCategory, DocumentOwnerType } from '@/types/document';

type TemplateData = Omit<DocumentTemplate, 'id' | 'createdAt' | 'updatedAt'>;

// ======== 入居者書類（RESIDENT） ========
const RESIDENT_TEMPLATES: TemplateData[] = [
  // 入居時必須
  { key: 'RESIDENT_APPLICATION', name: '入居申込書', category: 'NYUKYO', ownerType: 'RESIDENT', required: true, signedRequired: true },
  { key: 'RESIDENT_IMPORTANT_MATTERS', name: '重要事項説明書', category: 'NYUKYO', ownerType: 'RESIDENT', required: true, signedRequired: true },
  { key: 'RESIDENT_CONTRACT', name: '契約書', category: 'NYUKYO', ownerType: 'RESIDENT', required: true, signedRequired: true },
  { key: 'RESIDENT_PRIVACY_CONSENT', name: '個人情報同意書', category: 'NYUKYO', ownerType: 'RESIDENT', required: true, signedRequired: true },
  { key: 'RESIDENT_EMERGENCY_CONSENT', name: '緊急対応同意書', category: 'NYUKYO', ownerType: 'RESIDENT', required: true, signedRequired: true },
  { key: 'RESIDENT_MEDICAL_CONSENT', name: '医療連携同意書', category: 'NYUKYO', ownerType: 'RESIDENT', required: true, signedRequired: true },
  { key: 'RESIDENT_PHOTO_CONSENT', name: '写真同意書', category: 'NYUKYO', ownerType: 'RESIDENT', required: false, signedRequired: true },
  { key: 'RESIDENT_GUARANTOR', name: '身元引受/保証書', category: 'NYUKYO', ownerType: 'RESIDENT', required: true, signedRequired: true },
  { key: 'RESIDENT_EMERGENCY_CONTACT', name: '緊急連絡先届', category: 'NYUKYO', ownerType: 'RESIDENT', required: true, signedRequired: false },
  { key: 'RESIDENT_HEALTH_SHEET', name: '健康情報ヒアリング', category: 'NYUKYO', ownerType: 'RESIDENT', required: true, signedRequired: false },
  { key: 'RESIDENT_INSURANCE_CHECK', name: '介護保険情報確認票', category: 'NYUKYO', ownerType: 'RESIDENT', required: true, signedRequired: false, validityDays: 365 },
  { key: 'RESIDENT_BANK_TRANSFER', name: '口座振替/振込同意書', category: 'NYUKYO', ownerType: 'RESIDENT', required: true, signedRequired: true },
  { key: 'RESIDENT_MOVEOUT_SETTLEMENT', name: '退去精算確認書', category: 'NYUKYO', ownerType: 'RESIDENT', required: false, signedRequired: true },
  { key: 'RESIDENT_LIFE_NOTES', name: '生活歴・配慮事項シート', category: 'NYUKYO', ownerType: 'RESIDENT', required: true, signedRequired: false },

  // 入居中運用
  { key: 'RESIDENT_CARE_POLICY', name: 'ケア方針メモ', category: 'OPS', ownerType: 'RESIDENT', required: false, signedRequired: false },
  { key: 'RESIDENT_MONITORING', name: 'モニタリング記録', category: 'OPS', ownerType: 'RESIDENT', required: false, signedRequired: false },
  { key: 'RESIDENT_DOCTOR_ORDER', name: '医師指示書', category: 'CARE', ownerType: 'RESIDENT', required: false, signedRequired: false },
  { key: 'RESIDENT_MEDICATION', name: '服薬管理票', category: 'CARE', ownerType: 'RESIDENT', required: false, signedRequired: false },
  { key: 'RESIDENT_MOVEOUT_CHECKLIST', name: '退去チェックリスト', category: 'OPS', ownerType: 'RESIDENT', required: false, signedRequired: false },
  { key: 'RESIDENT_REPAIR_REQUEST', name: '修繕依頼票', category: 'OPS', ownerType: 'RESIDENT', required: false, signedRequired: false },
];

// ======== 従業員書類（EMPLOYEE） ========
const EMPLOYEE_TEMPLATES: TemplateData[] = [
  // 入職時必須
  { key: 'EMPLOYMENT_CONTRACT', name: '雇用契約書', category: 'HR', ownerType: 'EMPLOYEE', required: true, signedRequired: true },
  { key: 'WORK_CONDITIONS_NOTICE', name: '労働条件通知書', category: 'HR', ownerType: 'EMPLOYEE', required: true, signedRequired: false },
  { key: 'CONFIDENTIALITY_PLEDGE', name: '守秘義務誓約書', category: 'HR', ownerType: 'EMPLOYEE', required: true, signedRequired: true },
  { key: 'PERSONAL_INFO_PLEDGE', name: '個人情報誓約書', category: 'HR', ownerType: 'EMPLOYEE', required: true, signedRequired: true },
  { key: 'SNS_POLICY_ACK', name: 'SNS規程既読', category: 'HR', ownerType: 'EMPLOYEE', required: true, signedRequired: true },
  { key: 'ONBOARDING_CHECKLIST', name: '入職チェックリスト', category: 'HR', ownerType: 'EMPLOYEE', required: true, signedRequired: false },
  { key: 'ID_VERIFICATION', name: '本人確認書類', category: 'HR', ownerType: 'EMPLOYEE', required: true, signedRequired: false },
  { key: 'BANK_ACCOUNT_INFO', name: '給与振込口座届', category: 'HR', ownerType: 'EMPLOYEE', required: true, signedRequired: false },
  { key: 'QUALIFICATION_COPY', name: '資格証写し', category: 'HR', ownerType: 'EMPLOYEE', required: false, signedRequired: false },
  { key: 'QUALIFICATION_RENEWAL', name: '資格更新記録', category: 'HR', ownerType: 'EMPLOYEE', required: false, signedRequired: false },
  { key: 'HEALTH_CHECK_RESULT', name: '健康診断結果', category: 'HR', ownerType: 'EMPLOYEE', required: true, signedRequired: false, validityDays: 365 },
  { key: 'TRAINING_RECORD', name: '研修受講記録', category: 'HR', ownerType: 'EMPLOYEE', required: false, signedRequired: false },
  { key: 'WORK_RULES_ACK', name: '就業規則既読', category: 'HR', ownerType: 'EMPLOYEE', required: true, signedRequired: true },
  { key: 'HARASSMENT_POLICY_ACK', name: 'ハラスメント規程既読', category: 'HR', ownerType: 'EMPLOYEE', required: true, signedRequired: true },
];

// ======== 事業所共通（ORG） ========
const ORG_TEMPLATES: TemplateData[] = [
  { key: 'ORG_BCP', name: 'BCP（事業継続計画）', category: 'AUDIT', ownerType: 'ORG', required: true, signedRequired: false },
  { key: 'ORG_INFECTION_CONTROL', name: '感染症対策マニュアル', category: 'AUDIT', ownerType: 'ORG', required: true, signedRequired: false },
  { key: 'ORG_ABUSE_PREVENTION', name: '虐待防止指針', category: 'AUDIT', ownerType: 'ORG', required: true, signedRequired: false },
  { key: 'ORG_RESTRAINT_GUIDE', name: '身体拘束適正化指針', category: 'AUDIT', ownerType: 'ORG', required: true, signedRequired: false },
  { key: 'ORG_COMPLAINT_MANUAL', name: '苦情対応マニュアル', category: 'AUDIT', ownerType: 'ORG', required: true, signedRequired: false },
  { key: 'ORG_ACCIDENT_MANUAL', name: '事故対応マニュアル', category: 'AUDIT', ownerType: 'ORG', required: true, signedRequired: false },
  { key: 'ORG_PRIVACY_POLICY', name: '個人情報保護方針', category: 'AUDIT', ownerType: 'ORG', required: true, signedRequired: false },
  { key: 'ORG_INFO_SECURITY', name: '情報管理規程', category: 'AUDIT', ownerType: 'ORG', required: true, signedRequired: false },
  { key: 'ORG_COMMITTEE_PLAN', name: '委員会年間計画', category: 'AUDIT', ownerType: 'ORG', required: false, signedRequired: false },
  { key: 'ORG_COMMITTEE_MINUTES', name: '委員会議事録', category: 'AUDIT', ownerType: 'ORG', required: false, signedRequired: false },
  { key: 'ORG_COMMITTEE_REPORT', name: '委員会報告', category: 'AUDIT', ownerType: 'ORG', required: false, signedRequired: false },
];

// ======== 取引先・契約（PARTNER） ========
const PARTNER_TEMPLATES: TemplateData[] = [
  { key: 'PARTNER_REFERRAL_CONTRACT', name: '紹介会社契約書', category: 'CONTRACT', ownerType: 'PARTNER', required: true, signedRequired: true },
  { key: 'PARTNER_GUARANTOR_CONTRACT', name: '保証会社契約書', category: 'CONTRACT', ownerType: 'PARTNER', required: false, signedRequired: true },
  { key: 'PARTNER_OUTSOURCING_CONTRACT', name: '業務委託契約書', category: 'CONTRACT', ownerType: 'PARTNER', required: true, signedRequired: true },
];

// ======== 金銭（ORG扱い） ========
const FINANCE_TEMPLATES: TemplateData[] = [
  { key: 'FINANCE_BILLING_POLICY', name: '請求書発行ルール', category: 'FINANCE', ownerType: 'ORG', required: true, signedRequired: false },
  { key: 'FINANCE_RECONCILIATION_POLICY', name: '入金消込ルール', category: 'FINANCE', ownerType: 'ORG', required: true, signedRequired: false },
  { key: 'FINANCE_AR_COLLECTION_POLICY', name: '未収回収ルール', category: 'FINANCE', ownerType: 'ORG', required: true, signedRequired: false },
  { key: 'FINANCE_INSTALLMENT_AGREEMENT', name: '分割支払い合意書（雛形）', category: 'FINANCE', ownerType: 'ORG', required: false, signedRequired: true },
  { key: 'FINANCE_APPROVAL_POLICY', name: '支払申請/稟議フロー', category: 'FINANCE', ownerType: 'ORG', required: true, signedRequired: false },
];

// ======== 全テンプレート ========
export const DOCUMENT_TEMPLATES: TemplateData[] = [
  ...RESIDENT_TEMPLATES,
  ...EMPLOYEE_TEMPLATES,
  ...ORG_TEMPLATES,
  ...PARTNER_TEMPLATES,
  ...FINANCE_TEMPLATES,
];

// ======== ヘルパー関数 ========
export function getTemplatesByOwnerType(ownerType: DocumentOwnerType): TemplateData[] {
  return DOCUMENT_TEMPLATES.filter(t => t.ownerType === ownerType);
}

export function getTemplatesByCategory(category: DocumentCategory): TemplateData[] {
  return DOCUMENT_TEMPLATES.filter(t => t.category === category);
}

export function getRequiredTemplates(ownerType: DocumentOwnerType): TemplateData[] {
  return DOCUMENT_TEMPLATES.filter(t => t.ownerType === ownerType && t.required);
}

export function getTemplateByKey(key: string): TemplateData | undefined {
  return DOCUMENT_TEMPLATES.find(t => t.key === key);
}
