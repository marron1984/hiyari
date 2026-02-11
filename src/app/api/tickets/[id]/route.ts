/**
 * チケット詳細API
 *
 * GET /api/tickets/[id] - 詳細取得
 * PATCH /api/tickets/[id] - 更新
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTicketById, updateTicket } from '@/lib/tickets/repo';
import { getById as getTicketFromFirestore } from '@/lib/tickets/repo.firestore';
import type { AppRole } from '@/config/appRoles';
import { requireApiUser, isApiUser } from '@/lib/api-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const { id } = await params;
    const viewer = { userId: user.uid, role: user.role as AppRole };

    const result = getTicketById(id, viewer);

    if (!result.success) {
      // In-memoryに無い場合、Firestoreからフォールバック取得
      try {
        const fsTicket = await getTicketFromFirestore(id);
        if (fsTicket) {
          return NextResponse.json({ ticket: fsTicket });
        }
      } catch {
        // Firestore接続失敗時は元のエラーを返す
      }

      return NextResponse.json(
        { error: result.error },
        { status: result.error === 'チケットが見つかりません' ? 404 : 403 }
      );
    }

    return NextResponse.json({ ticket: result.ticket });
  } catch (error) {
    console.error('ticket GET error:', error);
    return NextResponse.json(
      { error: 'チケットの取得に失敗しました' },
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

    const { id } = await params;
    const body = await request.json();
    const viewer = { userId: user.uid, role: user.role as AppRole };

    const { title, description, priority, category, dueAt, tags, location } = body;

    const result = updateTicket(
      id,
      { title, description, priority, category, dueAt, tags, location },
      viewer
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error === 'チケットが見つかりません' ? 404 : 403 }
      );
    }

    return NextResponse.json({ ticket: result.ticket });
  } catch (error) {
    console.error('ticket PATCH error:', error);
    return NextResponse.json(
      { error: 'チケットの更新に失敗しました' },
      { status: 500 }
    );
  }
}
