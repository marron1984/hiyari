// ======== Firebase Admin SDK ========
// サーバーサイド用のFirebase Admin初期化

import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth, Auth, DecodedIdToken } from 'firebase-admin/auth';

let adminApp: App | null = null;
let _adminDb: Firestore | null = null;
let _adminAuth: Auth | null = null;

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

  if (serviceAccount) {
    adminApp = initializeApp({
      credential: cert(serviceAccount),
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });
  } else {
    // Application Default Credentials（Cloud環境用）
    adminApp = initializeApp({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
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

// Alias exports for convenience
export const adminDb = getAdminDb;
export const adminAuth = getAdminAuth;
