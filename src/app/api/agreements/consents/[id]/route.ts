/**
 * 同意レコード詳細・操作 API
 * GET  /api/agreements/consents/{id} - 詳細取得
 * POST /api/agreements/consents/{id} - 操作（withdraw / renew）
 */

import { NextRequest, NextResponse } from 'next/server';
import * as repo from '@/lib/agreements/repo';
import type { ViewerContext } from '@/lib/agreements/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const viewer: ViewerContext = {
      userId: 'user_manager',
      role: 'manager',
    };

    const consent = repo.getConsentById(id, viewer);

    if (!consent) {
      return NextResponse.json(
        { success: false, error: '同意レコードが見つかりません' },
        { status: 404 }
      );
    }

    // 関連情報も取得
    const agreementType = repo.getAgreementTypeById(consent.agreementTypeId);
    const document = repo.getDocumentById(consent.agreementDocumentId);
    const events = repo.getEvents(id);

    return NextResponse.json({
      success: true,
      consent,
      agreementType,
      document,
      events,
    });
  } catch (error) {
    console.error('Consent GET Error:', error);
    return NextResponse.json(
      { success: false, error: '同意レコードの取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const actorUserId = 'user_manager';
    const action = body.action as 'withdraw' | 'renew';

    let result;
    if (action === 'withdraw') {
      result = repo.withdrawConsent(id, actorUserId, body.note);
    } else if (action === 'renew') {
      if (!body.newValidUntil) {
        return NextResponse.json(
          { success: false, error: '新しい有効期限が必要です' },
          { status: 400 }
        );
      }
      result = repo.renewConsent(id, body.newValidUntil, actorUserId, body.note);
    } else {
      return NextResponse.json(
        { success: false, error: '無効なアクションです' },
        { status: 400 }
      );
    }

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, consent: result.consent });
  } catch (error) {
    console.error('Consent Action Error:', error);
    return NextResponse.json(
      { success: false, error: '同意レコード操作に失敗しました' },
      { status: 500 }
    );
  }
}
