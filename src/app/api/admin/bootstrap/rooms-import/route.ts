import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { FACILITIES_SEED, getFacilitySummary } from '@/data/rooms-seed';

/**
 * POST /api/admin/bootstrap/rooms-import
 *
 * Google Sheets「入居状況」シートの部屋データを一括インポート
 *
 * Body:
 * {
 *   tenantId: string,
 *   dryRun?: boolean,   // true でプレビューのみ
 *   force?: boolean,    // true で二重インポート防止をスキップ（更新用）
 * }
 *
 * 作成するドキュメント:
 * - facilities/{id} : 施設マスタ
 * - rooms/{auto}    : 部屋マスタ（個別）
 * - vacancyStatus/{id} : 施設別空室数
 */

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tenantId, dryRun, force } = body;

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId は必須です' }, { status: 400 });
    }

    const adminDb = getAdminDb();

    // 二重インポートチェック
    if (!force) {
      const flagRef = adminDb.collection('_bootstrap').doc('rooms-import');
      const flagDoc = await flagRef.get();
      if (flagDoc.exists) {
        const flagData = flagDoc.data();
        return NextResponse.json(
          {
            error: '部屋データは既にインポート済みです。更新する場合は force: true を指定してください。',
            importedAt: flagData?.importedAt?.toDate?.() || flagData?.importedAt,
            count: flagData?.count,
          },
          { status: 409 }
        );
      }
    }

    // 集計プレビュー
    const facilitySummaries = FACILITIES_SEED.map(f => ({
      id: f.id,
      name: f.name,
      ...getFacilitySummary(f),
    }));

    const totalRooms = facilitySummaries.reduce((sum, f) => sum + f.total, 0);
    const totalCapacity = facilitySummaries.reduce((sum, f) => sum + f.capacity, 0);
    const totalVacant = facilitySummaries.reduce((sum, f) => sum + f.vacant, 0);
    const occupancyRate = totalCapacity > 0
      ? Math.round(((totalCapacity - totalVacant) / totalCapacity) * 100)
      : 0;

    // Dry-run
    if (dryRun) {
      return NextResponse.json({
        mode: 'dry-run',
        summary: {
          facilities: facilitySummaries.length,
          totalRooms,
          totalCapacity,
          totalVacant,
          occupancyRate: `${occupancyRate}%`,
        },
        facilities: facilitySummaries,
      });
    }

    // 本番実行
    const batch = adminDb.batch();
    let roomCount = 0;

    for (const facility of FACILITIES_SEED) {
      const summary = getFacilitySummary(facility);

      // 施設ドキュメント
      const facilityRef = adminDb.collection('facilities').doc(facility.id);
      batch.set(facilityRef, {
        name: facility.name,
        area: '介護',
        capacity: summary.capacity,
        isActive: true,
        tenantId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      // 空室状態ドキュメント
      const vacancyRef = adminDb.collection('vacancyStatus').doc(facility.id);
      batch.set(vacancyRef, {
        facilityId: facility.id,
        vacantCount: summary.vacant,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: 'bootstrap',
        updatedByName: 'Sheetsインポート',
      }, { merge: true });

      // 個別の部屋ドキュメント
      for (const room of facility.rooms) {
        const roomRef = adminDb.collection('rooms').doc();
        batch.set(roomRef, {
          tenantId,
          buildingName: room.buildingName,
          roomNumber: room.roomNumber,
          capacity: 1,
          status: room.status,
          occupantName: room.occupantName || null,
          expectedCareLevel: room.expectedCareLevel || null,
          note: room.note || null,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        roomCount++;
      }
    }

    // 二重インポート防止フラグ
    const flagRef = adminDb.collection('_bootstrap').doc('rooms-import');
    batch.set(flagRef, {
      importedAt: FieldValue.serverTimestamp(),
      importedBy: 'api',
      count: roomCount,
      facilities: FACILITIES_SEED.length,
      tenantId,
    }, { merge: true });

    await batch.commit();

    return NextResponse.json({
      mode: 'execute',
      summary: {
        facilities: FACILITIES_SEED.length,
        totalRooms: roomCount,
        totalCapacity,
        totalVacant,
        occupancyRate: `${occupancyRate}%`,
      },
      facilities: facilitySummaries,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
