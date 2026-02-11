/**
 * キーパーソン API
 *
 * GET  /api/key-person - 一覧取得
 * POST /api/key-person - 新規作成
 */

import { NextRequest, NextResponse } from 'next/server';
import { listBySubject, createContact } from '@/lib/keyPerson/repo.firestore';
import { canManageKeyPerson, canViewKeyPerson } from '@/lib/keyPerson/types';
import type {
  CreateKeyPersonRequest,
  KeyPersonSubjectType,
} from '@/lib/keyPerson/types';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    // 権限チェック
    if (!canViewKeyPerson(user.role as AppRole)) {
      return NextResponse.json(
        { error: '閲覧権限がありません' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const subjectType = searchParams.get('subjectType') as KeyPersonSubjectType | null;
    const subjectId = searchParams.get('subjectId');

    if (!subjectType || !subjectId) {
      return NextResponse.json(
        { error: 'subjectType と subjectId は必須です' },
        { status: 400 }
      );
    }

    const contacts = await listBySubject(subjectType, subjectId, { userId: user.uid, role: user.role as AppRole });

    return NextResponse.json({ contacts });
  } catch (error) {
    console.error('Error listing key persons:', error);
    return NextResponse.json(
      { error: '連絡先の取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    // 権限チェック
    if (!canManageKeyPerson(user.role as AppRole)) {
      return NextResponse.json(
        { error: '作成権限がありません' },
        { status: 403 }
      );
    }

    const body = await request.json();

    const createRequest: CreateKeyPersonRequest = {
      subjectType: body.subjectType || 'client',
      subjectId: body.subjectId,
      priorityOrder: body.priorityOrder,
      name: body.name,
      relation: body.relation,
      phone: body.phone,
      email: body.email,
      lineIdOrHint: body.lineIdOrHint,
      preferredContactType: body.preferredContactType,
      availableTimeHint: body.availableTimeHint,
      notes: body.notes,
      isEmergency: body.isEmergency,
      consentStatus: body.consentStatus,
    };

    if (!createRequest.subjectId || !createRequest.name) {
      return NextResponse.json(
        { error: '利用者IDと名前は必須です' },
        { status: 400 }
      );
    }

    const contact = await createContact(createRequest, user.uid);

    return NextResponse.json({ contact }, { status: 201 });
  } catch (error) {
    console.error('Error creating key person:', error);
    return NextResponse.json(
      { error: '連絡先の作成に失敗しました' },
      { status: 500 }
    );
  }
}
