// ======== 入居者 API ========

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyIdToken } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { hasMinRole } from '@/lib/auth';

const DEFAULT_TENANT_ID = 'defaultTenant';

// GET: 入居者一覧取得
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId') || DEFAULT_TENANT_ID;
    const status = searchParams.get('status');
    const facilityId = searchParams.get('facilityId');

    let query = getAdminDb()
      .collection('residents')
      .where('tenantId', '==', tenantId)
      .orderBy('createdAt', 'desc');

    const snapshot = await query.get();

    let residents = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name,
        nameKana: data.nameKana,
        gender: data.gender,
        careLevel: data.careLevel,
        facilityId: data.facilityId,
        facilityName: data.facilityName,
        roomNumber: data.roomNumber,
        status: data.status,
        keyPersonName: data.keyPersonName,
        keyPersonRelation: data.keyPersonRelation,
        keyPersonContact: data.keyPersonContact,
        tenantId: data.tenantId,
        birthDate: data.birthDate?.toDate?.()?.toISOString(),
        moveInDate: data.moveInDate?.toDate?.()?.toISOString(),
        moveOutPlannedDate: data.moveOutPlannedDate?.toDate?.()?.toISOString(),
        createdAt: data.createdAt?.toDate?.()?.toISOString(),
        updatedAt: data.updatedAt?.toDate?.()?.toISOString(),
      };
    });

    // フィルタリング
    if (status) {
      residents = residents.filter((r) => r.status === status);
    }
    if (facilityId) {
      residents = residents.filter((r) => r.facilityId === facilityId);
    }

    return NextResponse.json({ residents });
  } catch (error) {
    console.error('[residents] GET Error:', error);
    return NextResponse.json(
      { error: 'Failed to get residents', details: String(error) },
      { status: 500 }
    );
  }
}

// POST: 入居者作成
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

    // 権限チェック
    const userDoc = await getAdminDb().collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();
    const userRole = userData?.role || 'user';

    if (!hasMinRole(userRole, 'leader')) {
      return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 });
    }

    const body = await request.json();
    const {
      tenantId = DEFAULT_TENANT_ID,
      name,
      nameKana,
      birthDate,
      gender,
      careLevel,
      facilityId,
      facilityName,
      roomNumber,
      moveInDate,
      moveOutPlannedDate,
      keyPersonName,
      keyPersonRelation,
      keyPersonContact,
      status = '入居中',
    } = body;

    if (!name) {
      return NextResponse.json({ error: '氏名は必須です' }, { status: 400 });
    }

    const residentData = {
      tenantId,
      name,
      nameKana,
      birthDate: birthDate ? Timestamp.fromDate(new Date(birthDate)) : null,
      gender,
      careLevel,
      facilityId,
      facilityName,
      roomNumber,
      moveInDate: moveInDate ? Timestamp.fromDate(new Date(moveInDate)) : null,
      moveOutPlannedDate: moveOutPlannedDate ? Timestamp.fromDate(new Date(moveOutPlannedDate)) : null,
      keyPersonName,
      keyPersonRelation,
      keyPersonContact,
      status,
      createdAt: Timestamp.now(),
      createdBy: decodedToken.uid,
    };

    const docRef = await getAdminDb().collection('residents').add(residentData);

    return NextResponse.json({
      success: true,
      resident: {
        id: docRef.id,
        ...residentData,
        birthDate,
        moveInDate,
        moveOutPlannedDate,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[residents] POST Error:', error);
    return NextResponse.json(
      { error: 'Failed to create resident', details: String(error) },
      { status: 500 }
    );
  }
}
