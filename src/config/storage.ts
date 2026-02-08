/**
 * ストレージドライバー設定
 *
 * PROD-003: 永続化層導入（Firestore）
 *
 * 環境変数 STORAGE_DRIVER で実装を切り替え:
 * - memory: In-Memory + JSONファイル（開発/テスト用）
 * - firestore: Cloud Firestore（本番用）
 */

export type StorageDriver = 'memory' | 'firestore';

/**
 * 現在のストレージドライバーを取得
 *
 * 優先順位:
 * 1. STORAGE_DRIVER 環境変数が明示的に設定されている場合はそれを使用
 * 2. Firebase Project ID が設定されている場合は 'firestore' を自動選択
 * 3. どちらもない場合は 'memory' フォールバック（開発用）
 */
export function getStorageDriver(): StorageDriver {
  const driver = process.env.STORAGE_DRIVER;

  // 明示的に設定されている場合はそれを尊重
  if (driver === 'firestore') return 'firestore';
  if (driver === 'memory') return 'memory';

  // 未設定の場合: Firebase が使えるなら firestore を自動選択
  if (canUseFirestore()) return 'firestore';

  return 'memory';
}

/**
 * Firestoreが有効かどうか
 */
export function isFirestoreEnabled(): boolean {
  return getStorageDriver() === 'firestore';
}

/**
 * Firestore接続が可能かどうかをチェック
 */
export function canUseFirestore(): boolean {
  // 必要な環境変数が設定されているかチェック
  const hasProjectId = !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const hasServiceAccount = !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  // プロジェクトIDがあれば、ADC（Application Default Credentials）でも動作可能
  return hasProjectId;
}

/**
 * ストレージ設定のサマリーを取得（デバッグ用）
 */
export function getStorageConfig(): {
  driver: StorageDriver;
  firestoreAvailable: boolean;
  projectId: string | null;
} {
  return {
    driver: getStorageDriver(),
    firestoreAvailable: canUseFirestore(),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || null,
  };
}
