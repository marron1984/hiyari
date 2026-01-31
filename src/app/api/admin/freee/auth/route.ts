// ======== freee OAuth認証開始 ========

import { NextRequest, NextResponse } from 'next/server';
import { getFreeeAuthUrl } from '@/lib/freee-token';
import { getAdminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

const OAUTH_STATES_COLLECTION = 'oauth_states';

/**
 * GET /api/admin/freee/auth
 * freee OAuth認証URLを生成して返す
 */
export async function GET(request: NextRequest) {
  try {
    // stateを生成（CSRF対策）
    const state = crypto.randomUUID();

    // stateをFirestoreに保存（有効期限10分）
    const db = getAdminDb();
    await db.collection(OAUTH_STATES_COLLECTION).doc(state).set({
      provider: 'freee',
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    // 認証URLを生成
    const authUrl = getFreeeAuthUrl(state);

    return NextResponse.json({
      success: true,
      authUrl,
      state,
    });
  } catch (error) {
    console.error('[freee/auth] エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '認証URL生成に失敗しました',
      },
      { status: 500 }
    );
  }
}
