/**
 * オンボーディング リポジトリ
 *
 * Ticket 093: 初回ログイン時の電子契約完了ゲート（本番対応版）
 *
 * - インメモリストレージ（デモ用）
 * - Firestore対応（本番用）
 *
 * STORAGE_DRIVER=firestore の場合はFirestoreを使用
 */

import type { AppRole } from '@/config/appRoles';
import type {
  OnboardingRequirement,
  UserOnboarding,
  UserRequiredItem,
  RequiredDocItem,
  CreateOnboardingRequirementRequest,
  UpdateOnboardingRequirementRequest,
} from './types';
import { isOnboardingTargetRole } from './types';
import { getUserById } from '@/lib/roles/user-store';
import { getStorageDriver } from '@/config/storage';

// ========== ドライバー判定 ==========

const isFirestore = getStorageDriver() === 'firestore';

// ========== インメモリストア（フォールバック） ==========

const requirementsStore = new Map<string, OnboardingRequirement>();
const userOnboardingStore = new Map<string, UserOnboarding>();
const esignRecordsStore = new Map<string, ESignRecordData>();

let reqIdCounter = 1;
let uobIdCounter = 1;

function now(): string {
  return new Date().toISOString();
}

function generateReqId(): string {
  return `obr_${Date.now()}_${reqIdCounter++}`;
}

function generateUserOnboardingId(): string {
  return `uob_${Date.now()}_${uobIdCounter++}`;
}

// ========== 署名レコード型（冪等ID用） ==========

interface ESignRecordData {
  subjectType: 'staff';
  subjectId: string;
  subjectName: string;
  documentId: string;
  documentVersionId: string;
  status: 'signed';
  method: 'online';
  signedAt: string;
  note?: string;
}

// ========== オンボーディング要件 CRUD ==========

/**
 * オンボーディング要件一覧を取得
 */
export function listRequirements(filter?: {
  isActive?: boolean;
  scopeType?: string;
}): OnboardingRequirement[] {
  let items = Array.from(requirementsStore.values());

  if (filter?.isActive !== undefined) {
    items = items.filter((r) => r.isActive === filter.isActive);
  }
  if (filter?.scopeType) {
    items = items.filter((r) => r.scopeType === filter.scopeType);
  }

  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return items;
}

/**
 * オンボーディング要件を取得
 */
export function getRequirementById(id: string): OnboardingRequirement | null {
  return requirementsStore.get(id) ?? null;
}

/**
 * オンボーディング要件を作成
 */
export function createRequirement(
  request: CreateOnboardingRequirementRequest
): OnboardingRequirement {
  const timestamp = now();
  const requirement: OnboardingRequirement = {
    id: generateReqId(),
    scopeType: request.scopeType,
    scopeValue: request.scopeValue ?? null,
    requiredDocs: request.requiredDocs,
    isActive: request.isActive ?? true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  requirementsStore.set(requirement.id, requirement);
  return requirement;
}

/**
 * オンボーディング要件を更新
 */
export function updateRequirement(
  id: string,
  request: UpdateOnboardingRequirementRequest
): OnboardingRequirement | null {
  const requirement = requirementsStore.get(id);
  if (!requirement) return null;

  if (request.requiredDocs !== undefined) {
    requirement.requiredDocs = request.requiredDocs;
  }
  if (request.isActive !== undefined) {
    requirement.isActive = request.isActive;
  }
  requirement.updatedAt = now();

  return requirement;
}

/**
 * オンボーディング要件を削除
 */
export function deleteRequirement(id: string): boolean {
  return requirementsStore.delete(id);
}

// ========== ユーザー向け必須文書取得 ==========

/**
 * ユーザーに適用される必須文書を取得
 *
 * 優先順位:
 * 1. global
 * 2. role
 * 3. orgUnit
 */
export function getRequiredDocsForUser(
  userId: string,
  role: AppRole,
  orgUnitIds: string[] = []
): RequiredDocItem[] {
  // オンボーディング対象でなければ空
  if (!isOnboardingTargetRole(role)) {
    return [];
  }

  const activeRequirements = listRequirements({ isActive: true });
  const docs: RequiredDocItem[] = [];
  const seenVersionIds = new Set<string>();

  // global
  for (const req of activeRequirements) {
    if (req.scopeType === 'global') {
      for (const doc of req.requiredDocs) {
        if (!seenVersionIds.has(doc.documentVersionId)) {
          docs.push(doc);
          seenVersionIds.add(doc.documentVersionId);
        }
      }
    }
  }

  // role
  for (const req of activeRequirements) {
    if (req.scopeType === 'role' && req.scopeValue === role) {
      for (const doc of req.requiredDocs) {
        if (!seenVersionIds.has(doc.documentVersionId)) {
          docs.push(doc);
          seenVersionIds.add(doc.documentVersionId);
        }
      }
    }
  }

  // orgUnit
  for (const req of activeRequirements) {
    if (req.scopeType === 'orgUnit' && req.scopeValue && orgUnitIds.includes(req.scopeValue)) {
      for (const doc of req.requiredDocs) {
        if (!seenVersionIds.has(doc.documentVersionId)) {
          docs.push(doc);
          seenVersionIds.add(doc.documentVersionId);
        }
      }
    }
  }

  return docs;
}

// ========== ユーザーオンボーディング ==========

/**
 * ユーザーオンボーディングを取得（なければ作成）
 */
export function getUserOnboarding(userId: string): UserOnboarding | null {
  return userOnboardingStore.get(userId) ?? null;
}

/**
 * ユーザーオンボーディングを初期化
 */
export function initializeUserOnboarding(
  userId: string,
  role: AppRole,
  orgUnitIds: string[] = []
): UserOnboarding {
  // 既存があればそれを返す
  const existing = userOnboardingStore.get(userId);
  if (existing) {
    return existing;
  }

  // 必須文書を取得
  const requiredDocs = getRequiredDocsForUser(userId, role, orgUnitIds);

  // 必須文書がなければ完了済みとする
  if (requiredDocs.length === 0) {
    const timestamp = now();
    const onboarding: UserOnboarding = {
      id: generateUserOnboardingId(),
      userId,
      status: 'completed',
      requiredItems: [],
      completedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    userOnboardingStore.set(userId, onboarding);
    return onboarding;
  }

  // 必須アイテムを作成
  const requiredItems: UserRequiredItem[] = requiredDocs.map((doc) => ({
    documentVersionId: doc.documentVersionId,
    documentId: doc.documentId,
    title: doc.title,
    status: 'pending',
  }));

  const timestamp = now();
  const onboarding: UserOnboarding = {
    id: generateUserOnboardingId(),
    userId,
    status: 'pending',
    requiredItems,
    completedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  userOnboardingStore.set(userId, onboarding);
  return onboarding;
}

/**
 * 署名完了をマーク
 */
export function markItemAsSigned(
  userId: string,
  documentVersionId: string
): { success: boolean; onboarding?: UserOnboarding; error?: string } {
  const onboarding = userOnboardingStore.get(userId);
  if (!onboarding) {
    return { success: false, error: 'オンボーディング情報が見つかりません' };
  }

  const item = onboarding.requiredItems.find(
    (i) => i.documentVersionId === documentVersionId
  );
  if (!item) {
    return { success: false, error: '対象の文書が見つかりません' };
  }

  if (item.status === 'signed') {
    return { success: true, onboarding };
  }

  item.status = 'signed';
  item.signedAt = now();
  onboarding.updatedAt = now();

  // 全件署名完了かチェック
  const allSigned = onboarding.requiredItems.every((i) => i.status === 'signed');
  if (allSigned) {
    onboarding.status = 'completed';
    onboarding.completedAt = now();
  }

  return { success: true, onboarding };
}

// ========== 判定関数 ==========

/**
 * オンボーディング完了判定
 */
export function isOnboardingComplete(userId: string): boolean {
  const user = getUserById(userId);
  if (!user) return true; // ユーザーが見つからなければ通す

  // オンボーディング対象でなければ完了扱い
  if (!isOnboardingTargetRole(user.role)) {
    return true;
  }

  const onboarding = userOnboardingStore.get(userId);
  if (!onboarding) {
    // まだ初期化されていない場合は必須文書があるかチェック
    const requiredDocs = getRequiredDocsForUser(userId, user.role, []);
    return requiredDocs.length === 0;
  }

  return onboarding.status === 'completed';
}

/**
 * オンボーディング状態を取得（UI用）
 */
export function getOnboardingStatus(userId: string): {
  isComplete: boolean;
  pendingCount: number;
  signedCount: number;
  totalCount: number;
} {
  const onboarding = userOnboardingStore.get(userId);
  if (!onboarding) {
    return {
      isComplete: true,
      pendingCount: 0,
      signedCount: 0,
      totalCount: 0,
    };
  }

  const pendingCount = onboarding.requiredItems.filter((i) => i.status === 'pending').length;
  const signedCount = onboarding.requiredItems.filter((i) => i.status === 'signed').length;

  return {
    isComplete: onboarding.status === 'completed',
    pendingCount,
    signedCount,
    totalCount: onboarding.requiredItems.length,
  };
}

// ========== 署名レコード（冪等） ==========

/**
 * 署名レコードのドキュメントIDを生成（冪等）
 * 形式: {userId}__{documentVersionId}
 */
function getESignRecordDocId(userId: string, documentVersionId: string): string {
  return `${userId}__${documentVersionId}`;
}

/**
 * 署名レコードが存在するかチェック
 */
export function hasSignedDocument(userId: string, documentVersionId: string): boolean {
  const docId = getESignRecordDocId(userId, documentVersionId);
  const record = esignRecordsStore.get(docId);
  return record?.status === 'signed';
}

/**
 * 署名レコードを作成/更新（upsert、冪等）
 */
export function upsertESignRecord(
  userId: string,
  documentId: string,
  documentVersionId: string,
  subjectName: string,
  note?: string
): { success: boolean; docId: string } {
  const docId = getESignRecordDocId(userId, documentVersionId);
  const timestamp = now();

  const record: ESignRecordData = {
    subjectType: 'staff',
    subjectId: userId,
    subjectName,
    documentId,
    documentVersionId,
    status: 'signed',
    method: 'online',
    signedAt: timestamp,
    note,
  };

  esignRecordsStore.set(docId, record);
  return { success: true, docId };
}

/**
 * 署名済み文書のバージョンIDリストを取得
 */
export function getSignedDocumentVersionIds(userId: string): string[] {
  const signed: string[] = [];
  for (const [docId, record] of esignRecordsStore) {
    if (record.subjectId === userId && record.status === 'signed') {
      signed.push(record.documentVersionId);
    }
  }
  return signed;
}

/**
 * e_sign_recordsを参照してオンボーディング状態を再評価
 */
export function reevaluateOnboardingStatus(userId: string): UserOnboarding | null {
  const onboarding = userOnboardingStore.get(userId);
  if (!onboarding) return null;

  const signedVersionIds = getSignedDocumentVersionIds(userId);

  let allSigned = true;
  for (const item of onboarding.requiredItems) {
    if (signedVersionIds.includes(item.documentVersionId)) {
      if (item.status !== 'signed') {
        item.status = 'signed';
        item.signedAt = now();
      }
    } else {
      allSigned = false;
    }
  }

  if (allSigned && onboarding.status !== 'completed') {
    onboarding.status = 'completed';
    onboarding.completedAt = now();
  }

  onboarding.updatedAt = now();
  return onboarding;
}

// ========== シードデータ ==========

export function seedOnboardingRequirements(): void {
  if (requirementsStore.size > 0) return;

  // デモ用：全員向けの必須文書
  createRequirement({
    scopeType: 'global',
    requiredDocs: [
      {
        documentId: 'doc_employment_oath',
        documentVersionId: 'docv_employment_oath_v1',
        title: '入社誓約書',
      },
      {
        documentId: 'doc_labor_contract',
        documentVersionId: 'docv_labor_contract_v1',
        title: '労働契約書',
      },
    ],
    isActive: true,
  });

  // デモ用：staff向けの追加文書
  createRequirement({
    scopeType: 'role',
    scopeValue: 'staff',
    requiredDocs: [
      {
        documentId: 'doc_confidentiality',
        documentVersionId: 'docv_confidentiality_v1',
        title: '機密保持誓約書',
      },
    ],
    isActive: true,
  });

  console.log('[Onboarding] Seeded requirements');
}

// ========== ストアクリア（テスト用） ==========

export function clearOnboardingStore(): void {
  requirementsStore.clear();
  userOnboardingStore.clear();
  esignRecordsStore.clear();
  reqIdCounter = 1;
  uobIdCounter = 1;
}

// 初期シード
seedOnboardingRequirements();
