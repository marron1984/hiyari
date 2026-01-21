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

// ======== 統計 ========

/**
 * ダッシュボード統計を取得
 */
export async function getProspectStats(
  tenantId: string = DEFAULT_TENANT_ID
): Promise<{
  total: number;
  byStatus: Record<ProspectStatus, number>;
  newThisWeek: number;
  newThisMonth: number;
  avgDaysElapsed: number;
}> {
  const prospects = await getProspects(tenantId);

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const byStatus: Record<string, number> = {};
  let totalDays = 0;
  let activeCount = 0;

  prospects.forEach((p) => {
    byStatus[p.status] = (byStatus[p.status] || 0) + 1;

    if (!['クローズ', '見送り', '入居決定'].includes(p.status)) {
      const days = Math.floor((now.getTime() - p.receivedAt.getTime()) / (1000 * 60 * 60 * 24));
      totalDays += days;
      activeCount++;
    }
  });

  return {
    total: prospects.length,
    byStatus: byStatus as Record<ProspectStatus, number>,
    newThisWeek: prospects.filter((p) => p.receivedAt > weekAgo).length,
    newThisMonth: prospects.filter((p) => p.receivedAt > monthAgo).length,
    avgDaysElapsed: activeCount > 0 ? Math.round(totalDays / activeCount) : 0,
  };
}
