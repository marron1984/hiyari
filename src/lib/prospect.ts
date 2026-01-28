// ======== 入居希望者管理 Firestoreヘルパー ========

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { db, DEFAULT_TENANT_ID } from './firebase';
import {
  Prospect,
  ProspectStatus,
  ProspectWebhookPayload,
  Room,
  RoomStatus,
  Occupancy,
  AuditLog,
  AuditAction,
  NotificationLog,
  generateProspectKey,
  IMPORTANT_STATUSES,
} from '@/types/prospect';
import { hasMinRole } from './auth';
import { UserRole } from '@/types';

// ======== 定数 ========

// 社内No 252以降のみアクティブ対象（251以前は旧データ）
export const ACTIVE_INTERNAL_NO_THRESHOLD = 252;

// KPI集計対象年（2026年以降）
export const KPI_START_YEAR = 2026;

/**
 * 社内Noが有効範囲（252以上）かどうかを判定
 */
export function isActiveInternalNo(internalNo?: string): boolean {
  if (!internalNo) return true; // internalNoがない場合はデフォルトでアクティブ
  const num = parseInt(internalNo, 10);
  if (isNaN(num)) return true;
  return num >= ACTIVE_INTERNAL_NO_THRESHOLD;
}

/**
 * 日付がKPI対象期間（2026年以降）かどうかを判定
 */
export function isKpiTargetDate(date: Date): boolean {
  return date.getFullYear() >= KPI_START_YEAR;
}

function getDb() {
  if (!db) throw new Error('Firestore not initialized');
  return db;
}

// ======== 入居希望者 CRUD ========

/**
 * 入居希望者を作成
 */
export async function createProspect(
  data: Partial<Prospect>,
  createdBy?: string,
  createdByName?: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<Prospect> {
  const firestore = getDb();

  const now = Timestamp.now();
  const prospectKey = generateProspectKey({
    customerName: data.customerName,
    age: data.age,
    inquiryDate: data.inquiryDate,
    salesCompanyName: data.salesCompanyName,
    salesRepName: data.salesRepName,
  });

  const prospectData = {
    tenantId,
    status: data.status || '新規受付',
    receivedAt: data.receivedAt ? Timestamp.fromDate(data.receivedAt) : now,
    prospectKey,
    createdAt: now,
    createdBy: createdBy || null,
    createdByName: createdByName || null,
    // 基本情報
    internalNo: data.internalNo || null,
    statusNote: data.statusNote || null,
    assigneeId: data.assigneeId || null,
    assigneeName: data.assigneeName || null,
    // 顧客情報
    customerName: data.customerName || null,
    age: data.age || null,
    gender: data.gender || null,
    careLevel: data.careLevel || null,
    disabilityCategory: data.disabilityCategory || null,
    // 費用
    budget: data.budget || null,
    budgetDetail: data.budgetDetail || null,
    monthlyBudget: data.monthlyBudget || null,
    // ADL
    adlSummary: data.adlSummary || null,
    adlDetail: data.adlDetail || null,
    adl: data.adl || null,
    // 状況
    debtStatus: data.debtStatus || null,
    currentSituation: data.currentSituation || null,
    currentAddress: data.currentAddress || null,
    currentDetail: data.currentDetail || null,
    // 入居希望
    desiredFacility: data.desiredFacility || null,
    desiredMoveInDate: data.desiredMoveInDate || null,
    entertainmentWish: data.entertainmentWish || null,
    tourRequestDate: data.tourRequestDate || null,
    // 面談・連絡
    interviewDateTime: data.interviewDateTime || null,
    keyPerson: data.keyPerson || null,
    otherNotes: data.otherNotes || null,
    // 営業会社
    salesCompanyName: data.salesCompanyName || null,
    salesRepName: data.salesRepName || null,
    salesRepContact: data.salesRepContact || null,
    // 問い合わせ
    inquiryDate: data.inquiryDate || null,
    // ソース
    source: data.source || null,
    rawTranscript: data.rawTranscript || null,
    rawPayload: data.rawPayload || null,
    // 重複
    duplicateOf: data.duplicateOf || null,
    duplicateCandidates: data.duplicateCandidates || null,
  };

  const docRef = await addDoc(collection(firestore, 'prospects'), prospectData);

  return {
    id: docRef.id,
    ...prospectData,
    receivedAt: data.receivedAt || now.toDate(),
    createdAt: now.toDate(),
  } as unknown as Prospect;
}

/**
 * 入居希望者を取得
 */
export async function getProspect(id: string): Promise<Prospect | null> {
  const firestore = getDb();
  const docRef = doc(firestore, 'prospects', id);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) return null;

  const data = docSnap.data();
  return {
    id: docSnap.id,
    ...data,
    receivedAt: data.receivedAt?.toDate() || new Date(),
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate(),
  } as Prospect;
}

/**
 * 入居希望者一覧を取得
 */
export async function getProspects(
  tenantId: string = DEFAULT_TENANT_ID,
  filters?: {
    status?: ProspectStatus;
    assigneeId?: string;
    desiredFacility?: string;
    salesCompanyName?: string;
    includeClosedOldData?: boolean; // 旧データ（251以前）を含めるか
  }
): Promise<Prospect[]> {
  const firestore = getDb();

  const q = query(
    collection(firestore, 'prospects'),
    where('tenantId', '==', tenantId)
  );

  const snapshot = await getDocs(q);

  let results = snapshot.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      receivedAt: data.receivedAt?.toDate() || new Date(),
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate(),
    } as Prospect;
  });

  // デフォルトで旧データ（社内No 251以前）を除外
  if (!filters?.includeClosedOldData) {
    results = results.filter((p) => isActiveInternalNo(p.internalNo));
  }

  // クライアントサイドフィルタ
  if (filters?.status) {
    results = results.filter((p) => p.status === filters.status);
  }
  if (filters?.assigneeId) {
    results = results.filter((p) => p.assigneeId === filters.assigneeId);
  }
  if (filters?.desiredFacility) {
    results = results.filter((p) => p.desiredFacility === filters.desiredFacility);
  }
  if (filters?.salesCompanyName) {
    results = results.filter((p) => p.salesCompanyName === filters.salesCompanyName);
  }

  // 受信日時降順
  return results.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
}

/**
 * 入居希望者を更新
 */
export async function updateProspect(
  id: string,
  updates: Partial<Prospect>,
  userId: string,
  userName: string,
  userRole: UserRole
): Promise<void> {
  if (!hasMinRole(userRole, 'leader')) {
    throw new Error('更新にはリーダー以上の権限が必要です');
  }

  const firestore = getDb();
  const existing = await getProspect(id);
  if (!existing) throw new Error('入居希望者が見つかりません');

  const updateData = {
    ...updates,
    updatedAt: Timestamp.now(),
  };

  // undefinedをnullに変換
  Object.keys(updateData).forEach((key) => {
    if ((updateData as Record<string, unknown>)[key] === undefined) {
      (updateData as Record<string, unknown>)[key] = null;
    }
  });

  await updateDoc(doc(firestore, 'prospects', id), updateData);

  // 監査ログ
  await createAuditLog({
    tenantId: existing.tenantId,
    actor: userId,
    actorName: userName,
    action: updates.status && updates.status !== existing.status ? 'status_change' : 'update',
    entity: 'prospect',
    entityId: id,
    diff: {
      before: { status: existing.status, assigneeId: existing.assigneeId },
      after: { status: updates.status || existing.status, assigneeId: updates.assigneeId || existing.assigneeId },
    },
  });
}

/**
 * 担当者を割り当て
 */
export async function assignProspect(
  id: string,
  assigneeId: string,
  assigneeName: string,
  userId: string,
  userName: string,
  userRole: UserRole
): Promise<void> {
  if (!hasMinRole(userRole, 'leader')) {
    throw new Error('担当割当にはリーダー以上の権限が必要です');
  }

  const firestore = getDb();
  const existing = await getProspect(id);
  if (!existing) throw new Error('入居希望者が見つかりません');

  await updateDoc(doc(firestore, 'prospects', id), {
    assigneeId,
    assigneeName,
    updatedAt: Timestamp.now(),
  });

  // 監査ログ
  await createAuditLog({
    tenantId: existing.tenantId,
    actor: userId,
    actorName: userName,
    action: 'assign',
    entity: 'prospect',
    entityId: id,
    diff: {
      before: { assigneeId: existing.assigneeId, assigneeName: existing.assigneeName },
      after: { assigneeId, assigneeName },
    },
  });
}

/**
 * ステータスを更新
 */
export async function updateProspectStatus(
  id: string,
  status: ProspectStatus,
  statusNote: string | undefined,
  userId: string,
  userName: string,
  userRole: UserRole
): Promise<{ shouldNotify: boolean }> {
  if (!hasMinRole(userRole, 'leader')) {
    throw new Error('ステータス更新にはリーダー以上の権限が必要です');
  }

  const firestore = getDb();
  const existing = await getProspect(id);
  if (!existing) throw new Error('入居希望者が見つかりません');

  const previousStatus = existing.status;

  await updateDoc(doc(firestore, 'prospects', id), {
    status,
    statusNote: statusNote || null,
    updatedAt: Timestamp.now(),
  });

  // 監査ログ
  await createAuditLog({
    tenantId: existing.tenantId,
    actor: userId,
    actorName: userName,
    action: 'status_change',
    entity: 'prospect',
    entityId: id,
    diff: {
      before: { status: previousStatus },
      after: { status },
    },
    note: statusNote,
  });

  // 重要ステータスへの変更は通知対象
  const shouldNotify = IMPORTANT_STATUSES.includes(status) && previousStatus !== status;
  return { shouldNotify };
}

// ======== 重複検知 ========

/**
 * 重複候補を検索
 */
export async function findDuplicateCandidates(
  data: {
    customerName?: string;
    age?: number;
    inquiryDate?: string;
    salesCompanyName?: string;
    salesRepName?: string;
  },
  excludeId?: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<Prospect[]> {
  const prospects = await getProspects(tenantId);

  const targetKey = generateProspectKey(data);
  if (!targetKey) return [];

  return prospects.filter((p) => {
    if (excludeId && p.id === excludeId) return false;

    // 完全一致
    if (p.prospectKey === targetKey) return true;

    // 部分一致（顧客名 + 年齢）
    if (
      data.customerName &&
      p.customerName &&
      data.customerName.trim().toLowerCase() === p.customerName.trim().toLowerCase() &&
      data.age &&
      p.age &&
      data.age === p.age
    ) {
      return true;
    }

    // 営業会社 + 営業担当 + 顧客名
    if (
      data.salesCompanyName &&
      p.salesCompanyName &&
      data.salesCompanyName === p.salesCompanyName &&
      data.salesRepName &&
      p.salesRepName &&
      data.salesRepName === p.salesRepName &&
      data.customerName &&
      p.customerName &&
      data.customerName.trim().toLowerCase() === p.customerName.trim().toLowerCase()
    ) {
      return true;
    }

    return false;
  });
}

/**
 * 入居希望者を統合
 */
export async function mergeProspects(
  primaryId: string,
  secondaryId: string,
  mergedData: Partial<Prospect>,
  userId: string,
  userName: string,
  userRole: UserRole
): Promise<void> {
  if (!hasMinRole(userRole, 'admin')) {
    throw new Error('統合には管理者権限が必要です');
  }

  const firestore = getDb();
  const batch = writeBatch(firestore);

  const primary = await getProspect(primaryId);
  const secondary = await getProspect(secondaryId);
  if (!primary || !secondary) throw new Error('入居希望者が見つかりません');

  // 主レコードを更新
  batch.update(doc(firestore, 'prospects', primaryId), {
    ...mergedData,
    updatedAt: Timestamp.now(),
  });

  // 副レコードに統合先を設定
  batch.update(doc(firestore, 'prospects', secondaryId), {
    duplicateOf: primaryId,
    status: 'クローズ' as ProspectStatus,
    statusNote: `${primaryId}に統合`,
    updatedAt: Timestamp.now(),
  });

  await batch.commit();

  // 監査ログ
  await createAuditLog({
    tenantId: primary.tenantId,
    actor: userId,
    actorName: userName,
    action: 'merge',
    entity: 'prospect',
    entityId: primaryId,
    diff: {
      before: { primaryId, secondaryId },
      after: { mergedInto: primaryId },
    },
    note: `${secondary.customerName || secondaryId}を${primary.customerName || primaryId}に統合`,
  });
}

// ======== Webhook処理 ========

/**
 * Webhookから入居希望者を登録
 */
export async function createProspectFromWebhook(
  payload: ProspectWebhookPayload,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<{ prospect: Prospect; duplicates: Prospect[] }> {
  const extracted = payload.extracted || {};

  // 抽出データをマッピング
  const data: Partial<Prospect> = {
    source: payload.source,
    rawTranscript: payload.raw_transcript,
    rawPayload: extracted,
    receivedAt: payload.meta?.received_at ? new Date(payload.meta.received_at) : new Date(),
    // 顧客情報
    customerName: extracted['顧客名'] as string || extracted['お名前'] as string,
    age: typeof extracted['年齢'] === 'number' ? extracted['年齢'] : parseInt(extracted['年齢'] as string) || undefined,
    gender: extracted['性別'] as Prospect['gender'],
    careLevel: extracted['介護度'] as Prospect['careLevel'] || extracted['介護度・障害区分'] as Prospect['careLevel'],
    // 費用
    budget: extracted['費用'] as string,
    budgetDetail: extracted['費用詳細'] as string,
    monthlyBudget: extracted['月額希望'] as string,
    // ADL
    adlSummary: extracted['ADL状況'] as string,
    adlDetail: extracted['ADL詳細'] as string,
    adl: {
      standing: extracted['ADL立位'] as string || extracted['立位'] as string,
      bathing: extracted['入浴'] as string,
      eating: extracted['食事'] as string,
      toileting: extracted['排泄'] as string,
      other: extracted['ADLその他'] as string,
    },
    // 状況
    debtStatus: extracted['借金有無'] as string,
    currentSituation: extracted['現在状況'] as string,
    currentAddress: extracted['現在のお住い・入院病院'] as string || extracted['現在のお住い'] as string,
    currentDetail: extracted['現在の詳細状況'] as string,
    // 入居希望
    desiredFacility: extracted['入居場所'] as string || extracted['希望施設'] as string,
    desiredMoveInDate: extracted['入居予定日'] as string,
    entertainmentWish: extracted['エント希望'] as string || extracted['エント'] as string,
    tourRequestDate: extracted['見学希望日'] as string,
    // 面談
    interviewDateTime: extracted['面談日時'] as string,
    keyPerson: extracted['キーパーソン'] as string,
    otherNotes: extracted['その他備考'] as string || extracted['その他'] as string,
    // 営業会社
    salesCompanyName: extracted['営業会社名'] as string || extracted['御社名'] as string,
    salesRepName: extracted['営業担当者名'] as string || extracted['ご担当者名'] as string,
    salesRepContact: extracted['ご連絡先'] as string,
    // 問い合わせ
    inquiryDate: extracted['問い合わせ日'] as string,
  };

  // 重複候補を検索
  const duplicates = await findDuplicateCandidates(
    {
      customerName: data.customerName,
      age: data.age,
      inquiryDate: data.inquiryDate,
      salesCompanyName: data.salesCompanyName,
      salesRepName: data.salesRepName,
    },
    undefined,
    tenantId
  );

  // 重複候補があれば設定
  if (duplicates.length > 0) {
    data.duplicateCandidates = duplicates.map((d) => d.id);
  }

  // 作成
  const prospect = await createProspect(data, undefined, 'Webhook', tenantId);

  return { prospect, duplicates };
}

// ======== 部屋管理 ========

/**
 * 部屋一覧を取得
 */
export async function getRooms(
  tenantId: string = DEFAULT_TENANT_ID,
  buildingName?: string
): Promise<Room[]> {
  const firestore = getDb();

  const q = query(
    collection(firestore, 'rooms'),
    where('tenantId', '==', tenantId)
  );

  const snapshot = await getDocs(q);

  let results = snapshot.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate(),
    } as Room;
  });

  if (buildingName) {
    results = results.filter((r) => r.buildingName === buildingName);
  }

  return results.sort((a, b) => {
    if (a.buildingName !== b.buildingName) {
      return a.buildingName.localeCompare(b.buildingName, 'ja');
    }
    return a.roomNumber.localeCompare(b.roomNumber, 'ja');
  });
}

/**
 * 部屋を作成
 */
export async function createRoom(
  data: Omit<Room, 'id' | 'createdAt' | 'updatedAt'>,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<Room> {
  const firestore = getDb();

  const roomData = {
    tenantId,
    buildingName: data.buildingName,
    roomNumber: data.roomNumber,
    status: data.status || '空室',
    expectedCareLevel: data.expectedCareLevel || null,
    note: data.note || null,
    createdAt: Timestamp.now(),
  };

  const docRef = await addDoc(collection(firestore, 'rooms'), roomData);

  return {
    id: docRef.id,
    ...roomData,
    createdAt: new Date(),
  } as Room;
}

/**
 * 部屋ステータスを更新
 */
export async function updateRoomStatus(
  id: string,
  status: RoomStatus,
  userId: string,
  userName: string,
  userRole: UserRole
): Promise<void> {
  if (!hasMinRole(userRole, 'leader')) {
    throw new Error('更新にはリーダー以上の権限が必要です');
  }

  const firestore = getDb();
  await updateDoc(doc(firestore, 'rooms', id), {
    status,
    updatedAt: Timestamp.now(),
  });
}

/**
 * 空き部屋を検索（マッチング用）
 */
export async function findAvailableRooms(
  tenantId: string = DEFAULT_TENANT_ID,
  buildingName?: string
): Promise<Room[]> {
  const rooms = await getRooms(tenantId, buildingName);
  return rooms.filter((r) => r.status === '空室');
}

// ======== 入居状況 ========

/**
 * 入居状況一覧を取得
 */
export async function getOccupancies(
  tenantId: string = DEFAULT_TENANT_ID,
  buildingName?: string
): Promise<Occupancy[]> {
  const firestore = getDb();

  const q = query(
    collection(firestore, 'occupancy'),
    where('tenantId', '==', tenantId)
  );

  const snapshot = await getDocs(q);

  let results = snapshot.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate(),
    } as Occupancy;
  });

  if (buildingName) {
    results = results.filter((o) => o.buildingName === buildingName);
  }

  return results.sort((a, b) => {
    if (a.buildingName !== b.buildingName) {
      return a.buildingName.localeCompare(b.buildingName, 'ja');
    }
    return a.roomNumber.localeCompare(b.roomNumber, 'ja');
  });
}

/**
 * 入居状況を作成
 */
export async function createOccupancy(
  data: Omit<Occupancy, 'id' | 'createdAt' | 'updatedAt'>,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<Occupancy> {
  const firestore = getDb();

  const occupancyData = {
    tenantId,
    buildingName: data.buildingName,
    roomNumber: data.roomNumber,
    roomStatus: data.roomStatus || '入居中',
    residentName: data.residentName || null,
    residentNameKana: data.residentNameKana || null,
    moveInDate: data.moveInDate || null,
    expectedCareLevel: data.expectedCareLevel || null,
    note: data.note || null,
    prospectId: data.prospectId || null,
    createdAt: Timestamp.now(),
  };

  const docRef = await addDoc(collection(firestore, 'occupancy'), occupancyData);

  return {
    id: docRef.id,
    ...occupancyData,
    createdAt: new Date(),
  } as Occupancy;
}

// ======== 監査ログ ========

/**
 * 監査ログを作成
 */
export async function createAuditLog(data: {
  tenantId: string;
  actor: string;
  actorName: string;
  action: AuditAction;
  entity: string;
  entityId: string;
  diff?: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };
  note?: string;
}): Promise<void> {
  const firestore = getDb();

  await addDoc(collection(firestore, 'auditLogs'), {
    ...data,
    diff: data.diff || null,
    note: data.note || null,
    createdAt: Timestamp.now(),
  });
}

/**
 * 監査ログを取得
 */
export async function getAuditLogs(
  tenantId: string = DEFAULT_TENANT_ID,
  filters?: {
    entity?: string;
    entityId?: string;
    actor?: string;
  },
  limitCount: number = 100
): Promise<AuditLog[]> {
  const firestore = getDb();

  const q = query(
    collection(firestore, 'auditLogs'),
    where('tenantId', '==', tenantId)
  );

  const snapshot = await getDocs(q);

  let results = snapshot.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      createdAt: data.createdAt?.toDate() || new Date(),
    } as AuditLog;
  });

  if (filters?.entity) {
    results = results.filter((l) => l.entity === filters.entity);
  }
  if (filters?.entityId) {
    results = results.filter((l) => l.entityId === filters.entityId);
  }
  if (filters?.actor) {
    results = results.filter((l) => l.actor === filters.actor);
  }

  return results
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limitCount);
}

// ======== 通知ログ ========

/**
 * 通知ログを作成
 */
export async function createNotificationLog(data: {
  tenantId: string;
  prospectId: string;
  channel: 'lineworks' | 'email';
  message: string;
  status: 'sent' | 'failed';
  error?: string;
}): Promise<void> {
  const firestore = getDb();

  await addDoc(collection(firestore, 'notificationLogs'), {
    ...data,
    error: data.error || null,
    sentAt: Timestamp.now(),
  });
}

/**
 * 最近の通知を確認（連投抑止用）
 */
export async function getRecentNotifications(
  prospectId: string,
  withinMinutes: number = 10
): Promise<NotificationLog[]> {
  const firestore = getDb();

  const q = query(
    collection(firestore, 'notificationLogs'),
    where('prospectId', '==', prospectId)
  );

  const snapshot = await getDocs(q);
  const cutoffTime = new Date(Date.now() - withinMinutes * 60 * 1000);

  return snapshot.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        sentAt: data.sentAt?.toDate() || new Date(),
      } as NotificationLog;
    })
    .filter((n) => n.sentAt > cutoffTime);
}

// ======== 旧データ管理 ========

/**
 * 旧データ（社内No 251以前）を一括でクローズにする
 * 管理者のみ実行可能
 */
export async function closeOldProspects(
  userId: string,
  userName: string,
  userRole: UserRole,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<{ closedCount: number }> {
  if (!hasMinRole(userRole, 'admin')) {
    throw new Error('管理者権限が必要です');
  }

  const firestore = getDb();

  // 全件取得（旧データ含む）
  const allProspects = await getProspects(tenantId, { includeClosedOldData: true });

  // 社内No 251以前でまだクローズでないものを抽出
  const oldProspects = allProspects.filter((p) => {
    if (!p.internalNo) return false;
    const num = parseInt(p.internalNo, 10);
    if (isNaN(num)) return false;
    return num < ACTIVE_INTERNAL_NO_THRESHOLD && p.status !== 'クローズ';
  });

  if (oldProspects.length === 0) {
    return { closedCount: 0 };
  }

  // バッチ更新
  const batch = writeBatch(firestore);
  const now = Timestamp.now();

  oldProspects.forEach((p) => {
    batch.update(doc(firestore, 'prospects', p.id), {
      status: 'クローズ' as ProspectStatus,
      statusNote: '旧データのため一括クローズ',
      updatedAt: now,
    });
  });

  await batch.commit();

  // 監査ログ
  await createAuditLog({
    tenantId,
    actor: userId,
    actorName: userName,
    action: 'update',
    entity: 'prospect',
    entityId: 'batch',
    note: `社内No ${ACTIVE_INTERNAL_NO_THRESHOLD - 1}以前の旧データ ${oldProspects.length}件を一括クローズ`,
  });

  return { closedCount: oldProspects.length };
}

// ======== 部屋ロック機能 ========

export interface RoomLock {
  roomId: string;
  caseId: string;        // 入居希望ID
  lockedAt: Date;
  lockedBy: string;
  lockedByName: string;
  lockExpireAt?: Date;   // 期限（任意）
}

/**
 * 申込時に部屋をロックする
 * トランザクションで原子的に実行
 */
export async function lockRoomForApplication(
  roomId: string,
  caseId: string,
  userId: string,
  userName: string,
  userRole: UserRole,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<{ success: boolean; error?: string }> {
  if (!hasMinRole(userRole, 'leader')) {
    throw new Error('部屋ロックにはリーダー以上の権限が必要です');
  }

  const firestore = getDb();

  // 部屋の現在状態を確認
  const roomRef = doc(firestore, 'rooms', roomId);
  const roomSnap = await getDoc(roomRef);

  if (!roomSnap.exists()) {
    return { success: false, error: '部屋が見つかりません' };
  }

  const roomData = roomSnap.data();
  const currentStatus = roomData.status as RoomStatus;

  // 空室以外はロックできない
  if (currentStatus !== '空室') {
    return {
      success: false,
      error: `この部屋は現在「${currentStatus}」のためロックできません。別の部屋を選択してください。`,
    };
  }

  // ロック（ステータスを「予約」に変更）
  const now = Timestamp.now();
  await updateDoc(roomRef, {
    status: '予約' as RoomStatus,
    lockedCaseId: caseId,
    lockedAt: now,
    lockedBy: userId,
    lockedByName: userName,
    updatedAt: now,
  });

  // 監査ログ
  await createAuditLog({
    tenantId,
    actor: userId,
    actorName: userName,
    action: 'update',
    entity: 'room',
    entityId: roomId,
    diff: {
      before: { status: '空室' },
      after: { status: '予約', lockedCaseId: caseId },
    },
    note: `入居希望 ${caseId} の申込により部屋をロック`,
  });

  return { success: true };
}

/**
 * 部屋のロックを解除する
 * 管理者またはロックした本人のみ可能
 */
export async function unlockRoom(
  roomId: string,
  userId: string,
  userName: string,
  userRole: UserRole,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<{ success: boolean; error?: string }> {
  const firestore = getDb();

  const roomRef = doc(firestore, 'rooms', roomId);
  const roomSnap = await getDoc(roomRef);

  if (!roomSnap.exists()) {
    return { success: false, error: '部屋が見つかりません' };
  }

  const roomData = roomSnap.data();

  // 予約状態でない場合は解除不要
  if (roomData.status !== '予約') {
    return { success: false, error: 'この部屋はロックされていません' };
  }

  // 管理者または本人のみ解除可能
  const isAdmin = hasMinRole(userRole, 'admin');
  const isLocker = roomData.lockedBy === userId;

  if (!isAdmin && !isLocker) {
    return { success: false, error: 'ロック解除には管理者権限、またはロックした本人である必要があります' };
  }

  const previousCaseId = roomData.lockedCaseId;

  // ロック解除
  const now = Timestamp.now();
  await updateDoc(roomRef, {
    status: '空室' as RoomStatus,
    lockedCaseId: null,
    lockedAt: null,
    lockedBy: null,
    lockedByName: null,
    updatedAt: now,
  });

  // 監査ログ
  await createAuditLog({
    tenantId,
    actor: userId,
    actorName: userName,
    action: 'update',
    entity: 'room',
    entityId: roomId,
    diff: {
      before: { status: '予約', lockedCaseId: previousCaseId },
      after: { status: '空室' },
    },
    note: 'ロック解除',
  });

  return { success: true };
}

// ======== 統計 ========

/**
 * ダッシュボード統計を取得
 * KPIは2026年以降のデータのみで算出
 */
export async function getProspectStats(
  tenantId: string = DEFAULT_TENANT_ID
): Promise<{
  total: number;
  byStatus: Record<ProspectStatus, number>;
  newThisWeek: number;
  newThisMonth: number;
  avgDaysElapsed: number;
  kpiNote: string;
}> {
  const prospects = await getProspects(tenantId);

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // KPI対象は2026年以降のデータのみ
  const kpiTargetProspects = prospects.filter((p) => isKpiTargetDate(p.receivedAt));

  const byStatus: Record<string, number> = {};
  let totalDays = 0;
  let activeCount = 0;

  // ステータス集計は全件（アクティブな社内No 252以降）
  prospects.forEach((p) => {
    byStatus[p.status] = (byStatus[p.status] || 0) + 1;
  });

  // KPIは2026以降のみ
  kpiTargetProspects.forEach((p) => {
    if (!['クローズ', '見送り', '入居決定'].includes(p.status)) {
      const days = Math.floor((now.getTime() - p.receivedAt.getTime()) / (1000 * 60 * 60 * 24));
      totalDays += days;
      activeCount++;
    }
  });

  return {
    total: prospects.length,
    byStatus: byStatus as Record<ProspectStatus, number>,
    newThisWeek: kpiTargetProspects.filter((p) => p.receivedAt > weekAgo).length,
    newThisMonth: kpiTargetProspects.filter((p) => p.receivedAt > monthAgo).length,
    avgDaysElapsed: activeCount > 0 ? Math.round(totalDays / activeCount) : 0,
    kpiNote: `KPIは${KPI_START_YEAR}年以降のデータで算出`,
  };
}
