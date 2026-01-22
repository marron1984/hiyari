import { NextRequest, NextResponse } from 'next/server';
import { db, DEFAULT_TENANT_ID } from '@/lib/firebase';
import {
  doc,
  setDoc,
  updateDoc,
  Timestamp,
} from 'firebase/firestore';

// 2026年1月22日時点の最新空室データ
const VACANCY_DATA = {
  pacific: {
    name: 'パシフィック',
    capacity: 22, // 入居可能な部屋数（会社利用・その他を除く）
    vacantCount: 10, // 空室数
    occupied: 12, // 入居中
    note: '210, 211, 303, 401, 406, 408, 410, 411, 416, 608が空室',
  },
  renaissance: {
    name: 'ルネッサンス',
    capacity: 9,
    vacantCount: 2,
    occupied: 7,
    note: '2E, 6A(社宅予定)が空室',
  },
  serene: {
    name: 'セレーネ',
    capacity: 9,
    vacantCount: 4,
    occupied: 5,
    note: '801, 813, 915, 1012が空室',
  },
};

export async function POST(request: NextRequest) {
  if (!db) {
    return NextResponse.json({ error: 'Database not available' }, { status: 500 });
  }

  try {
    const results = [];

    for (const [facilityId, data] of Object.entries(VACANCY_DATA)) {
      // 施設のcapacityを更新
      const facilityRef = doc(db, 'facilities', facilityId);
      await updateDoc(facilityRef, {
        capacity: data.capacity,
        updatedAt: Timestamp.now(),
      }).catch(async () => {
        // 施設が存在しない場合は作成
        await setDoc(facilityRef, {
          name: data.name,
          area: '介護',
          capacity: data.capacity,
          isActive: true,
          tenantId: DEFAULT_TENANT_ID,
          createdAt: Timestamp.now(),
        });
      });

      // 空室状態を更新
      const vacancyRef = doc(db, 'vacancyStatus', facilityId);
      await setDoc(vacancyRef, {
        facilityId,
        vacantCount: data.vacantCount,
        note: data.note,
        updatedAt: Timestamp.now(),
        updatedBy: 'system',
        updatedByName: 'システム自動更新',
      });

      results.push({
        facilityId,
        name: data.name,
        capacity: data.capacity,
        vacantCount: data.vacantCount,
        occupancyRate: Math.round(((data.capacity - data.vacantCount) / data.capacity) * 100),
      });
    }

    return NextResponse.json({
      success: true,
      message: '空室データを更新しました',
      data: results,
    });
  } catch (error) {
    console.error('[vacancy/update] Error:', error);
    return NextResponse.json(
      { error: '空室データの更新に失敗しました', details: String(error) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'POST to update vacancy data',
    data: VACANCY_DATA,
  });
}
