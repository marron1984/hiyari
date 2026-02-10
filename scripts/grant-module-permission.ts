/**
 * モジュール権限付与スクリプト
 *
 * 使用方法:
 * npx ts-node --project tsconfig.json scripts/grant-module-permission.ts
 *
 * 環境変数:
 * - GOOGLE_APPLICATION_CREDENTIALS: サービスアカウントキーのパス（本番）
 * - FIREBASE_PROJECT_ID: プロジェクトID（エミュレータ使用時）
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// ========================================
// 設定: ここを編集して権限を付与
// ========================================
const TARGET_EMAIL = 'ikuta@aska-g.com';
const MODULE_PERMISSIONS = {
  prospects: { canEdit: true },
};
// ========================================

// Firebase Admin 初期化
if (getApps().length === 0) {
  const projectId = process.env.FIREBASE_PROJECT_ID || 'demo-project';

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    initializeApp({
      credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS),
      projectId,
    });
  } else {
    initializeApp({ projectId });
  }
}

const db = getFirestore();

async function grantModulePermission() {
  console.log(`\n対象ユーザー: ${TARGET_EMAIL}`);
  console.log(`付与する権限:`, JSON.stringify(MODULE_PERMISSIONS, null, 2));
  console.log('---');

  // メールアドレスでユーザーを検索
  const usersSnapshot = await db
    .collection('users')
    .where('email', '==', TARGET_EMAIL)
    .limit(1)
    .get();

  if (usersSnapshot.empty) {
    console.error(`エラー: ユーザー ${TARGET_EMAIL} が見つかりません`);
    process.exit(1);
  }

  const userDoc = usersSnapshot.docs[0];
  const userData = userDoc.data();

  console.log(`ユーザーID: ${userDoc.id}`);
  console.log(`名前: ${userData.name}`);
  console.log(`現在のロール: ${userData.role}`);
  console.log(`現在のmodulePermissions:`, userData.modulePermissions || '(なし)');
  console.log('---');

  // modulePermissionsを更新
  await db.collection('users').doc(userDoc.id).update({
    modulePermissions: MODULE_PERMISSIONS,
    updatedAt: new Date(),
  });

  console.log('modulePermissionsを更新しました');

  // 確認
  const updatedDoc = await db.collection('users').doc(userDoc.id).get();
  const updatedData = updatedDoc.data();
  console.log(`更新後のmodulePermissions:`, updatedData?.modulePermissions);
  console.log('\n完了');
}

grantModulePermission().catch((err) => {
  console.error('エラー:', err);
  process.exit(1);
});
