/**
 * POST /api/os/checkin
 * チェックイン保存 → スコア算出 → 介入判定
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import { saveCheckin, getCheckin } from '@/lib/chaos';
import { CheckinFormData, SUPPORT_PURPOSE_TEXT } from '@/types/chaos';
import { createAuditLog } from '@/lib/chaos';

// チェックインデータのバリデーション
function validateCheckinData(data: unknown): { valid: boolean; error?: string; data?: CheckinFormData } {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'リクエストボディが不正です' };
  }

  const body = data as Record<string, unknown>;

  const requiredFields = ['physicalFatigue', 'mentalFatigue', 'sleep', 'anxiety', 'decisionLoad', 'consulted'];
  for (const field of requiredFields) {
    if (typeof body[field] !== 'number') {
      return { valid: false, error: `${field}は数値で指定してください` };
    }
    const value = body[field] as number;
    if (value < 0 || value > 4 || !Number.isInteger(value)) {
      return { valid: false, error: `${field}は0-4の整数で指定してください` };
    }
  }

  return {
    valid: true,
    data: {
      physicalFatigue: body.physicalFatigue as number,
      mentalFatigue: body.mentalFatigue as number,
      sleep: body.sleep as number,
      anxiety: body.anxiety as number,
      decisionLoad: body.decisionLoad as number,
      consulted: body.consulted as number,
      note: typeof body.note === 'string' ? body.note : undefined,
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    // リクエストボディのパース
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'JSONのパースに失敗しました' },
        { status: 400 }
      );
    }

    // バリデーション
    const validation = validateCheckinData(body);
    if (!validation.valid || !validation.data) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    // 日付の取得（クライアントから指定があればそれを使用、なければ今日）
    const requestBody = body as Record<string, unknown>;
    const date = typeof requestBody.date === 'string'
      ? requestBody.date
      : new Date().toISOString().split('T')[0];

    // 日付フォーマットのバリデーション（YYYY-MM-DD）
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: '日付はYYYY-MM-DD形式で指定してください' },
        { status: 400 }
      );
    }

    // チェックイン保存（スコア計算と介入判定も内部で実行）
    const checkinId = await saveCheckin(user.uid, user.name, date, validation.data);

    // 監査ログ（個人のメモはログに出さない）
    await createAuditLog(
      user.uid,
      user.name,
      'checkin_submitted',
      'staffCheckins',
      checkinId,
      { date } // note は含めない
    );

    // 保存後のチェックインを取得して返す
    const savedCheckin = await getCheckin(user.uid, date);

    return NextResponse.json({
      success: true,
      checkinId,
      date,
      checkin: savedCheckin,
      message: 'チェックインを記録しました',
      supportText: SUPPORT_PURPOSE_TEXT,
    });
  } catch (error) {
    console.error('Checkin API error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}

// GET: 指定日のチェックイン取得
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

    // 日付フォーマットのバリデーション
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: '日付はYYYY-MM-DD形式で指定してください' },
        { status: 400 }
      );
    }

    const checkin = await getCheckin(user.uid, date);

    return NextResponse.json({
      success: true,
      date,
      checkin,
      supportText: SUPPORT_PURPOSE_TEXT,
    });
  } catch (error) {
    console.error('Checkin GET API error:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}
