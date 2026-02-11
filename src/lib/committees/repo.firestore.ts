/**
 * 委員会管理リポジトリ (Firestore版)
 *
 * 委員会・開催・議事録・アクション項目のCRUD操作
 */

import { getAdminDb } from '../firebase-admin';
import type {
  Committee,
  CommitteeMember,
  CommitteeMeeting,
  CommitteeAttendance,
  CommitteeMinutes,
  CommitteeActionItem,
  CommitteeEvent,
  CommitteeSummary,
  MeetingStats,
  CommitteeCadenceRisk,
  OverdueActionItem,
  CreateCommitteeInput,
  UpdateCommitteeInput,
  CreateMeetingInput,
  UpdateMeetingInput,
  UpsertMinutesInput,
  CreateActionItemInput,
  UpdateActionItemInput,
  MeetingStatus,
  ActionItemStatus,
  CommitteeCadence,
} from './types';

const COMMITTEES = 'committees';
const COMMITTEE_MEMBERS = 'committee_members';
const COMMITTEE_MEETINGS = 'committee_meetings';
const COMMITTEE_ATTENDANCES = 'committee_attendances';
const COMMITTEE_MINUTES = 'committee_minutes';
const COMMITTEE_ACTION_ITEMS = 'committee_action_items';
const COMMITTEE_EVENTS = 'committee_events';

function docToCommittee(doc: FirebaseFirestore.DocumentSnapshot): Committee {
  const d = doc.data()!;
  return {
    id: doc.id,
    name: d.name,
    category: d.category,
    required: d.required ?? false,
    cadence: d.cadence,
    defaultDueDayOfMonth: d.defaultDueDayOfMonth ?? null,
    description: d.description ?? null,
    isActive: d.isActive ?? true,
    createdAt: d.createdAt ?? '',
    updatedAt: d.updatedAt ?? '',
  };
}

function docToMember(doc: FirebaseFirestore.DocumentSnapshot): CommitteeMember {
  const d = doc.data()!;
  return {
    id: doc.id,
    committeeId: d.committeeId,
    userId: d.userId,
    role: d.role,
    createdAt: d.createdAt ?? '',
  };
}

function docToMeeting(doc: FirebaseFirestore.DocumentSnapshot): CommitteeMeeting {
  const d = doc.data()!;
  return {
    id: doc.id,
    committeeId: d.committeeId,
    title: d.title,
    scheduledAt: d.scheduledAt,
    heldAt: d.heldAt ?? null,
    location: d.location ?? null,
    status: d.status ?? 'planned',
    createdByUserId: d.createdByUserId,
    notes: d.notes ?? null,
    createdAt: d.createdAt ?? '',
    updatedAt: d.updatedAt ?? '',
  };
}

function docToAttendance(doc: FirebaseFirestore.DocumentSnapshot): CommitteeAttendance {
  const d = doc.data()!;
  return {
    id: doc.id,
    meetingId: d.meetingId,
    userId: d.userId,
    status: d.status,
    createdAt: d.createdAt ?? '',
  };
}

function docToMinutes(doc: FirebaseFirestore.DocumentSnapshot): CommitteeMinutes {
  const d = doc.data()!;
  return {
    id: doc.id,
    meetingId: d.meetingId,
    summary: d.summary,
    discussion: d.discussion ?? null,
    decisions: d.decisions ?? null,
    risks: d.risks ?? null,
    createdByUserId: d.createdByUserId,
    createdAt: d.createdAt ?? '',
    updatedAt: d.updatedAt ?? '',
  };
}

function docToActionItem(doc: FirebaseFirestore.DocumentSnapshot): CommitteeActionItem {
  const d = doc.data()!;
  return {
    id: doc.id,
    meetingId: d.meetingId,
    title: d.title,
    description: d.description ?? null,
    ownerUserId: d.ownerUserId ?? null,
    ownerRole: d.ownerRole ?? null,
    dueAt: d.dueAt ?? null,
    status: d.status ?? 'open',
    createdAt: d.createdAt ?? '',
    updatedAt: d.updatedAt ?? '',
  };
}

function docToEvent(doc: FirebaseFirestore.DocumentSnapshot): CommitteeEvent {
  const d = doc.data()!;
  return {
    id: doc.id,
    entityType: d.entityType,
    entityId: d.entityId,
    actorUserId: d.actorUserId ?? null,
    action: d.action,
    beforeJson: d.beforeJson ?? null,
    afterJson: d.afterJson ?? null,
    createdAt: d.createdAt ?? '',
    note: d.note ?? null,
  };
}

async function recordEvent(
  entityType: CommitteeEvent['entityType'],
  entityId: string,
  action: CommitteeEvent['action'],
  actorUserId: string | null,
  beforeJson: Record<string, unknown> | null,
  afterJson: Record<string, unknown> | null,
  note: string | null
): Promise<void> {
  const db = getAdminDb();
  const now = new Date().toISOString();
  await db.collection(COMMITTEE_EVENTS).add({
    entityType,
    entityId,
    actorUserId,
    action,
    beforeJson,
    afterJson,
    createdAt: now,
    note,
  });
}

// ========== 委員会マスタ ==========

export async function listCommittees(filter: {
  q?: string;
  category?: string;
  active?: boolean;
}): Promise<Committee[]> {
  const db = getAdminDb();
  let query: FirebaseFirestore.Query = db.collection(COMMITTEES);

  if (filter.active !== undefined) {
    query = query.where('isActive', '==', filter.active);
  }
  if (filter.category) {
    query = query.where('category', '==', filter.category);
  }

  const snap = await query.get();
  let committees = snap.docs.map(docToCommittee);

  if (filter.q) {
    const q = filter.q.toLowerCase();
    committees = committees.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.description && c.description.toLowerCase().includes(q))
    );
  }

  committees.sort((a, b) => {
    if (a.required !== b.required) return a.required ? -1 : 1;
    return a.name.localeCompare(b.name, 'ja');
  });

  return committees;
}

export async function getCommittee(id: string): Promise<Committee | null> {
  const db = getAdminDb();
  const doc = await db.collection(COMMITTEES).doc(id).get();
  return doc.exists ? docToCommittee(doc) : null;
}

export async function createCommittee(
  input: CreateCommitteeInput,
  actorUserId: string
): Promise<{ success: true; committee: Committee } | { success: false; error: string }> {
  const db = getAdminDb();
  const now = new Date().toISOString();
  const data = {
    name: input.name,
    category: input.category,
    required: input.required ?? false,
    cadence: input.cadence,
    defaultDueDayOfMonth: input.defaultDueDayOfMonth ?? null,
    description: input.description ?? null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  const ref = await db.collection(COMMITTEES).add(data);
  const committee: Committee = { id: ref.id, ...data };
  await recordEvent('committee', ref.id, 'create', actorUserId, null, { ...committee }, null);

  return { success: true, committee };
}

export async function updateCommittee(
  id: string,
  patch: UpdateCommitteeInput,
  actorUserId: string
): Promise<{ success: true; committee: Committee } | { success: false; error: string }> {
  const db = getAdminDb();
  const doc = await db.collection(COMMITTEES).doc(id).get();
  if (!doc.exists) {
    return { success: false, error: '委員会が見つかりません' };
  }

  const committee = docToCommittee(doc);
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  const committeeRecord = committee as unknown as Record<string, unknown>;

  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined && committeeRecord[key] !== value) {
      before[key] = committeeRecord[key];
      after[key] = value;
      committeeRecord[key] = value;
    }
  }

  const now = new Date().toISOString();
  await db.collection(COMMITTEES).doc(id).update({ ...after, updatedAt: now });
  committee.updatedAt = now;

  if (Object.keys(after).length > 0) {
    await recordEvent('committee', id, 'update', actorUserId, before, after, null);
  }

  return { success: true, committee };
}

// ========== 委員会メンバー ==========

export async function listMembers(committeeId: string): Promise<CommitteeMember[]> {
  const db = getAdminDb();
  const snap = await db.collection(COMMITTEE_MEMBERS)
    .where('committeeId', '==', committeeId)
    .get();
  return snap.docs.map(docToMember);
}

export async function addMember(
  committeeId: string,
  userId: string,
  role: CommitteeMember['role'],
  actorUserId: string
): Promise<CommitteeMember> {
  const db = getAdminDb();
  const existing = await db.collection(COMMITTEE_MEMBERS)
    .where('committeeId', '==', committeeId)
    .where('userId', '==', userId)
    .limit(1)
    .get();

  if (!existing.empty) {
    const doc = existing.docs[0];
    await doc.ref.update({ role });
    return { ...docToMember(doc), role };
  }

  const now = new Date().toISOString();
  const data = { committeeId, userId, role, createdAt: now };
  const ref = await db.collection(COMMITTEE_MEMBERS).add(data);
  return { id: ref.id, ...data };
}

export async function removeMember(committeeId: string, userId: string): Promise<boolean> {
  const db = getAdminDb();
  const snap = await db.collection(COMMITTEE_MEMBERS)
    .where('committeeId', '==', committeeId)
    .where('userId', '==', userId)
    .limit(1)
    .get();

  if (snap.empty) return false;
  await snap.docs[0].ref.delete();
  return true;
}

// ========== 開催管理 ==========

export async function listMeetings(filter: {
  committeeId?: string;
  status?: MeetingStatus;
  dateFrom?: string;
  dateTo?: string;
}): Promise<CommitteeMeeting[]> {
  const db = getAdminDb();
  let query: FirebaseFirestore.Query = db.collection(COMMITTEE_MEETINGS);

  if (filter.committeeId) {
    query = query.where('committeeId', '==', filter.committeeId);
  }
  if (filter.status) {
    query = query.where('status', '==', filter.status);
  }

  const snap = await query.get();
  let meetings = snap.docs.map(docToMeeting);

  if (filter.dateFrom) {
    meetings = meetings.filter((m) => m.scheduledAt >= filter.dateFrom!);
  }
  if (filter.dateTo) {
    meetings = meetings.filter((m) => m.scheduledAt <= filter.dateTo!);
  }

  meetings.sort(
    (a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
  );

  return meetings;
}

export async function getMeeting(id: string): Promise<CommitteeMeeting | null> {
  const db = getAdminDb();
  const doc = await db.collection(COMMITTEE_MEETINGS).doc(id).get();
  return doc.exists ? docToMeeting(doc) : null;
}

export async function createMeeting(
  input: CreateMeetingInput,
  actorUserId: string
): Promise<{ success: true; meeting: CommitteeMeeting } | { success: false; error: string }> {
  const db = getAdminDb();
  const committee = await getCommittee(input.committeeId);
  if (!committee) {
    return { success: false, error: '委員会が見つかりません' };
  }

  const now = new Date().toISOString();
  const data = {
    committeeId: input.committeeId,
    title: input.title,
    scheduledAt: input.scheduledAt,
    heldAt: null,
    location: input.location ?? null,
    status: 'planned' as const,
    createdByUserId: actorUserId,
    notes: input.notes ?? null,
    createdAt: now,
    updatedAt: now,
  };

  const ref = await db.collection(COMMITTEE_MEETINGS).add(data);
  const meeting: CommitteeMeeting = { id: ref.id, ...data };
  await recordEvent('meeting', ref.id, 'create', actorUserId, null, { ...meeting }, null);

  return { success: true, meeting };
}

export async function updateMeeting(
  id: string,
  patch: UpdateMeetingInput,
  actorUserId: string
): Promise<{ success: true; meeting: CommitteeMeeting } | { success: false; error: string }> {
  const db = getAdminDb();
  const doc = await db.collection(COMMITTEE_MEETINGS).doc(id).get();
  if (!doc.exists) {
    return { success: false, error: '開催回が見つかりません' };
  }

  const meeting = docToMeeting(doc);
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  const meetingRecord = meeting as unknown as Record<string, unknown>;

  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined && meetingRecord[key] !== value) {
      before[key] = meetingRecord[key];
      after[key] = value;
      meetingRecord[key] = value;
    }
  }

  const now = new Date().toISOString();
  await db.collection(COMMITTEE_MEETINGS).doc(id).update({ ...after, updatedAt: now });
  meeting.updatedAt = now;

  if (Object.keys(after).length > 0) {
    await recordEvent('meeting', id, 'update', actorUserId, before, after, null);
  }

  return { success: true, meeting };
}

export async function setMeetingStatus(
  id: string,
  status: MeetingStatus,
  actorUserId: string,
  heldAt?: string
): Promise<{ success: true; meeting: CommitteeMeeting } | { success: false; error: string }> {
  const db = getAdminDb();
  const doc = await db.collection(COMMITTEE_MEETINGS).doc(id).get();
  if (!doc.exists) {
    return { success: false, error: '開催回が見つかりません' };
  }

  const meeting = docToMeeting(doc);
  const before = { status: meeting.status, heldAt: meeting.heldAt };

  meeting.status = status;
  if (status === 'held' && heldAt) {
    meeting.heldAt = heldAt;
  } else if (status === 'held' && !meeting.heldAt) {
    meeting.heldAt = new Date().toISOString();
  }
  meeting.updatedAt = new Date().toISOString();

  await db.collection(COMMITTEE_MEETINGS).doc(id).update({
    status: meeting.status,
    heldAt: meeting.heldAt,
    updatedAt: meeting.updatedAt,
  });

  await recordEvent(
    'meeting', id, 'status_change', actorUserId,
    before, { status: meeting.status, heldAt: meeting.heldAt }, null
  );

  return { success: true, meeting };
}

// ========== 出欠管理 ==========

export async function listAttendances(meetingId: string): Promise<CommitteeAttendance[]> {
  const db = getAdminDb();
  const snap = await db.collection(COMMITTEE_ATTENDANCES)
    .where('meetingId', '==', meetingId)
    .get();
  return snap.docs.map(docToAttendance);
}

export async function setAttendance(
  meetingId: string,
  userId: string,
  status: CommitteeAttendance['status']
): Promise<CommitteeAttendance> {
  const db = getAdminDb();
  const existing = await db.collection(COMMITTEE_ATTENDANCES)
    .where('meetingId', '==', meetingId)
    .where('userId', '==', userId)
    .limit(1)
    .get();

  if (!existing.empty) {
    const doc = existing.docs[0];
    await doc.ref.update({ status });
    return { ...docToAttendance(doc), status };
  }

  const now = new Date().toISOString();
  const data = { meetingId, userId, status, createdAt: now };
  const ref = await db.collection(COMMITTEE_ATTENDANCES).add(data);
  return { id: ref.id, ...data };
}

// ========== 議事録管理 ==========

export async function getMinutes(meetingId: string): Promise<CommitteeMinutes | null> {
  const db = getAdminDb();
  const snap = await db.collection(COMMITTEE_MINUTES)
    .where('meetingId', '==', meetingId)
    .limit(1)
    .get();
  return snap.empty ? null : docToMinutes(snap.docs[0]);
}

export async function upsertMinutes(
  meetingId: string,
  input: UpsertMinutesInput,
  actorUserId: string
): Promise<{ success: true; minutes: CommitteeMinutes } | { success: false; error: string }> {
  const db = getAdminDb();
  const meeting = await getMeeting(meetingId);
  if (!meeting) {
    return { success: false, error: '開催回が見つかりません' };
  }

  const existing = await getMinutes(meetingId);
  const now = new Date().toISOString();

  if (existing) {
    const before = { ...existing } as unknown as Record<string, unknown>;
    existing.summary = input.summary;
    existing.discussion = input.discussion ?? null;
    existing.decisions = input.decisions ?? null;
    existing.risks = input.risks ?? null;
    existing.updatedAt = now;

    await db.collection(COMMITTEE_MINUTES).doc(existing.id).update({
      summary: existing.summary,
      discussion: existing.discussion,
      decisions: existing.decisions,
      risks: existing.risks,
      updatedAt: now,
    });

    await recordEvent(
      'minutes', existing.id, 'update', actorUserId,
      before, { ...existing } as unknown as Record<string, unknown>, null
    );

    return { success: true, minutes: existing };
  }

  const data = {
    meetingId,
    summary: input.summary,
    discussion: input.discussion ?? null,
    decisions: input.decisions ?? null,
    risks: input.risks ?? null,
    createdByUserId: actorUserId,
    createdAt: now,
    updatedAt: now,
  };

  const ref = await db.collection(COMMITTEE_MINUTES).add(data);
  const minutes: CommitteeMinutes = { id: ref.id, ...data };

  await recordEvent(
    'minutes', ref.id, 'create', actorUserId,
    null, { ...minutes } as unknown as Record<string, unknown>, null
  );

  return { success: true, minutes };
}

// ========== アクション項目管理 ==========

export async function listActionItems(filter: {
  meetingId?: string;
  committeeId?: string;
  status?: ActionItemStatus;
  overdue?: boolean;
  ownerUserId?: string;
}): Promise<CommitteeActionItem[]> {
  const db = getAdminDb();
  let query: FirebaseFirestore.Query = db.collection(COMMITTEE_ACTION_ITEMS);

  if (filter.meetingId) {
    query = query.where('meetingId', '==', filter.meetingId);
  }
  if (filter.status) {
    query = query.where('status', '==', filter.status);
  }
  if (filter.ownerUserId) {
    query = query.where('ownerUserId', '==', filter.ownerUserId);
  }

  const snap = await query.get();
  let items = snap.docs.map(docToActionItem);
  const now = new Date();

  if (filter.committeeId) {
    const meetings = await listMeetings({ committeeId: filter.committeeId });
    const meetingIds = new Set(meetings.map((m) => m.id));
    items = items.filter((a) => meetingIds.has(a.meetingId));
  }

  if (filter.overdue === true) {
    items = items.filter(
      (a) =>
        a.dueAt &&
        new Date(a.dueAt) < now &&
        a.status !== 'done' &&
        a.status !== 'cancelled'
    );
  }

  items.sort((a, b) => {
    if (!a.dueAt && !b.dueAt) return 0;
    if (!a.dueAt) return 1;
    if (!b.dueAt) return -1;
    return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
  });

  return items;
}

export async function getActionItem(id: string): Promise<CommitteeActionItem | null> {
  const db = getAdminDb();
  const doc = await db.collection(COMMITTEE_ACTION_ITEMS).doc(id).get();
  return doc.exists ? docToActionItem(doc) : null;
}

export async function createActionItem(
  meetingId: string,
  input: CreateActionItemInput,
  actorUserId: string
): Promise<{ success: true; actionItem: CommitteeActionItem } | { success: false; error: string }> {
  const meeting = await getMeeting(meetingId);
  if (!meeting) {
    return { success: false, error: '開催回が見つかりません' };
  }

  const db = getAdminDb();
  const now = new Date().toISOString();
  const data = {
    meetingId,
    title: input.title,
    description: input.description ?? null,
    ownerUserId: input.ownerUserId ?? null,
    ownerRole: input.ownerRole ?? null,
    dueAt: input.dueAt ?? null,
    status: 'open' as const,
    createdAt: now,
    updatedAt: now,
  };

  const ref = await db.collection(COMMITTEE_ACTION_ITEMS).add(data);
  const actionItem: CommitteeActionItem = { id: ref.id, ...data };

  await recordEvent(
    'action_item', ref.id, 'create', actorUserId,
    null, { ...actionItem } as unknown as Record<string, unknown>, null
  );

  return { success: true, actionItem };
}

export async function updateActionItem(
  id: string,
  patch: UpdateActionItemInput,
  actorUserId: string
): Promise<{ success: true; actionItem: CommitteeActionItem } | { success: false; error: string }> {
  const db = getAdminDb();
  const doc = await db.collection(COMMITTEE_ACTION_ITEMS).doc(id).get();
  if (!doc.exists) {
    return { success: false, error: 'アクション項目が見つかりません' };
  }

  const actionItem = docToActionItem(doc);
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  const actionRecord = actionItem as unknown as Record<string, unknown>;

  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined && actionRecord[key] !== value) {
      before[key] = actionRecord[key];
      after[key] = value;
      actionRecord[key] = value;
    }
  }

  const now = new Date().toISOString();
  await db.collection(COMMITTEE_ACTION_ITEMS).doc(id).update({ ...after, updatedAt: now });
  actionItem.updatedAt = now;

  if (Object.keys(after).length > 0) {
    await recordEvent('action_item', id, 'update', actorUserId, before, after, null);
  }

  return { success: true, actionItem };
}

export async function setActionItemStatus(
  id: string,
  status: ActionItemStatus,
  actorUserId: string
): Promise<{ success: true; actionItem: CommitteeActionItem } | { success: false; error: string }> {
  const db = getAdminDb();
  const doc = await db.collection(COMMITTEE_ACTION_ITEMS).doc(id).get();
  if (!doc.exists) {
    return { success: false, error: 'アクション項目が見つかりません' };
  }

  const actionItem = docToActionItem(doc);
  const before = { status: actionItem.status };
  actionItem.status = status;
  actionItem.updatedAt = new Date().toISOString();

  await db.collection(COMMITTEE_ACTION_ITEMS).doc(id).update({
    status,
    updatedAt: actionItem.updatedAt,
  });

  const action =
    status === 'done' ? 'mark_done' : status === 'cancelled' ? 'cancel' : 'status_change';
  await recordEvent('action_item', id, action, actorUserId, before, { status }, null);

  return { success: true, actionItem };
}

// ========== 統計・サマリー ==========

export async function getCommitteeSummaries(): Promise<CommitteeSummary[]> {
  const committees = await listCommittees({ active: true });
  const now = new Date();

  const summaries: CommitteeSummary[] = [];
  for (const committee of committees) {
    const meetings = await listMeetings({ committeeId: committee.id });
    const heldMeetings = meetings.filter((m) => m.status === 'held' && m.heldAt);
    const lastHeldAt =
      heldMeetings.length > 0
        ? heldMeetings.sort(
            (a, b) => new Date(b.heldAt!).getTime() - new Date(a.heldAt!).getTime()
          )[0].heldAt
        : null;

    const plannedMeetings = meetings.filter(
      (m) => m.status === 'planned' && new Date(m.scheduledAt) >= now
    );
    const nextScheduledAt =
      plannedMeetings.length > 0
        ? plannedMeetings.sort(
            (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
          )[0].scheduledAt
        : null;

    const actions = await listActionItems({ committeeId: committee.id });
    const openActionCount = actions.filter(
      (a) => a.status === 'open' || a.status === 'in_progress'
    ).length;
    const overdueActionCount = actions.filter(
      (a) =>
        a.dueAt &&
        new Date(a.dueAt) < now &&
        a.status !== 'done' &&
        a.status !== 'cancelled'
    ).length;

    summaries.push({
      committee,
      lastHeldAt,
      nextScheduledAt,
      openActionCount,
      overdueActionCount,
    });
  }

  return summaries;
}

export async function getMeetingStats(meetingId: string): Promise<MeetingStats | null> {
  const meeting = await getMeeting(meetingId);
  if (!meeting) return null;

  const attendances = await listAttendances(meetingId);
  const actions = await listActionItems({ meetingId });
  const now = new Date();

  return {
    attendeeCount: attendances.length,
    presentCount: attendances.filter((a) => a.status === 'present').length,
    actionOpenCount: actions.filter(
      (a) => a.status === 'open' || a.status === 'in_progress'
    ).length,
    actionOverdueCount: actions.filter(
      (a) =>
        a.dueAt &&
        new Date(a.dueAt) < now &&
        a.status !== 'done' &&
        a.status !== 'cancelled'
    ).length,
  };
}

// ========== リスク検知 ==========

function getExpectedNextDate(lastHeld: Date | null, cadence: CommitteeCadence): Date {
  const base = lastHeld ?? new Date();
  const next = new Date(base);

  switch (cadence) {
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'quarterly':
      next.setMonth(next.getMonth() + 3);
      break;
    case 'semiannual':
      next.setMonth(next.getMonth() + 6);
      break;
    case 'annual':
      next.setFullYear(next.getFullYear() + 1);
      break;
    case 'adhoc':
      next.setFullYear(next.getFullYear() + 10);
      break;
  }

  return next;
}

export async function scanCommitteeCadenceRisk(): Promise<CommitteeCadenceRisk[]> {
  const committees = await listCommittees({ active: true });
  const now = new Date();
  const risks: CommitteeCadenceRisk[] = [];

  for (const committee of committees) {
    if (committee.cadence === 'adhoc') continue;

    const meetings = await listMeetings({ committeeId: committee.id, status: 'held' });
    const lastHeldAt =
      meetings.length > 0
        ? meetings.sort(
            (a, b) => new Date(b.heldAt!).getTime() - new Date(a.heldAt!).getTime()
          )[0].heldAt
        : null;

    const lastHeldDate = lastHeldAt ? new Date(lastHeldAt) : null;
    const expectedNext = getExpectedNextDate(lastHeldDate, committee.cadence);
    const daysOverdue = Math.max(
      0,
      Math.floor((now.getTime() - expectedNext.getTime()) / (1000 * 60 * 60 * 24))
    );

    if (daysOverdue > 0 || !lastHeldAt) {
      risks.push({
        committeeId: committee.id,
        committeeName: committee.name,
        cadence: committee.cadence,
        required: committee.required,
        lastHeldAt,
        expectedNextBy: expectedNext.toISOString(),
        daysOverdue: !lastHeldAt ? 999 : daysOverdue,
      });
    }
  }

  risks.sort((a, b) => {
    if (a.required !== b.required) return a.required ? -1 : 1;
    return b.daysOverdue - a.daysOverdue;
  });

  return risks;
}

export async function scanOverdueActionItems(): Promise<OverdueActionItem[]> {
  const db = getAdminDb();
  const now = new Date();
  const snap = await db.collection(COMMITTEE_ACTION_ITEMS)
    .where('status', 'in', ['open', 'in_progress'])
    .get();

  const overdueItems: OverdueActionItem[] = [];
  for (const doc of snap.docs) {
    const actionItem = docToActionItem(doc);
    if (actionItem.dueAt && new Date(actionItem.dueAt) < now) {
      const meeting = await getMeeting(actionItem.meetingId);
      const committee = meeting ? await getCommittee(meeting.committeeId) : null;
      const daysOverdue = Math.floor(
        (now.getTime() - new Date(actionItem.dueAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      overdueItems.push({
        ...actionItem,
        committeeName: committee?.name ?? '不明',
        meetingTitle: meeting?.title ?? '不明',
        daysOverdue,
      });
    }
  }

  overdueItems.sort((a, b) => b.daysOverdue - a.daysOverdue);
  return overdueItems;
}

// ========== イベント取得 ==========

export async function getEvents(filter: {
  entityType?: CommitteeEvent['entityType'];
  entityId?: string;
  limit?: number;
}): Promise<CommitteeEvent[]> {
  const db = getAdminDb();
  let query: FirebaseFirestore.Query = db.collection(COMMITTEE_EVENTS);

  if (filter.entityType) {
    query = query.where('entityType', '==', filter.entityType);
  }
  if (filter.entityId) {
    query = query.where('entityId', '==', filter.entityId);
  }

  query = query.orderBy('createdAt', 'desc');

  if (filter.limit) {
    query = query.limit(filter.limit);
  }

  const snap = await query.get();
  return snap.docs.map(docToEvent);
}
