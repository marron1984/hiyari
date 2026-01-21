// Google Tasks 同期API
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyIdToken } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { isAiVpOwner } from '@/lib/auth';
import {
  createApprovalTask,
  completeApprovalTask,
  isGoogleTasksConfigured,
} from '@/lib/google-tasks';

const DEFAULT_TENANT_ID = 'defaultTenant';

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

    // AI副社長オーナーまたは管理者チェック
    const userDoc = await getAdminDb().collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();
    const userRole = userData?.role || 'user';
    const isAdmin = ['admin', 'system_admin'].includes(userRole);

    if (!isAiVpOwner(decodedToken.email) && !isAdmin) {
      return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 });
    }

    // Google Tasks設定チェック
    if (!isGoogleTasksConfigured()) {
      return NextResponse.json({
        error: 'Google Tasks連携が設定されていません',
        configured: false,
      }, { status: 503 });
    }

    const body = await request.json();
    const { action, requestId } = body;

    if (!requestId) {
      return NextResponse.json({ error: 'requestIdは必須です' }, { status: 400 });
    }

    // 申請データ取得
    const requestDoc = await getAdminDb().collection('requests').doc(requestId).get();
    if (!requestDoc.exists) {
      return NextResponse.json({ error: '申請が見つかりません' }, { status: 404 });
    }

    const requestData = requestDoc.data();

    switch (action) {
      case 'create': {
        // タスク作成（AI副社長レビュー完了時に呼ばれる）
        const syncRecord = await createApprovalTask(
          requestId,
          requestData?.requestNumber || '',
          requestData?.title || '',
          requestData?.totalAmount || 0,
          requestData?.applicantName || ''
        );

        if (syncRecord) {
          // 監査ログ
          await getAdminDb().collection('aiVpAuditLogs').add({
            tenantId: DEFAULT_TENANT_ID,
            actorUserId: 'system',
            actorUserName: 'Google Tasks Sync',
            eventType: 'task_created',
            eventMeta: {
              requestId,
              googleTaskId: syncRecord.googleTaskId,
            },
            createdAt: FieldValue.serverTimestamp(),
          });

          return NextResponse.json({
            success: true,
            taskId: syncRecord.googleTaskId,
            syncRecordId: syncRecord.id,
          });
        } else {
          return NextResponse.json({ error: 'タスク作成に失敗しました' }, { status: 500 });
        }
      }

      case 'complete': {
        // タスク完了（最終決裁完了時に呼ばれる）
        const success = await completeApprovalTask(requestId);

        if (success) {
          // 監査ログ
          await getAdminDb().collection('aiVpAuditLogs').add({
            tenantId: DEFAULT_TENANT_ID,
            actorUserId: 'system',
            actorUserName: 'Google Tasks Sync',
            eventType: 'task_completed',
            eventMeta: { requestId },
            createdAt: FieldValue.serverTimestamp(),
          });

          return NextResponse.json({ success: true });
        } else {
          return NextResponse.json({ error: 'タスク完了に失敗しました' }, { status: 500 });
        }
      }

      default:
        return NextResponse.json({ error: '無効なアクションです' }, { status: 400 });
    }
  } catch (error) {
    console.error('Google Tasks sync error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// 設定状態を確認
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

    if (!isAiVpOwner(decodedToken.email)) {
      return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 });
    }

    return NextResponse.json({
      configured: isGoogleTasksConfigured(),
    });
  } catch (error) {
    console.error('Google Tasks config check error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
