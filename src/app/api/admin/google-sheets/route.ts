// ======== Google Sheets 認証・設定 API ========
// POST: 接続設定を保存
// GET: 接続状況を取得

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyIdToken } from '@/lib/firebase-admin';
import { hasMinRole } from '@/lib/auth';
import {
  isServiceAccountConfigured,
  getServiceAccountEmail,
  testConnection,
  getConnectionConfig,
  saveConnectionConfig,
  getRecentSyncLogs,
} from '@/lib/sheets-bidirectional';
import type { SyncEntity } from '@/types/sheets-sync';

const DEFAULT_TENANT_ID = 'defaultTenant';

/**
 * 認証チェック
 */
async function authenticateAdmin(request: NextRequest): Promise<{
  userId: string;
  userName: string;
  userRole: string;
} | NextResponse> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }

  const idToken = authHeader.substring(7);
  const decodedToken = await verifyIdToken(idToken);

  if (!decodedToken) {
    return NextResponse.json({ error: '無効なトークンです' }, { status: 401 });
  }

  const userDoc = await getAdminDb().collection('users').doc(decodedToken.uid).get();
  const userData = userDoc.data();
  const userRole = userData?.role || 'user';

  if (!hasMinRole(userRole, 'admin')) {
    return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 });
  }

  return {
    userId: decodedToken.uid,
    userName: userData?.name || decodedToken.email || 'Unknown',
    userRole,
  };
}

/**
 * GET: 接続状況を取得
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateAdmin(request);
    if (authResult instanceof NextResponse) return authResult;

    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action') || 'status';

    switch (action) {
      case 'status': {
        // 基本的な接続状況
        const isConfigured = isServiceAccountConfigured();
        const serviceAccountEmail = getServiceAccountEmail();
        const connectionConfig = await getConnectionConfig();
        const recentLogs = await getRecentSyncLogs(undefined, 5);

        return NextResponse.json({
          success: true,
          isConfigured,
          serviceAccountEmail,
          connectionConfig,
          recentLogs,
        });
      }

      case 'test': {
        // 接続テスト
        const spreadsheetId = searchParams.get('spreadsheetId');
        if (!spreadsheetId) {
          return NextResponse.json({ error: 'spreadsheetIdが必要です' }, { status: 400 });
        }

        const testResult = await testConnection(spreadsheetId);
        return NextResponse.json(testResult);
      }

      case 'logs': {
        // 同期ログ履歴
        const entity = searchParams.get('entity') as SyncEntity | null;
        const limitStr = searchParams.get('limit');
        const limit = limitStr ? parseInt(limitStr, 10) : 20;

        const logs = await getRecentSyncLogs(entity || undefined, limit);
        return NextResponse.json({ success: true, logs });
      }

      default:
        return NextResponse.json({ error: '無効なアクションです' }, { status: 400 });
    }
  } catch (error) {
    console.error('Google Sheets Admin API GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST: 接続設定を保存
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateAdmin(request);
    if (authResult instanceof NextResponse) return authResult;

    if (!isServiceAccountConfigured()) {
      return NextResponse.json(
        { error: 'Service Accountが設定されていません。環境変数 GOOGLE_SHEETS_SERVICE_ACCOUNT を設定してください。' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { spreadsheetId, sheets } = body;

    if (!spreadsheetId) {
      return NextResponse.json({ error: 'spreadsheetIdが必要です' }, { status: 400 });
    }

    // 接続テスト
    const testResult = await testConnection(spreadsheetId);
    if (!testResult.success) {
      return NextResponse.json(
        { error: testResult.error || 'スプレッドシートに接続できません' },
        { status: 400 }
      );
    }

    // シート設定の検証
    const validSheets: { entity: SyncEntity; sheetName: string; gid: number; isActive: boolean }[] = [];

    if (sheets && Array.isArray(sheets)) {
      for (const sheet of sheets) {
        if (sheet.entity && sheet.sheetName !== undefined) {
          // シートが存在するか確認
          const sheetExists = testResult.sheets?.some(
            (s) => s.title === sheet.sheetName || s.sheetId === sheet.gid
          );

          if (sheetExists || sheet.gid !== undefined) {
            validSheets.push({
              entity: sheet.entity as SyncEntity,
              sheetName: sheet.sheetName,
              gid: sheet.gid || 0,
              isActive: sheet.isActive !== false,
            });
          }
        }
      }
    }

    // 接続設定を保存
    const serviceAccountEmail = getServiceAccountEmail();
    await saveConnectionConfig({
      tenantId: DEFAULT_TENANT_ID,
      spreadsheetId,
      spreadsheetName: testResult.spreadsheetName || '',
      serviceAccountEmail: serviceAccountEmail || '',
      sheets: validSheets,
      lastSyncAt: null,
      isConnected: true,
    });

    return NextResponse.json({
      success: true,
      spreadsheetName: testResult.spreadsheetName,
      sheets: testResult.sheets,
      configuredSheets: validSheets,
    });
  } catch (error) {
    console.error('Google Sheets Admin API POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE: 接続を解除
 */
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await authenticateAdmin(request);
    if (authResult instanceof NextResponse) return authResult;

    const db = getAdminDb();
    const docRef = db.collection('sheetsConnectionConfigs').doc(DEFAULT_TENANT_ID);
    const doc = await docRef.get();

    if (doc.exists) {
      await docRef.update({
        isConnected: false,
        updatedAt: new Date(),
      });
    }

    return NextResponse.json({ success: true, message: '接続を解除しました' });
  } catch (error) {
    console.error('Google Sheets Admin API DELETE error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
