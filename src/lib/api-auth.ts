/**
 * API認証ヘルパー
 *
 * 全APIルートで共通の認証処理を提供する。
 * DEMO_USERパターンを置き換え、Firebaseトークン認証に統一する。
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken, getAdminDb } from './firebase-admin';
import type { UserRole } from '@/types';

export interface ApiUser {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId: string;
  baseId?: string;
  baseName?: string;
}

/**
 * リクエストから認証ユーザーを取得する。
 * Bearerトークンが無い、または無効な場合はnullを返す。
 */
export async function getApiUser(request: NextRequest): Promise<ApiUser | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const idToken = authHeader.substring(7);
  const decodedToken = await verifyIdToken(idToken);
  if (!decodedToken) {
    return null;
  }

  const db = getAdminDb();
  const userDoc = await db.collection('users').doc(decodedToken.uid).get();
  const userData = userDoc.data();

  return {
    uid: decodedToken.uid,
    email: decodedToken.email || '',
    name: userData?.name || userData?.displayName || '名前未設定',
    role: (userData?.role || 'user') as UserRole,
    tenantId: userData?.tenantId || 'defaultTenant',
    baseId: userData?.baseId,
    baseName: userData?.baseName,
  };
}

/**
 * 認証必須のAPIで使う。未認証の場合は401レスポンスを返す。
 */
export async function requireApiUser(
  request: NextRequest
): Promise<ApiUser | NextResponse> {
  const user = await getApiUser(request);
  if (!user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }
  return user;
}

/**
 * ApiUser かどうかを型ガード
 */
export function isApiUser(result: ApiUser | NextResponse): result is ApiUser {
  return 'uid' in result;
}
