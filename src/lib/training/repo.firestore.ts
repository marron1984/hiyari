/**
 * 研修管理リポジトリ - Firestore実装
 *
 * PROD-003: Cloud Firestore永続化
 *
 * コレクション:
 * - training_courses: 研修コース（マスタ）
 * - training_sessions: 研修セッション（実施回）
 * - training_assignments: 対象者割当
 * - training_attendances: 受講記録
 * - training_events: 監査ログ
 */

import { getAdminDb } from '@/lib/firebase-admin';
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
  TrainingStats,
  TrainingStatsOptions,
} from './types';
import { canManageTraining, canViewAllStats } from './types';

// ========== 定数 ==========

const COURSES_COLLECTION = 'training_courses';
const SESSIONS_COLLECTION = 'training_sessions';
const ASSIGNMENTS_COLLECTION = 'training_assignments';
const ATTENDANCES_COLLECTION = 'training_attendances';
const EVENTS_COLLECTION = 'training_events';

// ========== ユーティリティ ==========

function now(): string {
  return new Date().toISOString();
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ========== ドキュメント変換 ==========

function docToCourse(doc: FirebaseFirestore.DocumentSnapshot): TrainingCourse | null {
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    title: data.title ?? '',
    description: data.description ?? null,
    category: data.category ?? 'other',
    frequency: data.frequency ?? 'once',
    required: data.required ?? false,
    defaultDueDays: data.defaultDueDays ?? null,
    isActive: data.isActive ?? true,
    createdAt: data.createdAt ?? now(),
    updatedAt: data.updatedAt ?? now(),
  };
}

function docToSession(doc: FirebaseFirestore.DocumentSnapshot): TrainingSession | null {
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    courseId: data.courseId ?? '',
    courseName: data.courseName,
    name: data.name ?? '',
    scheduledAt: data.scheduledAt ?? now(),
    durationMinutes: data.durationMinutes ?? null,
    location: data.location ?? null,
    instructorName: data.instructorName ?? null,
    notes: data.notes ?? null,
    status: data.status ?? 'planned',
    createdByUserId: data.createdByUserId ?? '',
    createdByUserName: data.createdByUserName,
    createdAt: data.createdAt ?? now(),
    updatedAt: data.updatedAt ?? now(),
  };
}

function docToAssignment(doc: FirebaseFirestore.DocumentSnapshot): TrainingAssignment | null {
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    sessionId: data.sessionId ?? '',
    userId: data.userId ?? '',
    userName: data.userName,
    dueAt: data.dueAt ?? null,
    assignedAt: data.assignedAt ?? now(),
    assignedByUserId: data.assignedByUserId ?? null,
  };
}

function docToAttendance(doc: FirebaseFirestore.DocumentSnapshot): TrainingAttendance | null {
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    sessionId: data.sessionId ?? '',
    userId: data.userId ?? '',
    userName: data.userName,
    attendedAt: data.attendedAt ?? null,
    status: data.status ?? 'assigned',
    evidenceType: data.evidenceType ?? null,
    evidenceNote: data.evidenceNote ?? null,
    recordedByUserId: data.recordedByUserId ?? null,
    recordedByUserName: data.recordedByUserName ?? null,
    dueAt: data.dueAt ?? null,
    createdAt: data.createdAt ?? now(),
    updatedAt: data.updatedAt ?? now(),
  };
}

function docToEvent(doc: FirebaseFirestore.DocumentSnapshot): TrainingEvent | null {
  if (!doc.exists) return null;
  const data = doc.data()!;
  return {
    id: data.id ?? doc.id,
    entityType: data.entityType ?? 'course',
    entityId: data.entityId ?? '',
    actorUserId: data.actorUserId ?? null,
    actorUserName: data.actorUserName ?? null,
    action: data.action ?? 'create',
    beforeJson: data.beforeJson ?? null,
    afterJson: data.afterJson ?? null,
    createdAt: data.createdAt ?? now(),
    note: data.note ?? null,
  };
}

// ========== イベント記録 ==========

async function recordEvent(
  entityType: TrainingEntityType,
  entityId: string,
  action: TrainingEventAction,
  actorUserId: string | null,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  note: string | null = null
): Promise<TrainingEvent> {
  const db = getAdminDb();
  const event: TrainingEvent = {
    id: generateId('tevt'),
    entityType,
    entityId,
    actorUserId,
    actorUserName: null,
    action,
    beforeJson: before,
    afterJson: after,
    createdAt: now(),
    note,
  };
  await db.collection(EVENTS_COLLECTION).doc(event.id).set(event);
  return event;
}

// ========== コース管理 ==========

export async function listCourses(filter: {
  q?: string;
  category?: TrainingCategory;
  active?: boolean;
}): Promise<TrainingCourse[]> {
  const db = getAdminDb();
  let query: FirebaseFirestore.Query = db.collection(COURSES_COLLECTION);

  if (filter.category) {
    query = query.where('category', '==', filter.category);
  }
  if (filter.active !== undefined) {
    query = query.where('isActive', '==', filter.active);
  }

  const snap = await query.get();
  let courses = snap.docs.map((doc) => docToCourse(doc)!);

  if (filter.q) {
    const q = filter.q.toLowerCase();
    courses = courses.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.description && c.description.toLowerCase().includes(q))
    );
  }

  return courses.sort((a, b) => a.title.localeCompare(b.title, 'ja'));
}

export async function getCourse(id: string): Promise<TrainingCourse | null> {
  const db = getAdminDb();
  const doc = await db.collection(COURSES_COLLECTION).doc(id).get();
  return docToCourse(doc);
}

export async function createCourse(
  input: {
    title: string;
    description?: string | null;
    category?: TrainingCategory;
    frequency?: TrainingFrequency;
    required?: boolean;
    defaultDueDays?: number | null;
  },
  actorUserId: string
): Promise<TrainingCourse> {
  const db = getAdminDb();
  const timestamp = now();
  const course: TrainingCourse = {
    id: generateId('course'),
    title: input.title,
    description: input.description ?? null,
    category: input.category ?? 'other',
    frequency: input.frequency ?? 'once',
    required: input.required ?? false,
    defaultDueDays: input.defaultDueDays ?? null,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await db.collection(COURSES_COLLECTION).doc(course.id).set(course);

  await recordEvent('course', course.id, 'create', actorUserId, null, {
    title: course.title,
    category: course.category,
  }, null);

  return course;
}

export async function updateCourse(
  id: string,
  patch: Partial<Omit<TrainingCourse, 'id' | 'createdAt' | 'updatedAt'>>,
  actorUserId: string
): Promise<{ success: true; course: TrainingCourse } | { success: false; error: string }> {
  const db = getAdminDb();
  const docRef = db.collection(COURSES_COLLECTION).doc(id);
  const doc = await docRef.get();
  const course = docToCourse(doc);
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

  course.updatedAt = now();

  await docRef.set(course);

  if (Object.keys(after).length > 0) {
    await recordEvent('course', id, 'update', actorUserId, before, after, null);
  }

  return { success: true, course };
}

// ========== セッション管理 ==========

export async function listSessions(filter: {
  courseId?: string;
  status?: SessionStatus;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
}): Promise<TrainingSession[]> {
  const db = getAdminDb();
  let query: FirebaseFirestore.Query = db.collection(SESSIONS_COLLECTION);

  if (filter.courseId) {
    query = query.where('courseId', '==', filter.courseId);
  }
  if (filter.status) {
    query = query.where('status', '==', filter.status);
  }

  const snap = await query.get();
  let sessions = snap.docs.map((doc) => docToSession(doc)!);

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
  for (const s of sessions) {
    const courseDoc = await db.collection(COURSES_COLLECTION).doc(s.courseId).get();
    const course = docToCourse(courseDoc);
    if (course) {
      s.courseName = course.title;
    }
  }

  return sessions.sort(
    (a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
  );
}

export async function getSession(id: string): Promise<TrainingSession | null> {
  const db = getAdminDb();
  const doc = await db.collection(SESSIONS_COLLECTION).doc(id).get();
  const session = docToSession(doc);
  if (!session) return null;

  const courseDoc = await db.collection(COURSES_COLLECTION).doc(session.courseId).get();
  const course = docToCourse(courseDoc);
  if (course) {
    session.courseName = course.title;
  }

  return session;
}

export async function createSession(
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
): Promise<{ success: true; session: TrainingSession } | { success: false; error: string }> {
  const db = getAdminDb();

  const courseDoc = await db.collection(COURSES_COLLECTION).doc(input.courseId).get();
  const course = docToCourse(courseDoc);
  if (!course) {
    return { success: false, error: '研修コースが見つかりません' };
  }

  const timestamp = now();
  const session: TrainingSession = {
    id: generateId('session'),
    courseId: input.courseId,
    name: input.name,
    scheduledAt: input.scheduledAt,
    durationMinutes: input.durationMinutes ?? null,
    location: input.location ?? null,
    instructorName: input.instructorName ?? null,
    notes: input.notes ?? null,
    status: 'planned',
    createdByUserId: actorUserId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await db.collection(SESSIONS_COLLECTION).doc(session.id).set(session);

  await recordEvent('session', session.id, 'create', actorUserId, null, {
    name: session.name,
    courseId: session.courseId,
    scheduledAt: session.scheduledAt,
  }, null);

  return { success: true, session };
}

export async function updateSession(
  id: string,
  patch: Partial<Omit<TrainingSession, 'id' | 'createdAt' | 'updatedAt' | 'createdByUserId'>>,
  actorUserId: string
): Promise<{ success: true; session: TrainingSession } | { success: false; error: string }> {
  const db = getAdminDb();
  const docRef = db.collection(SESSIONS_COLLECTION).doc(id);
  const doc = await docRef.get();
  const session = docToSession(doc);
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

  session.updatedAt = now();

  await docRef.set(session);

  if (Object.keys(after).length > 0) {
    await recordEvent('session', id, 'update', actorUserId, before, after, null);
  }

  return { success: true, session };
}

export async function setSessionStatus(
  id: string,
  status: SessionStatus,
  actorUserId: string
): Promise<{ success: true; session: TrainingSession } | { success: false; error: string }> {
  const db = getAdminDb();
  const docRef = db.collection(SESSIONS_COLLECTION).doc(id);
  const doc = await docRef.get();
  const session = docToSession(doc);
  if (!session) {
    return { success: false, error: '研修セッションが見つかりません' };
  }

  const before = { status: session.status };
  session.status = status;
  session.updatedAt = now();

  await docRef.set(session);

  const action: TrainingEventAction = status === 'cancelled' ? 'cancel' : 'update';
  await recordEvent('session', id, action, actorUserId, before, { status }, null);

  return { success: true, session };
}

// ========== 対象者割当・受講記録 ==========

export async function assignUsers(
  sessionId: string,
  userIds: string[],
  dueAt: string | null,
  actorUserId: string
): Promise<{ success: true; count: number } | { success: false; error: string }> {
  const db = getAdminDb();

  const sessionDoc = await db.collection(SESSIONS_COLLECTION).doc(sessionId).get();
  const session = docToSession(sessionDoc);
  if (!session) {
    return { success: false, error: '研修セッションが見つかりません' };
  }

  const timestamp = now();
  let count = 0;

  for (const userId of userIds) {
    // 既存チェック
    const existingSnap = await db
      .collection(ASSIGNMENTS_COLLECTION)
      .where('sessionId', '==', sessionId)
      .where('userId', '==', userId)
      .limit(1)
      .get();
    if (!existingSnap.empty) continue;

    // Assignment作成
    const assignment: TrainingAssignment = {
      id: generateId('assign'),
      sessionId,
      userId,
      userName: undefined,
      dueAt,
      assignedAt: timestamp,
      assignedByUserId: actorUserId,
    };
    await db.collection(ASSIGNMENTS_COLLECTION).doc(assignment.id).set(assignment);

    // Attendance作成（初期状態）
    const attendance: TrainingAttendance = {
      id: generateId('attend'),
      sessionId,
      userId,
      userName: undefined,
      attendedAt: null,
      status: 'assigned',
      evidenceType: null,
      evidenceNote: null,
      recordedByUserId: null,
      dueAt,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await db.collection(ATTENDANCES_COLLECTION).doc(attendance.id).set(attendance);

    await recordEvent('attendance', attendance.id, 'assign', actorUserId, null, {
      sessionId,
      userId,
      dueAt,
    }, null);

    count++;
  }

  return { success: true, count };
}

export async function markAttended(
  sessionId: string,
  userId: string,
  attendedAt: string | null,
  actorUserId: string,
  evidenceNote?: string
): Promise<{ success: true; attendance: TrainingAttendance } | { success: false; error: string }> {
  const db = getAdminDb();
  const snap = await db
    .collection(ATTENDANCES_COLLECTION)
    .where('sessionId', '==', sessionId)
    .where('userId', '==', userId)
    .limit(1)
    .get();

  if (snap.empty) {
    return { success: false, error: '受講記録が見つかりません' };
  }

  const docRef = snap.docs[0].ref;
  const attendance = docToAttendance(snap.docs[0])!;

  const before = { status: attendance.status, attendedAt: attendance.attendedAt };
  attendance.status = 'attended';
  attendance.attendedAt = attendedAt ?? now();
  attendance.evidenceType = 'manual';
  attendance.evidenceNote = evidenceNote ?? null;
  attendance.recordedByUserId = actorUserId;
  attendance.updatedAt = now();

  await docRef.set(attendance);

  await recordEvent('attendance', attendance.id, 'mark_attended', actorUserId, before, {
    status: 'attended',
    attendedAt: attendance.attendedAt,
  }, evidenceNote ?? null);

  return { success: true, attendance };
}

export async function markAbsent(
  sessionId: string,
  userId: string,
  actorUserId: string,
  note?: string
): Promise<{ success: true; attendance: TrainingAttendance } | { success: false; error: string }> {
  const db = getAdminDb();
  const snap = await db
    .collection(ATTENDANCES_COLLECTION)
    .where('sessionId', '==', sessionId)
    .where('userId', '==', userId)
    .limit(1)
    .get();

  if (snap.empty) {
    return { success: false, error: '受講記録が見つかりません' };
  }

  const docRef = snap.docs[0].ref;
  const attendance = docToAttendance(snap.docs[0])!;

  const before = { status: attendance.status };
  attendance.status = 'absent';
  attendance.evidenceNote = note ?? null;
  attendance.recordedByUserId = actorUserId;
  attendance.updatedAt = now();

  await docRef.set(attendance);

  await recordEvent('attendance', attendance.id, 'mark_absent', actorUserId, before, {
    status: 'absent',
  }, note ?? null);

  return { success: true, attendance };
}

export async function listAttendances(sessionId: string): Promise<TrainingAttendance[]> {
  const db = getAdminDb();
  const snap = await db
    .collection(ATTENDANCES_COLLECTION)
    .where('sessionId', '==', sessionId)
    .get();

  const attendances = snap.docs.map((doc) => docToAttendance(doc)!);
  return attendances.sort((a, b) => (a.userName ?? '').localeCompare(b.userName ?? '', 'ja'));
}

// ========== 自分の研修 ==========

export async function myTrainingSummary(userId: string): Promise<MyTrainingSummary> {
  const db = getAdminDb();
  const currentTime = new Date();
  const yearStart = new Date(currentTime.getFullYear(), 0, 1);

  const snap = await db
    .collection(ATTENDANCES_COLLECTION)
    .where('userId', '==', userId)
    .get();

  const myAttendances = snap.docs.map((doc) => docToAttendance(doc)!);

  const pending = myAttendances.filter((a) => a.status === 'assigned');
  const overdue = pending.filter((a) => a.dueAt && new Date(a.dueAt) < currentTime);
  const completedThisYear = myAttendances.filter(
    (a) => a.status === 'attended' && a.attendedAt && new Date(a.attendedAt) >= yearStart
  );
  const recentCompleted = myAttendances
    .filter((a) => a.status === 'attended')
    .sort((a, b) => new Date(b.attendedAt!).getTime() - new Date(a.attendedAt!).getTime())
    .slice(0, 5);

  // セッション名を付与
  const addSessionName = async (att: TrainingAttendance) => {
    const sessionDoc = await db.collection(SESSIONS_COLLECTION).doc(att.sessionId).get();
    const session = docToSession(sessionDoc);
    if (session) {
      (att as any).sessionName = session.name;
      const courseDoc = await db.collection(COURSES_COLLECTION).doc(session.courseId).get();
      const course = docToCourse(courseDoc);
      if (course) {
        (att as any).courseName = course.title;
      }
    }
    return att;
  };

  const [enrichedPending, enrichedOverdue, enrichedRecent] = await Promise.all([
    Promise.all(pending.map(addSessionName)),
    Promise.all(overdue.map(addSessionName)),
    Promise.all(recentCompleted.map(addSessionName)),
  ]);

  return {
    pendingCount: pending.length,
    overdueCount: overdue.length,
    completedThisYear: completedThisYear.length,
    pending: enrichedPending as TrainingAttendance[],
    overdue: enrichedOverdue as TrainingAttendance[],
    recentCompleted: enrichedRecent as TrainingAttendance[],
  };
}

// ========== 統計 ==========

export async function getSessionStats(sessionId: string): Promise<SessionStats | null> {
  const db = getAdminDb();
  const sessionDoc = await db.collection(SESSIONS_COLLECTION).doc(sessionId).get();
  const session = docToSession(sessionDoc);
  if (!session) return null;

  const attendances = await listAttendances(sessionId);
  const currentTime = new Date();

  const targetCount = attendances.length;
  const attendedCount = attendances.filter((a) => a.status === 'attended').length;
  const absentCount = attendances.filter((a) => a.status === 'absent').length;
  const excusedCount = attendances.filter((a) => a.status === 'excused').length;
  const overdueCount = attendances.filter(
    (a) => a.status === 'assigned' && a.dueAt && new Date(a.dueAt) < currentTime
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

// ========== Task 054: スコープ対応統計 ==========

export async function getStats(
  viewer: ViewerContext,
  options?: TrainingStatsOptions
): Promise<TrainingStats | null> {
  if (!canViewAllStats(viewer)) {
    return null;
  }

  const db = getAdminDb();
  const currentTime = new Date();
  const weekAgo = new Date(currentTime.getTime() - 7 * 24 * 60 * 60 * 1000);

  // 全受講記録を取得
  const snap = await db.collection(ATTENDANCES_COLLECTION).get();
  let attendances = snap.docs.map((doc) => docToAttendance(doc)!);

  // Task 054: orgUnitIds スコープフィルタ
  // Note: Firestore版ではユーザー→組織マッピングは外部から取得する必要がある
  // 現在は全データを返し、将来的にユーザー所属フィルタを追加

  // 期限超過（未受講 + 期限切れ）
  const overdueCount = attendances.filter(
    (a) => a.status === 'assigned' && a.dueAt && new Date(a.dueAt) < currentTime
  ).length;

  // 未受講（assigned）件数
  const assignedOpenCount = attendances.filter(
    (a) => a.status === 'assigned'
  ).length;

  // 今週完了したセッション数（ユニークセッション）
  const attendedThisWeek = attendances.filter(
    (a) => a.status === 'attended' && a.attendedAt && new Date(a.attendedAt) >= weekAgo
  );
  const sessionsDoneThisWeek = new Set(attendedThisWeek.map((a) => a.sessionId)).size;

  return {
    overdueCount,
    sessionsDoneThisWeek,
    assignedOpenCount,
  };
}

// ========== 期限超過スキャン ==========

export async function overdueAssignmentsScan(): Promise<TrainingAttendance[]> {
  const db = getAdminDb();
  const currentTime = new Date();

  const snap = await db
    .collection(ATTENDANCES_COLLECTION)
    .where('status', '==', 'assigned')
    .get();

  const overdue = snap.docs
    .map((doc) => docToAttendance(doc)!)
    .filter((a) => a.dueAt && new Date(a.dueAt) < currentTime);

  // セッション名を付与
  for (const a of overdue) {
    const sessionDoc = await db.collection(SESSIONS_COLLECTION).doc(a.sessionId).get();
    const session = docToSession(sessionDoc);
    if (session) {
      (a as any).sessionName = session.name;
      const courseDoc = await db.collection(COURSES_COLLECTION).doc(session.courseId).get();
      const course = docToCourse(courseDoc);
      if (course) {
        (a as any).courseName = course.title;
      }
    }
  }

  return overdue;
}

// ========== イベント一覧 ==========

export async function listTrainingEvents(entityType?: TrainingEntityType, entityId?: string): Promise<TrainingEvent[]> {
  const db = getAdminDb();
  let query: FirebaseFirestore.Query = db
    .collection(EVENTS_COLLECTION)
    .orderBy('createdAt', 'desc');

  if (entityType) {
    query = db
      .collection(EVENTS_COLLECTION)
      .where('entityType', '==', entityType)
      .orderBy('createdAt', 'desc');
  }

  const snap = await query.get();
  let events = snap.docs.map((doc) => docToEvent(doc)!);

  if (entityId) {
    events = events.filter((e) => e.entityId === entityId);
  }

  return events;
}

// ========== デモデータ投入 ==========

export async function seedTrainingData(): Promise<void> {
  // Firestore版では no-op（データはFirestoreに直接投入）
  console.warn('[Training:Firestore] seedTrainingData is a no-op in Firestore mode');
}
