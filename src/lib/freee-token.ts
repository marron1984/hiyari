// ======== freee トークン管理 ========

import { getAdminDb } from './firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { FreeeIntegration } from '@/types/freee';
import { FREEE_INTEGRATION_COLLECTION, FREEE_INTEGRATION_DOC_ID, FREEE_OAUTH_CONFIG } from '@/types/freee';

const DEFAULT_TENANT_ID = 'defaultTenant';
const TOKEN_REFRESH_BUFFER_MINUTES = 5; // 期限の5分前にリフレッシュ

// ======== ヘルパー ========

function toDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  return undefined;
}

function removeUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const key in obj) {
    if (obj[key] !== undefined) {
      result[key] = obj[key];
    }
  }
  return result;
}

// ======== 連携情報の取得・保存 ========

/**
 * freee連携情報を取得
 */
export async function getFreeeIntegration(): Promise<FreeeIntegration | null> {
  const db = getAdminDb();
  const doc = await db
    .collection(FREEE_INTEGRATION_COLLECTION)
    .doc(`${DEFAULT_TENANT_ID}_${FREEE_INTEGRATION_DOC_ID}`)
    .get();

  if (!doc.exists) {
    return null;
  }

  const data = doc.data()!;
  return {
    id: doc.id,
    tenantId: data.tenantId,
    connected: data.connected || false,
    connectedAt: toDate(data.connectedAt),
    connectedBy: data.connectedBy,
    connectedByName: data.connectedByName,
    companyId: data.companyId,
    companyName: data.companyName,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    tokenExpiresAt: toDate(data.tokenExpiresAt),
    lastSyncAt: toDate(data.lastSyncAt),
    lastError: data.lastError,
    createdAt: toDate(data.createdAt) || new Date(),
    updatedAt: toDate(data.updatedAt) || new Date(),
  };
}

/**
 * freee連携情報を保存
 */
export async function saveFreeeIntegration(
  integration: Partial<FreeeIntegration> & { connected: boolean }
): Promise<void> {
  const db = getAdminDb();
  const docId = `${DEFAULT_TENANT_ID}_${FREEE_INTEGRATION_DOC_ID}`;

  const data = removeUndefined({
    tenantId: DEFAULT_TENANT_ID,
    connected: integration.connected,
    connectedAt: integration.connectedAt ? Timestamp.fromDate(integration.connectedAt) : undefined,
    connectedBy: integration.connectedBy,
    connectedByName: integration.connectedByName,
    companyId: integration.companyId,
    companyName: integration.companyName,
    accessToken: integration.accessToken,
    refreshToken: integration.refreshToken,
    tokenExpiresAt: integration.tokenExpiresAt ? Timestamp.fromDate(integration.tokenExpiresAt) : undefined,
    lastSyncAt: integration.lastSyncAt ? Timestamp.fromDate(integration.lastSyncAt) : undefined,
    lastError: integration.lastError,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const existing = await db.collection(FREEE_INTEGRATION_COLLECTION).doc(docId).get();
  if (existing.exists) {
    await db.collection(FREEE_INTEGRATION_COLLECTION).doc(docId).update(data);
  } else {
    await db.collection(FREEE_INTEGRATION_COLLECTION).doc(docId).set({
      ...data,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
}

/**
 * freee連携を解除
 */
export async function disconnectFreee(): Promise<void> {
  const db = getAdminDb();
  const docId = `${DEFAULT_TENANT_ID}_${FREEE_INTEGRATION_DOC_ID}`;

  await db.collection(FREEE_INTEGRATION_COLLECTION).doc(docId).set({
    tenantId: DEFAULT_TENANT_ID,
    connected: false,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

// ======== OAuth トークン管理 ========

/**
 * OAuth認証URLを生成
 */
export function getFreeeAuthUrl(state: string): string {
  const clientId = process.env.FREEE_CLIENT_ID;
  const redirectUri = process.env.FREEE_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/freee/callback`;

  if (!clientId) {
    throw new Error('FREEE_CLIENT_ID環境変数が設定されていません');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
  });

  return `${FREEE_OAUTH_CONFIG.authorizeUrl}?${params.toString()}`;
}

/**
 * 認証コードをトークンに交換
 */
export async function exchangeCodeForToken(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const clientId = process.env.FREEE_CLIENT_ID;
  const clientSecret = process.env.FREEE_CLIENT_SECRET;
  const redirectUri = process.env.FREEE_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/freee/callback`;

  if (!clientId || !clientSecret) {
    throw new Error('freee OAuth認証情報が設定されていません');
  }

  console.log('[FreeeToken] コードをトークンに交換', { code: code.substring(0, 10) + '...' });

  const response = await fetch(FREEE_OAUTH_CONFIG.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`トークン取得失敗: ${error}`);
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

/**
 * リフレッシュトークンでアクセストークンを更新
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const clientId = process.env.FREEE_CLIENT_ID;
  const clientSecret = process.env.FREEE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('freee OAuth認証情報が設定されていません');
  }

  console.log('[FreeeToken] トークンリフレッシュ');

  const response = await fetch(FREEE_OAUTH_CONFIG.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`トークンリフレッシュ失敗: ${error}`);
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

/**
 * トークンの有効期限をチェックし、必要ならリフレッシュ
 */
export async function refreshFreeeTokenIfNeeded(
  integration: FreeeIntegration
): Promise<FreeeIntegration | null> {
  if (!integration.refreshToken || !integration.tokenExpiresAt) {
    console.log('[FreeeToken] リフレッシュトークンまたは有効期限なし');
    return null;
  }

  const now = new Date();
  const expiresAt = integration.tokenExpiresAt;
  const bufferMs = TOKEN_REFRESH_BUFFER_MINUTES * 60 * 1000;

  // 有効期限内（バッファ考慮）であればそのまま返す
  if (expiresAt.getTime() - now.getTime() > bufferMs) {
    console.log('[FreeeToken] トークン有効、リフレッシュ不要');
    return integration;
  }

  console.log('[FreeeToken] トークン期限切れ間近、リフレッシュ実行');

  try {
    const tokens = await refreshAccessToken(integration.refreshToken);

    const updatedIntegration: FreeeIntegration = {
      ...integration,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
      updatedAt: new Date(),
    };

    await saveFreeeIntegration(updatedIntegration);
    console.log('[FreeeToken] トークンリフレッシュ完了');

    return updatedIntegration;
  } catch (error) {
    console.error('[FreeeToken] トークンリフレッシュ失敗', error);

    // エラーを記録
    await saveFreeeIntegration({
      ...integration,
      connected: false,
      lastError: error instanceof Error ? error.message : 'トークンリフレッシュ失敗',
    });

    return null;
  }
}

// ======== 事業所情報取得 ========

/**
 * freee事業所一覧を取得
 */
export async function getFreeeCompanies(accessToken: string): Promise<Array<{ id: number; name: string }>> {
  console.log('[FreeeToken] 事業所一覧取得');

  const response = await fetch(`${FREEE_OAUTH_CONFIG.apiBaseUrl}/api/1/companies`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('事業所一覧の取得に失敗しました');
  }

  const data = await response.json();
  return data.companies.map((c: { id: number; display_name?: string; name: string }) => ({
    id: c.id,
    name: c.display_name || c.name,
  }));
}
