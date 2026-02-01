/**
 * 委員会管理リポジトリ
 *
 * 委員会・開催・議事録・アクション項目のCRUD操作
 * インメモリストレージ（本番ではDBに置き換え）
 */

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

// ========== インメモリストレージ ==========

const committeesStore = new Map<string, Committee>();
const membersStore = new Map<string, CommitteeMember>();
const meetingsStore = new Map<string, CommitteeMeeting>();
const attendancesStore = new Map<string, CommitteeAttendance>();
const minutesStore = new Map<string, CommitteeMinutes>(); // meetingId -> minutes
const actionItemsStore = new Map<string, CommitteeActionItem>();
const eventsStore: CommitteeEvent[] = [];

// ID生成
let idCounter = 1;
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${idCounter++}`;
}

// 監査ログ記録
function recordEvent(
  entityType: CommitteeEvent['entityType'],
  entityId: string,
  action: CommitteeEvent['action'],
  actorUserId: string | null,
  beforeJson: Record<string, unknown> | null,
  afterJson: Record<string, unknown> | null,
  note: string | null
): void {
  const event: CommitteeEvent = {
    id: generateId('cmtev'),
    entityType,
    entityId,
    actorUserId,
    action,
    beforeJson,
    afterJson,
    createdAt: new Date().toISOString(),
    note,
  };
  eventsStore.push(event);
}

// ========== 委員会マスタ ==========

export function listCommittees(filter: {
  q?: string;
  category?: string;
  active?: boolean;
}): Committee[] {
  let committees = Array.from(committeesStore.values());

  if (filter.active !== undefined) {
    committees = committees.filter((c) => c.isActive === filter.active);
  }

  if (filter.category) {
    committees = committees.filter((c) => c.category === filter.category);
  }

  if (filter.q) {
    const q = filter.q.toLowerCase();
    committees = committees.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.description && c.description.toLowerCase().includes(q))
    );
  }

  // required優先、名前順
  committees.sort((a, b) => {
    if (a.required !== b.required) return a.required ? -1 : 1;
    return a.name.localeCompare(b.name, 'ja');
  });

  return committees;
}

export function getCommittee(id: string): Committee | null {
  return committeesStore.get(id) ?? null;
}

export function createCommittee(
  input: CreateCommitteeInput,
  actorUserId: string
): { success: true; committee: Committee } | { success: false; error: string } {
  const now = new Date().toISOString();
  const committee: Committee = {
    id: generateId('cmt'),
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

  committeesStore.set(committee.id, committee);
  recordEvent('committee', committee.id, 'create', actorUserId, null, { ...committee }, null);

  return { success: true, committee };
}

export function updateCommittee(
  id: string,
  patch: UpdateCommitteeInput,
  actorUserId: string
): { success: true; committee: Committee } | { success: false; error: string } {
  const committee = committeesStore.get(id);
  if (!committee) {
    return { success: false, error: '委員会が見つかりません' };
  }

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

  committee.updatedAt = new Date().toISOString();

  if (Object.keys(after).length > 0) {
    recordEvent('committee', id, 'update', actorUserId, before, after, null);
  }

  return { success: true, committee };
}

// ========== 委員会メンバー ==========

export function listMembers(committeeId: string): CommitteeMember[] {
  return Array.from(membersStore.values()).filter(
    (m) => m.committeeId === committeeId
  );
}

export function addMember(
  committeeId: string,
  userId: string,
  role: CommitteeMember['role'],
  actorUserId: string
): CommitteeMember {
  // 重複チェック
  const existing = Array.from(membersStore.values()).find(
    (m) => m.committeeId === committeeId && m.userId === userId
  );
  if (existing) {
    existing.role = role;
    return existing;
  }

  const member: CommitteeMember = {
    id: generateId('cmtmem'),
    committeeId,
    userId,
    role,
    createdAt: new Date().toISOString(),
  };
  membersStore.set(member.id, member);
  return member;
}

export function removeMember(committeeId: string, userId: string): boolean {
  for (const [id, member] of membersStore.entries()) {
    if (member.committeeId === committeeId && member.userId === userId) {
      membersStore.delete(id);
      return true;
    }
  }
  return false;
}

// ========== 開催管理 ==========

export function listMeetings(filter: {
  committeeId?: string;
  status?: MeetingStatus;
  dateFrom?: string;
  dateTo?: string;
}): CommitteeMeeting[] {
  let meetings = Array.from(meetingsStore.values());

  if (filter.committeeId) {
    meetings = meetings.filter((m) => m.committeeId === filter.committeeId);
  }

  if (filter.status) {
    meetings = meetings.filter((m) => m.status === filter.status);
  }

  if (filter.dateFrom) {
    meetings = meetings.filter((m) => m.scheduledAt >= filter.dateFrom!);
  }

  if (filter.dateTo) {
    meetings = meetings.filter((m) => m.scheduledAt <= filter.dateTo!);
  }

  // 日付降順
  meetings.sort(
    (a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
  );

  return meetings;
}

export function getMeeting(id: string): CommitteeMeeting | null {
  return meetingsStore.get(id) ?? null;
}

export function createMeeting(
  input: CreateMeetingInput,
  actorUserId: string
): { success: true; meeting: CommitteeMeeting } | { success: false; error: string } {
  const committee = committeesStore.get(input.committeeId);
  if (!committee) {
    return { success: false, error: '委員会が見つかりません' };
  }

  const now = new Date().toISOString();
  const meeting: CommitteeMeeting = {
    id: generateId('mtg'),
    committeeId: input.committeeId,
    title: input.title,
    scheduledAt: input.scheduledAt,
    heldAt: null,
    location: input.location ?? null,
    status: 'planned',
    createdByUserId: actorUserId,
    notes: input.notes ?? null,
    createdAt: now,
    updatedAt: now,
  };

  meetingsStore.set(meeting.id, meeting);
  recordEvent('meeting', meeting.id, 'create', actorUserId, null, { ...meeting }, null);

  return { success: true, meeting };
}

export function updateMeeting(
  id: string,
  patch: UpdateMeetingInput,
  actorUserId: string
): { success: true; meeting: CommitteeMeeting } | { success: false; error: string } {
  const meeting = meetingsStore.get(id);
  if (!meeting) {
    return { success: false, error: '開催回が見つかりません' };
  }

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

  meeting.updatedAt = new Date().toISOString();

  if (Object.keys(after).length > 0) {
    recordEvent('meeting', id, 'update', actorUserId, before, after, null);
  }

  return { success: true, meeting };
}

export function setMeetingStatus(
  id: string,
  status: MeetingStatus,
  actorUserId: string,
  heldAt?: string
): { success: true; meeting: CommitteeMeeting } | { success: false; error: string } {
  const meeting = meetingsStore.get(id);
  if (!meeting) {
    return { success: false, error: '開催回が見つかりません' };
  }

  const before = { status: meeting.status, heldAt: meeting.heldAt };
  meeting.status = status;
  if (status === 'held' && heldAt) {
    meeting.heldAt = heldAt;
  } else if (status === 'held' && !meeting.heldAt) {
    meeting.heldAt = new Date().toISOString();
  }
  meeting.updatedAt = new Date().toISOString();

  recordEvent(
    'meeting',
    id,
    'status_change',
    actorUserId,
    before,
    { status: meeting.status, heldAt: meeting.heldAt },
    null
  );

  return { success: true, meeting };
}

// ========== 出欠管理 ==========

export function listAttendances(meetingId: string): CommitteeAttendance[] {
  return Array.from(attendancesStore.values()).filter(
    (a) => a.meetingId === meetingId
  );
}

export function setAttendance(
  meetingId: string,
  userId: string,
  status: CommitteeAttendance['status']
): CommitteeAttendance {
  const existing = Array.from(attendancesStore.values()).find(
    (a) => a.meetingId === meetingId && a.userId === userId
  );

  if (existing) {
    existing.status = status;
    return existing;
  }

  const attendance: CommitteeAttendance = {
    id: generateId('cmtatt'),
    meetingId,
    userId,
    status,
    createdAt: new Date().toISOString(),
  };
  attendancesStore.set(attendance.id, attendance);
  return attendance;
}

// ========== 議事録管理 ==========

export function getMinutes(meetingId: string): CommitteeMinutes | null {
  return minutesStore.get(meetingId) ?? null;
}

export function upsertMinutes(
  meetingId: string,
  input: UpsertMinutesInput,
  actorUserId: string
): { success: true; minutes: CommitteeMinutes } | { success: false; error: string } {
  const meeting = meetingsStore.get(meetingId);
  if (!meeting) {
    return { success: false, error: '開催回が見つかりません' };
  }

  const existing = minutesStore.get(meetingId);
  const now = new Date().toISOString();

  if (existing) {
    const before = { ...existing };
    existing.summary = input.summary;
    existing.discussion = input.discussion ?? null;
    existing.decisions = input.decisions ?? null;
    existing.risks = input.risks ?? null;
    existing.updatedAt = now;

    recordEvent(
      'minutes',
      existing.id,
      'update',
      actorUserId,
      before as unknown as Record<string, unknown>,
      { ...existing } as unknown as Record<string, unknown>,
      null
    );

    return { success: true, minutes: existing };
  }

  const minutes: CommitteeMinutes = {
    id: generateId('min'),
    meetingId,
    summary: input.summary,
    discussion: input.discussion ?? null,
    decisions: input.decisions ?? null,
    risks: input.risks ?? null,
    createdByUserId: actorUserId,
    createdAt: now,
    updatedAt: now,
  };

  minutesStore.set(meetingId, minutes);
  recordEvent(
    'minutes',
    minutes.id,
    'create',
    actorUserId,
    null,
    { ...minutes } as unknown as Record<string, unknown>,
    null
  );

  return { success: true, minutes };
}

// ========== アクション項目管理 ==========

export function listActionItems(filter: {
  meetingId?: string;
  committeeId?: string;
  status?: ActionItemStatus;
  overdue?: boolean;
  ownerUserId?: string;
}): CommitteeActionItem[] {
  let items = Array.from(actionItemsStore.values());
  const now = new Date();

  if (filter.meetingId) {
    items = items.filter((a) => a.meetingId === filter.meetingId);
  }

  if (filter.committeeId) {
    const meetingIds = Array.from(meetingsStore.values())
      .filter((m) => m.committeeId === filter.committeeId)
      .map((m) => m.id);
    items = items.filter((a) => meetingIds.includes(a.meetingId));
  }

  if (filter.status) {
    items = items.filter((a) => a.status === filter.status);
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

  if (filter.ownerUserId) {
    items = items.filter((a) => a.ownerUserId === filter.ownerUserId);
  }

  // 期限順（期限なしは後ろ）
  items.sort((a, b) => {
    if (!a.dueAt && !b.dueAt) return 0;
    if (!a.dueAt) return 1;
    if (!b.dueAt) return -1;
    return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
  });

  return items;
}

export function getActionItem(id: string): CommitteeActionItem | null {
  return actionItemsStore.get(id) ?? null;
}

export function createActionItem(
  meetingId: string,
  input: CreateActionItemInput,
  actorUserId: string
): { success: true; actionItem: CommitteeActionItem } | { success: false; error: string } {
  const meeting = meetingsStore.get(meetingId);
  if (!meeting) {
    return { success: false, error: '開催回が見つかりません' };
  }

  const now = new Date().toISOString();
  const actionItem: CommitteeActionItem = {
    id: generateId('act'),
    meetingId,
    title: input.title,
    description: input.description ?? null,
    ownerUserId: input.ownerUserId ?? null,
    ownerRole: input.ownerRole ?? null,
    dueAt: input.dueAt ?? null,
    status: 'open',
    createdAt: now,
    updatedAt: now,
  };

  actionItemsStore.set(actionItem.id, actionItem);
  recordEvent(
    'action_item',
    actionItem.id,
    'create',
    actorUserId,
    null,
    { ...actionItem } as unknown as Record<string, unknown>,
    null
  );

  return { success: true, actionItem };
}

export function updateActionItem(
  id: string,
  patch: UpdateActionItemInput,
  actorUserId: string
): { success: true; actionItem: CommitteeActionItem } | { success: false; error: string } {
  const actionItem = actionItemsStore.get(id);
  if (!actionItem) {
    return { success: false, error: 'アクション項目が見つかりません' };
  }

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

  actionItem.updatedAt = new Date().toISOString();

  if (Object.keys(after).length > 0) {
    recordEvent('action_item', id, 'update', actorUserId, before, after, null);
  }

  return { success: true, actionItem };
}

export function setActionItemStatus(
  id: string,
  status: ActionItemStatus,
  actorUserId: string
): { success: true; actionItem: CommitteeActionItem } | { success: false; error: string } {
  const actionItem = actionItemsStore.get(id);
  if (!actionItem) {
    return { success: false, error: 'アクション項目が見つかりません' };
  }

  const before = { status: actionItem.status };
  actionItem.status = status;
  actionItem.updatedAt = new Date().toISOString();

  const action =
    status === 'done' ? 'mark_done' : status === 'cancelled' ? 'cancel' : 'status_change';
  recordEvent('action_item', id, action, actorUserId, before, { status }, null);

  return { success: true, actionItem };
}

// ========== 統計・サマリー ==========

export function getCommitteeSummaries(): CommitteeSummary[] {
  const committees = listCommittees({ active: true });
  const now = new Date();

  return committees.map((committee) => {
    const meetings = listMeetings({ committeeId: committee.id });

    // 直近開催日
    const heldMeetings = meetings.filter((m) => m.status === 'held' && m.heldAt);
    const lastHeldAt =
      heldMeetings.length > 0
        ? heldMeetings.sort(
            (a, b) => new Date(b.heldAt!).getTime() - new Date(a.heldAt!).getTime()
          )[0].heldAt
        : null;

    // 次回予定
    const plannedMeetings = meetings.filter(
      (m) => m.status === 'planned' && new Date(m.scheduledAt) >= now
    );
    const nextScheduledAt =
      plannedMeetings.length > 0
        ? plannedMeetings.sort(
            (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
          )[0].scheduledAt
        : null;

    // アクション件数
    const actions = listActionItems({ committeeId: committee.id });
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

    return {
      committee,
      lastHeldAt,
      nextScheduledAt,
      openActionCount,
      overdueActionCount,
    };
  });
}

export function getMeetingStats(meetingId: string): MeetingStats | null {
  const meeting = meetingsStore.get(meetingId);
  if (!meeting) return null;

  const attendances = listAttendances(meetingId);
  const actions = listActionItems({ meetingId });
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

/**
 * 開催周期に応じた次回期限を計算
 */
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
      // 随時は判定しない（遠い未来を返す）
      next.setFullYear(next.getFullYear() + 10);
      break;
  }

  return next;
}

/**
 * 開催漏れリスクをスキャン
 */
export function scanCommitteeCadenceRisk(): CommitteeCadenceRisk[] {
  const committees = listCommittees({ active: true });
  const now = new Date();
  const risks: CommitteeCadenceRisk[] = [];

  for (const committee of committees) {
    if (committee.cadence === 'adhoc') continue; // 随時は除外

    const meetings = listMeetings({ committeeId: committee.id, status: 'held' });
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
        daysOverdue: !lastHeldAt ? 999 : daysOverdue, // 未開催は大きな値
      });
    }
  }

  // 重要度順（required優先、超過日数順）
  risks.sort((a, b) => {
    if (a.required !== b.required) return a.required ? -1 : 1;
    return b.daysOverdue - a.daysOverdue;
  });

  return risks;
}

/**
 * 期限超過アクション項目をスキャン
 */
export function scanOverdueActionItems(): OverdueActionItem[] {
  const now = new Date();
  const overdueItems: OverdueActionItem[] = [];

  for (const actionItem of actionItemsStore.values()) {
    if (
      actionItem.dueAt &&
      new Date(actionItem.dueAt) < now &&
      actionItem.status !== 'done' &&
      actionItem.status !== 'cancelled'
    ) {
      const meeting = meetingsStore.get(actionItem.meetingId);
      const committee = meeting ? committeesStore.get(meeting.committeeId) : null;

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

  // 超過日数順
  overdueItems.sort((a, b) => b.daysOverdue - a.daysOverdue);

  return overdueItems;
}

// ========== イベント取得 ==========

export function getEvents(filter: {
  entityType?: CommitteeEvent['entityType'];
  entityId?: string;
  limit?: number;
}): CommitteeEvent[] {
  let events = [...eventsStore];

  if (filter.entityType) {
    events = events.filter((e) => e.entityType === filter.entityType);
  }

  if (filter.entityId) {
    events = events.filter((e) => e.entityId === filter.entityId);
  }

  // 新しい順
  events.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  if (filter.limit) {
    events = events.slice(0, filter.limit);
  }

  return events;
}

// ========== デモデータ初期化 ==========

function initDemoData(): void {
  const now = new Date();
  const systemUser = 'system';

  // 委員会マスタ
  const committees: Committee[] = [
    {
      id: 'cmt_001',
      name: '身体拘束適正化委員会',
      category: 'compliance',
      required: true,
      cadence: 'monthly',
      defaultDueDayOfMonth: 20,
      description: '身体拘束の適正化に関する検討・報告',
      isActive: true,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
    {
      id: 'cmt_002',
      name: '事故防止委員会',
      category: 'safety',
      required: true,
      cadence: 'monthly',
      defaultDueDayOfMonth: 15,
      description: '事故・ヒヤリハットの分析と対策',
      isActive: true,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
    {
      id: 'cmt_003',
      name: '感染症対策委員会',
      category: 'safety',
      required: true,
      cadence: 'quarterly',
      defaultDueDayOfMonth: null,
      description: '感染症予防と発生時対応の検討',
      isActive: true,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
    {
      id: 'cmt_004',
      name: '運営会議',
      category: 'other',
      required: false,
      cadence: 'monthly',
      defaultDueDayOfMonth: 25,
      description: '施設運営に関する定例会議',
      isActive: true,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
    {
      id: 'cmt_005',
      name: '虐待防止委員会',
      category: 'compliance',
      required: true,
      cadence: 'semiannual',
      defaultDueDayOfMonth: null,
      description: '虐待防止に関する研修・検討',
      isActive: true,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
  ];

  for (const c of committees) {
    committeesStore.set(c.id, c);
  }

  // 開催回（過去と予定）
  const meetings: CommitteeMeeting[] = [
    {
      id: 'mtg_001',
      committeeId: 'cmt_001',
      title: '2026年1月 定例',
      scheduledAt: '2026-01-20T14:00:00.000Z',
      heldAt: '2026-01-20T14:00:00.000Z',
      location: '会議室A',
      status: 'held',
      createdByUserId: 'user_manager',
      notes: null,
      createdAt: '2026-01-10T00:00:00.000Z',
      updatedAt: '2026-01-20T15:00:00.000Z',
    },
    {
      id: 'mtg_002',
      committeeId: 'cmt_001',
      title: '2026年2月 定例',
      scheduledAt: '2026-02-20T14:00:00.000Z',
      heldAt: null,
      location: '会議室A',
      status: 'planned',
      createdByUserId: 'user_manager',
      notes: null,
      createdAt: '2026-01-25T00:00:00.000Z',
      updatedAt: '2026-01-25T00:00:00.000Z',
    },
    {
      id: 'mtg_003',
      committeeId: 'cmt_002',
      title: '2026年1月 定例',
      scheduledAt: '2026-01-15T10:00:00.000Z',
      heldAt: '2026-01-15T10:00:00.000Z',
      location: '会議室B',
      status: 'held',
      createdByUserId: 'user_manager',
      notes: 'インシデント分析を中心に実施',
      createdAt: '2026-01-05T00:00:00.000Z',
      updatedAt: '2026-01-15T12:00:00.000Z',
    },
    {
      id: 'mtg_004',
      committeeId: 'cmt_002',
      title: '2026年2月 定例',
      scheduledAt: '2026-02-15T10:00:00.000Z',
      heldAt: null,
      location: '会議室B',
      status: 'planned',
      createdByUserId: 'user_manager',
      notes: null,
      createdAt: '2026-01-20T00:00:00.000Z',
      updatedAt: '2026-01-20T00:00:00.000Z',
    },
    {
      id: 'mtg_005',
      committeeId: 'cmt_003',
      title: '2026年Q1 定例',
      scheduledAt: '2026-03-10T13:00:00.000Z',
      heldAt: null,
      location: '会議室A',
      status: 'planned',
      createdByUserId: 'user_manager',
      notes: 'インフルエンザ対策の振り返り',
      createdAt: '2026-01-15T00:00:00.000Z',
      updatedAt: '2026-01-15T00:00:00.000Z',
    },
  ];

  for (const m of meetings) {
    meetingsStore.set(m.id, m);
  }

  // 議事録
  const minutes: CommitteeMinutes[] = [
    {
      id: 'min_001',
      meetingId: 'mtg_001',
      summary: '1月の身体拘束実施状況を報告。新規拘束0件、継続2件。',
      discussion: '継続2件について、減算の可能性を検討。リハビリ担当と連携して代替案を模索中。',
      decisions: '・継続ケースのカンファレンスを2月上旬に実施\n・代替案の効果検証を3月に報告',
      risks: '継続ケースの長期化リスク',
      createdByUserId: 'user_manager',
      createdAt: '2026-01-20T15:00:00.000Z',
      updatedAt: '2026-01-20T15:00:00.000Z',
    },
    {
      id: 'min_002',
      meetingId: 'mtg_003',
      summary: '1月のヒヤリハット18件、事故2件を分析。転倒関連が増加傾向。',
      discussion: '転倒事故の要因分析を実施。夜間帯の発生が多く、巡視強化を検討。',
      decisions: '・夜間巡視の頻度を15分→10分間隔に変更（2月から試行）\n・センサーマット追加導入を稟議申請',
      risks: '人員配置の負荷増加',
      createdByUserId: 'user_manager',
      createdAt: '2026-01-15T12:00:00.000Z',
      updatedAt: '2026-01-15T12:00:00.000Z',
    },
  ];

  for (const m of minutes) {
    minutesStore.set(m.meetingId, m);
  }

  // アクション項目
  const actionItems: CommitteeActionItem[] = [
    {
      id: 'act_001',
      meetingId: 'mtg_001',
      title: '継続ケースのカンファレンス実施',
      description: 'リハビリ担当、看護師、介護主任で代替案を検討',
      ownerUserId: 'user_manager',
      ownerRole: null,
      dueAt: '2026-02-10T00:00:00.000Z',
      status: 'open',
      createdAt: '2026-01-20T15:00:00.000Z',
      updatedAt: '2026-01-20T15:00:00.000Z',
    },
    {
      id: 'act_002',
      meetingId: 'mtg_003',
      title: '夜間巡視頻度変更の周知',
      description: '夜勤スタッフへの説明と勤務表への反映',
      ownerUserId: 'user_leader',
      ownerRole: null,
      dueAt: '2026-01-31T00:00:00.000Z',
      status: 'done',
      createdAt: '2026-01-15T12:00:00.000Z',
      updatedAt: '2026-01-28T10:00:00.000Z',
    },
    {
      id: 'act_003',
      meetingId: 'mtg_003',
      title: 'センサーマット稟議申請',
      description: '追加5台、予算見積もりを添付して申請',
      ownerUserId: 'user_manager',
      ownerRole: null,
      dueAt: '2026-01-25T00:00:00.000Z',
      status: 'open', // 期限超過
      createdAt: '2026-01-15T12:00:00.000Z',
      updatedAt: '2026-01-15T12:00:00.000Z',
    },
    {
      id: 'act_004',
      meetingId: 'mtg_001',
      title: '代替案の効果検証報告',
      description: '3月定例で報告予定',
      ownerUserId: 'user_manager',
      ownerRole: null,
      dueAt: '2026-03-20T00:00:00.000Z',
      status: 'open',
      createdAt: '2026-01-20T15:00:00.000Z',
      updatedAt: '2026-01-20T15:00:00.000Z',
    },
  ];

  for (const a of actionItems) {
    actionItemsStore.set(a.id, a);
  }
}

// 初期化実行
initDemoData();
