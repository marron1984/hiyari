// ======== freee OAuthコールバック ========

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import {
  exchangeCodeForToken,
  getFreeeCompanies,
  saveFreeeIntegration,
} from '@/lib/freee-token';

const OAUTH_STATES_COLLECTION = 'oauth_states';

/**
 * GET /api/admin/freee/callback
 * freee OAuthコールバック処理
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // エラーレスポンスの場合
  if (error) {
    console.error('[freee/callback] OAuthエラー:', error);
    return redirectWithError('認証がキャンセルされました');
  }

  // パラメータチェック
  if (!code || !state) {
    console.error('[freee/callback] 必須パラメータなし', { code: !!code, state: !!state });
    return redirectWithError('不正なリクエストです');
  }

  try {
    // state検証
    const db = getAdminDb();
    const stateDoc = await db.collection(OAUTH_STATES_COLLECTION).doc(state).get();

    if (!stateDoc.exists) {
      console.error('[freee/callback] state不正', { state });
      return redirectWithError('認証セッションが無効です');
    }

    const stateData = stateDoc.data()!;
    if (stateData.provider !== 'freee') {
      console.error('[freee/callback] provider不正', { provider: stateData.provider });
      return redirectWithError('認証セッションが無効です');
    }

    // 有効期限チェック
    const expiresAt = stateData.expiresAt?.toDate?.() || stateData.expiresAt;
    if (expiresAt && new Date(expiresAt) < new Date()) {
      console.error('[freee/callback] state期限切れ');
      return redirectWithError('認証セッションが期限切れです');
    }

    // stateを削除
    await db.collection(OAUTH_STATES_COLLECTION).doc(state).delete();

    // コードをトークンに交換
    console.log('[freee/callback] トークン交換開始');
    const tokens = await exchangeCodeForToken(code);

    // 事業所一覧を取得
    console.log('[freee/callback] 事業所一覧取得');
    const companies = await getFreeeCompanies(tokens.accessToken);

    if (companies.length === 0) {
      return redirectWithError('アクセス可能な事業所がありません');
    }

    // 最初の事業所を使用（複数事業所対応は後で実装）
    const company = companies[0];

    // 連携情報を保存
    await saveFreeeIntegration({
      connected: true,
      connectedAt: new Date(),
      // connectedBy, connectedByName は後でUIから設定
      companyId: company.id,
      companyName: company.name,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
    });

    console.log('[freee/callback] 連携完了', { companyId: company.id, companyName: company.name });

    // 成功ページにリダイレクト
    return NextResponse.redirect(
      new URL('/admin/settings/freee?status=connected', request.nextUrl.origin)
    );
  } catch (error) {
    console.error('[freee/callback] エラー:', error);
    return redirectWithError(
      error instanceof Error ? error.message : '連携処理中にエラーが発生しました'
    );
  }
}

function redirectWithError(message: string): NextResponse {
  const url = new URL('/admin/settings/freee', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
  url.searchParams.set('status', 'error');
  url.searchParams.set('message', message);
  return NextResponse.redirect(url);
}
