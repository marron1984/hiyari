/**
 * キーパーソン リポジトリ
 *
 * CRUD操作と監査ログ
 * インメモリストレージ（本番ではDBに置き換え）
 */

import type {
  KeyPersonContact,
  KeyPersonEvent,
  KeyPersonSubjectType,
  CreateKeyPersonRequest,
  UpdateKeyPersonRequest,
  ViewerContext,
} from './types';
import { canViewKeyPerson } from './types';

// インメモリストレージ
const contactsStore = new Map<string, KeyPersonContact>();
const eventsStore = new Map<string, KeyPersonEvent[]>();

// ID生成
let contactIdCounter = 1;
let eventIdCounter = 1;

function generateContactId(): string {
  return `kp_${Date.now()}_${contactIdCounter++}`;
}

function generateEventId(): string {
  return `kp_evt_${Date.now()}_${eventIdCounter++}`;
}

/**
 * イベントを記録（内部）
 */
function addEvent(
  contactId: string,
  actorUserId: string,
  action: 'create' | 'update' | 'deactivate' | 'reorder',
  beforeJson: Record<string, unknown> | null,
  afterJson: Record<string, unknown> | null,
  note?: string
): void {
  const event: KeyPersonEvent = {
    id: generateEventId(),
    contactId,
    actorUserId,
    action,
    beforeJson,
    afterJson,
    createdAt: new Date().toISOString(),
    note: note ?? null,
  };
  const events = eventsStore.get(contactId) ?? [];
  events.push(event);
  eventsStore.set(contactId, events);
}

/**
 * 対象の連絡先一覧を取得
 */
export function listBySubject(
  subjectType: KeyPersonSubjectType,
  subjectId: string,
  viewer: ViewerContext
): KeyPersonContact[] {
  // RBAC
  if (!canViewKeyPerson(viewer.role)) {
    return [];
  }

  const contacts = Array.from(contactsStore.values())
    .filter(
      (c) =>
        c.subjectType === subjectType &&
        c.subjectId === subjectId &&
        c.isActive
    )
    .sort((a, b) => a.priorityOrder - b.priorityOrder);

  return contacts;
}

/**
 * IDで連絡先を取得
 */
export function getById(
  id: string,
  viewer: ViewerContext
): KeyPersonContact | null {
  if (!canViewKeyPerson(viewer.role)) {
    return null;
  }

  return contactsStore.get(id) ?? null;
}

/**
 * 連絡先を作成
 */
export function createContact(
  request: CreateKeyPersonRequest,
  actorUserId: string
): KeyPersonContact {
  const now = new Date().toISOString();

  // 優先順位を決定（指定がなければ最後尾）
  let priorityOrder = request.priorityOrder;
  if (!priorityOrder) {
    const existingContacts = Array.from(contactsStore.values()).filter(
      (c) =>
        c.subjectType === request.subjectType &&
        c.subjectId === request.subjectId &&
        c.isActive
    );
    priorityOrder = existingContacts.length + 1;
  }

  const contact: KeyPersonContact = {
    id: generateContactId(),
    subjectType: request.subjectType,
    subjectId: request.subjectId,
    priorityOrder,
    name: request.name,
    relation: request.relation ?? null,
    phone: request.phone ?? null,
    email: request.email ?? null,
    lineIdOrHint: request.lineIdOrHint ?? null,
    preferredContactType: request.preferredContactType ?? null,
    availableTimeHint: request.availableTimeHint ?? null,
    notes: request.notes ?? null,
    isEmergency: request.isEmergency ?? false,
    consentStatus: request.consentStatus ?? null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdByUserId: actorUserId,
  };

  contactsStore.set(contact.id, contact);
  addEvent(contact.id, actorUserId, 'create', null, contact as unknown as Record<string, unknown>);

  return contact;
}

/**
 * 連絡先を更新
 */
export function updateContact(
  id: string,
  patch: UpdateKeyPersonRequest,
  actorUserId: string
): KeyPersonContact | null {
  const contact = contactsStore.get(id);
  if (!contact) return null;

  const before = { ...contact };

  if (patch.name !== undefined) contact.name = patch.name;
  if (patch.relation !== undefined) contact.relation = patch.relation;
  if (patch.phone !== undefined) contact.phone = patch.phone;
  if (patch.email !== undefined) contact.email = patch.email;
  if (patch.lineIdOrHint !== undefined) contact.lineIdOrHint = patch.lineIdOrHint;
  if (patch.preferredContactType !== undefined)
    contact.preferredContactType = patch.preferredContactType;
  if (patch.availableTimeHint !== undefined)
    contact.availableTimeHint = patch.availableTimeHint;
  if (patch.notes !== undefined) contact.notes = patch.notes;
  if (patch.isEmergency !== undefined) contact.isEmergency = patch.isEmergency;
  if (patch.consentStatus !== undefined) contact.consentStatus = patch.consentStatus;

  contact.updatedAt = new Date().toISOString();
  contactsStore.set(id, contact);

  addEvent(
    id,
    actorUserId,
    'update',
    before as unknown as Record<string, unknown>,
    contact as unknown as Record<string, unknown>
  );

  return contact;
}

/**
 * 連絡先を無効化
 */
export function deactivateContact(
  id: string,
  actorUserId: string
): KeyPersonContact | null {
  const contact = contactsStore.get(id);
  if (!contact) return null;

  const before = { ...contact };

  contact.isActive = false;
  contact.updatedAt = new Date().toISOString();
  contactsStore.set(id, contact);

  addEvent(
    id,
    actorUserId,
    'deactivate',
    before as unknown as Record<string, unknown>,
    contact as unknown as Record<string, unknown>
  );

  // 残りの連絡先の優先順位を詰める
  reorderAfterDeactivate(
    contact.subjectType,
    contact.subjectId,
    actorUserId
  );

  return contact;
}

/**
 * 無効化後の優先順位再調整（内部）
 */
function reorderAfterDeactivate(
  subjectType: KeyPersonSubjectType,
  subjectId: string,
  actorUserId: string
): void {
  const activeContacts = Array.from(contactsStore.values())
    .filter(
      (c) =>
        c.subjectType === subjectType &&
        c.subjectId === subjectId &&
        c.isActive
    )
    .sort((a, b) => a.priorityOrder - b.priorityOrder);

  activeContacts.forEach((contact, index) => {
    const newOrder = index + 1;
    if (contact.priorityOrder !== newOrder) {
      contact.priorityOrder = newOrder;
      contact.updatedAt = new Date().toISOString();
      contactsStore.set(contact.id, contact);
    }
  });
}

/**
 * 連絡先の並び替え
 */
export function reorderContacts(
  subjectType: KeyPersonSubjectType,
  subjectId: string,
  orderedIds: string[],
  actorUserId: string
): KeyPersonContact[] {
  const contacts: KeyPersonContact[] = [];

  orderedIds.forEach((id, index) => {
    const contact = contactsStore.get(id);
    if (
      contact &&
      contact.subjectType === subjectType &&
      contact.subjectId === subjectId &&
      contact.isActive
    ) {
      const before = { ...contact };
      contact.priorityOrder = index + 1;
      contact.updatedAt = new Date().toISOString();
      contactsStore.set(id, contact);

      addEvent(
        id,
        actorUserId,
        'reorder',
        before as unknown as Record<string, unknown>,
        contact as unknown as Record<string, unknown>,
        `優先順位を ${before.priorityOrder} から ${contact.priorityOrder} に変更`
      );

      contacts.push(contact);
    }
  });

  return contacts.sort((a, b) => a.priorityOrder - b.priorityOrder);
}

/**
 * 第1連絡先を取得
 */
export function getPrimaryContact(
  subjectType: KeyPersonSubjectType,
  subjectId: string
): KeyPersonContact | null {
  for (const contact of contactsStore.values()) {
    if (
      contact.subjectType === subjectType &&
      contact.subjectId === subjectId &&
      contact.priorityOrder === 1 &&
      contact.isActive
    ) {
      return contact;
    }
  }
  return null;
}

/**
 * 監査ログを取得
 */
export function getAuditTrail(
  contactId: string,
  limit = 50,
  offset = 0
): { events: KeyPersonEvent[]; total: number } {
  const allEvents = eventsStore.get(contactId) ?? [];
  const sorted = allEvents.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return {
    events: sorted.slice(offset, offset + limit),
    total: allEvents.length,
  };
}

/**
 * 利用者一覧を取得（キーパーソンが登録されている）
 */
export function getSubjectsWithContacts(): { subjectType: KeyPersonSubjectType; subjectId: string; contactCount: number }[] {
  const subjectMap = new Map<string, number>();

  for (const contact of contactsStore.values()) {
    if (contact.isActive) {
      const key = `${contact.subjectType}:${contact.subjectId}`;
      subjectMap.set(key, (subjectMap.get(key) ?? 0) + 1);
    }
  }

  return Array.from(subjectMap.entries()).map(([key, count]) => {
    const [subjectType, subjectId] = key.split(':');
    return {
      subjectType: subjectType as KeyPersonSubjectType,
      subjectId,
      contactCount: count,
    };
  });
}

/**
 * 第1連絡先が未設定の利用者をスキャン
 */
export function scanMissingPrimaryContacts(): { subjectType: KeyPersonSubjectType; subjectId: string }[] {
  const subjects = getSubjectsWithContacts();
  return subjects.filter((s) => {
    const primary = getPrimaryContact(s.subjectType, s.subjectId);
    return !primary;
  });
}

// ===== デモデータ =====
function initDemoData() {
  const now = new Date().toISOString();

  const demoContacts: Omit<KeyPersonContact, 'id' | 'createdAt' | 'updatedAt'>[] = [
    // client_001 の連絡先
    {
      subjectType: 'client',
      subjectId: 'client_001',
      priorityOrder: 1,
      name: '山田花子',
      relation: '長女',
      phone: '090-1234-5678',
      email: 'hanako.yamada@example.com',
      lineIdOrHint: null,
      preferredContactType: 'phone',
      availableTimeHint: '平日18時以降',
      notes: 'お仕事の関係で日中は電話に出られないことが多い',
      isEmergency: true,
      consentStatus: 'granted',
      isActive: true,
      createdByUserId: 'user_manager',
    },
    {
      subjectType: 'client',
      subjectId: 'client_001',
      priorityOrder: 2,
      name: '山田太郎',
      relation: '長男',
      phone: '080-9876-5432',
      email: 'taro.yamada@example.com',
      lineIdOrHint: 'yamada_taro',
      preferredContactType: 'line',
      availableTimeHint: null,
      notes: null,
      isEmergency: false,
      consentStatus: 'granted',
      isActive: true,
      createdByUserId: 'user_manager',
    },
    // client_002 の連絡先
    {
      subjectType: 'client',
      subjectId: 'client_002',
      priorityOrder: 1,
      name: '鈴木良子',
      relation: '妻',
      phone: '03-1234-5678',
      email: null,
      lineIdOrHint: null,
      preferredContactType: 'phone',
      availableTimeHint: '午前中推奨',
      notes: '耳が少し遠いのでゆっくり話してください',
      isEmergency: true,
      consentStatus: 'granted',
      isActive: true,
      createdByUserId: 'user_manager',
    },
    // client_003 の連絡先
    {
      subjectType: 'client',
      subjectId: 'client_003',
      priorityOrder: 1,
      name: '佐藤一郎',
      relation: '長男',
      phone: '070-1111-2222',
      email: 'ichiro.sato@example.com',
      lineIdOrHint: null,
      preferredContactType: 'email',
      availableTimeHint: 'メールでの連絡希望',
      notes: '電話よりメールを好む。緊急時のみ電話可。',
      isEmergency: true,
      consentStatus: 'granted',
      isActive: true,
      createdByUserId: 'user_manager',
    },
    {
      subjectType: 'client',
      subjectId: 'client_003',
      priorityOrder: 2,
      name: '佐藤次郎',
      relation: '次男',
      phone: '070-3333-4444',
      email: null,
      lineIdOrHint: null,
      preferredContactType: 'phone',
      availableTimeHint: null,
      notes: '長男と連絡が取れない場合のみ連絡',
      isEmergency: false,
      consentStatus: 'unknown',
      isActive: true,
      createdByUserId: 'user_manager',
    },
    // client_004 の連絡先
    {
      subjectType: 'client',
      subjectId: 'client_004',
      priorityOrder: 1,
      name: '田中美智子',
      relation: '長男の妻',
      phone: '090-5555-6666',
      email: 'michiko.tanaka@example.com',
      lineIdOrHint: null,
      preferredContactType: 'any',
      availableTimeHint: null,
      notes: '長男が海外出張中のため、当面の連絡窓口',
      isEmergency: true,
      consentStatus: 'granted',
      isActive: true,
      createdByUserId: 'user_manager',
    },
  ];

  for (const data of demoContacts) {
    const contact: KeyPersonContact = {
      id: generateContactId(),
      ...data,
      createdAt: now,
      updatedAt: now,
    };
    contactsStore.set(contact.id, contact);
    addEvent(contact.id, data.createdByUserId, 'create', null, contact as unknown as Record<string, unknown>);
  }
}

// 初期化
initDemoData();
