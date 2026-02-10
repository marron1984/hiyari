// Google Sheets インポートAPI
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyIdToken } from '@/lib/firebase-admin';
import {
  isGoogleSheetsConfigured,
  importProspectsFromSheet,
  saveImportLog,
  getRecentImportLogs,
  getSheetData,
  detectColumnMapping,
} from '@/lib/google-sheets';
import { canEditProspects } from '@/lib/auth';

// GET: インポート状況・プレビューを取得
export async function GET(request: NextRequest) {
  try {
    // 認証チェック
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const idToken = authHeader.substring(7);
    const decodedToken = await verifyIdToken(idToken);

    if (!decodedToken) {
      return NextResponse.json({ error: '無効なトークンです' }, { status: 401 });
    }

    // 管理者チェック
    const userDoc = await getAdminDb().collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();
    const userRole = userData?.role || 'user';

    if (!canEditProspects(userRole, userData?.modulePermissions)) {
      return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action') || 'status';

    switch (action) {
      case 'status': {
        // API設定状況とインポート履歴を返す
        const configured = isGoogleSheetsConfigured();
        const recentLogs = configured ? await getRecentImportLogs(5) : [];

        return NextResponse.json({
          success: true,
          configured,
          recentLogs,
        });
      }

      case 'preview': {
        // シートデータのプレビュー
        const sheetId = searchParams.get('sheetId');
        if (!sheetId) {
          return NextResponse.json({ error: 'sheetIdが必要です' }, { status: 400 });
        }

        if (!isGoogleSheetsConfigured()) {
          return NextResponse.json({ error: 'Google Sheets APIが設定されていません' }, { status: 400 });
        }

        const data = await getSheetData(sheetId);
        if (!data) {
          return NextResponse.json({ error: 'シートデータの取得に失敗しました' }, { status: 500 });
        }

        const headers = data[0] || [];
        const mapping = detectColumnMapping(headers);
        const previewRows = data.slice(1, 6);

        return NextResponse.json({
          success: true,
          headers,
          mapping,
          previewRows,
          totalRows: data.length - 1,
        });
      }

      default:
        return NextResponse.json({ error: '無効なアクションです' }, { status: 400 });
    }
  } catch (error) {
    console.error('Google Sheets API GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: インポート実行
export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const idToken = authHeader.substring(7);
    const decodedToken = await verifyIdToken(idToken);

    if (!decodedToken) {
      return NextResponse.json({ error: '無効なトークンです' }, { status: 401 });
    }

    // 管理者チェック
    const userDoc = await getAdminDb().collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();
    const userRole = userData?.role || 'user';

    if (!canEditProspects(userRole, userData?.modulePermissions)) {
      return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 });
    }

    if (!isGoogleSheetsConfigured()) {
      return NextResponse.json({ error: 'Google Sheets APIが設定されていません' }, { status: 400 });
    }

    const body = await request.json();
    const { sheetId, range = 'A:Z', dryRun = false, yearFilter = 2026 } = body;

    if (!sheetId) {
      return NextResponse.json({ error: 'sheetIdが必要です' }, { status: 400 });
    }

    // インポート実行（年フィルター付き）
    const result = await importProspectsFromSheet(sheetId, range, dryRun, yearFilter);

    // 履歴を保存（dryRunでない場合）
    if (!dryRun && result.success) {
      await saveImportLog(
        sheetId,
        result,
        decodedToken.uid,
        userData?.name || decodedToken.email || 'Unknown'
      );
    }

    return NextResponse.json({
      ...result,
      dryRun,
    });
  } catch (error) {
    console.error('Google Sheets API POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
