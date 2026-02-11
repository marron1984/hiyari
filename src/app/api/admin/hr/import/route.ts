// ======== 人事インポート統一API ========

import { NextRequest, NextResponse } from 'next/server';
import {
  importFromFreee,
  importFromCSV,
  listEmployees,
  listHRImportAuditLogs,
  listHRImportRuns,
  isPreviewEnvironment,
  shouldForceDryRun,
} from '@/lib/hr-import';
import type { HRImportSource, HRImportDryRunResult } from '@/types/hr-import';

/**
 * GET /api/admin/hr/import
 * 従業員一覧 / インポート履歴 / 実行ログを取得
 *
 * Query Parameters:
 * - type: 'employees' | 'history' | 'runs'
 * - tenantId: string (default: 'default')
 * - status: 'ACTIVE' | 'INACTIVE' (type=employees の場合)
 * - limit: number
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId') || 'default';
    const type = searchParams.get('type') || 'employees';
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    if (type === 'history') {
      // 監査ログ（audit_logs）
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

    if (type === 'runs') {
      // 実行ログ（hr_import_runs）
      const runs = await listHRImportRuns(tenantId, limit);

      return NextResponse.json({
        success: true,
        runs: runs.map((run) => ({
          ...run,
          startedAt: run.startedAt.toISOString(),
          completedAt: run.completedAt.toISOString(),
        })),
      });
    }

    // 従業員一覧
    const status = searchParams.get('status') as 'ACTIVE' | 'INACTIVE' | null;

    const employees = await listEmployees(tenantId, {
      status: status || undefined,
      limit: limit || 100,
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
 * Query Parameters:
 * - source: 'freee' | 'csv' | 'sheets' （またはBodyで指定）
 *
 * Request Body:
 * - source: 'freee' | 'csv' | 'sheets' （query parameterでも可）
 * - dryRun: boolean (true で差分プレビューのみ)
 * - csvData: string (source=csv の場合)
 * - tenantId: string (default: 'default')
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const querySource = searchParams.get('source');

    const body = await request.json().catch(() => ({}));
    const {
      source: bodySource,
      dryRun: requestedDryRun,
      csvData,
      tenantId = 'default',
    } = body;

    // source はクエリパラメータ優先
    const source = querySource || bodySource;

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

    // dry_run判定（プレビュー環境では強制）
    const forcedDryRun = shouldForceDryRun();
    const dryRun = requestedDryRun === true || forcedDryRun;

    // プレビュー環境での実行は警告
    if (forcedDryRun && requestedDryRun === false) {
      console.warn('[HR/Import] プレビュー環境ではdry_runが強制されます');
    }

    let result;

    switch (source) {
      case 'freee':
        // freeeからインポート
        result = await importFromFreee({
          tenantId,
          dryRun,
        });
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
        // Google Sheetsは外部依存のため、CSVエクスポート→csvインポートを案内
        return NextResponse.json(
          {
            success: false,
            error: 'Google Sheetsからの直接インポートは非対応です。シートをCSVにエクスポートし、source=csv で送信してください。',
          },
          { status: 400 }
        );

      default:
        return NextResponse.json(
          { success: false, error: '不正なソース' },
          { status: 400 }
        );
    }

    // レスポンス整形
    const isDryRunResult = 'isDryRun' in result && result.isDryRun === true;

    if (isDryRunResult) {
      const dryRunResult = result as HRImportDryRunResult;
      return NextResponse.json({
        success: dryRunResult.success,
        isDryRun: true,
        forcedDryRun,
        isPreviewEnvironment: isPreviewEnvironment(),
        result: {
          ...dryRunResult,
          previewedAt: dryRunResult.previewedAt.toISOString(),
        },
      });
    }

    // 実行結果（HRImportResult）
    const importResult = result as import('@/types/hr-import').HRImportResult;
    return NextResponse.json({
      success: importResult.success,
      isDryRun: false,
      result: {
        ...importResult,
        importedAt: importResult.importedAt.toISOString(),
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
