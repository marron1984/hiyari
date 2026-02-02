/**
 * キーパーソン詳細 API
 *
 * GET   /api/key-person/[id] - 詳細取得
 * PATCH /api/key-person/[id] - 更新
 */

import { NextRequest, NextResponse } from 'next/server';
import { getById, updateContact } from '@/lib/keyPerson/repo';
import { canViewKeyPerson, canEditKeyPerson } from '@/lib/keyPerson/types';
import type { UpdateKeyPersonRequest, ViewerContext } from '@/lib/keyPerson/types';

// デモユーザー
const DEMO_VIEWER: ViewerContext = {
  userId: 'user_manager',
  role: 'manager',
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 権限チェック
    if (!canViewKeyPerson(DEMO_VIEWER.role)) {
      return NextResponse.json(
        { error: '閲覧権限がありません' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const contact = getById(id, DEMO_VIEWER);

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
    // 権限チェック
    if (!canEditKeyPerson(DEMO_VIEWER.role)) {
      return NextResponse.json(
        { error: '編集権限がありません' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const contact = getById(id, DEMO_VIEWER);

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

    const updated = updateContact(id, updateRequest, DEMO_VIEWER.userId);

    return NextResponse.json({ contact: updated });
  } catch (error) {
    console.error('Error updating key person:', error);
    return NextResponse.json(
      { error: '連絡先の更新に失敗しました' },
      { status: 500 }
    );
  }
}
