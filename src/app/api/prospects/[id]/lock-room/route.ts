// ======== 部屋ロックAPI ========
import { NextRequest, NextResponse } from 'next/server';
import { lockRoomForApplication, unlockRoom, updateProspect, getProspect, getRooms } from '@/lib/prospect';
import { DEFAULT_TENANT_ID } from '@/lib/firebase';
import { UserRole, ModulePermissions } from '@/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/prospects/:id/lock-room
 * 部屋をロックして入居希望に紐付ける
 * Body:
 *   - roomId: ロックする部屋ID
 *   - userId: 操作ユーザーID
 *   - userName: 操作ユーザー名
 *   - userRole: 操作ユーザー権限
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: prospectId } = await params;
    const body = await request.json();
    const { roomId, userId, userName, userRole, modulePermissions } = body;

    // パラメータチェック
    if (!roomId || !userId || !userName || !userRole) {
      return NextResponse.json(
        { success: false, error: 'roomId, userId, userName, userRoleは必須です' },
        { status: 400 }
      );
    }

    // プロスペクトの存在確認
    const prospect = await getProspect(prospectId);
    if (!prospect) {
      return NextResponse.json(
        { success: false, error: '入居希望が見つかりません' },
        { status: 404 }
      );
    }

    // 既にロック済みの部屋がある場合は先に解除
    if (prospect.selectedRoomId) {
      await unlockRoom(
        prospect.selectedRoomId,
        userId,
        userName,
        userRole as UserRole,
        DEFAULT_TENANT_ID
      );
    }

    // 部屋をロック
    const lockResult = await lockRoomForApplication(
      roomId,
      prospectId,
      userId,
      userName,
      userRole as UserRole,
      DEFAULT_TENANT_ID,
      modulePermissions as ModulePermissions | undefined
    );

    if (!lockResult.success) {
      return NextResponse.json(
        { success: false, error: lockResult.error },
        { status: 400 }
      );
    }

    // 部屋情報を取得して名前を保存
    const rooms = await getRooms(DEFAULT_TENANT_ID);
    const lockedRoom = rooms.find((r) => r.id === roomId);
    const roomName = lockedRoom
      ? `${lockedRoom.buildingName} ${lockedRoom.roomNumber}`
      : roomId;

    // プロスペクトを更新（部屋情報を紐付け）
    await updateProspect(
      prospectId,
      {
        selectedRoomId: roomId,
        selectedRoomName: roomName,
        appliedAt: new Date(),
      },
      userId,
      userName,
      userRole as UserRole,
      modulePermissions as ModulePermissions | undefined
    );

    return NextResponse.json({
      success: true,
      message: `部屋「${roomName}」をロックしました`,
      data: {
        prospectId,
        roomId,
        roomName,
      },
    });
  } catch (error) {
    console.error('Failed to lock room:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/prospects/:id/lock-room
 * 部屋のロックを解除
 * Body:
 *   - userId: 操作ユーザーID
 *   - userName: 操作ユーザー名
 *   - userRole: 操作ユーザー権限
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: prospectId } = await params;
    const body = await request.json();
    const { userId, userName, userRole, modulePermissions } = body;

    // パラメータチェック
    if (!userId || !userName || !userRole) {
      return NextResponse.json(
        { success: false, error: 'userId, userName, userRoleは必須です' },
        { status: 400 }
      );
    }

    // プロスペクトの存在確認
    const prospect = await getProspect(prospectId);
    if (!prospect) {
      return NextResponse.json(
        { success: false, error: '入居希望が見つかりません' },
        { status: 404 }
      );
    }

    // ロック済み部屋がない場合
    if (!prospect.selectedRoomId) {
      return NextResponse.json(
        { success: false, error: 'ロック済みの部屋がありません' },
        { status: 400 }
      );
    }

    // 部屋のロックを解除
    const unlockResult = await unlockRoom(
      prospect.selectedRoomId,
      userId,
      userName,
      userRole as UserRole,
      DEFAULT_TENANT_ID
    );

    if (!unlockResult.success) {
      return NextResponse.json(
        { success: false, error: unlockResult.error },
        { status: 400 }
      );
    }

    // プロスペクトの部屋情報をクリア
    await updateProspect(
      prospectId,
      {
        selectedRoomId: undefined,
        selectedRoomName: undefined,
        appliedAt: undefined,
      },
      userId,
      userName,
      userRole as UserRole,
      modulePermissions as ModulePermissions | undefined
    );

    return NextResponse.json({
      success: true,
      message: 'ロックを解除しました',
    });
  } catch (error) {
    console.error('Failed to unlock room:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
