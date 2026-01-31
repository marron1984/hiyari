// ======== AI副社長「今日のTODO」自動生成ライブラリ ========

import { getAdminDb } from './firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { toDate } from './date';
import type {
  TodoItem,
  TodoGenerationResult,
  TodoPriority,
  TodoSource,
  TodoRole,
  PendingApproval,
  AttendanceAlert,
  StaleSalesCase,
  MissingDocument,
  GetTodosOptions,
  TodoDashboardSummary,
} from '@/types/todo';

const DEFAULT_TENANT_ID = 'defaultTenant';

// ======== 定数 ========

/** 承認滞留の閾値（日数） */
const APPROVAL_STALE_THRESHOLD = 2;

/** 営業停滞の閾値（日数） */
const SALES_STALE_THRESHOLD = 7;

/** 書類期限警告の閾値（日数） */
const DOCUMENT_DUE_WARNING_DAYS = 7;

// ======== ヘルパー関数 ========

/**
 * 日数を計算
 */
function daysSince(date: Date): number {
  const now = new Date();
  const diffTime = now.getTime() - date.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * 日数を計算（未来）
 */
function daysUntil(date: Date): number {
  const now = new Date();
  const diffTime = date.getTime() - now.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * 今日の日付文字列を取得
 */
function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

// ======== データ収集 ========

/**
 * 未承認の申請を取得
 */
async function getPendingApprovals(): Promise<PendingApproval[]> {
  const db = getAdminDb();
  const results: PendingApproval[] = [];

  // 稟議
  const ringisSnapshot = await db
    .collection('ringis')
    .where('tenantId', '==', DEFAULT_TENANT_ID)
    .where('status', '==', 'submitted')
    .get();

  for (const doc of ringisSnapshot.docs) {
    const data = doc.data();
    const createdAt = toDate(data.createdAt) || new Date();
    results.push({
      id: doc.id,
      type: 'ringi',
      title: data.title || '稟議',
      applicantName: data.authorName || '',
      applicantId: data.authorId || '',
      createdAt,
      staleDays: daysSince(createdAt),
      amount: data.amount,
      currentStep: data.currentStep,
      nextApproverId: data.nextApproverId,
    });
  }

  // 申請（経費・残業等）
  const applicationsSnapshot = await db
    .collection('applications')
    .where('tenantId', '==', DEFAULT_TENANT_ID)
    .where('status', 'in', ['submitted', 'pending'])
    .get();

  for (const doc of applicationsSnapshot.docs) {
    const data = doc.data();
    const createdAt = toDate(data.createdAt) || new Date();
    results.push({
      id: doc.id,
      type: data.type || 'application',
      title: data.title || `${data.type || '申請'}`,
      applicantName: data.applicantName || '',
      applicantId: data.applicantId || '',
      createdAt,
      staleDays: daysSince(createdAt),
      amount: data.amount,
      currentStep: data.currentStep,
      nextApproverId: data.nextApproverId,
    });
  }

  return results;
}

/**
 * 勤怠アラートを取得（直近の anomalyReports から）
 */
async function getAttendanceAlerts(): Promise<AttendanceAlert[]> {
  const db = getAdminDb();
  const results: AttendanceAlert[] = [];

  // 直近7日間の anomalyReports を取得
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const reportsSnapshot = await db
    .collection('anomalyReports')
    .where('tenantId', '==', DEFAULT_TENANT_ID)
    .where('createdAt', '>=', sevenDaysAgo)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();

  if (!reportsSnapshot.empty) {
    const report = reportsSnapshot.docs[0].data();
    const anomalies = report.anomalies || [];

    for (const anomaly of anomalies) {
      if (anomaly.severity === 'NG' || anomaly.severity === 'WARN') {
        results.push({
          id: `${reportsSnapshot.docs[0].id}_${anomaly.userId}_${anomaly.date}`,
          userId: anomaly.userId,
          userName: anomaly.userName || '',
          date: anomaly.date,
          type: anomaly.severity,
          reason: anomaly.reason || anomaly.message || '',
          overtimeMinutes: anomaly.overtimeMinutes,
          approvedMinutes: anomaly.approvedMinutes,
        });
      }
    }
  }

  return results;
}

/**
 * 停滞している営業案件を取得
 */
async function getStaleSalesCases(): Promise<StaleSalesCase[]> {
  const db = getAdminDb();
  const results: StaleSalesCase[] = [];

  // prospects の進行中案件
  const prospectsSnapshot = await db
    .collection('prospects')
    .where('tenantId', '==', DEFAULT_TENANT_ID)
    .where('status', 'in', ['対応中', '検討中', '施設見学', '面談調整中'])
    .get();

  for (const doc of prospectsSnapshot.docs) {
    const data = doc.data();
    const lastUpdated = toDate(data.updatedAt) || toDate(data.createdAt) || new Date();
    const staleDays = daysSince(lastUpdated);

    if (staleDays >= SALES_STALE_THRESHOLD) {
      const expectedCloseDate = toDate(data.expectedMoveInDate);
      results.push({
        id: doc.id,
        prospectName: data.customerName || '',
        stage: data.status || '',
        assignedTo: data.assignedTo || '',
        assignedToName: data.assignedToName || '',
        lastUpdated,
        staleDays,
        expectedCloseDate: expectedCloseDate || undefined,
        isOverdue: expectedCloseDate ? expectedCloseDate < new Date() : false,
      });
    }
  }

  return results;
}

/**
 * 未提出・期限切れ書類を取得
 */
async function getMissingDocuments(): Promise<MissingDocument[]> {
  const db = getAdminDb();
  const results: MissingDocument[] = [];

  // 書類テンプレートから必須書類を取得
  const templatesSnapshot = await db
    .collection('documentTemplates')
    .where('required', '==', true)
    .get();

  const requiredTemplates = templatesSnapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      name: data.name as string | undefined,
      ownerType: data.ownerType as 'prospect' | 'user' | undefined,
    };
  });

  // prospects の書類チェック
  const prospectsSnapshot = await db
    .collection('prospects')
    .where('tenantId', '==', DEFAULT_TENANT_ID)
    .where('status', 'in', ['対応中', '検討中', '施設見学', '契約準備中'])
    .get();

  for (const prospectDoc of prospectsSnapshot.docs) {
    const prospect = prospectDoc.data();

    // 提出済み書類を取得
    const docsSnapshot = await db
      .collection('documents')
      .where('targetId', '==', prospectDoc.id)
      .get();

    const submittedTypes = new Set(docsSnapshot.docs.map((d) => d.data().templateId));

    // 未提出の必須書類をチェック
    for (const template of requiredTemplates) {
      if (template.ownerType === 'prospect' && !submittedTypes.has(template.id)) {
        const dueDate = prospect.expectedMoveInDate
          ? toDate(prospect.expectedMoveInDate)
          : undefined;
        const daysUntilDue = dueDate ? daysUntil(dueDate) : undefined;

        results.push({
          id: `${prospectDoc.id}_${template.id}`,
          documentType: template.name || template.id,
          targetId: prospectDoc.id,
          targetName: prospect.customerName || '',
          targetType: 'prospect',
          dueDate: dueDate || undefined,
          isOverdue: dueDate ? dueDate < new Date() : false,
          daysUntilDue,
        });
      }
    }
  }

  return results;
}

// ======== TODO生成 ========

/**
 * 承認系TODOを生成
 */
function generateApprovalTodos(
  approvals: PendingApproval[],
  users: Map<string, { id: string; name: string; role: string }>
): TodoItem[] {
  const todos: TodoItem[] = [];
  const now = new Date();
  const today = getTodayString();

  for (const approval of approvals) {
    // 承認者向けTODO
    const approverIds = approval.nextApproverId
      ? [approval.nextApproverId]
      : Array.from(users.values())
          .filter((u) => u.role === 'admin' || u.role === 'system_admin')
          .map((u) => u.id);

    for (const approverId of approverIds) {
      const user = users.get(approverId);
      if (!user) continue;

      const priority: TodoPriority = approval.staleDays >= APPROVAL_STALE_THRESHOLD ? 'MEDIUM' : 'LOW';
      const typeLabel = {
        ringi: '稟議',
        expense: '経費申請',
        overtime: '残業申請',
        application: '申請',
      }[approval.type] || '申請';

      todos.push({
        tenantId: DEFAULT_TENANT_ID,
        userId: approverId,
        userRole: (user.role === 'admin' || user.role === 'system_admin' ? 'exec' : 'manager') as TodoRole,
        priority,
        title: `${typeLabel}の承認: ${approval.title}`,
        description: `${approval.applicantName}さんからの${typeLabel}が${approval.staleDays}日間未承認です`,
        link: approval.type === 'ringi' ? `/ringi/${approval.id}` : `/dashboard/applications/${approval.id}`,
        source: 'APPROVAL',
        sourceId: approval.id,
        staleDays: approval.staleDays,
        isCompleted: false,
        createdAt: now,
        updatedAt: now,
        generatedAt: now,
      });
    }
  }

  return todos;
}

/**
 * 勤怠系TODOを生成
 */
function generateOvertimeTodos(
  alerts: AttendanceAlert[],
  users: Map<string, { id: string; name: string; role: string }>
): TodoItem[] {
  const todos: TodoItem[] = [];
  const now = new Date();

  for (const alert of alerts) {
    // 管理者向けTODO（NGは HIGH、WARNは MEDIUM）
    const adminUsers = Array.from(users.values()).filter(
      (u) => u.role === 'admin' || u.role === 'system_admin' || u.role === 'leader'
    );

    for (const admin of adminUsers) {
      const priority: TodoPriority = alert.type === 'NG' ? 'HIGH' : 'MEDIUM';

      todos.push({
        tenantId: DEFAULT_TENANT_ID,
        userId: admin.id,
        userRole: admin.role === 'leader' ? 'manager' : 'exec',
        priority,
        title: alert.type === 'NG' ? `未申請残業の確認: ${alert.userName}` : `勤怠アラート: ${alert.userName}`,
        description: `${alert.date}: ${alert.reason}`,
        link: '/admin/attendance/dashboard',
        source: 'OVERTIME',
        sourceId: alert.id,
        isCompleted: false,
        createdAt: now,
        updatedAt: now,
        generatedAt: now,
      });
    }

    // 本人向けTODO
    const user = users.get(alert.userId);
    if (user) {
      todos.push({
        tenantId: DEFAULT_TENANT_ID,
        userId: alert.userId,
        userRole: 'staff',
        priority: alert.type === 'NG' ? 'HIGH' : 'MEDIUM',
        title: alert.type === 'NG' ? '残業申請が必要です' : '勤怠確認が必要です',
        description: `${alert.date}: ${alert.reason}`,
        link: '/attendance/overtime',
        source: 'OVERTIME',
        sourceId: alert.id,
        isCompleted: false,
        createdAt: now,
        updatedAt: now,
        generatedAt: now,
      });
    }
  }

  return todos;
}

/**
 * 営業系TODOを生成
 */
function generateSalesTodos(
  cases: StaleSalesCase[],
  users: Map<string, { id: string; name: string; role: string }>
): TodoItem[] {
  const todos: TodoItem[] = [];
  const now = new Date();

  for (const salesCase of cases) {
    // 担当者向けTODO
    const assignee = users.get(salesCase.assignedTo);
    if (assignee) {
      const priority: TodoPriority = salesCase.isOverdue ? 'MEDIUM' : 'LOW';

      todos.push({
        tenantId: DEFAULT_TENANT_ID,
        userId: salesCase.assignedTo,
        userRole: 'staff',
        priority,
        title: salesCase.isOverdue ? `期限超過案件: ${salesCase.prospectName}` : `停滞案件: ${salesCase.prospectName}`,
        description: `${salesCase.staleDays}日間更新なし（ステータス: ${salesCase.stage}）`,
        link: `/dashboard/prospects/${salesCase.id}`,
        source: 'SALES',
        sourceId: salesCase.id,
        staleDays: salesCase.staleDays,
        dueDate: salesCase.expectedCloseDate,
        isCompleted: false,
        createdAt: now,
        updatedAt: now,
        generatedAt: now,
      });
    }

    // 管理者向けTODO（期限超過のみ）
    if (salesCase.isOverdue) {
      const admins = Array.from(users.values()).filter(
        (u) => u.role === 'admin' || u.role === 'system_admin'
      );

      for (const admin of admins) {
        todos.push({
          tenantId: DEFAULT_TENANT_ID,
          userId: admin.id,
          userRole: 'exec',
          priority: 'MEDIUM',
          title: `期限超過案件の確認: ${salesCase.prospectName}`,
          description: `担当: ${salesCase.assignedToName || salesCase.assignedTo}、${salesCase.staleDays}日間更新なし`,
          link: `/dashboard/prospects/${salesCase.id}`,
          source: 'SALES',
          sourceId: salesCase.id,
          staleDays: salesCase.staleDays,
          isCompleted: false,
          createdAt: now,
          updatedAt: now,
          generatedAt: now,
        });
      }
    }
  }

  return todos;
}

/**
 * 書類系TODOを生成
 */
function generateDocumentTodos(
  documents: MissingDocument[],
  users: Map<string, { id: string; name: string; role: string }>
): TodoItem[] {
  const todos: TodoItem[] = [];
  const now = new Date();

  // 管理者向けTODO
  const admins = Array.from(users.values()).filter(
    (u) => u.role === 'admin' || u.role === 'system_admin' || u.role === 'leader'
  );

  for (const doc of documents) {
    const isUrgent = doc.isOverdue || (doc.daysUntilDue !== undefined && doc.daysUntilDue <= DOCUMENT_DUE_WARNING_DAYS);
    const priority: TodoPriority = doc.isOverdue ? 'MEDIUM' : 'LOW';

    for (const admin of admins) {
      todos.push({
        tenantId: DEFAULT_TENANT_ID,
        userId: admin.id,
        userRole: admin.role === 'leader' ? 'manager' : 'exec',
        priority,
        title: doc.isOverdue
          ? `書類期限超過: ${doc.targetName} - ${doc.documentType}`
          : `書類未提出: ${doc.targetName} - ${doc.documentType}`,
        description: doc.dueDate
          ? `期限: ${doc.dueDate.toLocaleDateString('ja-JP')}${doc.isOverdue ? '（超過）' : ''}`
          : '期限未設定',
        link: `/dashboard/prospects/${doc.targetId}`,
        source: 'DOCUMENT',
        sourceId: doc.id,
        dueDate: doc.dueDate,
        isCompleted: false,
        createdAt: now,
        updatedAt: now,
        generatedAt: now,
      });
    }
  }

  return todos;
}

// ======== メイン処理 ========

/**
 * 今日のTODOを生成
 */
export async function generateDailyTodos(): Promise<TodoGenerationResult> {
  const db = getAdminDb();
  const now = new Date();
  const today = getTodayString();

  const result: TodoGenerationResult = {
    success: false,
    generatedAt: now,
    summary: {
      total: 0,
      byPriority: { HIGH: 0, MEDIUM: 0, LOW: 0 },
      bySource: { OVERTIME: 0, APPROVAL: 0, SALES: 0, DOCUMENT: 0, PROSPECT: 0 },
      byRole: { staff: 0, manager: 0, exec: 0 },
    },
    errors: [],
  };

  try {
    // ユーザー一覧を取得
    const usersSnapshot = await db
      .collection('users')
      .where('tenantId', '==', DEFAULT_TENANT_ID)
      .get();

    const users = new Map<string, { id: string; name: string; role: string }>();
    usersSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      users.set(doc.id, {
        id: doc.id,
        name: data.name || data.email || '',
        role: data.role || 'user',
      });
    });

    // 各データソースからデータを収集
    const [approvals, alerts, salesCases, documents] = await Promise.all([
      getPendingApprovals().catch((e) => {
        result.errors.push(`承認データ取得エラー: ${e.message}`);
        return [] as PendingApproval[];
      }),
      getAttendanceAlerts().catch((e) => {
        result.errors.push(`勤怠データ取得エラー: ${e.message}`);
        return [] as AttendanceAlert[];
      }),
      getStaleSalesCases().catch((e) => {
        result.errors.push(`営業データ取得エラー: ${e.message}`);
        return [] as StaleSalesCase[];
      }),
      getMissingDocuments().catch((e) => {
        result.errors.push(`書類データ取得エラー: ${e.message}`);
        return [] as MissingDocument[];
      }),
    ]);

    // TODOを生成
    const allTodos: TodoItem[] = [
      ...generateApprovalTodos(approvals, users),
      ...generateOvertimeTodos(alerts, users),
      ...generateSalesTodos(salesCases, users),
      ...generateDocumentTodos(documents, users),
    ];

    // 既存の今日のTODOを削除
    const existingTodosSnapshot = await db
      .collection('todoItems')
      .where('tenantId', '==', DEFAULT_TENANT_ID)
      .where('generatedAt', '>=', new Date(today))
      .get();

    const batch = db.batch();
    existingTodosSnapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // 新しいTODOを保存
    for (const todo of allTodos) {
      const docRef = db.collection('todoItems').doc();
      batch.set(docRef, {
        ...todo,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // サマリーを更新
      result.summary.total++;
      result.summary.byPriority[todo.priority]++;
      result.summary.bySource[todo.source]++;
      result.summary.byRole[todo.userRole]++;
    }

    await batch.commit();

    // 生成ログを保存
    await db.collection('todoGenerationLogs').add({
      tenantId: DEFAULT_TENANT_ID,
      type: 'daily-batch',
      generatedAt: now,
      result,
      createdAt: FieldValue.serverTimestamp(),
    });

    result.success = true;
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : 'Unknown error');
  }

  return result;
}

/**
 * TODOを取得
 */
export async function getTodos(options: GetTodosOptions = {}): Promise<TodoItem[]> {
  const db = getAdminDb();
  let query = db.collection('todoItems').where('tenantId', '==', DEFAULT_TENANT_ID);

  if (options.userId) {
    query = query.where('userId', '==', options.userId);
  }

  if (options.role) {
    query = query.where('userRole', '==', options.role);
  }

  if (options.priority) {
    query = query.where('priority', '==', options.priority);
  }

  if (options.source) {
    query = query.where('source', '==', options.source);
  }

  if (!options.includeCompleted) {
    query = query.where('isCompleted', '==', false);
  }

  if (options.date) {
    const startOfDay = new Date(options.date);
    const endOfDay = new Date(options.date);
    endOfDay.setDate(endOfDay.getDate() + 1);
    query = query.where('generatedAt', '>=', startOfDay).where('generatedAt', '<', endOfDay);
  }

  query = query.orderBy('priority', 'asc').orderBy('createdAt', 'desc');

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const snapshot = await query.get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: toDate(data.createdAt) || new Date(),
      updatedAt: toDate(data.updatedAt) || new Date(),
      generatedAt: toDate(data.generatedAt) || new Date(),
      dueDate: data.dueDate ? toDate(data.dueDate) : undefined,
      completedAt: data.completedAt ? toDate(data.completedAt) : undefined,
    } as TodoItem;
  });
}

/**
 * TODOを完了にする
 */
export async function completeTodo(todoId: string, userId: string): Promise<boolean> {
  const db = getAdminDb();
  const todoRef = db.collection('todoItems').doc(todoId);

  try {
    await todoRef.update({
      isCompleted: true,
      completedAt: FieldValue.serverTimestamp(),
      completedBy: userId,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error('Failed to complete todo:', error);
    return false;
  }
}

/**
 * ダッシュボード用サマリーを取得
 */
export async function getTodoDashboardSummary(
  userId?: string,
  date?: string
): Promise<TodoDashboardSummary> {
  const targetDate = date || getTodayString();
  const todos = await getTodos({
    userId,
    date: targetDate,
    includeCompleted: true,
  });

  const summary: TodoDashboardSummary = {
    date: targetDate,
    totalTodos: todos.length,
    completedTodos: todos.filter((t) => t.isCompleted).length,
    pendingTodos: todos.filter((t) => !t.isCompleted).length,
    byPriority: {
      HIGH: { total: 0, completed: 0 },
      MEDIUM: { total: 0, completed: 0 },
      LOW: { total: 0, completed: 0 },
    },
    bySource: {
      OVERTIME: { total: 0, completed: 0 },
      APPROVAL: { total: 0, completed: 0 },
      SALES: { total: 0, completed: 0 },
      DOCUMENT: { total: 0, completed: 0 },
      PROSPECT: { total: 0, completed: 0 },
    },
    recentTodos: todos.filter((t) => !t.isCompleted).slice(0, 10),
  };

  for (const todo of todos) {
    summary.byPriority[todo.priority].total++;
    if (todo.isCompleted) summary.byPriority[todo.priority].completed++;

    summary.bySource[todo.source].total++;
    if (todo.isCompleted) summary.bySource[todo.source].completed++;
  }

  return summary;
}

/**
 * 最新の生成ログを取得
 */
export async function getLatestGenerationLog(): Promise<TodoGenerationResult | null> {
  const db = getAdminDb();
  const snapshot = await db
    .collection('todoGenerationLogs')
    .where('tenantId', '==', DEFAULT_TENANT_ID)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const data = snapshot.docs[0].data();
  return data.result as TodoGenerationResult;
}
