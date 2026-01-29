// /api/vacancy/metrics - 空室メトリクスAPI
// キャッシュ禁止、status集計、safeRate対応

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyIdToken } from '@/lib/firebase-admin';
import { hasMinRole } from '@/lib/auth';

const DEFAULT_TENANT_ID = 'defaultTenant';

// キャッシュを完全に無効化
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// ステータス定義（日本語 → 英語正規化）
// 空室 = AVAILABLE（入居可能）
// 予約 = LOCKED（申込ロック中、空室カウントしない）
// 入居中 = OCCUPIED
// 退去予定 = OCCUPIED（まだ退去していない）
// メンテナンス = MAINTENANCE
type NormalizedStatus = 'AVAILABLE' | 'LOCKED' | 'OCCUPIED' | 'MAINTENANCE' | 'UNKNOWN';

function normalizeRoomStatus(status: string): NormalizedStatus {
  switch (status) {
    case '空室':
      return 'AVAILABLE';
    case '予約':
      return 'LOCKED';
    case '入居中':
    case '退去予定':
      return 'OCCUPIED';
    case 'メンテナンス':
      return 'MAINTENANCE';
    default:
      return 'UNKNOWN';
  }
}

interface Warning {
  label: string;
  code: string;
  message: string;
}

interface FacilityMetrics {
  id: string;
  name: string;
  area: string;
  capacity: number;
  available: number;    // 空室（入居可能）
  locked: number;       // 申込ロック中
  occupied: number;     // 入居中 + 退去予定
  maintenance: number;  // 修繕中
  unknown: number;      // 未知のステータス
  occupancyRate: number | null;  // 稼働率（入居中/総室数）
  vacancyRate: number | null;    // 空室率（空室/総室数）
  lastUpdated: string | null;
  lastUpdatedBy: string | null;
}

interface VacancyMetricsResponse {
  success: boolean;
  // 全体サマリー
  summary: {
    totalRooms: number;       // 総室数（INACTIVE除外）
    available: number;        // 空室
    locked: number;           // 申込ロック
    occupied: number;         // 入居中
    maintenance: number;      // 修繕
    unknown: number;          // 未知ステータス
    occupancyRate: number | null;  // 全体稼働率
    vacancyRate: number | null;    // 全体空室率
  };
  // 施設別
  facilities: FacilityMetrics[];
  // ロック中の部屋詳細
  lockedRooms: Array<{
    id: string;
    buildingName: string;
    roomNumber: string;
    lockedCaseId: string | null;
    lockedByName: string | null;
    lockedAt: string | null;
  }>;
  // メタ情報
  updatedAt: string;
  warnings: Warning[];
  // デバッグ情報（debug=1時のみ）
  debug?: {
    roomsQueried: number;
    facilitiesQueried: number;
    unknownStatuses: string[];
    rawStatusCounts: Record<string, number>;
  };
}

// safeRate: 分母0はnull
function safeRate(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10; // 小数点1桁
}

export async function GET(request: NextRequest) {
  const warnings: Warning[] = [];

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

    // ユーザー情報取得
    const db = getAdminDb();
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();
    const userRole = userData?.role || 'user';

    // デバッグモード判定（adminのみ）
    const debugMode = request.nextUrl.searchParams.get('debug') === '1' && hasMinRole(userRole, 'admin');

    // ===== 施設取得 =====
    let facilitiesMap = new Map<string, { id: string; name: string; area: string; capacity: number; isActive: boolean }>();
    let facilitiesQueried = 0;

    try {
      const facilitiesSnap = await db
        .collection('facilities')
        .where('tenantId', '==', DEFAULT_TENANT_ID)
        .get();

      facilitiesQueried = facilitiesSnap.size;

      facilitiesSnap.docs.forEach((doc) => {
        const data = doc.data();
        // INACTIVE施設は除外
        if (data.isActive === false) return;

        facilitiesMap.set(doc.id, {
          id: doc.id,
          name: data.name || doc.id,
          area: data.area || '',
          capacity: data.capacity || 0,
          isActive: data.isActive !== false,
        });
      });
    } catch (err) {
      warnings.push({
        label: 'facilities',
        code: 'FETCH_ERROR',
        message: err instanceof Error ? err.message : '施設取得エラー',
      });
    }

    // ===== 部屋取得（rooms コレクション）=====
    let roomsQueried = 0;
    const unknownStatuses: string[] = [];
    const rawStatusCounts: Record<string, number> = {};

    // 施設別集計初期化
    const facilityStats = new Map<string, {
      available: number;
      locked: number;
      occupied: number;
      maintenance: number;
      unknown: number;
    }>();

    facilitiesMap.forEach((_, id) => {
      facilityStats.set(id, { available: 0, locked: 0, occupied: 0, maintenance: 0, unknown: 0 });
    });

    // 全体集計
    let totalStats = { available: 0, locked: 0, occupied: 0, maintenance: 0, unknown: 0 };

    // ロック中部屋リスト
    const lockedRooms: VacancyMetricsResponse['lockedRooms'] = [];

    try {
      const roomsSnap = await db
        .collection('rooms')
        .where('tenantId', '==', DEFAULT_TENANT_ID)
        .get();

      roomsQueried = roomsSnap.size;

      roomsSnap.docs.forEach((doc) => {
        const room = doc.data();
        const status = room.status as string || '空室';
        const buildingName = room.buildingName as string;

        // 生ステータスカウント
        rawStatusCounts[status] = (rawStatusCounts[status] || 0) + 1;

        // 施設IDを特定（buildingNameから）
        let facilityId: string | null = null;
        facilitiesMap.forEach((facility, id) => {
          if (facility.name === buildingName) {
            facilityId = id;
          }
        });

        // 施設に紐づかない部屋は無視（INACTIVE施設の部屋など）
        if (!facilityId || !facilityStats.has(facilityId)) {
          return;
        }

        const normalized = normalizeRoomStatus(status);
        const stats = facilityStats.get(facilityId)!;

        switch (normalized) {
          case 'AVAILABLE':
            stats.available++;
            totalStats.available++;
            break;
          case 'LOCKED':
            stats.locked++;
            totalStats.locked++;
            lockedRooms.push({
              id: doc.id,
              buildingName,
              roomNumber: room.roomNumber || '',
              lockedCaseId: room.lockedCaseId || null,
              lockedByName: room.lockedByName || null,
              lockedAt: room.lockedAt?.toDate?.()?.toISOString() || null,
            });
            break;
          case 'OCCUPIED':
            stats.occupied++;
            totalStats.occupied++;
            break;
          case 'MAINTENANCE':
            stats.maintenance++;
            totalStats.maintenance++;
            break;
          case 'UNKNOWN':
            stats.unknown++;
            totalStats.unknown++;
            if (!unknownStatuses.includes(status)) {
              unknownStatuses.push(status);
            }
            break;
        }
      });
    } catch (err) {
      warnings.push({
        label: 'rooms',
        code: 'FETCH_ERROR',
        message: err instanceof Error ? err.message : '部屋取得エラー',
      });
    }

    // ===== vacancyStatus取得（最終更新情報）=====
    const vacancyStatusMap = new Map<string, { updatedAt: string | null; updatedByName: string | null }>();

    try {
      const vacancyStatusSnap = await db.collection('vacancyStatus').get();

      vacancyStatusSnap.docs.forEach((doc) => {
        const data = doc.data();
        vacancyStatusMap.set(doc.id, {
          updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
          updatedByName: data.updatedByName || null,
        });
      });
    } catch (err) {
      // vacancyStatusは補助情報なのでwarningのみ
      warnings.push({
        label: 'vacancyStatus',
        code: 'FETCH_ERROR',
        message: err instanceof Error ? err.message : 'vacancyStatus取得エラー',
      });
    }

    // ===== 未知ステータス警告 =====
    if (unknownStatuses.length > 0) {
      warnings.push({
        label: 'status',
        code: 'UNKNOWN_STATUS',
        message: `未知のステータス: ${unknownStatuses.join(', ')}`,
      });
    }

    // ===== 施設別メトリクス構築 =====
    const facilities: FacilityMetrics[] = [];

    facilitiesMap.forEach((facility, id) => {
      const stats = facilityStats.get(id)!;
      const totalRooms = stats.available + stats.locked + stats.occupied + stats.maintenance + stats.unknown;
      const vacancyInfo = vacancyStatusMap.get(id);

      facilities.push({
        id,
        name: facility.name,
        area: facility.area,
        capacity: facility.capacity || totalRooms,
        available: stats.available,
        locked: stats.locked,
        occupied: stats.occupied,
        maintenance: stats.maintenance,
        unknown: stats.unknown,
        occupancyRate: safeRate(stats.occupied, totalRooms),
        vacancyRate: safeRate(stats.available, totalRooms),
        lastUpdated: vacancyInfo?.updatedAt || null,
        lastUpdatedBy: vacancyInfo?.updatedByName || null,
      });
    });

    // 名前順ソート
    facilities.sort((a, b) => a.name.localeCompare(b.name, 'ja'));

    // ===== 全体サマリー =====
    const totalRooms = totalStats.available + totalStats.locked + totalStats.occupied + totalStats.maintenance + totalStats.unknown;

    const summary = {
      totalRooms,
      available: totalStats.available,
      locked: totalStats.locked,
      occupied: totalStats.occupied,
      maintenance: totalStats.maintenance,
      unknown: totalStats.unknown,
      occupancyRate: safeRate(totalStats.occupied, totalRooms),
      vacancyRate: safeRate(totalStats.available, totalRooms),
    };

    // ===== レスポンス構築 =====
    const response: VacancyMetricsResponse = {
      success: true,
      summary,
      facilities,
      lockedRooms,
      updatedAt: new Date().toISOString(),
      warnings,
    };

    // デバッグ情報
    if (debugMode) {
      response.debug = {
        roomsQueried,
        facilitiesQueried,
        unknownStatuses,
        rawStatusCounts,
      };
    }

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });

  } catch (error) {
    console.error('Vacancy metrics API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
        warnings,
        updatedAt: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
