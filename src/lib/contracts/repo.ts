/**
 * 契約管理（Contracts）リポジトリ
 *
 * Task 049: 事業別財務集計のための契約管理
 * 現状は in-memory ストレージ（将来 DB 置換）
 */

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

// ========== ストレージ ==========

const contractsStore = new Map<string, Contract>();
const eventsStore = new Map<string, ContractEvent>();

// ========== ユーティリティ ==========

function generateId(): string {
  return `contract_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateEventId(): string {
  return `cevt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function now(): string {
  return new Date().toISOString();
}

// ========== 監査ログ記録 ==========

function logEvent(
  contractId: string,
  actorUserId: string,
  action: ContractEventAction,
  beforeData: Contract | null,
  afterData: Contract | null,
  note: string | null = null
): void {
  const event: ContractEvent = {
    id: generateEventId(),
    contractId,
    actorUserId,
    action,
    beforeJson: beforeData ? JSON.stringify(beforeData) : null,
    afterJson: afterData ? JSON.stringify(afterData) : null,
    createdAt: now(),
    note,
  };
  eventsStore.set(event.id, event);
}

// ========== フィルタリング ==========

export interface ContractFilters {
  status?: ContractStatus;
  type?: ContractType;
  riskLevel?: ContractRiskLevel;
  businessUnitId?: string;
  expiringSoon?: boolean;     // 期限間近（デフォルト30日）
  warnDays?: number;          // 期限間近の日数
  decisionOverdue?: boolean;  // 更新判断期限超過
  q?: string;
}

export interface PaginationParams {
  limit: number;
  offset: number;
}

// ========== CRUD ==========

/**
 * 一覧取得
 */
export function listContracts(
  viewer: ViewerContext,
  filters: ContractFilters = {},
  pagination: PaginationParams = { limit: 50, offset: 0 }
): { items: Contract[]; total: number } {
  if (!canViewContracts(viewer.role)) {
    return { items: [], total: 0 };
  }

  let items = Array.from(contractsStore.values());

  // フィルタリング
  if (filters.status) {
    items = items.filter((c) => c.status === filters.status);
  }
  if (filters.type) {
    items = items.filter((c) => c.type === filters.type);
  }
  if (filters.riskLevel) {
    items = items.filter((c) => c.riskLevel === filters.riskLevel);
  }
  if (filters.businessUnitId) {
    items = items.filter((c) => c.businessUnitId === filters.businessUnitId);
  }
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
}

/**
 * 詳細取得
 */
export function getById(id: string, viewer: ViewerContext): Contract | null {
  if (!canViewContracts(viewer.role)) {
    return null;
  }

  return contractsStore.get(id) ?? null;
}

/**
 * 作成
 */
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

export function createContract(
  input: CreateContractInput,
  actorUserId: string
): Contract {
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

  contractsStore.set(id, contract);
  logEvent(id, actorUserId, 'create', null, contract);

  return contract;
}

/**
 * 更新
 */
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

export function updateContract(
  id: string,
  patch: UpdateContractInput,
  actorUserId: string
): Contract | null {
  const existing = contractsStore.get(id);
  if (!existing) return null;

  const updated: Contract = {
    ...existing,
    ...patch,
    updatedAt: now(),
  };

  contractsStore.set(id, updated);
  logEvent(id, actorUserId, 'update', existing, updated);

  return updated;
}

/**
 * ステータス変更
 */
export function changeStatus(
  id: string,
  status: ContractStatus,
  actorUserId: string,
  note?: string
): Contract | null {
  const existing = contractsStore.get(id);
  if (!existing) return null;

  const updated: Contract = {
    ...existing,
    status,
    updatedAt: now(),
  };

  contractsStore.set(id, updated);
  logEvent(id, actorUserId, 'status_change', existing, updated, note);

  return updated;
}

/**
 * 契約更新（renew）
 */
export function renewContract(
  id: string,
  newEndAt: string,
  actorUserId: string,
  note?: string
): Contract | null {
  const existing = contractsStore.get(id);
  if (!existing) return null;

  const updated: Contract = {
    ...existing,
    status: 'renewed',
    endAt: newEndAt,
    updatedAt: now(),
  };

  contractsStore.set(id, updated);
  logEvent(id, actorUserId, 'renew', existing, updated, note);

  return updated;
}

/**
 * 契約解約
 */
export function terminateContract(
  id: string,
  actorUserId: string,
  note?: string
): Contract | null {
  const existing = contractsStore.get(id);
  if (!existing) return null;

  const updated: Contract = {
    ...existing,
    status: 'terminated',
    updatedAt: now(),
  };

  contractsStore.set(id, updated);
  logEvent(id, actorUserId, 'terminate', existing, updated, note);

  return updated;
}

// ========== 監査ログ取得 ==========

export function getEvents(
  contractId: string,
  limit: number = 50,
  offset: number = 0
): { events: ContractEvent[]; total: number } {
  const events = Array.from(eventsStore.values())
    .filter((e) => e.contractId === contractId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const total = events.length;
  const paged = events.slice(offset, offset + limit);

  return { events: paged, total };
}

// ========== 統計 ==========

export interface ContractStats {
  total: number;
  active: number;
  expiring: number;          // warnDays以内に期限を迎える件数
  expired: number;
  decisionOverdue: number;   // 更新判断期限超過
  highRiskExpiring: number;  // high/critical かつ expiring
  countByStatus: Record<ContractStatus, number>;
  countByType: Record<ContractType, number>;
  totalAmount: number;
}

// Task 049: 統計フィルタオプション
export interface StatsFilterOptions {
  businessUnitId?: string;
  warnDays?: number;
}

export function getStats(viewer: ViewerContext, options: StatsFilterOptions = {}): ContractStats | null {
  if (!canViewStats(viewer.role)) {
    return null;
  }

  const warnDays = options.warnDays ?? 30;
  let items = Array.from(contractsStore.values());

  // Task 049: 事業単位フィルタ
  if (options.businessUnitId) {
    items = items.filter((c) => c.businessUnitId === options.businessUnitId);
  }

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
}

// ========== 期限超過スキャン ==========

export interface ExpiringContractInfo {
  contract: Contract;
  daysUntilEnd: number;
  daysUntilDecision: number | null;
}

export function scanExpiringContracts(warnDays: number = 30): ExpiringContractInfo[] {
  const items = Array.from(contractsStore.values());
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
}

export function scanDecisionOverdueContracts(): Contract[] {
  const items = Array.from(contractsStore.values());
  return items
    .filter((c) => isDecisionOverdue(c))
    .sort((a, b) => {
      // 超過日数が大きい順
      const aDate = new Date(a.renewalDecisionDueAt!);
      const bDate = new Date(b.renewalDecisionDueAt!);
      return aDate.getTime() - bDate.getTime();
    });
}

// ========== デモデータ ==========

function initDemoData(): void {
  if (contractsStore.size > 0) return;

  const demoContracts: Contract[] = [
    {
      id: 'contract_demo_001',
      businessUnitId: 'bu_001',  // 西淀川
      contractNo: 'CTR-2025-001',
      name: 'サービス利用契約（山田太郎様）',
      type: 'service',
      description: '訪問介護サービス利用契約',
      counterpartyName: '山田太郎',
      counterpartyId: 'resident_001',
      amount: 180000,
      currency: 'JPY',
      paymentTerms: '月末締め翌月15日払い',
      startAt: '2025-04-01',
      endAt: '2026-03-31',
      renewalDecisionDueAt: '2026-02-15',
      status: 'active',
      riskLevel: 'medium',
      riskNote: null,
      autoRenewal: 'manual',
      renewalTermMonths: 12,
      ownerUserId: 'user_manager',
      ownerName: '田中管理者',
      documentIds: [],
      createdByUserId: 'system',
      createdAt: '2025-04-01T09:00:00Z',
      updatedAt: '2025-04-01T09:00:00Z',
    },
    {
      id: 'contract_demo_002',
      businessUnitId: 'bu_003',  // サ高住さくら
      contractNo: 'CTR-2025-002',
      name: '建物賃貸借契約（サ高住さくら）',
      type: 'lease',
      description: 'サービス付き高齢者向け住宅の建物賃貸借',
      counterpartyName: '株式会社不動産管理',
      counterpartyId: 'company_002',
      amount: 2500000,
      currency: 'JPY',
      paymentTerms: '毎月末日払い',
      startAt: '2023-04-01',
      endAt: '2026-03-31',
      renewalDecisionDueAt: '2026-01-15',
      status: 'active',
      riskLevel: 'high',
      riskNote: '更新判断期限超過、早急に対応必要',
      autoRenewal: 'none',
      renewalTermMonths: null,
      ownerUserId: 'user_executive',
      ownerName: '佐藤部長',
      documentIds: [],
      createdByUserId: 'system',
      createdAt: '2023-04-01T09:00:00Z',
      updatedAt: '2026-01-20T10:00:00Z',
    },
    {
      id: 'contract_demo_003',
      businessUnitId: 'bu_001',  // 西淀川
      contractNo: 'CTR-2025-003',
      name: '給食業務委託契約',
      type: 'vendor',
      description: '利用者向け給食の業務委託',
      counterpartyName: '株式会社ABC給食',
      counterpartyId: 'company_003',
      amount: 850000,
      currency: 'JPY',
      paymentTerms: '月末締め翌月末払い',
      startAt: '2025-01-01',
      endAt: '2025-12-31',
      renewalDecisionDueAt: '2025-11-01',
      status: 'renewed',
      riskLevel: 'low',
      riskNote: null,
      autoRenewal: 'auto',
      renewalTermMonths: 12,
      ownerUserId: 'user_manager',
      ownerName: '田中管理者',
      documentIds: [],
      createdByUserId: 'system',
      createdAt: '2025-01-01T09:00:00Z',
      updatedAt: '2025-11-15T14:00:00Z',
    },
    {
      id: 'contract_demo_004',
      businessUnitId: 'bu_004',  // 老人ホーム
      contractNo: 'CTR-2025-004',
      name: '医療機器保守契約',
      type: 'maintenance',
      description: '施設内医療機器の定期保守',
      counterpartyName: '医療機器メンテナンス株式会社',
      counterpartyId: 'company_004',
      amount: 120000,
      currency: 'JPY',
      paymentTerms: '年払い',
      startAt: '2025-04-01',
      endAt: '2026-02-28',
      renewalDecisionDueAt: '2026-01-31',
      status: 'active',
      riskLevel: 'critical',
      riskNote: '機器故障時のリスク大、更新必須',
      autoRenewal: 'manual',
      renewalTermMonths: 12,
      ownerUserId: 'user_manager',
      ownerName: '田中管理者',
      documentIds: [],
      createdByUserId: 'system',
      createdAt: '2025-04-01T09:00:00Z',
      updatedAt: '2025-04-01T09:00:00Z',
    },
    {
      id: 'contract_demo_005',
      businessUnitId: 'bu_002',  // 東淀川
      contractNo: 'CTR-2024-010',
      name: '清掃業務委託契約',
      type: 'vendor',
      description: '施設清掃業務委託',
      counterpartyName: 'クリーンサービス株式会社',
      counterpartyId: 'company_005',
      amount: 200000,
      currency: 'JPY',
      paymentTerms: '月末締め翌月15日払い',
      startAt: '2024-04-01',
      endAt: '2025-03-31',
      renewalDecisionDueAt: '2025-02-28',
      status: 'expired',
      riskLevel: 'medium',
      riskNote: '契約期限切れ、更新交渉中',
      autoRenewal: 'none',
      renewalTermMonths: null,
      ownerUserId: 'user_leader',
      ownerName: '山田リーダー',
      documentIds: [],
      createdByUserId: 'system',
      createdAt: '2024-04-01T09:00:00Z',
      updatedAt: '2025-04-01T10:00:00Z',
    },
    {
      id: 'contract_demo_006',
      businessUnitId: null,  // 未分類
      contractNo: 'CTR-2025-006',
      name: 'システム保守契約',
      type: 'maintenance',
      description: '業務システム保守',
      counterpartyName: 'ITソリューションズ株式会社',
      counterpartyId: 'company_006',
      amount: 500000,
      currency: 'JPY',
      paymentTerms: '年払い',
      startAt: '2025-01-01',
      endAt: '2025-12-31',
      renewalDecisionDueAt: '2025-10-31',
      status: 'active',
      riskLevel: 'high',
      riskNote: null,
      autoRenewal: 'manual',
      renewalTermMonths: 12,
      ownerUserId: null,
      ownerName: null,
      documentIds: [],
      createdByUserId: 'system',
      createdAt: '2025-01-01T09:00:00Z',
      updatedAt: '2025-01-01T09:00:00Z',
    },
  ];

  demoContracts.forEach((c) => {
    contractsStore.set(c.id, c);
  });

  console.log(`[Contracts] Seeded ${demoContracts.length} records`);
}

// 初期化
initDemoData();
