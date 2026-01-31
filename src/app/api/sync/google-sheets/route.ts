// ======== Google Sheets 同期 API ========
// POST: 同期を実行
// GET: 同期プレビューを取得

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyIdToken } from '@/lib/firebase-admin';
import { hasMinRole } from '@/lib/auth';
import {
  isServiceAccountConfigured,
  generateSyncPreview,
  executeBidirectionalSync,
  getConnectionConfig,
} from '@/lib/sheets-bidirectional';
import type { SyncEntity, SyncDirection, BidirectionalSyncOptions } from '@/types/sheets-sync';

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
 * GET: 同期プレビューを取得
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateAdmin(request);
    if (authResult instanceof NextResponse) return authResult;

    if (!isServiceAccountConfigured()) {
      return NextResponse.json(
        { error: 'Service Accountが設定されていません' },
        { status: 400 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const entity = searchParams.get('entity') as SyncEntity | null;
    const spreadsheetId = searchParams.get('spreadsheetId');
    const sheetName = searchParams.get('sheetName');
    const gidStr = searchParams.get('gid');

    // パラメータが指定されていない場合は接続設定から取得
    let options: BidirectionalSyncOptions;

    if (entity && spreadsheetId && sheetName) {
      options = {
        entity,
        spreadsheetId,
        sheetName,
        gid: gidStr ? parseInt(gidStr, 10) : 0,
      };
    } else if (entity) {
      // 接続設定から取得
      const config = await getConnectionConfig();
      if (!config || !config.isConnected) {
        return NextResponse.json(
          { error: 'Google Sheetsが接続されていません' },
          { status: 400 }
        );
      }

      const sheetConfig = config.sheets.find((s) => s.entity === entity && s.isActive);
      if (!sheetConfig) {
        return NextResponse.json(
          { error: `${entity} のシート設定が見つかりません` },
          { status: 400 }
        );
      }

      options = {
        entity,
        spreadsheetId: config.spreadsheetId,
        sheetName: sheetConfig.sheetName,
        gid: sheetConfig.gid,
      };
    } else {
      return NextResponse.json(
        { error: 'entityパラメータが必要です' },
        { status: 400 }
      );
    }

    const preview = await generateSyncPreview(options);

    if (!preview) {
      return NextResponse.json(
        { error: 'プレビューの生成に失敗しました' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      preview,
    });
  } catch (error) {
    console.error('Sync Preview API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST: 同期を実行
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateAdmin(request);
    if (authResult instanceof NextResponse) return authResult;

    if (!isServiceAccountConfigured()) {
      return NextResponse.json(
        { error: 'Service Accountが設定されていません' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const {
      entity,
      spreadsheetId,
      sheetName,
      gid,
      direction = 'BIDIRECTIONAL',
      dryRun = false,
      conflictResolution = 'HUB_WINS',
    } = body;

    // パラメータの検証
    let options: BidirectionalSyncOptions;

    if (entity && spreadsheetId && sheetName !== undefined) {
      options = {
        entity: entity as SyncEntity,
        spreadsheetId,
        sheetName,
        gid: gid || 0,
        dryRun,
        conflictResolution,
      };
    } else if (entity) {
      // 接続設定から取得
      const config = await getConnectionConfig();
      if (!config || !config.isConnected) {
        return NextResponse.json(
          { error: 'Google Sheetsが接続されていません' },
          { status: 400 }
        );
      }

      const sheetConfig = config.sheets.find((s) => s.entity === entity && s.isActive);
      if (!sheetConfig) {
        return NextResponse.json(
          { error: `${entity} のシート設定が見つかりません` },
          { status: 400 }
        );
      }

      options = {
        entity: entity as SyncEntity,
        spreadsheetId: config.spreadsheetId,
        sheetName: sheetConfig.sheetName,
        gid: sheetConfig.gid,
        dryRun,
        conflictResolution,
      };
    } else {
      return NextResponse.json(
        { error: 'entityパラメータが必要です' },
        { status: 400 }
      );
    }

    // 同期方向に応じて処理
    const syncDirection = direction as SyncDirection;

    if (syncDirection === 'BIDIRECTIONAL') {
      const result = await executeBidirectionalSync(
        options,
        authResult.userId,
        authResult.userName
      );

      // 接続設定の最終同期日時を更新
      if (!dryRun && result.success) {
        const db = getAdminDb();
        await db.collection('sheetsConnectionConfigs').doc('defaultTenant').update({
          lastSyncAt: new Date(),
          updatedAt: new Date(),
        });
      }

      return NextResponse.json({
        success: result.success,
        result,
        dryRun,
      });
    } else if (syncDirection === 'IMPORT') {
      // インポートのみ（Sheets → HUB）
      const importOptions = { ...options, conflictResolution: 'SHEET_WINS' as const };
      const result = await executeBidirectionalSync(
        importOptions,
        authResult.userId,
        authResult.userName
      );

      return NextResponse.json({
        success: result.success,
        result,
        dryRun,
      });
    } else if (syncDirection === 'EXPORT') {
      // エクスポートのみ（HUB → Sheets）
      const exportOptions = { ...options, conflictResolution: 'HUB_WINS' as const };
      const result = await executeBidirectionalSync(
        exportOptions,
        authResult.userId,
        authResult.userName
      );

      return NextResponse.json({
        success: result.success,
        result,
        dryRun,
      });
    } else {
      return NextResponse.json(
        { error: '無効な同期方向です' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Sync API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
