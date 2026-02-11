/**
 * キーパーソン Firestoreリポジトリ
 *
 * PROD-003: 本番永続化
 *
 * コレクション: key_persons, key_person_events
 *
 * 対応関数:
 * - listBySubject / getById: 閲覧
 * - createContact / updateContact / deactivateContact: CRUD
 * - reorderContacts: 並び替え
 * - getPrimaryContact: 第1連絡先
 * - getAuditTrail: 監査ログ
 * - getSubjectsWithContacts / scanMissingPrimaryContacts: スキャン
 */

import { getAdminDb } from '@/lib/firebase-admin';
import type {
  KeyPersonContact,
  KeyPersonEvent,
  KeyPersonSubjectType,
  CreateKeyPersonRequest,
  UpdateKeyPersonRequest,
  ViewerContext,
} from './types';
import { canViewKeyPerson } from './types';

// ========== 定数 ==========

const CONTACTS_COLLECTION = 'key_persons';
const EVENTS_COLLECTION = 'key_person_events';

// ========== ユーティリティ ==========

function now(): string {
  return new Date().toISOString();
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ========== ドキュメント変換 ==========

function docToContact(doc: FirebaseFirestore.DocumentSnapshot): KeyPersonContact | null {
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    subjectType: data.subjectType ?? 'client',
    subjectId: data.subjectId ?? '',
    priorityOrder: data.priorityOrder ?? 1,
    name: data.name ?? '',
    relation: data.relation ?? null,
    phone: data.phone ?? null,
    email: data.email ?? null,
    lineIdOrHint: data.lineIdOrHint ?? null,
    preferredContactType: data.preferredContactType ?? null,
    availableTimeHint: data.availableTimeHint ?? null,
    notes: data.notes ?? null,
    isEmergency: data.isEmergency ?? false,
    consentStatus: data.consentStatus ?? null,
    isActive: data.isActive ?? true,
    createdAt: data.createdAt ?? now(),
    updatedAt: data.updatedAt ?? now(),
    createdByUserId: data.createdByUserId ?? 'unknown',
  };
}

function docToEvent(doc: FirebaseFirestore.DocumentSnapshot): KeyPersonEvent | null {
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    contactId: data.contactId ?? '',
    actorUserId: data.actorUserId ?? '',
    action: data.action ?? 'update',
    beforeJson: data.beforeJson ?? null,
    afterJson: data.afterJson ?? null,
    createdAt: data.createdAt ?? now(),
    note: data.note ?? null,
  };
}

// ========== 監査ログ (内部) ==========

async function addEvent(
  contactId: string,
  actorUserId: string,
  action: 'create' | 'update' | 'deactivate' | 'reorder',
  beforeJson: Record<string, unknown> | null,
  afterJson: Record<string, unknown> | null,
  note?: string
): Promise<void> {
  try {
    const db = getAdminDb();
    const eventId = generateId('kp_evt');
    const event: KeyPersonEvent = {
      id: eventId,
      contactId,
      actorUserId,
      action,
      beforeJson,
      afterJson,
      createdAt: now(),
      note: note ?? null,
    };
    await db.collection(EVENTS_COLLECTION).doc(eventId).set(event);
  } catch (error) {
    console.error('[KeyPerson:Firestore] addEvent error:', error);
  }
}

// ========== 閲覧 ==========

/**
 * 対象の連絡先一覧を取得
 */
export async function listBySubject(
  subjectType: KeyPersonSubjectType,
  subjectId: string,
  viewer: ViewerContext
): Promise<KeyPersonContact[]> {
  if (!canViewKeyPerson(viewer.role)) {
    return [];
  }

  try {
    const db = getAdminDb();
    const snap = await db
      .collection(CONTACTS_COLLECTION)
      .where('subjectType', '==', subjectType)
      .where('subjectId', '==', subjectId)
      .where('isActive', '==', true)
      .get();

    const contacts = snap.docs.map((d) => docToContact(d)!).filter(Boolean);
    contacts.sort((a, b) => a.priorityOrder - b.priorityOrder);

    return contacts;
  } catch (error) {
    console.error('[KeyPerson:Firestore] listBySubject error:', error);
    return [];
  }
}

/**
 * IDで連絡先を取得
 */
export async function getById(
  id: string,
  viewer: ViewerContext
): Promise<KeyPersonContact | null> {
  if (!canViewKeyPerson(viewer.role)) {
    return null;
  }

  try {
    const db = getAdminDb();
    const doc = await db.collection(CONTACTS_COLLECTION).doc(id).get();
    return docToContact(doc);
  } catch (error) {
    console.error('[KeyPerson:Firestore] getById error:', error);
    return null;
  }
}

// ========== CRUD ==========

/**
 * 連絡先を作成
 */
export async function createContact(
  request: CreateKeyPersonRequest,
  actorUserId: string
): Promise<KeyPersonContact> {
  const db = getAdminDb();
  const timestamp = now();

  // 優先順位を決定（指定がなければ最後尾）
  let priorityOrder = request.priorityOrder;
  if (!priorityOrder) {
    try {
      const existingSnap = await db
        .collection(CONTACTS_COLLECTION)
        .where('subjectType', '==', request.subjectType)
        .where('subjectId', '==', request.subjectId)
        .where('isActive', '==', true)
        .get();
      priorityOrder = existingSnap.size + 1;
    } catch {
      priorityOrder = 1;
    }
  }

  const contactId = generateId('kp');
  const contact: KeyPersonContact = {
    id: contactId,
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
    createdAt: timestamp,
    updatedAt: timestamp,
    createdByUserId: actorUserId,
  };

  await db.collection(CONTACTS_COLLECTION).doc(contactId).set(contact);
  await addEvent(contactId, actorUserId, 'create', null, contact as unknown as Record<string, unknown>);

  return contact;
}

/**
 * 連絡先を更新
 */
export async function updateContact(
  id: string,
  patch: UpdateKeyPersonRequest,
  actorUserId: string
): Promise<KeyPersonContact | null> {
  try {
    const db = getAdminDb();
    const docRef = db.collection(CONTACTS_COLLECTION).doc(id);
    const doc = await docRef.get();
    const contact = docToContact(doc);

    if (!contact) return null;

    const before = { ...contact } as unknown as Record<string, unknown>;

    const updateData: Record<string, unknown> = {
      updatedAt: now(),
    };

    if (patch.name !== undefined) updateData.name = patch.name;
    if (patch.relation !== undefined) updateData.relation = patch.relation;
    if (patch.phone !== undefined) updateData.phone = patch.phone;
    if (patch.email !== undefined) updateData.email = patch.email;
    if (patch.lineIdOrHint !== undefined) updateData.lineIdOrHint = patch.lineIdOrHint;
    if (patch.preferredContactType !== undefined) updateData.preferredContactType = patch.preferredContactType;
    if (patch.availableTimeHint !== undefined) updateData.availableTimeHint = patch.availableTimeHint;
    if (patch.notes !== undefined) updateData.notes = patch.notes;
    if (patch.isEmergency !== undefined) updateData.isEmergency = patch.isEmergency;
    if (patch.consentStatus !== undefined) updateData.consentStatus = patch.consentStatus;

    await docRef.update(updateData);

    const updatedDoc = await docRef.get();
    const updated = docToContact(updatedDoc);

    if (updated) {
      await addEvent(
        id,
        actorUserId,
        'update',
        before,
        updated as unknown as Record<string, unknown>
      );
    }

    return updated;
  } catch (error) {
    console.error('[KeyPerson:Firestore] updateContact error:', error);
    return null;
  }
}

/**
 * 連絡先を無効化
 */
export async function deactivateContact(
  id: string,
  actorUserId: string
): Promise<KeyPersonContact | null> {
  try {
    const db = getAdminDb();
    const docRef = db.collection(CONTACTS_COLLECTION).doc(id);
    const doc = await docRef.get();
    const contact = docToContact(doc);

    if (!contact) return null;

    const before = { ...contact } as unknown as Record<string, unknown>;

    await docRef.update({
      isActive: false,
      updatedAt: now(),
    });

    const updatedDoc = await docRef.get();
    const updated = docToContact(updatedDoc);

    if (updated) {
      await addEvent(
        id,
        actorUserId,
        'deactivate',
        before,
        updated as unknown as Record<string, unknown>
      );
    }

    // 残りの連絡先の優先順位を詰める
    if (contact) {
      await reorderAfterDeactivate(
        contact.subjectType,
        contact.subjectId,
        actorUserId
      );
    }

    return updated;
  } catch (error) {
    console.error('[KeyPerson:Firestore] deactivateContact error:', error);
    return null;
  }
}

/**
 * 無効化後の優先順位再調整（内部）
 */
async function reorderAfterDeactivate(
  subjectType: KeyPersonSubjectType,
  subjectId: string,
  actorUserId: string
): Promise<void> {
  try {
    const db = getAdminDb();
    const snap = await db
      .collection(CONTACTS_COLLECTION)
      .where('subjectType', '==', subjectType)
      .where('subjectId', '==', subjectId)
      .where('isActive', '==', true)
      .get();

    const contacts = snap.docs
      .map((d) => docToContact(d)!)
      .filter(Boolean)
      .sort((a, b) => a.priorityOrder - b.priorityOrder);

    for (let i = 0; i < contacts.length; i++) {
      const newOrder = i + 1;
      if (contacts[i].priorityOrder !== newOrder) {
        await db.collection(CONTACTS_COLLECTION).doc(contacts[i].id).update({
          priorityOrder: newOrder,
          updatedAt: now(),
        });
      }
    }
  } catch (error) {
    console.error('[KeyPerson:Firestore] reorderAfterDeactivate error:', error);
  }
}

/**
 * 連絡先の並び替え
 */
export async function reorderContacts(
  subjectType: KeyPersonSubjectType,
  subjectId: string,
  orderedIds: string[],
  actorUserId: string
): Promise<KeyPersonContact[]> {
  try {
    const db = getAdminDb();
    const contacts: KeyPersonContact[] = [];

    for (let i = 0; i < orderedIds.length; i++) {
      const id = orderedIds[i];
      const docRef = db.collection(CONTACTS_COLLECTION).doc(id);
      const doc = await docRef.get();
      const contact = docToContact(doc);

      if (
        contact &&
        contact.subjectType === subjectType &&
        contact.subjectId === subjectId &&
        contact.isActive
      ) {
        const before = { ...contact } as unknown as Record<string, unknown>;
        const newOrder = i + 1;
        const oldOrder = contact.priorityOrder;

        await docRef.update({
          priorityOrder: newOrder,
          updatedAt: now(),
        });

        const updatedDoc = await docRef.get();
        const updated = docToContact(updatedDoc);

        if (updated) {
          await addEvent(
            id,
            actorUserId,
            'reorder',
            before,
            updated as unknown as Record<string, unknown>,
            `優先順位を ${oldOrder} から ${newOrder} に変更`
          );
          contacts.push(updated);
        }
      }
    }

    return contacts.sort((a, b) => a.priorityOrder - b.priorityOrder);
  } catch (error) {
    console.error('[KeyPerson:Firestore] reorderContacts error:', error);
    return [];
  }
}

// ========== 第1連絡先 ==========

/**
 * 第1連絡先を取得
 */
export async function getPrimaryContact(
  subjectType: KeyPersonSubjectType,
  subjectId: string
): Promise<KeyPersonContact | null> {
  try {
    const db = getAdminDb();
    const snap = await db
      .collection(CONTACTS_COLLECTION)
      .where('subjectType', '==', subjectType)
      .where('subjectId', '==', subjectId)
      .where('priorityOrder', '==', 1)
      .where('isActive', '==', true)
      .limit(1)
      .get();

    if (snap.empty) return null;
    return docToContact(snap.docs[0]);
  } catch (error) {
    console.error('[KeyPerson:Firestore] getPrimaryContact error:', error);
    return null;
  }
}

// ========== 監査ログ ==========

/**
 * 監査ログを取得
 */
export async function getAuditTrail(
  contactId: string,
  limit: number = 50,
  offset: number = 0
): Promise<{ events: KeyPersonEvent[]; total: number }> {
  try {
    const db = getAdminDb();

    // 全件取得してカウント
    const countSnap = await db
      .collection(EVENTS_COLLECTION)
      .where('contactId', '==', contactId)
      .get();

    const total = countSnap.size;

    // ページネーション付きクエリ
    const snap = await db
      .collection(EVENTS_COLLECTION)
      .where('contactId', '==', contactId)
      .orderBy('createdAt', 'desc')
      .offset(offset)
      .limit(limit)
      .get();

    const events = snap.docs.map((d) => docToEvent(d)!).filter(Boolean);

    return { events, total };
  } catch (error) {
    console.error('[KeyPerson:Firestore] getAuditTrail error:', error);
    return { events: [], total: 0 };
  }
}

// ========== スキャン ==========

/**
 * 利用者一覧を取得（キーパーソンが登録されている）
 */
export async function getSubjectsWithContacts(): Promise<
  { subjectType: KeyPersonSubjectType; subjectId: string; contactCount: number }[]
> {
  try {
    const db = getAdminDb();
    const snap = await db
      .collection(CONTACTS_COLLECTION)
      .where('isActive', '==', true)
      .get();

    const subjectMap = new Map<string, number>();

    for (const doc of snap.docs) {
      const contact = docToContact(doc);
      if (!contact) continue;
      const key = `${contact.subjectType}:${contact.subjectId}`;
      subjectMap.set(key, (subjectMap.get(key) ?? 0) + 1);
    }

    return Array.from(subjectMap.entries()).map(([key, count]) => {
      const [subjectType, subjectId] = key.split(':');
      return {
        subjectType: subjectType as KeyPersonSubjectType,
        subjectId,
        contactCount: count,
      };
    });
  } catch (error) {
    console.error('[KeyPerson:Firestore] getSubjectsWithContacts error:', error);
    return [];
  }
}

/**
 * 第1連絡先が未設定の利用者をスキャン
 */
export async function scanMissingPrimaryContacts(): Promise<
  { subjectType: KeyPersonSubjectType; subjectId: string }[]
> {
  try {
    const subjects = await getSubjectsWithContacts();
    const results: { subjectType: KeyPersonSubjectType; subjectId: string }[] = [];

    for (const s of subjects) {
      const primary = await getPrimaryContact(s.subjectType, s.subjectId);
      if (!primary) {
        results.push({ subjectType: s.subjectType, subjectId: s.subjectId });
      }
    }

    return results;
  } catch (error) {
    console.error('[KeyPerson:Firestore] scanMissingPrimaryContacts error:', error);
    return [];
  }
}
