// ======== 人事インポート ライブラリ ========

import { getAdminDb } from './firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { fetchFreeeEmployees } from './freee-employees';
import type {
  HRImportSource,
  HRImportRow,
  HRImportResult,
  HREvent,
  HRImportAuditLog,
  Employee,
  EmployeeStatus,
  EmploymentType,
  FreeeEmployee,
} from '@/types/hr-import';
import {
  EMPLOYEES_COLLECTION,
  HR_IMPORT_AUDIT_COLLECTION,
  FREEE_STATUS_MAP,
  EMPLOYMENT_TYPE_MAP,
  DEFAULT_EMPLOYMENT_TYPE,
} from '@/types/hr-import';

const DEFAULT_TENANT_ID = 'defaultTenant';

// ======== ヘルパー ========

function toDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  return undefined;
}

/**
 * ステータスを判定
 */
function determineStatus(joinDate?: string, leaveDate?: string): EmployeeStatus {
  const today = new Date().toISOString().split('T')[0];

  if (leaveDate && leaveDate <= today) {
    return 'INACTIVE';
  }
  if (joinDate && joinDate > today) {
    // 入社日が未来
    return 'INACTIVE';
  }
  return 'ACTIVE';
}

/**
 * 雇用形態を正規化
 */
function normalizeEmploymentType(type?: string): EmploymentType {
  if (!type) return DEFAULT_EMPLOYMENT_TYPE;
  return EMPLOYMENT_TYPE_MAP[type] || DEFAULT_EMPLOYMENT_TYPE;
}

// ======== 従業員の取得・保存 ========

/**
 * employeeCodeで従業員を取得
 */
export async function getEmployeeByCode(
  tenantId: string,
  employeeCode: string
): Promise<Employee | null> {
  const db = getAdminDb();

  const snapshot = await db
    .collection(EMPLOYEES_COLLECTION)
    .where('tenantId', '==', tenantId)
    .where('employeeCode', '==', employeeCode)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  const data = doc.data();

  return {
    id: doc.id,
    ...data,
    createdAt: toDate(data.createdAt) || new Date(),
    updatedAt: toDate(data.updatedAt) || new Date(),
    lastSyncAt: toDate(data.lastSyncAt),
  } as Employee;
}

/**
 * 従業員一覧を取得
 */
export async function listEmployees(
  tenantId: string,
  options?: { status?: EmployeeStatus; limit?: number }
): Promise<Employee[]> {
  const db = getAdminDb();

  let query = db.collection(EMPLOYEES_COLLECTION).where('tenantId', '==', tenantId);

  if (options?.status) {
    query = query.where('status', '==', options.status);
  }

  query = query.orderBy('name', 'asc');

  if (options?.limit) {
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
      lastSyncAt: toDate(data.lastSyncAt),
    } as Employee;
  });
}

// ======== インポート処理 ========

/**
 * freeeから従業員をインポート
 */
export async function importFromFreee(
  tenantId: string = DEFAULT_TENANT_ID,
  executedBy?: string,
  executedByName?: string
): Promise<HRImportResult> {
  console.log('[HRImport] freeeからインポート開始');

  const result: HRImportResult = {
    success: false,
    source: 'freee',
    totalCount: 0,
    createdCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    errorCount: 0,
    hireEvents: [],
    leaveEvents: [],
    errors: [],
    importedAt: new Date(),
    importedBy: executedBy,
    importedByName: executedByName,
  };

  try {
    // freeeから従業員取得
    const freeeResult = await fetchFreeeEmployees();

    if (!freeeResult.success) {
      result.errors.push({
        row: 0,
        message: freeeResult.error || 'freee従業員取得に失敗しました',
      });
      return result;
    }

    // freee従業員データをインポート行に変換
    const rows: HRImportRow[] = freeeResult.employees.map((emp) => ({
      employeeCode: emp.employeeNumber || `FREEE-${emp.id}`,
      name: emp.displayName,
      nameKana: emp.lastNameKana && emp.firstNameKana
        ? `${emp.lastNameKana} ${emp.firstNameKana}`
        : undefined,
      email: emp.email,
      departmentName: emp.departmentName,
      position: emp.position,
      employmentType: emp.employmentType,
      joinDate: emp.entryDate,
      leaveDate: emp.retireDate,
      freeeEmployeeId: emp.id,
    }));

    // インポート実行
    const importResult = await importRows(tenantId, 'freee', rows, executedBy, executedByName);

    return importResult;
  } catch (error) {
    console.error('[HRImport] freeeインポートエラー:', error);
    result.errors.push({
      row: 0,
      message: error instanceof Error ? error.message : 'インポートに失敗しました',
    });
    return result;
  }
}

/**
 * CSVからインポート
 */
export async function importFromCSV(
  tenantId: string,
  csvData: string,
  executedBy?: string,
  executedByName?: string
): Promise<HRImportResult> {
  console.log('[HRImport] CSVからインポート開始');

  const result: HRImportResult = {
    success: false,
    source: 'csv',
    totalCount: 0,
    createdCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    errorCount: 0,
    hireEvents: [],
    leaveEvents: [],
    errors: [],
    importedAt: new Date(),
    importedBy: executedBy,
    importedByName: executedByName,
  };

  try {
    // CSVパース
    const lines = csvData.split('\n').filter((line) => line.trim());
    if (lines.length < 2) {
      result.errors.push({ row: 0, message: 'CSVデータが不正です（ヘッダーとデータが必要）' });
      return result;
    }

    const headers = lines[0].split(',').map((h) => h.trim());
    const rows: HRImportRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v) => v.trim());
      const row: HRImportRow = {
        employeeCode: '',
        name: '',
      };

      headers.forEach((header, index) => {
        const value = values[index] || '';
        switch (header.toLowerCase()) {
          case 'employeecode':
          case 'employee_code':
          case '従業員コード':
            row.employeeCode = value;
            break;
          case 'name':
          case '氏名':
          case '名前':
            row.name = value;
            break;
          case 'namekana':
          case 'name_kana':
          case 'フリガナ':
            row.nameKana = value;
            break;
          case 'email':
          case 'メール':
            row.email = value;
            break;
          case 'phone':
          case 'phonenumber':
          case '電話番号':
            row.phoneNumber = value;
            break;
          case 'divisionid':
          case 'division_id':
          case '事業部ID':
            row.divisionId = value;
            break;
          case 'branchid':
          case 'branch_id':
          case '拠点ID':
            row.branchId = value;
            break;
          case 'department':
          case 'departmentname':
          case '部門':
            row.departmentName = value;
            break;
          case 'position':
          case '役職':
            row.position = value;
            break;
          case 'employmenttype':
          case 'employment_type':
          case '雇用形態':
            row.employmentType = value;
            break;
          case 'joindate':
          case 'join_date':
          case '入社日':
            row.joinDate = value;
            break;
          case 'leavedate':
          case 'leave_date':
          case '退社日':
            row.leaveDate = value;
            break;
          case 'notes':
          case '備考':
            row.notes = value;
            break;
        }
      });

      if (row.employeeCode && row.name) {
        rows.push(row);
      } else {
        result.errors.push({
          row: i + 1,
          message: '従業員コードまたは氏名が不足しています',
        });
        result.errorCount++;
      }
    }

    // インポート実行
    const importResult = await importRows(tenantId, 'csv', rows, executedBy, executedByName);

    return importResult;
  } catch (error) {
    console.error('[HRImport] CSVインポートエラー:', error);
    result.errors.push({
      row: 0,
      message: error instanceof Error ? error.message : 'CSVインポートに失敗しました',
    });
    return result;
  }
}

/**
 * 行データをインポート（共通処理）
 */
async function importRows(
  tenantId: string,
  source: HRImportSource,
  rows: HRImportRow[],
  executedBy?: string,
  executedByName?: string
): Promise<HRImportResult> {
  const db = getAdminDb();

  const result: HRImportResult = {
    success: true,
    source,
    totalCount: rows.length,
    createdCount: 0,
    updatedCount: 0,
    skippedCount: 0,
    errorCount: 0,
    hireEvents: [],
    leaveEvents: [],
    errors: [],
    importedAt: new Date(),
    importedBy: executedBy,
    importedByName: executedByName,
  };

  const today = new Date().toISOString().split('T')[0];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;

    try {
      // 既存従業員を検索
      const existing = await getEmployeeByCode(tenantId, row.employeeCode);

      // ステータス判定
      const newStatus = determineStatus(row.joinDate, row.leaveDate);
      const previousStatus = existing?.status;

      // 入社・退社イベント検知
      let hireEvent: HREvent | null = null;
      let leaveEvent: HREvent | null = null;

      if (!existing && newStatus === 'ACTIVE') {
        // 新規入社
        hireEvent = {
          type: 'hire',
          employeeId: '', // 後で設定
          employeeCode: row.employeeCode,
          employeeName: row.name,
          eventDate: row.joinDate || today,
          newStatus: 'ACTIVE',
          linkedActions: [],
        };
      } else if (existing) {
        // ステータス変更チェック
        if (previousStatus === 'ACTIVE' && newStatus === 'INACTIVE') {
          // 退社
          leaveEvent = {
            type: 'leave',
            employeeId: existing.id,
            employeeCode: row.employeeCode,
            employeeName: row.name,
            eventDate: row.leaveDate || today,
            previousStatus: 'ACTIVE',
            newStatus: 'INACTIVE',
            linkedActions: [],
          };
        } else if (previousStatus === 'INACTIVE' && newStatus === 'ACTIVE') {
          // 復帰（再入社）
          hireEvent = {
            type: 'hire',
            employeeId: existing.id,
            employeeCode: row.employeeCode,
            employeeName: row.name,
            eventDate: row.joinDate || today,
            previousStatus: 'INACTIVE',
            newStatus: 'ACTIVE',
            linkedActions: [],
          };
        }
      }

      // 従業員データを準備
      const employeeData: Partial<Employee> = {
        tenantId,
        employeeCode: row.employeeCode,
        name: row.name,
        nameKana: row.nameKana,
        email: row.email,
        phoneNumber: row.phoneNumber,
        divisionId: row.divisionId,
        branchId: row.branchId,
        departmentName: row.departmentName,
        position: row.position,
        employmentType: normalizeEmploymentType(row.employmentType),
        joinDate: row.joinDate,
        leaveDate: row.leaveDate,
        status: newStatus,
        isAttendanceTarget: newStatus === 'ACTIVE',
        isApprovalTarget: newStatus === 'ACTIVE',
        isPaymentTarget: newStatus === 'ACTIVE',
        freeeEmployeeId: row.freeeEmployeeId,
        lastSyncSource: source,
        lastSyncAt: new Date(),
        notes: row.notes,
        updatedAt: new Date(),
      };

      if (existing) {
        // UPDATE
        await db.collection(EMPLOYEES_COLLECTION).doc(existing.id).update({
          ...employeeData,
          updatedAt: FieldValue.serverTimestamp(),
        });
        result.updatedCount++;

        // 連動処理
        if (leaveEvent) {
          await executeLeaveActions(existing.id, leaveEvent);
          result.leaveEvents.push(leaveEvent);
        }
        if (hireEvent) {
          hireEvent.employeeId = existing.id;
          await executeHireActions(existing.id, hireEvent);
          result.hireEvents.push(hireEvent);
        }
      } else {
        // CREATE
        const docRef = await db.collection(EMPLOYEES_COLLECTION).add({
          ...employeeData,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        result.createdCount++;

        // 連動処理
        if (hireEvent) {
          hireEvent.employeeId = docRef.id;
          await executeHireActions(docRef.id, hireEvent);
          result.hireEvents.push(hireEvent);
        }
      }
    } catch (error) {
      console.error(`[HRImport] 行${rowNum}エラー:`, error);
      result.errors.push({
        row: rowNum,
        employeeCode: row.employeeCode,
        message: error instanceof Error ? error.message : '処理に失敗しました',
      });
      result.errorCount++;
    }
  }

  result.success = result.errorCount === 0;

  // 監査ログ保存
  await saveAuditLog(tenantId, result);

  console.log('[HRImport] インポート完了', {
    total: result.totalCount,
    created: result.createdCount,
    updated: result.updatedCount,
    errors: result.errorCount,
    hireEvents: result.hireEvents.length,
    leaveEvents: result.leaveEvents.length,
  });

  return result;
}

// ======== 入社・退社連動処理 ========

/**
 * 入社時の連動処理
 */
async function executeHireActions(employeeId: string, event: HREvent): Promise<void> {
  console.log('[HRImport] 入社連動処理', { employeeId, employeeName: event.employeeName });

  const db = getAdminDb();

  // 1. 勤怠・承認・支払い対象 ON
  try {
    await db.collection(EMPLOYEES_COLLECTION).doc(employeeId).update({
      isAttendanceTarget: true,
      isApprovalTarget: true,
      isPaymentTarget: true,
      status: 'ACTIVE',
      updatedAt: FieldValue.serverTimestamp(),
    });
    event.linkedActions.push({ action: '勤怠・承認・支払い対象を有効化', success: true });
  } catch (error) {
    event.linkedActions.push({
      action: '勤怠・承認・支払い対象を有効化',
      success: false,
      error: error instanceof Error ? error.message : 'エラー',
    });
  }

  // 2. 管理者に通知
  try {
    await createHRNotification('hire', event);
    event.linkedActions.push({ action: '管理者に入社通知を送信', success: true });
  } catch (error) {
    event.linkedActions.push({
      action: '管理者に入社通知を送信',
      success: false,
      error: error instanceof Error ? error.message : 'エラー',
    });
  }
}

/**
 * 退社時の連動処理
 */
async function executeLeaveActions(employeeId: string, event: HREvent): Promise<void> {
  console.log('[HRImport] 退社連動処理', { employeeId, employeeName: event.employeeName });

  const db = getAdminDb();

  // 1. 勤怠・承認・支払い対象 OFF
  try {
    await db.collection(EMPLOYEES_COLLECTION).doc(employeeId).update({
      isAttendanceTarget: false,
      isApprovalTarget: false,
      isPaymentTarget: false,
      status: 'INACTIVE',
      updatedAt: FieldValue.serverTimestamp(),
    });
    event.linkedActions.push({ action: '勤怠・承認・支払い対象を無効化', success: true });
  } catch (error) {
    event.linkedActions.push({
      action: '勤怠・承認・支払い対象を無効化',
      success: false,
      error: error instanceof Error ? error.message : 'エラー',
    });
  }

  // 2. ユーザーアカウント無効化（userId がある場合）
  try {
    const empDoc = await db.collection(EMPLOYEES_COLLECTION).doc(employeeId).get();
    const empData = empDoc.data();
    if (empData?.userId) {
      await db.collection('users').doc(empData.userId).update({
        role: 'user', // 権限をダウングレード
        isActive: false,
        updatedAt: FieldValue.serverTimestamp(),
      });
      event.linkedActions.push({ action: 'ユーザーアカウントを無効化', success: true });
    }
  } catch (error) {
    event.linkedActions.push({
      action: 'ユーザーアカウントを無効化',
      success: false,
      error: error instanceof Error ? error.message : 'エラー',
    });
  }

  // 3. 管理者に通知
  try {
    await createHRNotification('leave', event);
    event.linkedActions.push({ action: '管理者に退社通知を送信', success: true });
  } catch (error) {
    event.linkedActions.push({
      action: '管理者に退社通知を送信',
      success: false,
      error: error instanceof Error ? error.message : 'エラー',
    });
  }
}

/**
 * 人事通知を作成
 */
async function createHRNotification(
  type: 'hire' | 'leave',
  event: HREvent
): Promise<void> {
  const db = getAdminDb();

  const title = type === 'hire'
    ? `入社通知: ${event.employeeName}`
    : `退社通知: ${event.employeeName}`;

  const body = type === 'hire'
    ? `${event.employeeName}さん（${event.employeeCode}）が${event.eventDate}に入社しました。勤怠・承認・支払い対象として登録されました。`
    : `${event.employeeName}さん（${event.employeeCode}）が${event.eventDate}に退社しました。勤怠・承認・支払い対象から除外されました。`;

  // 管理者ユーザーを取得
  const adminsSnapshot = await db
    .collection('users')
    .where('role', 'in', ['admin', 'system_admin'])
    .get();

  // 各管理者に通知を作成
  const batch = db.batch();
  for (const adminDoc of adminsSnapshot.docs) {
    const notifRef = db.collection('notifications').doc();
    batch.set(notifRef, {
      tenantId: DEFAULT_TENANT_ID,
      userId: adminDoc.id,
      type: type === 'hire' ? 'hr_hire' : 'hr_leave',
      title,
      body,
      data: {
        employeeId: event.employeeId,
        employeeCode: event.employeeCode,
        employeeName: event.employeeName,
        eventDate: event.eventDate,
      },
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
  console.log('[HRImport] 通知送信完了', { type, adminCount: adminsSnapshot.size });
}

// ======== 監査ログ ========

/**
 * 監査ログを保存
 */
async function saveAuditLog(tenantId: string, result: HRImportResult): Promise<void> {
  const db = getAdminDb();

  const auditLog: Omit<HRImportAuditLog, 'id'> = {
    tenantId,
    source: result.source,
    result,
    executedBy: result.importedBy,
    executedByName: result.importedByName,
    createdAt: new Date(),
  };

  await db.collection(HR_IMPORT_AUDIT_COLLECTION).add({
    ...auditLog,
    createdAt: FieldValue.serverTimestamp(),
  });

  console.log('[HRImport] 監査ログ保存完了');
}

/**
 * 監査ログ一覧を取得
 */
export async function listHRImportAuditLogs(
  tenantId: string,
  limit: number = 20
): Promise<HRImportAuditLog[]> {
  const db = getAdminDb();

  const snapshot = await db
    .collection(HR_IMPORT_AUDIT_COLLECTION)
    .where('tenantId', '==', tenantId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: toDate(data.createdAt) || new Date(),
    } as HRImportAuditLog;
  });
}
