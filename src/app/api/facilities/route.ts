// ======== 施設マスタAPI ========
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyIdToken } from '@/lib/firebase-admin';
import { hasMinRole } from '@/lib/auth';
import { Timestamp } from 'firebase-admin/firestore';

const DEFAULT_TENANT_ID = 'defaultTenant';

/**
 * GET /api/facilities
 * 施設一覧を取得
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

    const db = getAdminDb();
    const snapshot = await db
      .collection('facilities')
      .where('tenantId', '==', DEFAULT_TENANT_ID)
      .get();

    // vacancyStatus も取得して結合
    const [vacancySnap] = await Promise.all([
      db.collection('vacancyStatus').get(),
    ]);
    const vacancyMap = new Map<string, { vacantCount: number; updatedAt: string | null }>();
    vacancySnap.docs.forEach((d) => {
      const vData = d.data();
      vacancyMap.set(d.id, {
        vacantCount: vData.vacantCount ?? 0,
        updatedAt: vData.updatedAt?.toDate?.()?.toISOString() || null,
      });
    });

    const facilities = snapshot.docs
      .map((doc) => {
        const data = doc.data();
        const vacancy = vacancyMap.get(doc.id);
        return {
          id: doc.id,
          name: data.name,
          address: data.address || null,
          area: data.area || null,
          capacity: data.capacity || null,
          note: data.note || null,
          isActive: data.isActive !== false,
          tenantId: data.tenantId,
          vacantCount: vacancy?.vacantCount ?? null,
          vacancyUpdatedAt: vacancy?.updatedAt ?? null,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
          updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
        };
      })
      .filter((f) => f.isActive)
      .sort((a, b) => a.name.localeCompare(b.name, 'ja'));

    return NextResponse.json({
      success: true,
      facilities,
      count: facilities.length,
    });
  } catch (error) {
    console.error('Failed to fetch facilities:', error);
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
 * POST /api/facilities
 * 施設を追加（admin のみ）
 * Body:
 *   - name: 施設名（必須）
 *   - address: 住所（任意）
 *   - area: エリア（任意）
 *   - capacity: 定員（任意）
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
        { error: '施設の追加には admin 以上の権限が必要です' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, address, area, capacity, note } = body;

    // バリデーション
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json(
        { error: '施設名は必須です' },
        { status: 400 }
      );
    }

    // 重複チェック
    const existingQuery = await db
      .collection('facilities')
      .where('tenantId', '==', DEFAULT_TENANT_ID)
      .where('name', '==', name.trim())
      .get();

    if (!existingQuery.empty) {
      return NextResponse.json(
        { error: `施設「${name}」は既に登録されています` },
        { status: 409 }
      );
    }

    // 施設を作成
    const facilityData = {
      tenantId: DEFAULT_TENANT_ID,
      name: name.trim(),
      address: address?.trim() || null,
      area: area?.trim() || null,
      capacity: capacity ? Number(capacity) : null,
      note: note?.trim() || null,
      isActive: true,
      createdAt: Timestamp.now(),
      createdBy: decodedToken.uid,
      createdByName: userData?.displayName || decodedToken.email || 'Unknown',
    };

    const docRef = await db.collection('facilities').add(facilityData);

    return NextResponse.json({
      success: true,
      message: `施設「${name}」を追加しました`,
      facility: {
        id: docRef.id,
        ...facilityData,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Failed to create facility:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
