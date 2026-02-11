/**
 * オンボーディング Firestoreリポジトリ
 *
 * コレクション:
 *   - onboarding_requirements
 *   - user_onboarding (ドキュメントID = userId)
 *   - e_sign_records (ドキュメントID = {userId}__{documentVersionId})
 *   - onboarding_events
 */

import { getAdminDb } from '@/lib/firebase-admin';
import type { AppRole } from '@/config/appRoles';
import type {
  OnboardingRequirement,
  UserOnboarding,
  UserRequiredItem,
  RequiredDocItem,
  CreateOnboardingRequirementRequest,
  UpdateOnboardingRequirementRequest,
  OnboardingEvent,
  OnboardingEventAction,
} from './types';
import { isOnboardingTargetRole } from './types';
import { getUserById } from '@/lib/roles/user-store.firestore';

const REQUIREMENTS_COLLECTION = 'onboarding_requirements';
const USER_ONBOARDING_COLLECTION = 'user_onboarding';
const ESIGN_RECORDS_COLLECTION = 'e_sign_records';
const EVENTS_COLLECTION = 'onboarding_events';

function now(): string {
  return new Date().toISOString();
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

// ========== ドキュメント変換 ==========

function docToRequirement(doc: FirebaseFirestore.DocumentSnapshot): OnboardingRequirement {
  const d = doc.data()!;
  return {
    id: d.id ?? doc.id,
    scopeType: d.scopeType,
    scopeValue: d.scopeValue ?? null,
    requiredDocs: d.requiredDocs ?? [],
    isActive: d.isActive ?? true,
    requirementsVersion: d.requirementsVersion ?? 1,
    updatedByUserId: d.updatedByUserId ?? null,
    note: d.note ?? null,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

function docToUserOnboarding(doc: FirebaseFirestore.DocumentSnapshot): UserOnboarding {
  const d = doc.data()!;
  return {
    id: d.id ?? doc.id,
    userId: d.userId,
    status: d.status,
    requiredItems: d.requiredItems ?? [],
    appliedRequirementsVersion: d.appliedRequirementsVersion ?? 0,
    appliedAt: d.appliedAt,
    completedAt: d.completedAt ?? null,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

function docToOnboardingEvent(doc: FirebaseFirestore.DocumentSnapshot): OnboardingEvent {
  const d = doc.data()!;
  return {
    id: d.id ?? doc.id,
    userId: d.userId,
    action: d.action,
    fromVersion: d.fromVersion ?? null,
    toVersion: d.toVersion ?? null,
    actorUserId: d.actorUserId ?? null,
    note: d.note ?? null,
    createdAt: d.createdAt,
  };
}

// ========== オンボーディング要件 CRUD ==========

/**
 * オンボーディング要件一覧を取得
 */
export async function listRequirements(filter?: {
  isActive?: boolean;
  scopeType?: string;
}): Promise<OnboardingRequirement[]> {
  const db = getAdminDb();
  let q: FirebaseFirestore.Query = db.collection(REQUIREMENTS_COLLECTION);

  if (filter?.isActive !== undefined) {
    q = q.where('isActive', '==', filter.isActive);
  }
  if (filter?.scopeType) {
    q = q.where('scopeType', '==', filter.scopeType);
  }

  const snap = await q.get();
  const items = snap.docs.map(docToRequirement);

  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return items;
}

/**
 * オンボーディング要件を取得
 */
export async function getRequirementById(id: string): Promise<OnboardingRequirement | null> {
  const db = getAdminDb();
  const doc = await db.collection(REQUIREMENTS_COLLECTION).doc(id).get();
  if (!doc.exists) return null;
  return docToRequirement(doc);
}

/**
 * オンボーディング要件を作成
 */
export async function createRequirement(
  request: CreateOnboardingRequirementRequest
): Promise<OnboardingRequirement> {
  const db = getAdminDb();
  const docRef = db.collection(REQUIREMENTS_COLLECTION).doc();
  const timestamp = now();

  const requirement: OnboardingRequirement = {
    id: docRef.id,
    scopeType: request.scopeType,
    scopeValue: request.scopeValue ?? null,
    requiredDocs: request.requiredDocs,
    isActive: request.isActive ?? true,
    requirementsVersion: 1,
    updatedByUserId: request.actorUserId ?? null,
    note: request.note ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await docRef.set(requirement);
  return requirement;
}

/**
 * オンボーディング要件を更新
 *
 * Ticket 094: requiredDocs変更時はバージョンを+1
 */
export async function updateRequirement(
  id: string,
  request: UpdateOnboardingRequirementRequest
): Promise<OnboardingRequirement | null> {
  const db = getAdminDb();
  const docRef = db.collection(REQUIREMENTS_COLLECTION).doc(id);
  const doc = await docRef.get();

  if (!doc.exists) return null;

  const requirement = docToRequirement(doc);
  const updates: Record<string, unknown> = {};

  // requiredDocs変更時はバージョンをインクリメント
  if (request.requiredDocs !== undefined) {
    updates.requiredDocs = request.requiredDocs;
    updates.requirementsVersion = requirement.requirementsVersion + 1;
    requirement.requiredDocs = request.requiredDocs;
    requirement.requirementsVersion += 1;
  }
  if (request.isActive !== undefined) {
    updates.isActive = request.isActive;
    requirement.isActive = request.isActive;
  }
  if (request.note !== undefined) {
    updates.note = request.note;
    requirement.note = request.note;
  }
  if (request.actorUserId !== undefined) {
    updates.updatedByUserId = request.actorUserId;
    requirement.updatedByUserId = request.actorUserId;
  }

  const timestamp = now();
  updates.updatedAt = timestamp;
  requirement.updatedAt = timestamp;

  await docRef.update(updates);
  return requirement;
}

/**
 * オンボーディング要件を削除
 */
export async function deleteRequirement(id: string): Promise<boolean> {
  const db = getAdminDb();
  const docRef = db.collection(REQUIREMENTS_COLLECTION).doc(id);
  const doc = await docRef.get();
  if (!doc.exists) return false;

  await docRef.delete();
  return true;
}

/**
 * 現在のrequirementsVersionを取得
 * 全アクティブ要件の最大バージョンを返す
 */
export async function getCurrentRequirementsVersion(): Promise<number> {
  const activeRequirements = await listRequirements({ isActive: true });
  if (activeRequirements.length === 0) return 0;
  return Math.max(...activeRequirements.map((r) => r.requirementsVersion));
}

// ========== ユーザー向け必須文書取得 ==========

/**
 * ユーザーに適用される必須文書を取得
 */
export async function getRequiredDocsForUser(
  userId: string,
  role: AppRole,
  orgUnitIds: string[] = []
): Promise<RequiredDocItem[]> {
  // オンボーディング対象でなければ空
  if (!isOnboardingTargetRole(role)) {
    return [];
  }

  const activeRequirements = await listRequirements({ isActive: true });
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
 * ユーザーオンボーディングを取得
 */
export async function getUserOnboarding(userId: string): Promise<UserOnboarding | null> {
  const db = getAdminDb();
  const doc = await db.collection(USER_ONBOARDING_COLLECTION).doc(userId).get();
  if (!doc.exists) return null;
  return docToUserOnboarding(doc);
}

/**
 * 全ユーザーのオンボーディング情報を取得
 */
export async function getAllUserOnboardings(): Promise<UserOnboarding[]> {
  const db = getAdminDb();
  const snap = await db.collection(USER_ONBOARDING_COLLECTION).get();
  return snap.docs.map(docToUserOnboarding);
}

/**
 * ユーザーオンボーディングを初期化
 *
 * Ticket 094: appliedRequirementsVersion を設定
 */
export async function initializeUserOnboarding(
  userId: string,
  role: AppRole,
  orgUnitIds: string[] = []
): Promise<UserOnboarding> {
  const db = getAdminDb();

  // 既存があればそれを返す
  const existingDoc = await db.collection(USER_ONBOARDING_COLLECTION).doc(userId).get();
  if (existingDoc.exists) {
    return docToUserOnboarding(existingDoc);
  }

  // 必須文書を取得
  const requiredDocs = await getRequiredDocsForUser(userId, role, orgUnitIds);
  const currentVersion = await getCurrentRequirementsVersion();
  const timestamp = now();

  const docRef = db.collection(USER_ONBOARDING_COLLECTION).doc(userId);

  // 必須文書がなければ完了済みとする
  if (requiredDocs.length === 0) {
    const onboarding: UserOnboarding = {
      id: docRef.id,
      userId,
      status: 'completed',
      requiredItems: [],
      appliedRequirementsVersion: currentVersion,
      appliedAt: timestamp,
      completedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await docRef.set(onboarding);
    return onboarding;
  }

  // 必須アイテムを作成
  const requiredItems: UserRequiredItem[] = requiredDocs.map((doc) => ({
    documentVersionId: doc.documentVersionId,
    documentId: doc.documentId,
    title: doc.title,
    status: 'pending',
  }));

  const onboarding: UserOnboarding = {
    id: docRef.id,
    userId,
    status: 'pending',
    requiredItems,
    appliedRequirementsVersion: currentVersion,
    appliedAt: timestamp,
    completedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await docRef.set(onboarding);
  return onboarding;
}

/**
 * 署名完了をマーク
 */
export async function markItemAsSigned(
  userId: string,
  documentVersionId: string
): Promise<{ success: boolean; onboarding?: UserOnboarding; error?: string }> {
  const db = getAdminDb();
  const docRef = db.collection(USER_ONBOARDING_COLLECTION).doc(userId);
  const doc = await docRef.get();

  if (!doc.exists) {
    return { success: false, error: 'オンボーディング情報が見つかりません' };
  }

  const onboarding = docToUserOnboarding(doc);

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

  await docRef.set(onboarding);
  return { success: true, onboarding };
}

// ========== 判定関数 ==========

/**
 * オンボーディング完了判定
 */
export async function isOnboardingComplete(userId: string): Promise<boolean> {
  const user = await getUserById(userId);
  if (!user) return true; // ユーザーが見つからなければ通す

  // オンボーディング対象でなければ完了扱い
  if (!isOnboardingTargetRole(user.role)) {
    return true;
  }

  const onboarding = await getUserOnboarding(userId);
  if (!onboarding) {
    // まだ初期化されていない場合は必須文書があるかチェック
    const requiredDocs = await getRequiredDocsForUser(userId, user.role, []);
    return requiredDocs.length === 0;
  }

  return onboarding.status === 'completed';
}

/**
 * オンボーディング状態を取得（UI用）
 */
export async function getOnboardingStatus(userId: string): Promise<{
  isComplete: boolean;
  pendingCount: number;
  signedCount: number;
  totalCount: number;
}> {
  const onboarding = await getUserOnboarding(userId);
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
 */
function getESignRecordDocId(userId: string, documentVersionId: string): string {
  return `${userId}__${documentVersionId}`;
}

/**
 * 署名レコードが存在するかチェック
 */
export async function hasSignedDocument(userId: string, documentVersionId: string): Promise<boolean> {
  const db = getAdminDb();
  const docId = getESignRecordDocId(userId, documentVersionId);
  const doc = await db.collection(ESIGN_RECORDS_COLLECTION).doc(docId).get();
  if (!doc.exists) return false;
  const data = doc.data()!;
  return data.status === 'signed';
}

/**
 * 署名レコードを作成/更新（upsert、冪等）
 */
export async function upsertESignRecord(
  userId: string,
  documentId: string,
  documentVersionId: string,
  subjectName: string,
  note?: string
): Promise<{ success: boolean; docId: string }> {
  const db = getAdminDb();
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

  await db.collection(ESIGN_RECORDS_COLLECTION).doc(docId).set(record, { merge: true });
  return { success: true, docId };
}

/**
 * 署名済み文書のバージョンIDリストを取得
 */
export async function getSignedDocumentVersionIds(userId: string): Promise<string[]> {
  const db = getAdminDb();
  const snap = await db
    .collection(ESIGN_RECORDS_COLLECTION)
    .where('subjectId', '==', userId)
    .where('status', '==', 'signed')
    .get();

  return snap.docs.map((doc) => doc.data().documentVersionId);
}

/**
 * e_sign_recordsを参照してオンボーディング状態を再評価
 */
export async function reevaluateOnboardingStatus(userId: string): Promise<UserOnboarding | null> {
  const db = getAdminDb();
  const docRef = db.collection(USER_ONBOARDING_COLLECTION).doc(userId);
  const doc = await docRef.get();

  if (!doc.exists) return null;

  const onboarding = docToUserOnboarding(doc);
  const signedVersionIds = await getSignedDocumentVersionIds(userId);

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
  await docRef.set(onboarding);
  return onboarding;
}

// ========== オンボーディングイベント（監査ログ） ==========

/**
 * オンボーディングイベントを記録
 */
export async function logOnboardingEvent(
  userId: string,
  action: OnboardingEventAction,
  options: {
    fromVersion?: number | null;
    toVersion?: number | null;
    actorUserId?: string | null;
    note?: string | null;
  } = {}
): Promise<OnboardingEvent> {
  const db = getAdminDb();
  const docRef = db.collection(EVENTS_COLLECTION).doc();

  const event: OnboardingEvent = {
    id: docRef.id,
    userId,
    action,
    fromVersion: options.fromVersion ?? null,
    toVersion: options.toVersion ?? null,
    actorUserId: options.actorUserId ?? null,
    note: options.note ?? null,
    createdAt: now(),
  };

  await docRef.set(event);
  return event;
}

/**
 * ユーザーのオンボーディングイベント一覧を取得
 */
export async function getOnboardingEventsForUser(userId: string): Promise<OnboardingEvent[]> {
  const db = getAdminDb();
  const snap = await db
    .collection(EVENTS_COLLECTION)
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .get();

  return snap.docs.map(docToOnboardingEvent);
}

/**
 * 全オンボーディングイベント取得（監査ビュー用）
 */
export async function getAllOnboardingEvents(limit: number = 1000): Promise<OnboardingEvent[]> {
  const db = getAdminDb();
  const snap = await db
    .collection(EVENTS_COLLECTION)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return snap.docs.map(docToOnboardingEvent);
}

// ========== 同期ロジック ==========

/**
 * ユーザーのオンボーディング状態を同期
 *
 * Ticket 094: requirements が更新されていたら状態を再評価
 */
export async function syncOnboardingForUser(
  userId: string,
  role: AppRole,
  orgUnitIds: string[] = []
): Promise<UserOnboarding> {
  const currentVersion = await getCurrentRequirementsVersion();
  const requiredDocs = await getRequiredDocsForUser(userId, role, orgUnitIds);
  const signedVersionIds = await getSignedDocumentVersionIds(userId);
  const timestamp = now();
  const db = getAdminDb();

  // 既存のオンボーディング情報を取得
  let onboarding = await getUserOnboarding(userId);

  // なければ初期化
  if (!onboarding) {
    onboarding = await initializeUserOnboarding(userId, role, orgUnitIds);

    // 初期化時にイベントを記録
    await logOnboardingEvent(userId, 'requirement_applied', {
      fromVersion: null,
      toVersion: currentVersion,
      note: '初回オンボーディング作成',
    });

    return onboarding;
  }

  // バージョンが同じなら何もしない
  if (onboarding.appliedRequirementsVersion === currentVersion) {
    return onboarding;
  }

  // バージョンが異なる場合は再同期
  const oldVersion = onboarding.appliedRequirementsVersion;
  const wasCompleted = onboarding.status === 'completed';

  // 必須文書がなければ完了扱い
  if (requiredDocs.length === 0) {
    onboarding.status = 'completed';
    onboarding.requiredItems = [];
    onboarding.completedAt = onboarding.completedAt ?? timestamp;
    onboarding.appliedRequirementsVersion = currentVersion;
    onboarding.appliedAt = timestamp;
    onboarding.updatedAt = timestamp;

    await db.collection(USER_ONBOARDING_COLLECTION).doc(userId).set(onboarding);

    await logOnboardingEvent(userId, 'requirement_applied', {
      fromVersion: oldVersion,
      toVersion: currentVersion,
      note: '必須文書なし - 完了扱い',
    });

    return onboarding;
  }

  // 新しい requiredItems を生成
  const newRequiredItems: UserRequiredItem[] = requiredDocs.map((doc) => {
    // 既に署名済みかチェック
    const isSigned = signedVersionIds.includes(doc.documentVersionId);
    return {
      documentVersionId: doc.documentVersionId,
      documentId: doc.documentId,
      title: doc.title,
      status: isSigned ? 'signed' : 'pending',
      signedAt: isSigned ? timestamp : undefined,
    };
  });

  // 全件署名済みかチェック
  const allSigned = newRequiredItems.every((item) => item.status === 'signed');

  // 状態を更新
  onboarding.requiredItems = newRequiredItems;
  onboarding.status = allSigned ? 'completed' : 'pending';
  onboarding.completedAt = allSigned ? timestamp : null;
  onboarding.appliedRequirementsVersion = currentVersion;
  onboarding.appliedAt = timestamp;
  onboarding.updatedAt = timestamp;

  await db.collection(USER_ONBOARDING_COLLECTION).doc(userId).set(onboarding);

  // イベントを記録
  if (wasCompleted && !allSigned) {
    await logOnboardingEvent(userId, 'reset_pending', {
      fromVersion: oldVersion,
      toVersion: currentVersion,
      note: '文書改訂により未完了に戻された',
    });
  } else {
    await logOnboardingEvent(userId, 'requirement_applied', {
      fromVersion: oldVersion,
      toVersion: currentVersion,
      note: '要件バージョン更新',
    });
  }

  return onboarding;
}

// ========== シードデータ ==========

export async function seedOnboardingRequirements(): Promise<void> {
  const existing = await listRequirements();
  if (existing.length > 0) return;

  // デモ用：全員向けの必須文書
  await createRequirement({
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
  await createRequirement({
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

  console.log('[Onboarding] Seeded requirements to Firestore');
}
