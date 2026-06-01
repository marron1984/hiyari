// ======== Firebase Admin SDK ========
// サーバーサイド用のFirebase Admin初期化

import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth, DecodedIdToken } from 'firebase-admin/auth';
import { getStorage, Storage } from 'firebase-admin/storage';

let adminApp: App | null = null;
let _adminDb: Firestore | null = null;
let _adminAuth: Auth | null = null;
let _adminStorage: Storage | null = null;

/**
 * Firebase Admin Appを取得（初期化がまだなら初期化）
 */
function getAdminApp(): App {
  if (adminApp) {
    return adminApp;
  }

  if (getApps().length > 0) {
    adminApp = getApps()[0];
    return adminApp;
  }

  // 環境変数からサービスアカウント情報を取得
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
    : undefined;

  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.appspot.com`;

  if (serviceAccount) {
    adminApp = initializeApp({
      credential: cert(serviceAccount),
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket,
    });
  } else {
    // Application Default Credentials（Cloud環境用）
    adminApp = initializeApp({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket,
    });
  }

  return adminApp;
}

/**
 * Firebase Admin Firestoreを取得
 */
export function getAdminDb(): Firestore {
  if (_adminDb) {
    return _adminDb;
  }

  getAdminApp();
  _adminDb = getFirestore();
  return _adminDb;
}

/**
 * Firebase Admin Authを取得
 */
export function getAdminAuth(): Auth {
  if (_adminAuth) {
    return _adminAuth;
  }

  getAdminApp();
  _adminAuth = getAuth();
  return _adminAuth;
}

/**
 * Firebase Admin Storageを取得
 */
export function getAdminStorage(): Storage {
  if (_adminStorage) {
    return _adminStorage;
  }

  getAdminApp();
  _adminStorage = getStorage();
  return _adminStorage;
}

/**
 * IDトークンを検証
 */
export async function verifyIdToken(idToken: string): Promise<DecodedIdToken | null> {
  try {
    const auth = getAdminAuth();
    const decodedToken = await auth.verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    console.error('ID token verification failed:', error);
    return null;
  }
}

/**
 * リクエストからBearerトークンを検証し、ユーザー情報を返す共通ヘルパー
 */
export async function authenticateRequest(
  request: { headers: { get(name: string): string | null } }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ id: string; userId: string; name: string; email: string; role: any; branchId: string } | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const decodedToken = await verifyIdToken(authHeader.substring(7));
  if (!decodedToken) return null;

  const userDoc = await getAdminDb().collection('users').doc(decodedToken.uid).get();
  const userData = userDoc.data();

  const uid = decodedToken.uid;
  return {
    id: uid,
    userId: uid,
    name: userData?.name || userData?.displayName || decodedToken.email || 'Unknown',
    email: decodedToken.email || '',
    role: userData?.role || 'user',
    branchId: userData?.branchId || 'default',
  };
}

// Alias exports for convenience
export const adminDb = getAdminDb;
export const adminAuth = getAdminAuth;
