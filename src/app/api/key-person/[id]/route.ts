/**
 * キーパーソン詳細 API
 *
 * GET   /api/key-person/[id] - 詳細取得
 * PATCH /api/key-person/[id] - 更新
 */

import { NextRequest, NextResponse } from 'next/server';
import { getById, updateContact } from '@/lib/keyPerson/repo.firestore';
import { canViewKeyPerson, canEditKeyPerson } from '@/lib/keyPerson/types';
import type { UpdateKeyPersonRequest } from '@/lib/keyPerson/types';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { AppRole } from '@/config/appRoles';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const contact = await getById(id, { userId: user.uid, role: user.role as AppRole });

    if (!contact) {
      return NextResponse.json(
        { error: '連絡先が見つかりません' },
        { status: 404 }
      );
    }

    return NextResponse.json({ contact });
  } catch (error) {
    console.error('Error fetching key person:', error);
    return NextResponse.json(
      { error: '連絡先の取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    // 権限チェック
    if (!canEditKeyPerson(user.role as AppRole)) {
      return NextResponse.json(
        { error: '編集権限がありません' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const contact = await getById(id, { userId: user.uid, role: user.role as AppRole });

    if (!contact) {
      return NextResponse.json(
        { error: '連絡先が見つかりません' },
        { status: 404 }
      );
    }

    const body = await request.json();

    const updateRequest: UpdateKeyPersonRequest = {};

    if (body.name !== undefined) updateRequest.name = body.name;
    if (body.relation !== undefined) updateRequest.relation = body.relation;
    if (body.phone !== undefined) updateRequest.phone = body.phone;
    if (body.email !== undefined) updateRequest.email = body.email;
    if (body.lineIdOrHint !== undefined) updateRequest.lineIdOrHint = body.lineIdOrHint;
    if (body.preferredContactType !== undefined)
      updateRequest.preferredContactType = body.preferredContactType;
    if (body.availableTimeHint !== undefined)
      updateRequest.availableTimeHint = body.availableTimeHint;
    if (body.notes !== undefined) updateRequest.notes = body.notes;
    if (body.isEmergency !== undefined) updateRequest.isEmergency = body.isEmergency;
    if (body.consentStatus !== undefined) updateRequest.consentStatus = body.consentStatus;

    const updated = await updateContact(id, updateRequest, user.uid);

    return NextResponse.json({ contact: updated });
  } catch (error) {
    console.error('Error updating key person:', error);
    return NextResponse.json(
      { error: '連絡先の更新に失敗しました' },
      { status: 500 }
    );
  }
}
