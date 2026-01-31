// ======== 人事インポート統一API ========

import { NextRequest, NextResponse } from 'next/server';
import {
  importFromFreee,
  importFromCSV,
  listEmployees,
  listHRImportAuditLogs,
} from '@/lib/hr-import';
import type { HRImportSource } from '@/types/hr-import';

/**
 * GET /api/admin/hr/import
 * 従業員一覧またはインポート履歴を取得
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId') || 'default';
    const type = searchParams.get('type') || 'employees';

    if (type === 'history') {
      // インポート履歴
      const limit = parseInt(searchParams.get('limit') || '20', 10);
      const logs = await listHRImportAuditLogs(tenantId, limit);

      return NextResponse.json({
        success: true,
        logs: logs.map((log) => ({
          ...log,
          createdAt: log.createdAt.toISOString(),
          result: {
            ...log.result,
            importedAt: log.result.importedAt.toISOString(),
          },
        })),
      });
    }

    // 従業員一覧
    const status = searchParams.get('status') as 'ACTIVE' | 'INACTIVE' | null;
    const limit = parseInt(searchParams.get('limit') || '100', 10);

    const employees = await listEmployees(tenantId, {
      status: status || undefined,
      limit,
    });

    return NextResponse.json({
      success: true,
      employees: employees.map((emp) => ({
        ...emp,
        createdAt: emp.createdAt.toISOString(),
        updatedAt: emp.updatedAt.toISOString(),
        lastSyncAt: emp.lastSyncAt?.toISOString(),
      })),
    });
  } catch (error) {
    console.error('[HR/Import] 取得エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '取得に失敗しました',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/hr/import
 * 従業員をインポート
 *
 * Request Body:
 * - source: 'freee' | 'csv' | 'sheets'
 * - csvData: string (source=csv の場合)
 * - sheetsId: string (source=sheets の場合)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { source, csvData, sheetsId, tenantId = 'default' } = body;

    // ソースバリデーション
    const validSources: HRImportSource[] = ['csv', 'sheets', 'freee'];
    if (!source || !validSources.includes(source)) {
      return NextResponse.json(
        {
          success: false,
          error: 'source は csv, sheets, freee のいずれかを指定してください',
        },
        { status: 400 }
      );
    }

    let result;

    switch (source) {
      case 'freee':
        // freeeからインポート
        result = await importFromFreee(tenantId);
        break;

      case 'csv':
        // CSVからインポート
        if (!csvData || typeof csvData !== 'string') {
          return NextResponse.json(
            { success: false, error: 'csvData は必須です' },
            { status: 400 }
          );
        }
        result = await importFromCSV(tenantId, csvData);
        break;

      case 'sheets':
        // Google Sheetsからインポート（未実装）
        return NextResponse.json(
          { success: false, error: 'sheets インポートは未実装です' },
          { status: 501 }
        );

      default:
        return NextResponse.json(
          { success: false, error: '不正なソース' },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: result.success,
      result: {
        ...result,
        importedAt: result.importedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('[HR/Import] インポートエラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'インポートに失敗しました',
      },
      { status: 500 }
    );
  }
}
