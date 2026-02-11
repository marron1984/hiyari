// ======== freee 従業員 API 連携 ========

import { getFreeeIntegration, refreshFreeeTokenIfNeeded } from './freee-token';
import type { FreeeEmployee } from '@/types/hr-import';

const HR_API_BASE = 'https://api.freee.co.jp/hr';

// ======== 従業員一覧取得 ========

/**
 * freeeから従業員一覧を取得
 */
export async function fetchFreeeEmployees(): Promise<{
  success: boolean;
  employees: FreeeEmployee[];
  error?: string;
}> {
  console.log('[FreeeEmployees] 従業員一覧取得開始');

  try {
    const integration = await getFreeeIntegration();

    if (!integration?.connected || !integration.accessToken || !integration.companyId) {
      return {
        success: false,
        employees: [],
        error: 'freee連携が設定されていません',
      };
    }

    const refreshedIntegration = await refreshFreeeTokenIfNeeded(integration);
    if (!refreshedIntegration?.accessToken) {
      return {
        success: false,
        employees: [],
        error: 'freeeトークンの更新に失敗しました',
      };
    }

    // ページネーション対応で全従業員を取得
    const allEmployees: FreeeEmployee[] = [];
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const response = await fetch(
        `${HR_API_BASE}/api/v1/employees?company_id=${refreshedIntegration.companyId}&limit=${limit}&offset=${offset}`,
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
      const employees: FreeeEmployee[] = data.employees.map((emp: {
        id: number; num?: string; display_name?: string;
        last_name?: string; first_name?: string;
        last_name_kana?: string; first_name_kana?: string;
        email?: string; birth_date?: string;
        entry_date?: string; retire_date?: string;
        department_name?: string; position?: string;
        employment_type?: string;
      }) => ({
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
        status: emp.retire_date ? 'retired' as const : 'working' as const,
        departmentName: emp.department_name,
        position: emp.position,
        employmentType: emp.employment_type,
      }));

      allEmployees.push(...employees);

      if (employees.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }
    }

    console.log('[FreeeEmployees] 従業員一覧取得完了', {
      count: allEmployees.length,
    });

    return {
      success: true,
      employees: allEmployees,
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
 * freeeから単一従業員を取得
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

    const refreshedIntegration = await refreshFreeeTokenIfNeeded(integration);
    if (!refreshedIntegration?.accessToken) {
      return {
        success: false,
        error: 'freeeトークンの更新に失敗しました',
      };
    }

    const response = await fetch(
      `${HR_API_BASE}/api/v1/employees/${freeeEmployeeId}?company_id=${refreshedIntegration.companyId}`,
      {
        headers: {
          Authorization: `Bearer ${refreshedIntegration.accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`freee API error: ${response.status}`);
    }

    const data = await response.json();
    const emp = data.employee;
    const employee: FreeeEmployee = {
      id: emp.id,
      companyId: refreshedIntegration.companyId!,
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
