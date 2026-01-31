// ======== freee 従業員 API 連携 ========
// ダミー実装（インターフェース確定用）

import { getFreeeIntegration, refreshFreeeTokenIfNeeded } from './freee-token';
import type { FreeeEmployee } from '@/types/hr-import';

// ======== 従業員一覧取得 ========

/**
 * freeeから従業員一覧を取得（ダミー実装）
 */
export async function fetchFreeeEmployees(): Promise<{
  success: boolean;
  employees: FreeeEmployee[];
  error?: string;
}> {
  console.log('[FreeeEmployees] 従業員一覧取得開始');

  try {
    // freee連携情報を取得
    const integration = await getFreeeIntegration();

    if (!integration?.connected || !integration.accessToken || !integration.companyId) {
      return {
        success: false,
        employees: [],
        error: 'freee連携が設定されていません',
      };
    }

    // トークンリフレッシュ
    const refreshedIntegration = await refreshFreeeTokenIfNeeded(integration);
    if (!refreshedIntegration?.accessToken) {
      return {
        success: false,
        employees: [],
        error: 'freeeトークンの更新に失敗しました',
      };
    }

    // ダミー実装: 実際のAPI呼び出しの代わり
    /*
    const response = await fetch(
      `https://api.freee.co.jp/hr/api/v1/employees?company_id=${refreshedIntegration.companyId}&limit=100`,
      {
        headers: {
          Authorization: `Bearer ${refreshedIntegration.accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`freee API error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    const employees: FreeeEmployee[] = data.employees.map((emp: any) => ({
      id: emp.id,
      companyId: refreshedIntegration.companyId,
      employeeNumber: emp.num,
      displayName: emp.display_name,
      lastName: emp.last_name,
      firstName: emp.first_name,
      lastNameKana: emp.last_name_kana,
      firstNameKana: emp.first_name_kana,
      email: emp.email,
      birthDate: emp.birth_date,
      entryDate: emp.entry_date,
      retireDate: emp.retire_date,
      status: emp.retire_date ? 'retired' : 'working',
      departmentName: emp.department_name,
      position: emp.position,
      employmentType: emp.employment_type,
    }));
    */

    // ダミー従業員データ
    const employees: FreeeEmployee[] = [
      {
        id: 1001,
        companyId: refreshedIntegration.companyId!,
        employeeNumber: 'EMP001',
        displayName: '大石 崇敬',
        lastName: '大石',
        firstName: '崇敬',
        lastNameKana: 'オオイシ',
        firstNameKana: 'タカノリ',
        email: 'oishi@example.com',
        entryDate: '2015-04-01',
        status: 'working',
        position: '代表取締役',
        employmentType: '役員',
      },
      {
        id: 1002,
        companyId: refreshedIntegration.companyId!,
        employeeNumber: 'EMP002',
        displayName: '吉田 俊輔',
        lastName: '吉田',
        firstName: '俊輔',
        lastNameKana: 'ヨシダ',
        firstNameKana: 'シュンスケ',
        email: 'yoshida@example.com',
        entryDate: '2016-01-01',
        status: 'working',
        position: '副社長',
        employmentType: '役員',
      },
      {
        id: 1003,
        companyId: refreshedIntegration.companyId!,
        employeeNumber: 'EMP003',
        displayName: '拔屋 壮勇',
        lastName: '拔屋',
        firstName: '壮勇',
        lastNameKana: 'ヌキヤ',
        firstNameKana: 'ソウユウ',
        email: 'nukiya@example.com',
        entryDate: '2020-04-01',
        status: 'working',
        position: 'マネージャー',
        employmentType: '正社員',
        departmentName: '介護事業部',
      },
      {
        id: 1004,
        companyId: refreshedIntegration.companyId!,
        employeeNumber: 'EMP100',
        displayName: '新入 太郎',
        lastName: '新入',
        firstName: '太郎',
        lastNameKana: 'シンニュウ',
        firstNameKana: 'タロウ',
        email: 'shinnyuu@example.com',
        entryDate: '2026-02-01', // 新入社員
        status: 'working',
        employmentType: '正社員',
        departmentName: '介護事業部',
      },
      {
        id: 1005,
        companyId: refreshedIntegration.companyId!,
        employeeNumber: 'EMP050',
        displayName: '退職 花子',
        lastName: '退職',
        firstName: '花子',
        lastNameKana: 'タイショク',
        firstNameKana: 'ハナコ',
        email: 'taishoku@example.com',
        entryDate: '2020-04-01',
        retireDate: '2026-01-31', // 退職者
        status: 'retired',
        employmentType: '正社員',
        departmentName: 'サポート事業部',
      },
    ];

    console.log('[FreeeEmployees] 従業員一覧取得完了', {
      count: employees.length,
    });

    return {
      success: true,
      employees,
    };
  } catch (error) {
    console.error('[FreeeEmployees] 取得エラー:', error);
    return {
      success: false,
      employees: [],
      error: error instanceof Error ? error.message : '従業員取得に失敗しました',
    };
  }
}

/**
 * freeeから単一従業員を取得（ダミー実装）
 */
export async function fetchFreeeEmployee(freeeEmployeeId: number): Promise<{
  success: boolean;
  employee?: FreeeEmployee;
  error?: string;
}> {
  console.log('[FreeeEmployees] 従業員取得', { freeeEmployeeId });

  try {
    const integration = await getFreeeIntegration();

    if (!integration?.connected || !integration.accessToken || !integration.companyId) {
      return {
        success: false,
        error: 'freee連携が設定されていません',
      };
    }

    // ダミー実装: 実際のAPI呼び出しの代わり
    /*
    const response = await fetch(
      `https://api.freee.co.jp/hr/api/v1/employees/${freeeEmployeeId}?company_id=${integration.companyId}`,
      {
        headers: {
          Authorization: `Bearer ${integration.accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`freee API error: ${response.status}`);
    }

    const data = await response.json();
    */

    // ダミー従業員
    const employee: FreeeEmployee = {
      id: freeeEmployeeId,
      companyId: integration.companyId!,
      employeeNumber: `EMP${freeeEmployeeId}`,
      displayName: `従業員${freeeEmployeeId}`,
      status: 'working',
    };

    return {
      success: true,
      employee,
    };
  } catch (error) {
    console.error('[FreeeEmployees] 取得エラー:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '従業員取得に失敗しました',
    };
  }
}
