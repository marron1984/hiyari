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
  HRImportDiff,
  HRImportDryRunResult,
  HRImportRun,
  Employee,
  EmployeeStatus,
  EmploymentType,
} from '@/types/hr-import';
import {
  EMPLOYEES_COLLECTION,
  HR_IMPORT_AUDIT_COLLECTION,
  HR_IMPORT_RUNS_COLLECTION,
  EMPLOYMENT_TYPE_MAP,
  DEFAULT_EMPLOYMENT_TYPE,
} from '@/types/hr-import';

const DEFAULT_TENANT_ID = 'defaultTenant';

// ======== 環境検出 ========

type Environment = 'production' | 'preview' | 'development';

/**
 * 現在の環境を検出
 */
function detectEnvironment(): Environment {
  // Vercel環境変数
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv === 'production') return 'production';
  if (vercelEnv === 'preview') return 'preview';

  // NODE_ENV
  if (process.env.NODE_ENV === 'production') {
    // Vercel以外の本番環境
    return 'production';
  }

  return 'development';
}

/**
 * プレビュー環境かどうか
 */
export function isPreviewEnvironment(): boolean {
  return detectEnvironment() === 'preview';
}

/**
 * dry_runを強制するかどうか
 */
export function shouldForceDryRun(): boolean {
  // プレビュー環境では外部実行をdry_runに強制
  return isPreviewEnvironment();
}

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

// ======== インポートオプション ========

export interface HRImportOptions {
  tenantId?: string;
  dryRun?: boolean;
  executedBy?: string;
  executedByName?: string;
}

// ======== インポート処理 ========

/**
 * freeeから従業員をインポート（dry_run対応）
 */
export async function importFromFreee(
  options: HRImportOptions = {}
): Promise<HRImportResult | HRImportDryRunResult> {
  const {
    tenantId = DEFAULT_TENANT_ID,
    executedBy,
    executedByName,
  } = options;

  // プレビュー環境ではdry_runを強制
  const dryRun = options.dryRun ?? shouldForceDryRun();
  const environment = detectEnvironment();

  console.log('[HRImport] freeeからインポート開始', { dryRun, environment });

  const startedAt = new Date();

  try {
    // freeeから従業員取得
    const freeeResult = await fetchFreeeEmployees();

    if (!freeeResult.success) {
      const errorResult: HRImportResult = {
        success: false,
        source: 'freee',
        totalCount: 0,
        createdCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        errorCount: 1,
        hireEvents: [],
        leaveEvents: [],
        errors: [{ row: 0, message: freeeResult.error || 'freee従業員取得に失敗しました' }],
        importedAt: new Date(),
        importedBy: executedBy,
        importedByName: executedByName,
      };
      return errorResult;
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

    if (dryRun) {
      // dry_run: 差分プレビューを生成
      const dryRunResult = await generateDryRunPreview(tenantId, 'freee', rows);

      // 実行ログ保存
      await saveImportRun(tenantId, 'freee', 'dry_run', dryRunResult, environment, startedAt, executedBy, executedByName);

      return dryRunResult;
    }

    // 実行モード: インポート実行
    const importResult = await importRows(tenantId, 'freee', rows, executedBy, executedByName);

    // 実行ログ保存
    await saveImportRun(tenantId, 'freee', 'execute', importResult, environment, startedAt, executedBy, executedByName);

    return importResult;
  } catch (error) {
    console.error('[HRImport] freeeインポートエラー:', error);
    const errorResult: HRImportResult = {
      success: false,
      source: 'freee',
      totalCount: 0,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      errorCount: 1,
      hireEvents: [],
      leaveEvents: [],
      errors: [{ row: 0, message: error instanceof Error ? error.message : 'インポートに失敗しました' }],
      importedAt: new Date(),
      importedBy: executedBy,
      importedByName: executedByName,
    };
    return errorResult;
  }
}

/**
 * dry_run差分プレビューを生成
 */
async function generateDryRunPreview(
  tenantId: string,
  source: HRImportSource,
  rows: HRImportRow[]
): Promise<HRImportDryRunResult> {
  console.log('[HRImport] dry_run: 差分プレビュー生成', { rowCount: rows.length });

  const diffs: HRImportDiff[] = [];
  let toCreate = 0;
  let toUpdate = 0;
  let toSkip = 0;
  let hireCount = 0;
  let leaveCount = 0;

  for (const row of rows) {
    const existing = await getEmployeeByCode(tenantId, row.employeeCode);
    const newStatus = determineStatus(row.joinDate, row.leaveDate);

    const diff: HRImportDiff = {
      employeeCode: row.employeeCode,
      name: row.name,
      action: 'skip',
    };

    if (!existing) {
      // 新規作成
      diff.action = 'create';
      toCreate++;

      if (newStatus === 'ACTIVE') {
        diff.statusChange = {
          before: null,
          after: 'ACTIVE',
          eventType: 'hire',
        };
        hireCount++;

        // 入社時: 勤怠ON、承認/支払いOFF
        diff.flagChanges = {
          isAttendanceTarget: { before: false, after: true },
          isApprovalTarget: { before: false, after: false },
          isPaymentTarget: { before: false, after: false },
        };
      }
    } else {
      // 更新
      const changes: HRImportDiff['changes'] = [];

      // 各フィールドの変更をチェック
      if (existing.name !== row.name) {
        changes.push({ field: 'name', fieldLabel: '氏名', before: existing.name, after: row.name });
      }
      if (existing.nameKana !== row.nameKana) {
        changes.push({ field: 'nameKana', fieldLabel: 'フリガナ', before: existing.nameKana || null, after: row.nameKana || null });
      }
      if (existing.email !== row.email) {
        changes.push({ field: 'email', fieldLabel: 'メール', before: existing.email || null, after: row.email || null });
      }
      if (existing.departmentName !== row.departmentName) {
        changes.push({ field: 'departmentName', fieldLabel: '部門', before: existing.departmentName || null, after: row.departmentName || null });
      }
      if (existing.position !== row.position) {
        changes.push({ field: 'position', fieldLabel: '役職', before: existing.position || null, after: row.position || null });
      }
      if (existing.joinDate !== row.joinDate) {
        changes.push({ field: 'joinDate', fieldLabel: '入社日', before: existing.joinDate || null, after: row.joinDate || null });
      }
      if (existing.leaveDate !== row.leaveDate) {
        changes.push({ field: 'leaveDate', fieldLabel: '退社日', before: existing.leaveDate || null, after: row.leaveDate || null });
      }

      // ステータス変更チェック
      if (existing.status !== newStatus) {
        diff.statusChange = {
          before: existing.status,
          after: newStatus,
        };

        if (existing.status === 'ACTIVE' && newStatus === 'INACTIVE') {
          diff.statusChange.eventType = 'leave';
          leaveCount++;

          diff.flagChanges = {
            isAttendanceTarget: { before: existing.isAttendanceTarget, after: false },
            isApprovalTarget: { before: existing.isApprovalTarget, after: false },
            isPaymentTarget: { before: existing.isPaymentTarget, after: false },
          };
        } else if (existing.status === 'INACTIVE' && newStatus === 'ACTIVE') {
          diff.statusChange.eventType = 'rehire';
          hireCount++;

          // 再入社時も勤怠ON、承認/支払いOFF
          diff.flagChanges = {
            isAttendanceTarget: { before: existing.isAttendanceTarget, after: true },
            isApprovalTarget: { before: existing.isApprovalTarget, after: false },
            isPaymentTarget: { before: existing.isPaymentTarget, after: false },
          };
        }
      }

      if (changes.length > 0 || diff.statusChange) {
        diff.action = 'update';
        diff.changes = changes.length > 0 ? changes : undefined;
        toUpdate++;
      } else {
        toSkip++;
      }
    }

    diffs.push(diff);
  }

  return {
    success: true,
    source,
    isDryRun: true,
    diffs,
    summary: {
      total: rows.length,
      toCreate,
      toUpdate,
      toSkip,
      hireCount,
      leaveCount,
    },
    previewedAt: new Date(),
  };
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
      // 入社時: 勤怠ON、承認/支払いは初期OFF（管理者が手動で有効化する想定）
      // 退社時: 全てOFF
      const isNewHire = !existing && newStatus === 'ACTIVE';
      const isRehire = existing && existing.status === 'INACTIVE' && newStatus === 'ACTIVE';

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
        // 入社/再入社: 勤怠ON、承認/支払いOFF
        // 退社: 全てOFF
        // 更新のみ: 既存値維持（ステータス変更がない場合）
        isAttendanceTarget: (isNewHire || isRehire) ? true : (newStatus === 'ACTIVE' ? (existing?.isAttendanceTarget ?? true) : false),
        isApprovalTarget: (isNewHire || isRehire) ? false : (newStatus === 'ACTIVE' ? (existing?.isApprovalTarget ?? false) : false),
        isPaymentTarget: (isNewHire || isRehire) ? false : (newStatus === 'ACTIVE' ? (existing?.isPaymentTarget ?? false) : false),
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
 * 入社時: 勤怠ON、承認/支払いは初期OFF（管理者が手動で有効化する想定）
 */
async function executeHireActions(employeeId: string, event: HREvent): Promise<void> {
  console.log('[HRImport] 入社連動処理', { employeeId, employeeName: event.employeeName });

  const db = getAdminDb();

  // 1. 勤怠対象ON、承認/支払い対象は初期OFF
  try {
    await db.collection(EMPLOYEES_COLLECTION).doc(employeeId).update({
      isAttendanceTarget: true,
      isApprovalTarget: false, // 管理者が手動で有効化
      isPaymentTarget: false,  // 管理者が手動で有効化
      status: 'ACTIVE',
      updatedAt: FieldValue.serverTimestamp(),
    });
    event.linkedActions.push({ action: '勤怠対象を有効化（承認/支払いは手動設定待ち）', success: true });
  } catch (error) {
    event.linkedActions.push({
      action: '勤怠対象を有効化',
      success: false,
      error: error instanceof Error ? error.message : 'エラー',
    });
  }

  // 2. 管理者・役員に通知
  try {
    await createHRNotification('hire', event);
    event.linkedActions.push({ action: '管理者・役員に入社通知を送信', success: true });
  } catch (error) {
    event.linkedActions.push({
      action: '管理者・役員に入社通知を送信',
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
 * 人事通知を作成（管理者・役員に送信）
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
    ? `${event.employeeName}さん（${event.employeeCode}）が${event.eventDate}に入社しました。\n勤怠対象として登録されました。承認・支払い対象の設定は管理者が行ってください。`
    : `${event.employeeName}さん（${event.employeeCode}）が${event.eventDate}に退社しました。\n勤怠・承認・支払い対象から除外されました。`;

  // 管理者・役員ユーザーを取得（exec, admin, system_admin）
  const adminsSnapshot = await db
    .collection('users')
    .where('role', 'in', ['admin', 'system_admin'])
    .get();

  // 各管理者・役員に通知を作成
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
  console.log('[HRImport] 通知送信完了', { type, recipientCount: adminsSnapshot.size });
}

// ======== 実行ログ保存 ========

/**
 * hr_import_runsにログを保存
 */
async function saveImportRun(
  tenantId: string,
  source: HRImportSource,
  mode: 'dry_run' | 'execute',
  result: HRImportResult | HRImportDryRunResult,
  environment: Environment,
  startedAt: Date,
  executedBy?: string,
  executedByName?: string
): Promise<void> {
  const db = getAdminDb();

  const run: Omit<HRImportRun, 'id'> = {
    tenantId,
    source,
    mode,
    result,
    executedBy,
    executedByName,
    environment,
    startedAt,
    completedAt: new Date(),
  };

  await db.collection(HR_IMPORT_RUNS_COLLECTION).add({
    ...run,
    startedAt: Timestamp.fromDate(startedAt),
    completedAt: FieldValue.serverTimestamp(),
  });

  console.log('[HRImport] 実行ログ保存完了', { mode, source, environment });
}

/**
 * 実行ログ一覧を取得
 */
export async function listHRImportRuns(
  tenantId: string,
  limit: number = 20
): Promise<HRImportRun[]> {
  const db = getAdminDb();

  const snapshot = await db
    .collection(HR_IMPORT_RUNS_COLLECTION)
    .where('tenantId', '==', tenantId)
    .orderBy('completedAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      startedAt: toDate(data.startedAt) || new Date(),
      completedAt: toDate(data.completedAt) || new Date(),
    } as HRImportRun;
  });
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
