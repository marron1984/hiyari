// ======== 入居希望者 一覧・新規作成API ========
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyIdToken } from '@/lib/firebase-admin';
import { hasMinRole, canEditProspects } from '@/lib/auth';
import { Timestamp } from 'firebase-admin/firestore';
import type { ProspectStatus } from '@/types/prospect';
import { generateProspectKey } from '@/types/prospect';

const DEFAULT_TENANT_ID = 'defaultTenant';

// GET: 入居希望者一覧
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

    // ユーザー情報を取得
    const userDoc = await getAdminDb().collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();
    const tenantId = userData?.tenantId || DEFAULT_TENANT_ID;

    // クエリパラメータ
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as ProspectStatus | null;
    const assigneeId = searchParams.get('assigneeId');

    // Firestoreから取得
    let q = getAdminDb()
      .collection('prospects')
      .where('tenantId', '==', tenantId);

    if (status) {
      q = q.where('status', '==', status);
    }
    if (assigneeId) {
      q = q.where('assigneeId', '==', assigneeId);
    }

    const snapshot = await q.get();

    const prospects = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        receivedAt: data.receivedAt?.toDate?.()?.toISOString() || null,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
      };
    });

    return NextResponse.json({
      success: true,
      prospects,
      total: prospects.length,
    });
  } catch (error) {
    console.error('Prospects GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: 入居希望者を新規作成
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

    // ユーザー情報を取得
    const userDoc = await getAdminDb().collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();
    const userRole = userData?.role || 'user';
    const tenantId = userData?.tenantId || DEFAULT_TENANT_ID;

    // 権限チェック
    if (!canEditProspects(userRole, userData?.modulePermissions)) {
      return NextResponse.json({ error: '入居希望者の登録権限がありません' }, { status: 403 });
    }

    const body = await request.json();

    // 必須フィールドチェック
    if (!body.customerName) {
      return NextResponse.json({ error: '顧客名は必須です' }, { status: 400 });
    }

    const now = Timestamp.now();

    // 次のinternal_noを取得
    const counterRef = getAdminDb().doc('counters/prospects_internal_no');
    let nextInternalNo: number;

    const counterSnap = await counterRef.get();
    if (!counterSnap.exists) {
      // カウンタが未設定の場合、既存の最大値を計算
      const existingSnap = await getAdminDb()
        .collection('prospects')
        .where('tenantId', '==', tenantId)
        .get();
      let maxNo = 0;
      existingSnap.docs.forEach((d) => {
        const no = d.data().internalNo;
        if (no) {
          const num = typeof no === 'number' ? no : parseInt(String(no), 10);
          if (!isNaN(num) && num > maxNo) maxNo = num;
        }
      });
      nextInternalNo = maxNo + 1;
    } else {
      nextInternalNo = (counterSnap.data()?.current || 0) + 1;
    }

    // カウンタを更新
    await counterRef.set({ current: nextInternalNo, updatedAt: now });

    // 重複判定キーを生成
    const prospectKey = generateProspectKey({
      customerName: body.customerName,
      age: body.age,
      inquiryDate: body.inquiryDate,
      salesCompanyName: body.salesCompanyName,
      salesRepName: body.salesRepName,
    });

    const prospectData = {
      tenantId,
      status: '新規受付' as ProspectStatus,
      receivedAt: now,
      prospectKey,
      createdAt: now,
      createdBy: decodedToken.uid,
      createdByName: userData?.name || decodedToken.email || 'Unknown',
      internalNo: nextInternalNo.toString(),
      statusNote: null,
      assigneeId: body.assigneeId || null,
      assigneeName: body.assigneeName || null,
      customerName: body.customerName || null,
      age: body.age ? parseInt(body.age, 10) || null : null,
      gender: body.gender || null,
      careLevel: body.careLevel || null,
      disabilityCategory: body.disabilityCategory || null,
      budget: body.budget || null,
      budgetDetail: body.budgetDetail || null,
      monthlyBudget: body.monthlyBudget || null,
      adlSummary: body.adlSummary || null,
      adlDetail: body.adlDetail || null,
      debtStatus: body.debtStatus || null,
      currentSituation: body.currentSituation || null,
      currentAddress: body.currentAddress || null,
      desiredFacility: body.desiredFacility || null,
      desiredMoveInDate: body.desiredMoveInDate || null,
      tourRequestDate: body.tourRequestDate || null,
      interviewDateTime: body.interviewDateTime || null,
      keyPerson: body.keyPerson || null,
      otherNotes: body.otherNotes || null,
      salesCompanyName: body.salesCompanyName || null,
      salesRepName: body.salesRepName || null,
      salesRepContact: body.salesRepContact || null,
      inquiryDate: body.inquiryDate || null,
      source: 'manual',
      duplicateOf: null,
      duplicateCandidates: null,
    };

    const docRef = await getAdminDb().collection('prospects').add(prospectData);

    // 監査ログ
    await getAdminDb().collection('auditLogs').add({
      tenantId,
      actor: decodedToken.uid,
      actorName: userData?.name || 'Unknown',
      action: 'create',
      entity: 'prospect',
      entityId: docRef.id,
      diff: { after: { internalNo: nextInternalNo, customerName: body.customerName } },
      note: `手動登録: ${body.customerName} (No.${nextInternalNo})`,
      createdAt: now,
    });

    return NextResponse.json({
      success: true,
      id: docRef.id,
      internalNo: nextInternalNo,
    });
  } catch (error) {
    console.error('Prospects POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
