// ======== 空室一覧API ========
import { NextRequest, NextResponse } from 'next/server';
import { getRooms, findAvailableRooms } from '@/lib/prospect';
import { DEFAULT_TENANT_ID } from '@/lib/firebase';

/**
 * GET /api/rooms/available
 * 空室一覧を取得（ロック済み部屋も含む）
 * Query params:
 *   - buildingName: 建物名でフィルター（任意）
 *   - onlyAvailable: trueなら空室のみ（デフォルト: false）
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const buildingName = searchParams.get('buildingName') || undefined;
    const onlyAvailable = searchParams.get('onlyAvailable') === 'true';
    const tenantId = DEFAULT_TENANT_ID;

    let rooms;
    if (onlyAvailable) {
      rooms = await findAvailableRooms(tenantId, buildingName);
    } else {
      rooms = await getRooms(tenantId, buildingName);
      // 空室と予約のみを返す（入居中は除外）
      rooms = rooms.filter((r) => r.status === '空室' || r.status === '予約');
    }

    // レスポンス用にDate→ISO文字列に変換
    const roomsResponse = rooms.map((room) => ({
      ...room,
      lockedAt: room.lockedAt?.toISOString() || null,
      createdAt: room.createdAt?.toISOString() || null,
      updatedAt: room.updatedAt?.toISOString() || null,
    }));

    return NextResponse.json({
      success: true,
      rooms: roomsResponse,
      count: roomsResponse.length,
    });
  } catch (error) {
    console.error('Failed to fetch available rooms:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
