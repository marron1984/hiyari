// ======== 部屋マスタAPI ========
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyIdToken } from '@/lib/firebase-admin';
import { hasMinRole } from '@/lib/auth';
import { RoomStatus, ROOM_STATUSES } from '@/types/prospect';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';

const DEFAULT_TENANT_ID = 'defaultTenant';

/**
 * GET /api/rooms
 * 部屋一覧を取得
 * Query params:
 *   - buildingName: 建物名でフィルター（任意）
 *   - status: ステータスでフィルター（任意）
 */
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

    const { searchParams } = new URL(request.url);
    const buildingName = searchParams.get('buildingName') || undefined;
    const statusFilter = searchParams.get('status') || undefined;

    const db = getAdminDb();
    let query = db.collection('rooms').where('tenantId', '==', DEFAULT_TENANT_ID);

    if (buildingName) {
      query = query.where('buildingName', '==', buildingName);
    }

    const snapshot = await query.get();

    let rooms = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        tenantId: data.tenantId,
        buildingName: data.buildingName,
        roomNumber: data.roomNumber,
        capacity: data.capacity ?? 1,
        status: data.status || '空室',
        expectedCareLevel: data.expectedCareLevel || null,
        note: data.note || null,
        lockedCaseId: data.lockedCaseId || null,
        lockedAt: data.lockedAt?.toDate?.()?.toISOString() || null,
        lockedBy: data.lockedBy || null,
        lockedByName: data.lockedByName || null,
        occupantId: data.occupantId || null,
        occupantName: data.occupantName || null,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
      };
    });

    // ステータスフィルター
    if (statusFilter) {
      rooms = rooms.filter((r) => r.status === statusFilter);
    }

    // ソート: 建物名 → 部屋番号
    rooms.sort((a, b) => {
      if (a.buildingName !== b.buildingName) {
        return a.buildingName.localeCompare(b.buildingName, 'ja');
      }
      return a.roomNumber.localeCompare(b.roomNumber, 'ja');
    });

    return NextResponse.json({
      success: true,
      rooms,
      count: rooms.length,
    });
  } catch (error) {
    console.error('Failed to fetch rooms:', error);
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
 * POST /api/rooms
 * 部屋を追加（admin/execのみ）
 * Body:
 *   - buildingName: 建物名（必須）
 *   - roomNumber: 部屋番号（必須）
 *   - capacity: 定員（任意、デフォルト1）
 *   - status: 初期ステータス（任意、デフォルト '空室'）
 *   - expectedCareLevel: 想定介護度（任意）
 *   - note: 備考（任意）
 */
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

    // ユーザー情報取得・権限チェック
    const db = getAdminDb();
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();
    const userRole = userData?.role || 'user';

    // admin のみ
    if (!hasMinRole(userRole, 'admin')) {
      return NextResponse.json(
        { error: '部屋の追加には admin 以上の権限が必要です' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      buildingName,
      roomNumber,
      capacity = 1,
      status = '空室',
      expectedCareLevel,
      note,
    } = body;

    // バリデーション
    if (!buildingName || !roomNumber) {
      return NextResponse.json(
        { error: '建物名と部屋番号は必須です' },
        { status: 400 }
      );
    }

    // ステータスチェック
    if (!ROOM_STATUSES.includes(status as RoomStatus)) {
      return NextResponse.json(
        { error: `無効なステータスです: ${status}` },
        { status: 400 }
      );
    }

    // 重複チェック
    const existingQuery = await db
      .collection('rooms')
      .where('tenantId', '==', DEFAULT_TENANT_ID)
      .where('buildingName', '==', buildingName)
      .where('roomNumber', '==', roomNumber)
      .get();

    if (!existingQuery.empty) {
      return NextResponse.json(
        { error: `${buildingName} ${roomNumber} は既に登録されています` },
        { status: 409 }
      );
    }

    // 部屋を作成
    const roomData = {
      tenantId: DEFAULT_TENANT_ID,
      buildingName,
      roomNumber,
      capacity: Number(capacity) || 1,
      status,
      expectedCareLevel: expectedCareLevel || null,
      note: note || null,
      createdAt: Timestamp.now(),
      createdBy: decodedToken.uid,
      createdByName: userData?.displayName || decodedToken.email || 'Unknown',
    };

    const docRef = await db.collection('rooms').add(roomData);

    return NextResponse.json({
      success: true,
      message: `${buildingName} ${roomNumber} を追加しました`,
      room: {
        id: docRef.id,
        ...roomData,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Failed to create room:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
