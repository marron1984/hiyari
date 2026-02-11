/**
 * 電子署名ログ 個別API
 *
 * GET   /api/e-sign/{id} - 詳細取得
 * PATCH /api/e-sign/{id} - 更新/ステータス変更
 */

import { NextRequest, NextResponse } from 'next/server';
import * as repo from '@/lib/esign/repo';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import type { SignStatus, SignMethod } from '@/lib/esign/types';
import type { AppRole } from '@/config/appRoles';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const viewer: repo.ViewerContext = {
      userId: user.uid,
      role: user.role as AppRole,
    };

    const { id } = await context.params;

    const record = repo.getESignRecordById(id, viewer);
    if (!record) {
      return NextResponse.json(
        { success: false, error: '電子署名レコードが見つかりません' },
        { status: 404 }
      );
    }

    const events = repo.getESignEvents(id);

    return NextResponse.json({
      success: true,
      record,
      events,
    });
  } catch (error) {
    console.error('[E-Sign API] GET [id] error:', error);
    return NextResponse.json(
      { success: false, error: '電子署名ログの取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const viewer: repo.ViewerContext = {
      userId: user.uid,
      role: user.role as AppRole,
    };

    const { id } = await context.params;
    const body = await request.json();

    // ステータス変更の場合
    if (body.action) {
      const statusMap: Record<string, SignStatus> = {
        sign: 'signed',
        decline: 'declined',
        void: 'voided',
        expire: 'expired',
        request: 'requested',
      };

      const newStatus = statusMap[body.action];
      if (!newStatus) {
        return NextResponse.json(
          { success: false, error: `不正なアクション: ${body.action}` },
          { status: 400 }
        );
      }

      const result = repo.changeStatus(
        id,
        newStatus,
        viewer.userId,
        viewer.role,
        body.note
      );

      if (!result.success) {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: 400 }
        );
      }

      return NextResponse.json({ success: true, record: result.record });
    }

    // 通常の更新
    const result = repo.updateESignRecord(
      id,
      {
        subjectName: body.subjectName,
        method: body.method as SignMethod | undefined,
        expiresAt: body.expiresAt,
        note: body.note,
      },
      viewer.userId,
      viewer.role
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, record: result.record });
  } catch (error) {
    console.error('[E-Sign API] PATCH [id] error:', error);
    return NextResponse.json(
      { success: false, error: '電子署名ログの更新に失敗しました' },
      { status: 500 }
    );
  }
}
