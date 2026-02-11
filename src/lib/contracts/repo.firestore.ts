/**
 * 契約管理（Contracts）Firestoreリポジトリ
 *
 * PROD-003: Cloud Firestore永続化
 *
 * コレクション:
 * - contracts: 契約本体
 * - contract_clauses: 条項（将来拡張用）
 * - contract_events: 監査ログ
 */

import { getAdminDb } from '@/lib/firebase-admin';
import type {
  Contract,
  ContractEvent,
  ContractType,
  ContractStatus,
  ContractRiskLevel,
  AutoRenewalType,
  ContractEventAction,
  ViewerContext,
} from './types';
import {
  canViewContracts,
  canViewStats,
  isExpiringSoon,
  isExpired,
  isDecisionOverdue,
} from './types';

// ========== 定数 ==========

const CONTRACTS_COLLECTION = 'contracts';
const EVENTS_COLLECTION = 'contract_events';

// ========== ユーティリティ ==========

function now(): string {
  return new Date().toISOString();
}

function generateId(): string {
  return `contract_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateEventId(): string {
  return `cevt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ========== ドキュメント変換 ==========

function docToContract(doc: FirebaseFirestore.DocumentSnapshot): Contract {
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    businessUnitId: data.businessUnitId ?? null,
    contractNo: data.contractNo ?? null,
    name: data.name ?? '',
    type: data.type ?? 'other',
    description: data.description ?? null,
    counterpartyName: data.counterpartyName ?? '',
    counterpartyId: data.counterpartyId ?? null,
    amount: data.amount ?? null,
    currency: data.currency ?? 'JPY',
    paymentTerms: data.paymentTerms ?? null,
    startAt: data.startAt ?? '',
    endAt: data.endAt ?? '',
    renewalDecisionDueAt: data.renewalDecisionDueAt ?? null,
    status: data.status ?? 'draft',
    riskLevel: data.riskLevel ?? 'low',
    riskNote: data.riskNote ?? null,
    autoRenewal: data.autoRenewal ?? 'none',
    renewalTermMonths: data.renewalTermMonths ?? null,
    ownerUserId: data.ownerUserId ?? null,
    ownerName: data.ownerName ?? null,
    documentIds: data.documentIds ?? [],
    createdByUserId: data.createdByUserId ?? '',
    createdAt: data.createdAt ?? now(),
    updatedAt: data.updatedAt ?? now(),
  };
}

function docToEvent(doc: FirebaseFirestore.DocumentSnapshot): ContractEvent {
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    contractId: data.contractId ?? '',
    actorUserId: data.actorUserId ?? '',
    action: data.action ?? 'create',
    beforeJson: data.beforeJson ?? null,
    afterJson: data.afterJson ?? null,
    createdAt: data.createdAt ?? now(),
    note: data.note ?? null,
  };
}

// ========== 監査ログ記録 ==========

async function logEvent(
  contractId: string,
  actorUserId: string,
  action: ContractEventAction,
  beforeData: Contract | null,
  afterData: Contract | null,
  note: string | null = null
): Promise<void> {
  try {
    const db = getAdminDb();
    const eventId = generateEventId();
    const event: ContractEvent = {
      id: eventId,
      contractId,
      actorUserId,
      action,
      beforeJson: beforeData ? JSON.stringify(beforeData) : null,
      afterJson: afterData ? JSON.stringify(afterData) : null,
      createdAt: now(),
      note,
    };
    await db.collection(EVENTS_COLLECTION).doc(eventId).set(event);
  } catch (error) {
    console.error('[Contracts:Firestore] logEvent error:', error);
  }
}

// ========== フィルタリング（re-export for consumers） ==========

export interface ContractFilters {
  status?: ContractStatus;
  type?: ContractType;
  riskLevel?: ContractRiskLevel;
  businessUnitId?: string;
  expiringSoon?: boolean;
  warnDays?: number;
  decisionOverdue?: boolean;
  q?: string;
}

export interface PaginationParams {
  limit: number;
  offset: number;
}

// ========== CRUD ==========

export async function listContracts(
  viewer: ViewerContext,
  filters: ContractFilters = {},
  pagination: PaginationParams = { limit: 50, offset: 0 }
): Promise<{ items: Contract[]; total: number }> {
  if (!canViewContracts(viewer.role)) {
    return { items: [], total: 0 };
  }

  try {
    const db = getAdminDb();
    let query: FirebaseFirestore.Query = db.collection(CONTRACTS_COLLECTION);

    // Firestoreフィルタ
    if (filters.status) {
      query = query.where('status', '==', filters.status);
    }
    if (filters.type) {
      query = query.where('type', '==', filters.type);
    }
    if (filters.riskLevel) {
      query = query.where('riskLevel', '==', filters.riskLevel);
    }
    if (filters.businessUnitId) {
      query = query.where('businessUnitId', '==', filters.businessUnitId);
    }

    const snapshot = await query.get();
    let items = snapshot.docs.map(docToContract);

    // メモリ内フィルタリング
    if (filters.expiringSoon) {
      const warnDays = filters.warnDays ?? 30;
      items = items.filter((c) => isExpiringSoon(c, warnDays));
    }
    if (filters.decisionOverdue) {
      items = items.filter((c) => isDecisionOverdue(c));
    }
    if (filters.q) {
      const q = filters.q.toLowerCase();
      items = items.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.counterpartyName.toLowerCase().includes(q) ||
          (c.contractNo && c.contractNo.toLowerCase().includes(q))
      );
    }

    // ソート: 終了日が近い順
    items.sort((a, b) => new Date(a.endAt).getTime() - new Date(b.endAt).getTime());

    const total = items.length;
    const paged = items.slice(pagination.offset, pagination.offset + pagination.limit);

    return { items: paged, total };
  } catch (error) {
    console.error('[Contracts:Firestore] listContracts error:', error);
    return { items: [], total: 0 };
  }
}

export async function getById(id: string, viewer: ViewerContext): Promise<Contract | null> {
  if (!canViewContracts(viewer.role)) {
    return null;
  }

  try {
    const db = getAdminDb();
    const doc = await db.collection(CONTRACTS_COLLECTION).doc(id).get();
    if (!doc.exists) return null;
    return docToContract(doc);
  } catch (error) {
    console.error('[Contracts:Firestore] getById error:', error);
    return null;
  }
}

// ========== 作成 ==========

export interface CreateContractInput {
  businessUnitId?: string | null;
  contractNo?: string | null;
  name: string;
  type: ContractType;
  description?: string | null;
  counterpartyName: string;
  counterpartyId?: string | null;
  amount?: number | null;
  paymentTerms?: string | null;
  startAt: string;
  endAt: string;
  renewalDecisionDueAt?: string | null;
  status?: ContractStatus;
  riskLevel?: ContractRiskLevel;
  riskNote?: string | null;
  autoRenewal?: AutoRenewalType;
  renewalTermMonths?: number | null;
  ownerUserId?: string | null;
  documentIds?: string[];
}

export async function createContract(
  input: CreateContractInput,
  actorUserId: string
): Promise<Contract> {
  const db = getAdminDb();
  const id = generateId();
  const timestamp = now();

  const contract: Contract = {
    id,
    businessUnitId: input.businessUnitId ?? null,
    contractNo: input.contractNo ?? null,
    name: input.name,
    type: input.type,
    description: input.description ?? null,
    counterpartyName: input.counterpartyName,
    counterpartyId: input.counterpartyId ?? null,
    amount: input.amount ?? null,
    currency: 'JPY',
    paymentTerms: input.paymentTerms ?? null,
    startAt: input.startAt,
    endAt: input.endAt,
    renewalDecisionDueAt: input.renewalDecisionDueAt ?? null,
    status: input.status ?? 'active',
    riskLevel: input.riskLevel ?? 'low',
    riskNote: input.riskNote ?? null,
    autoRenewal: input.autoRenewal ?? 'none',
    renewalTermMonths: input.renewalTermMonths ?? null,
    ownerUserId: input.ownerUserId ?? null,
    ownerName: null,
    documentIds: input.documentIds ?? [],
    createdByUserId: actorUserId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await db.collection(CONTRACTS_COLLECTION).doc(id).set(contract);
  await logEvent(id, actorUserId, 'create', null, contract);

  return contract;
}

// ========== 更新 ==========

export interface UpdateContractInput {
  businessUnitId?: string | null;
  contractNo?: string | null;
  name?: string;
  type?: ContractType;
  description?: string | null;
  counterpartyName?: string;
  counterpartyId?: string | null;
  amount?: number | null;
  paymentTerms?: string | null;
  startAt?: string;
  endAt?: string;
  renewalDecisionDueAt?: string | null;
  riskLevel?: ContractRiskLevel;
  riskNote?: string | null;
  autoRenewal?: AutoRenewalType;
  renewalTermMonths?: number | null;
  ownerUserId?: string | null;
  documentIds?: string[];
}

export async function updateContract(
  id: string,
  patch: UpdateContractInput,
  actorUserId: string
): Promise<Contract | null> {
  try {
    const db = getAdminDb();
    const docRef = db.collection(CONTRACTS_COLLECTION).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) return null;

    const existing = docToContract(doc);
    const updated: Contract = {
      ...existing,
      ...patch,
      updatedAt: now(),
    };

    await docRef.set(updated);
    await logEvent(id, actorUserId, 'update', existing, updated);

    return updated;
  } catch (error) {
    console.error('[Contracts:Firestore] updateContract error:', error);
    return null;
  }
}

// ========== ステータス変更 ==========

export async function changeStatus(
  id: string,
  status: ContractStatus,
  actorUserId: string,
  note?: string
): Promise<Contract | null> {
  try {
    const db = getAdminDb();
    const docRef = db.collection(CONTRACTS_COLLECTION).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) return null;

    const existing = docToContract(doc);
    const updated: Contract = {
      ...existing,
      status,
      updatedAt: now(),
    };

    await docRef.set(updated);
    await logEvent(id, actorUserId, 'status_change', existing, updated, note ?? null);

    return updated;
  } catch (error) {
    console.error('[Contracts:Firestore] changeStatus error:', error);
    return null;
  }
}

// ========== 契約更新（renew） ==========

export async function renewContract(
  id: string,
  newEndAt: string,
  actorUserId: string,
  note?: string
): Promise<Contract | null> {
  try {
    const db = getAdminDb();
    const docRef = db.collection(CONTRACTS_COLLECTION).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) return null;

    const existing = docToContract(doc);
    const updated: Contract = {
      ...existing,
      status: 'renewed',
      endAt: newEndAt,
      updatedAt: now(),
    };

    await docRef.set(updated);
    await logEvent(id, actorUserId, 'renew', existing, updated, note ?? null);

    return updated;
  } catch (error) {
    console.error('[Contracts:Firestore] renewContract error:', error);
    return null;
  }
}

// ========== 契約解約 ==========

export async function terminateContract(
  id: string,
  actorUserId: string,
  note?: string
): Promise<Contract | null> {
  try {
    const db = getAdminDb();
    const docRef = db.collection(CONTRACTS_COLLECTION).doc(id);
    const doc = await docRef.get();

    if (!doc.exists) return null;

    const existing = docToContract(doc);
    const updated: Contract = {
      ...existing,
      status: 'terminated',
      updatedAt: now(),
    };

    await docRef.set(updated);
    await logEvent(id, actorUserId, 'terminate', existing, updated, note ?? null);

    return updated;
  } catch (error) {
    console.error('[Contracts:Firestore] terminateContract error:', error);
    return null;
  }
}

// ========== 監査ログ取得 ==========

export async function getEvents(
  contractId: string,
  limit: number = 50,
  offset: number = 0
): Promise<{ events: ContractEvent[]; total: number }> {
  try {
    const db = getAdminDb();
    const snapshot = await db
      .collection(EVENTS_COLLECTION)
      .where('contractId', '==', contractId)
      .orderBy('createdAt', 'desc')
      .get();

    const events = snapshot.docs.map(docToEvent);
    const total = events.length;
    const paged = events.slice(offset, offset + limit);

    return { events: paged, total };
  } catch (error) {
    console.error('[Contracts:Firestore] getEvents error:', error);
    return { events: [], total: 0 };
  }
}

// ========== 統計 ==========

export interface ContractStats {
  total: number;
  active: number;
  expiring: number;
  expired: number;
  decisionOverdue: number;
  highRiskExpiring: number;
  countByStatus: Record<ContractStatus, number>;
  countByType: Record<ContractType, number>;
  totalAmount: number;
}

export interface StatsFilterOptions {
  businessUnitId?: string;
  warnDays?: number;
}

export async function getStats(viewer: ViewerContext, options: StatsFilterOptions = {}): Promise<ContractStats | null> {
  if (!canViewStats(viewer.role)) {
    return null;
  }

  try {
    const db = getAdminDb();
    let query: FirebaseFirestore.Query = db.collection(CONTRACTS_COLLECTION);

    if (options.businessUnitId) {
      query = query.where('businessUnitId', '==', options.businessUnitId);
    }

    const snapshot = await query.get();
    const items = snapshot.docs.map(docToContract);
    const warnDays = options.warnDays ?? 30;

    const countByStatus: Record<ContractStatus, number> = {
      draft: 0,
      pending: 0,
      active: 0,
      expiring: 0,
      expired: 0,
      renewed: 0,
      terminated: 0,
    };

    const countByType: Record<ContractType, number> = {
      service: 0,
      lease: 0,
      maintenance: 0,
      vendor: 0,
      employment: 0,
      other: 0,
    };

    let expiring = 0;
    let expired = 0;
    let decisionOverdue = 0;
    let highRiskExpiring = 0;

    items.forEach((c) => {
      countByStatus[c.status]++;
      countByType[c.type]++;

      if (isExpiringSoon(c, warnDays)) {
        expiring++;
        if (['high', 'critical'].includes(c.riskLevel)) {
          highRiskExpiring++;
        }
      }

      if (isExpired(c)) {
        expired++;
      }

      if (isDecisionOverdue(c)) {
        decisionOverdue++;
      }
    });

    return {
      total: items.length,
      active: countByStatus.active,
      expiring,
      expired,
      decisionOverdue,
      highRiskExpiring,
      countByStatus,
      countByType,
      totalAmount: items.reduce((sum, c) => sum + (c.amount ?? 0), 0),
    };
  } catch (error) {
    console.error('[Contracts:Firestore] getStats error:', error);
    return null;
  }
}

// ========== 期限超過スキャン ==========

export interface ExpiringContractInfo {
  contract: Contract;
  daysUntilEnd: number;
  daysUntilDecision: number | null;
}

export async function scanExpiringContracts(warnDays: number = 30): Promise<ExpiringContractInfo[]> {
  try {
    const db = getAdminDb();
    const snapshot = await db.collection(CONTRACTS_COLLECTION).get();
    const items = snapshot.docs.map(docToContract);
    const expiringInfos: ExpiringContractInfo[] = [];

    for (const contract of items) {
      if (!isExpiringSoon(contract, warnDays)) continue;

      const today = new Date();
      const endDate = new Date(contract.endAt);
      const daysUntilEnd = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      let daysUntilDecision: number | null = null;
      if (contract.renewalDecisionDueAt) {
        const decisionDate = new Date(contract.renewalDecisionDueAt);
        daysUntilDecision = Math.ceil((decisionDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      }

      expiringInfos.push({
        contract,
        daysUntilEnd,
        daysUntilDecision,
      });
    }

    // 終了日が近い順
    expiringInfos.sort((a, b) => a.daysUntilEnd - b.daysUntilEnd);

    return expiringInfos;
  } catch (error) {
    console.error('[Contracts:Firestore] scanExpiringContracts error:', error);
    return [];
  }
}

export async function scanDecisionOverdueContracts(): Promise<Contract[]> {
  try {
    const db = getAdminDb();
    const snapshot = await db.collection(CONTRACTS_COLLECTION).get();
    const items = snapshot.docs.map(docToContract);

    return items
      .filter((c) => isDecisionOverdue(c))
      .sort((a, b) => {
        const aDate = new Date(a.renewalDecisionDueAt!);
        const bDate = new Date(b.renewalDecisionDueAt!);
        return aDate.getTime() - bDate.getTime();
      });
  } catch (error) {
    console.error('[Contracts:Firestore] scanDecisionOverdueContracts error:', error);
    return [];
  }
}
