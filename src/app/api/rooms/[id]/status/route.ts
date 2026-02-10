// ======== 部屋ステータス変更API ========
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyIdToken } from '@/lib/firebase-admin';
import { hasMinRole } from '@/lib/auth';
import { RoomStatus, ROOM_STATUSES } from '@/types/prospect';
import { Timestamp } from 'firebase-admin/firestore';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// 許可される状態遷移
// - 空室 → 会社利用, 入居中
// - 会社利用 → 空室
// - 入居中 → 空室（退去）, 退去予定
// - 退去予定 → 空室, 入居中
// - 予約（LOCKED）は申込連動で自動設定、手動不可
const ALLOWED_TRANSITIONS: Record<RoomStatus, RoomStatus[]> = {
  '空室': ['メンテナンス', '入居中'],
  'メンテナンス': ['空室'],
  '入居中': ['空室', '退去予定'],
  '退去予定': ['空室', '入居中'],
  '予約': [], // 手動変更不可
};

/**
 * PATCH /api/rooms/:id/status
 * 部屋ステータスを変更（manager以上）
 * Body:
 *   - status: 新しいステータス（必須）
 *   - note: 備考（任意）
 *   - occupantId: 入居者ID（入居中に変更時）
 *   - occupantName: 入居者名（入居中に変更時）
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: roomId } = await params;

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

    // ユーザー情報取得・権限チェック
    const db = getAdminDb();
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();
    const userRole = userData?.role || 'user';

    // leader 以上
    if (!hasMinRole(userRole, 'leader')) {
      return NextResponse.json(
        { error: '状態変更には leader 以上の権限が必要です' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { status: newStatus, note, occupantId, occupantName } = body;

    // ステータスチェック
    if (!newStatus || !ROOM_STATUSES.includes(newStatus as RoomStatus)) {
      return NextResponse.json(
        { error: `無効なステータスです: ${newStatus}` },
        { status: 400 }
      );
    }

    // 部屋取得
    const roomDoc = await db.collection('rooms').doc(roomId).get();
    if (!roomDoc.exists) {
      return NextResponse.json(
        { error: '部屋が見つかりません' },
        { status: 404 }
      );
    }

    const roomData = roomDoc.data()!;
    const currentStatus = roomData.status as RoomStatus;

    // 予約（LOCKED）は手動変更不可
    if (currentStatus === '予約') {
      return NextResponse.json(
        { error: '予約中の部屋は申込解除後に状態変更してください' },
        { status: 400 }
      );
    }

    if (newStatus === '予約') {
      return NextResponse.json(
        { error: '予約状態は申込連動で自動設定されます' },
        { status: 400 }
      );
    }

    // 状態遷移チェック
    const allowedNextStates = ALLOWED_TRANSITIONS[currentStatus] || [];
    if (!allowedNextStates.includes(newStatus as RoomStatus)) {
      return NextResponse.json(
        {
          error: `${currentStatus} から ${newStatus} への変更は許可されていません`,
          allowedTransitions: allowedNextStates,
        },
        { status: 400 }
      );
    }

    // 更新データ準備
    const updateData: Record<string, unknown> = {
      status: newStatus,
      updatedAt: Timestamp.now(),
      updatedBy: decodedToken.uid,
      updatedByName: userData?.displayName || decodedToken.email || 'Unknown',
    };

    // 備考更新
    if (note !== undefined) {
      updateData.note = note || null;
    }

    // 入居中に変更時
    if (newStatus === '入居中') {
      updateData.occupantId = occupantId || null;
      updateData.occupantName = occupantName || null;
    }

    // 空室に変更時（退去）
    if (newStatus === '空室') {
      updateData.occupantId = null;
      updateData.occupantName = null;
      updateData.lockedCaseId = null;
      updateData.lockedAt = null;
      updateData.lockedBy = null;
      updateData.lockedByName = null;
    }

    // 更新実行
    await db.collection('rooms').doc(roomId).update(updateData);

    // 監査ログ作成
    await db.collection('auditLogs').add({
      tenantId: roomData.tenantId,
      actor: decodedToken.uid,
      actorName: userData?.displayName || decodedToken.email || 'Unknown',
      action: 'status_change',
      entity: 'room',
      entityId: roomId,
      diff: {
        before: { status: currentStatus },
        after: { status: newStatus },
      },
      note: note || null,
      createdAt: Timestamp.now(),
    });

    return NextResponse.json({
      success: true,
      message: `${roomData.buildingName} ${roomData.roomNumber} を ${newStatus} に変更しました`,
      room: {
        id: roomId,
        buildingName: roomData.buildingName,
        roomNumber: roomData.roomNumber,
        previousStatus: currentStatus,
        status: newStatus,
      },
    });
  } catch (error) {
    console.error('Failed to update room status:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
