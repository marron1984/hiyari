/**
 * 研修管理リポジトリ
 *
 * インメモリストア実装（本番ではDBに置き換え）
 */

import type {
  TrainingCourse,
  TrainingSession,
  TrainingAssignment,
  TrainingAttendance,
  TrainingEvent,
  TrainingCategory,
  TrainingFrequency,
  SessionStatus,
  AttendanceStatus,
  TrainingEntityType,
  TrainingEventAction,
  SessionStats,
  MyTrainingSummary,
  ViewerContext,
} from './types';
import { canManageTraining, canViewAllStats } from './types';

// ========== インメモリストア ==========

const coursesStore = new Map<string, TrainingCourse>();
const sessionsStore = new Map<string, TrainingSession>();
const assignmentsStore = new Map<string, TrainingAssignment>();
const attendancesStore = new Map<string, TrainingAttendance>();
const eventsStore = new Map<string, TrainingEvent>();

let courseIdCounter = 1;
let sessionIdCounter = 1;
let assignmentIdCounter = 1;
let attendanceIdCounter = 1;
let eventIdCounter = 1;

// ========== デモユーザーマスタ ==========

const DEMO_USERS: Record<string, { id: string; name: string }> = {
  user_001: { id: 'user_001', name: '山田太郎' },
  user_002: { id: 'user_002', name: '佐藤次郎' },
  user_003: { id: 'user_003', name: '鈴木花子' },
  user_004: { id: 'user_004', name: '高橋三郎' },
  user_005: { id: 'user_005', name: '田中美咲' },
};

// ========== ヘルパー関数 ==========

function generateCourseId(): string {
  return `course_${String(courseIdCounter++).padStart(4, '0')}`;
}

function generateSessionId(): string {
  return `session_${String(sessionIdCounter++).padStart(4, '0')}`;
}

function generateAssignmentId(): string {
  return `assign_${String(assignmentIdCounter++).padStart(5, '0')}`;
}

function generateAttendanceId(): string {
  return `attend_${String(attendanceIdCounter++).padStart(5, '0')}`;
}

function generateEventId(): string {
  return `tevt_${String(eventIdCounter++).padStart(5, '0')}`;
}

function getUserName(userId: string): string {
  return DEMO_USERS[userId]?.name ?? userId;
}

// ========== イベント記録 ==========

function recordEvent(
  entityType: TrainingEntityType,
  entityId: string,
  action: TrainingEventAction,
  actorUserId: string | null,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  note: string | null = null
): TrainingEvent {
  const event: TrainingEvent = {
    id: generateEventId(),
    entityType,
    entityId,
    actorUserId,
    actorUserName: actorUserId ? getUserName(actorUserId) : null,
    action,
    beforeJson: before,
    afterJson: after,
    createdAt: new Date().toISOString(),
    note,
  };
  eventsStore.set(event.id, event);
  return event;
}

// ========== コース管理 ==========

export function listCourses(filter: {
  q?: string;
  category?: TrainingCategory;
  active?: boolean;
}): TrainingCourse[] {
  let courses = Array.from(coursesStore.values());

  if (filter.q) {
    const q = filter.q.toLowerCase();
    courses = courses.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.description && c.description.toLowerCase().includes(q))
    );
  }

  if (filter.category) {
    courses = courses.filter((c) => c.category === filter.category);
  }

  if (filter.active !== undefined) {
    courses = courses.filter((c) => c.isActive === filter.active);
  }

  return courses.sort((a, b) => a.title.localeCompare(b.title, 'ja'));
}

export function getCourse(id: string): TrainingCourse | null {
  return coursesStore.get(id) ?? null;
}

export function createCourse(
  input: {
    title: string;
    description?: string | null;
    category?: TrainingCategory;
    frequency?: TrainingFrequency;
    required?: boolean;
    defaultDueDays?: number | null;
  },
  actorUserId: string
): TrainingCourse {
  const now = new Date().toISOString();
  const course: TrainingCourse = {
    id: generateCourseId(),
    title: input.title,
    description: input.description ?? null,
    category: input.category ?? 'other',
    frequency: input.frequency ?? 'once',
    required: input.required ?? false,
    defaultDueDays: input.defaultDueDays ?? null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  coursesStore.set(course.id, course);

  recordEvent('course', course.id, 'create', actorUserId, null, {
    title: course.title,
    category: course.category,
  }, null);

  return course;
}

export function updateCourse(
  id: string,
  patch: Partial<Omit<TrainingCourse, 'id' | 'createdAt' | 'updatedAt'>>,
  actorUserId: string
): { success: true; course: TrainingCourse } | { success: false; error: string } {
  const course = coursesStore.get(id);
  if (!course) {
    return { success: false, error: '研修コースが見つかりません' };
  }

  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};

  const courseRecord = course as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined && courseRecord[key] !== value) {
      before[key] = courseRecord[key];
      after[key] = value;
      courseRecord[key] = value;
    }
  }

  course.updatedAt = new Date().toISOString();

  if (Object.keys(after).length > 0) {
    recordEvent('course', id, 'update', actorUserId, before, after, null);
  }

  return { success: true, course };
}

// ========== セッション管理 ==========

export function listSessions(filter: {
  courseId?: string;
  status?: SessionStatus;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
}): TrainingSession[] {
  let sessions = Array.from(sessionsStore.values());

  if (filter.courseId) {
    sessions = sessions.filter((s) => s.courseId === filter.courseId);
  }

  if (filter.status) {
    sessions = sessions.filter((s) => s.status === filter.status);
  }

  if (filter.dateFrom) {
    sessions = sessions.filter((s) => s.scheduledAt >= filter.dateFrom!);
  }

  if (filter.dateTo) {
    sessions = sessions.filter((s) => s.scheduledAt <= filter.dateTo!);
  }

  if (filter.q) {
    const q = filter.q.toLowerCase();
    sessions = sessions.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.notes && s.notes.toLowerCase().includes(q))
    );
  }

  // コース名を付与
  sessions = sessions.map((s) => {
    const course = coursesStore.get(s.courseId);
    return { ...s, courseName: course?.title };
  });

  return sessions.sort(
    (a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
  );
}

export function getSession(id: string): TrainingSession | null {
  const session = sessionsStore.get(id);
  if (!session) return null;

  const course = coursesStore.get(session.courseId);
  return {
    ...session,
    courseName: course?.title,
    createdByUserName: getUserName(session.createdByUserId),
  };
}

export function createSession(
  input: {
    courseId: string;
    name: string;
    scheduledAt: string;
    durationMinutes?: number | null;
    location?: string | null;
    instructorName?: string | null;
    notes?: string | null;
  },
  actorUserId: string
): { success: true; session: TrainingSession } | { success: false; error: string } {
  const course = coursesStore.get(input.courseId);
  if (!course) {
    return { success: false, error: '研修コースが見つかりません' };
  }

  const now = new Date().toISOString();
  const session: TrainingSession = {
    id: generateSessionId(),
    courseId: input.courseId,
    name: input.name,
    scheduledAt: input.scheduledAt,
    durationMinutes: input.durationMinutes ?? null,
    location: input.location ?? null,
    instructorName: input.instructorName ?? null,
    notes: input.notes ?? null,
    status: 'planned',
    createdByUserId: actorUserId,
    createdAt: now,
    updatedAt: now,
  };

  sessionsStore.set(session.id, session);

  recordEvent('session', session.id, 'create', actorUserId, null, {
    name: session.name,
    courseId: session.courseId,
    scheduledAt: session.scheduledAt,
  }, null);

  return { success: true, session };
}

export function updateSession(
  id: string,
  patch: Partial<Omit<TrainingSession, 'id' | 'createdAt' | 'updatedAt' | 'createdByUserId'>>,
  actorUserId: string
): { success: true; session: TrainingSession } | { success: false; error: string } {
  const session = sessionsStore.get(id);
  if (!session) {
    return { success: false, error: '研修セッションが見つかりません' };
  }

  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};

  const sessionRecord = session as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined && sessionRecord[key] !== value) {
      before[key] = sessionRecord[key];
      after[key] = value;
      sessionRecord[key] = value;
    }
  }

  session.updatedAt = new Date().toISOString();

  if (Object.keys(after).length > 0) {
    recordEvent('session', id, 'update', actorUserId, before, after, null);
  }

  return { success: true, session };
}

export function setSessionStatus(
  id: string,
  status: SessionStatus,
  actorUserId: string
): { success: true; session: TrainingSession } | { success: false; error: string } {
  const session = sessionsStore.get(id);
  if (!session) {
    return { success: false, error: '研修セッションが見つかりません' };
  }

  const before = { status: session.status };
  session.status = status;
  session.updatedAt = new Date().toISOString();

  const action: TrainingEventAction = status === 'cancelled' ? 'cancel' : 'update';
  recordEvent('session', id, action, actorUserId, before, { status }, null);

  return { success: true, session };
}

// ========== 対象者割当・受講記録 ==========

export function assignUsers(
  sessionId: string,
  userIds: string[],
  dueAt: string | null,
  actorUserId: string
): { success: true; count: number } | { success: false; error: string } {
  const session = sessionsStore.get(sessionId);
  if (!session) {
    return { success: false, error: '研修セッションが見つかりません' };
  }

  const now = new Date().toISOString();
  let count = 0;

  for (const userId of userIds) {
    // 既存チェック
    const existingAssignment = Array.from(assignmentsStore.values()).find(
      (a) => a.sessionId === sessionId && a.userId === userId
    );
    if (existingAssignment) continue;

    // Assignment作成
    const assignment: TrainingAssignment = {
      id: generateAssignmentId(),
      sessionId,
      userId,
      userName: getUserName(userId),
      dueAt,
      assignedAt: now,
      assignedByUserId: actorUserId,
    };
    assignmentsStore.set(assignment.id, assignment);

    // Attendance作成（初期状態）
    const attendance: TrainingAttendance = {
      id: generateAttendanceId(),
      sessionId,
      userId,
      userName: getUserName(userId),
      attendedAt: null,
      status: 'assigned',
      evidenceType: null,
      evidenceNote: null,
      recordedByUserId: null,
      dueAt,
      createdAt: now,
      updatedAt: now,
    };
    attendancesStore.set(attendance.id, attendance);

    recordEvent('attendance', attendance.id, 'assign', actorUserId, null, {
      sessionId,
      userId,
      dueAt,
    }, null);

    count++;
  }

  return { success: true, count };
}

export function markAttended(
  sessionId: string,
  userId: string,
  attendedAt: string | null,
  actorUserId: string,
  evidenceNote?: string
): { success: true; attendance: TrainingAttendance } | { success: false; error: string } {
  const attendance = Array.from(attendancesStore.values()).find(
    (a) => a.sessionId === sessionId && a.userId === userId
  );

  if (!attendance) {
    return { success: false, error: '受講記録が見つかりません' };
  }

  const before = { status: attendance.status, attendedAt: attendance.attendedAt };
  attendance.status = 'attended';
  attendance.attendedAt = attendedAt ?? new Date().toISOString();
  attendance.evidenceType = 'manual';
  attendance.evidenceNote = evidenceNote ?? null;
  attendance.recordedByUserId = actorUserId;
  attendance.recordedByUserName = getUserName(actorUserId);
  attendance.updatedAt = new Date().toISOString();

  recordEvent('attendance', attendance.id, 'mark_attended', actorUserId, before, {
    status: 'attended',
    attendedAt: attendance.attendedAt,
  }, evidenceNote ?? null);

  return { success: true, attendance };
}

export function markAbsent(
  sessionId: string,
  userId: string,
  actorUserId: string,
  note?: string
): { success: true; attendance: TrainingAttendance } | { success: false; error: string } {
  const attendance = Array.from(attendancesStore.values()).find(
    (a) => a.sessionId === sessionId && a.userId === userId
  );

  if (!attendance) {
    return { success: false, error: '受講記録が見つかりません' };
  }

  const before = { status: attendance.status };
  attendance.status = 'absent';
  attendance.evidenceNote = note ?? null;
  attendance.recordedByUserId = actorUserId;
  attendance.recordedByUserName = getUserName(actorUserId);
  attendance.updatedAt = new Date().toISOString();

  recordEvent('attendance', attendance.id, 'mark_absent', actorUserId, before, {
    status: 'absent',
  }, note ?? null);

  return { success: true, attendance };
}

export function listAttendances(sessionId: string): TrainingAttendance[] {
  return Array.from(attendancesStore.values())
    .filter((a) => a.sessionId === sessionId)
    .sort((a, b) => (a.userName ?? '').localeCompare(b.userName ?? '', 'ja'));
}

// ========== 自分の研修 ==========

export function myTrainingSummary(userId: string): MyTrainingSummary {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const myAttendances = Array.from(attendancesStore.values()).filter(
    (a) => a.userId === userId
  );

  const pending = myAttendances.filter((a) => a.status === 'assigned');
  const overdue = pending.filter((a) => a.dueAt && new Date(a.dueAt) < now);
  const completedThisYear = myAttendances.filter(
    (a) => a.status === 'attended' && a.attendedAt && new Date(a.attendedAt) >= yearStart
  );
  const recentCompleted = myAttendances
    .filter((a) => a.status === 'attended')
    .sort((a, b) => new Date(b.attendedAt!).getTime() - new Date(a.attendedAt!).getTime())
    .slice(0, 5);

  // セッション名を付与
  const addSessionName = (att: TrainingAttendance) => {
    const session = sessionsStore.get(att.sessionId);
    return {
      ...att,
      sessionName: session?.name,
      courseName: session ? coursesStore.get(session.courseId)?.title : undefined,
    };
  };

  return {
    pendingCount: pending.length,
    overdueCount: overdue.length,
    completedThisYear: completedThisYear.length,
    pending: pending.map(addSessionName) as TrainingAttendance[],
    overdue: overdue.map(addSessionName) as TrainingAttendance[],
    recentCompleted: recentCompleted.map(addSessionName) as TrainingAttendance[],
  };
}

// ========== 統計 ==========

export function getSessionStats(sessionId: string): SessionStats | null {
  const session = sessionsStore.get(sessionId);
  if (!session) return null;

  const attendances = listAttendances(sessionId);
  const now = new Date();

  const targetCount = attendances.length;
  const attendedCount = attendances.filter((a) => a.status === 'attended').length;
  const absentCount = attendances.filter((a) => a.status === 'absent').length;
  const excusedCount = attendances.filter((a) => a.status === 'excused').length;
  const overdueCount = attendances.filter(
    (a) => a.status === 'assigned' && a.dueAt && new Date(a.dueAt) < now
  ).length;
  const attendedRate = targetCount > 0 ? Math.round((attendedCount / targetCount) * 100) : 0;

  return {
    targetCount,
    attendedCount,
    absentCount,
    excusedCount,
    overdueCount,
    attendedRate,
  };
}

// ========== 期限超過スキャン ==========

export function overdueAssignmentsScan(): TrainingAttendance[] {
  const now = new Date();
  return Array.from(attendancesStore.values())
    .filter((a) => a.status === 'assigned' && a.dueAt && new Date(a.dueAt) < now)
    .map((a) => {
      const session = sessionsStore.get(a.sessionId);
      return {
        ...a,
        sessionName: session?.name,
        courseName: session ? coursesStore.get(session.courseId)?.title : undefined,
      } as TrainingAttendance;
    });
}

// ========== イベント一覧 ==========

export function listTrainingEvents(entityType?: TrainingEntityType, entityId?: string): TrainingEvent[] {
  let events = Array.from(eventsStore.values());

  if (entityType) {
    events = events.filter((e) => e.entityType === entityType);
  }

  if (entityId) {
    events = events.filter((e) => e.entityId === entityId);
  }

  return events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// ========== デモデータ投入 ==========

export function seedTrainingData(): void {
  if (coursesStore.size > 0) return;

  const now = new Date();
  const lastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // コース作成
  const courses: Omit<TrainingCourse, 'id' | 'createdAt' | 'updatedAt'>[] = [
    {
      title: '身体拘束適正化研修',
      description: '身体拘束の適正化に関する必須研修です。年1回以上の受講が義務付けられています。',
      category: 'compliance',
      frequency: 'annual',
      required: true,
      defaultDueDays: 30,
      isActive: true,
    },
    {
      title: '感染症予防研修',
      description: '感染症の予防と対応についての研修です。',
      category: 'safety',
      frequency: 'semiannual',
      required: true,
      defaultDueDays: 14,
      isActive: true,
    },
    {
      title: '認知症ケア研修',
      description: '認知症の理解とケア技術についての研修です。',
      category: 'care',
      frequency: 'annual',
      required: false,
      defaultDueDays: 30,
      isActive: true,
    },
    {
      title: '個人情報保護研修',
      description: '個人情報の適切な取り扱いについての研修です。',
      category: 'compliance',
      frequency: 'annual',
      required: true,
      defaultDueDays: 14,
      isActive: true,
    },
    {
      title: '業務システム操作研修',
      description: '新しい業務システムの操作方法についての研修です。',
      category: 'it',
      frequency: 'once',
      required: false,
      defaultDueDays: 7,
      isActive: true,
    },
  ];

  for (const c of courses) {
    const course: TrainingCourse = {
      ...c,
      id: generateCourseId(),
      createdAt: lastMonth.toISOString(),
      updatedAt: lastMonth.toISOString(),
    };
    coursesStore.set(course.id, course);
  }

  // セッション作成
  const sessions: { courseId: string; name: string; status: SessionStatus; scheduledAt: Date }[] = [
    { courseId: 'course_0001', name: '2026年2月 身体拘束適正化研修', status: 'planned', scheduledAt: nextWeek },
    { courseId: 'course_0002', name: '2026年1月 感染症予防研修', status: 'done', scheduledAt: lastMonth },
    { courseId: 'course_0003', name: '2026年2月 認知症ケア研修', status: 'planned', scheduledAt: nextWeek },
    { courseId: 'course_0004', name: '2026年1月 個人情報保護研修', status: 'done', scheduledAt: lastMonth },
  ];

  for (const s of sessions) {
    const session: TrainingSession = {
      id: generateSessionId(),
      courseId: s.courseId,
      name: s.name,
      scheduledAt: s.scheduledAt.toISOString(),
      durationMinutes: 60,
      location: '会議室A',
      instructorName: '研修委員会',
      notes: null,
      status: s.status,
      createdByUserId: 'user_003',
      createdAt: lastMonth.toISOString(),
      updatedAt: now.toISOString(),
    };
    sessionsStore.set(session.id, session);
  }

  // 受講記録作成
  const userIds = ['user_001', 'user_002', 'user_003', 'user_004', 'user_005'];

  // session_0001（予定中）の割当
  for (const userId of userIds) {
    const assignment: TrainingAssignment = {
      id: generateAssignmentId(),
      sessionId: 'session_0001',
      userId,
      userName: getUserName(userId),
      dueAt: nextWeek.toISOString(),
      assignedAt: now.toISOString(),
      assignedByUserId: 'user_003',
    };
    assignmentsStore.set(assignment.id, assignment);

    const attendance: TrainingAttendance = {
      id: generateAttendanceId(),
      sessionId: 'session_0001',
      userId,
      userName: getUserName(userId),
      attendedAt: null,
      status: 'assigned',
      evidenceType: null,
      evidenceNote: null,
      recordedByUserId: null,
      dueAt: nextWeek.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    attendancesStore.set(attendance.id, attendance);
  }

  // session_0002（完了）の記録
  for (const userId of userIds) {
    const assignment: TrainingAssignment = {
      id: generateAssignmentId(),
      sessionId: 'session_0002',
      userId,
      userName: getUserName(userId),
      dueAt: lastMonth.toISOString(),
      assignedAt: lastMonth.toISOString(),
      assignedByUserId: 'user_003',
    };
    assignmentsStore.set(assignment.id, assignment);

    const isAttended = userId !== 'user_005'; // user_005 は未受講
    const attendance: TrainingAttendance = {
      id: generateAttendanceId(),
      sessionId: 'session_0002',
      userId,
      userName: getUserName(userId),
      attendedAt: isAttended ? lastMonth.toISOString() : null,
      status: isAttended ? 'attended' : 'assigned',
      evidenceType: isAttended ? 'manual' : null,
      evidenceNote: isAttended ? '受講確認' : null,
      recordedByUserId: isAttended ? 'user_003' : null,
      dueAt: yesterday.toISOString(), // 期限超過
      createdAt: lastMonth.toISOString(),
      updatedAt: now.toISOString(),
    };
    attendancesStore.set(attendance.id, attendance);
  }

  // session_0003（予定中）
  for (const userId of ['user_001', 'user_002', 'user_003']) {
    const assignment: TrainingAssignment = {
      id: generateAssignmentId(),
      sessionId: 'session_0003',
      userId,
      userName: getUserName(userId),
      dueAt: nextWeek.toISOString(),
      assignedAt: now.toISOString(),
      assignedByUserId: 'user_003',
    };
    assignmentsStore.set(assignment.id, assignment);

    const attendance: TrainingAttendance = {
      id: generateAttendanceId(),
      sessionId: 'session_0003',
      userId,
      userName: getUserName(userId),
      attendedAt: null,
      status: 'assigned',
      evidenceType: null,
      evidenceNote: null,
      recordedByUserId: null,
      dueAt: nextWeek.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    attendancesStore.set(attendance.id, attendance);
  }
}

// 初期化時にデモデータ投入
seedTrainingData();
