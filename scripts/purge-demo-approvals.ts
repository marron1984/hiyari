/**
 * 承認デモ/テストデータ削除スクリプト（Dry-run → Execute）
 *
 * 対象 Firestore コレクション:
 *   - ringis（稟議書）
 *   - ringiAuditLogs（監査ログ）
 *   - approval_routes（承認経路） + サブコレクション steps
 *   - approvalRoutes（リクエストエンジン承認経路）
 *   - approvalLogs（リクエストエンジンログ）
 *   - approvalKeys（リクエストエンジンキー）
 *
 * 使用方法:
 *   # Dry-run（削除候補の確認のみ）
 *   ALLOW_DEMO_PURGE=true PURGE_MODE=DRY_RUN PURGE_TENANT_ID=defaultTenant \
 *     npx ts-node --project tsconfig.json scripts/purge-demo-approvals.ts
 *
 *   # Execute（実際に削除）
 *   ALLOW_DEMO_PURGE=true PURGE_MODE=EXECUTE PURGE_TENANT_ID=defaultTenant \
 *     npx ts-node --project tsconfig.json scripts/purge-demo-approvals.ts
 *
 * 環境変数:
 *   ALLOW_DEMO_PURGE  - 必須。"true" でないと実行不可
 *   PURGE_MODE        - DRY_RUN | EXECUTE（デフォルト: DRY_RUN）
 *   PURGE_TENANT_ID   - 対象テナントID（必須）
 *   PURGE_LIMIT       - 削除上限数（デフォルト: 500）
 *
 * デモデータ判定基準:
 *   - isDemo === true
 *   - seedTag フィールドが存在
 *   - createdBy === 'seed' または 'system'
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, WriteBatch } from 'firebase-admin/firestore';

// ========================================
// 環境変数バリデーション
// ========================================

const ALLOW_DEMO_PURGE = process.env.ALLOW_DEMO_PURGE === 'true';
const PURGE_MODE = (process.env.PURGE_MODE || 'DRY_RUN') as 'DRY_RUN' | 'EXECUTE';
const PURGE_TENANT_ID = process.env.PURGE_TENANT_ID;
const PURGE_LIMIT = parseInt(process.env.PURGE_LIMIT || '500', 10);

function validateEnv(): void {
  if (!ALLOW_DEMO_PURGE) {
    console.error('❌ ALLOW_DEMO_PURGE=true が必要です');
    process.exit(1);
  }
  if (!PURGE_TENANT_ID) {
    console.error('❌ PURGE_TENANT_ID が必要です');
    process.exit(1);
  }
  if (PURGE_MODE !== 'DRY_RUN' && PURGE_MODE !== 'EXECUTE') {
    console.error('❌ PURGE_MODE は DRY_RUN または EXECUTE を指定してください');
    process.exit(1);
  }
  if (isNaN(PURGE_LIMIT) || PURGE_LIMIT < 1) {
    console.error('❌ PURGE_LIMIT は正の整数を指定してください');
    process.exit(1);
  }
}

// ========================================
// Firebase Admin 初期化
// ========================================

function initFirebase() {
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
  return getFirestore();
}

// ========================================
// デモデータ判定
// ========================================

interface DocCandidate {
  id: string;
  collection: string;
  reason: string;
  title?: string;
}

function isDemoRecord(data: Record<string, unknown>): { match: boolean; reason: string } {
  // 1. 明示的な isDemo フラグ
  if (data.isDemo === true) {
    return { match: true, reason: 'isDemo===true' };
  }

  // 2. seedTag フィールドが存在
  if (data.seedTag !== undefined && data.seedTag !== null) {
    return { match: true, reason: `seedTag="${data.seedTag}"` };
  }

  // 3. createdBy が seed/system
  if (data.createdBy === 'seed' || data.createdBy === 'system') {
    return { match: true, reason: `createdBy="${data.createdBy}"` };
  }

  return { match: false, reason: '' };
}

// ========================================
// コレクション別スキャン
// ========================================

async function scanCollection(
  db: FirebaseFirestore.Firestore,
  collectionName: string,
  tenantId: string,
  limit: number,
): Promise<DocCandidate[]> {
  const candidates: DocCandidate[] = [];
  const snap = await db.collection(collectionName).get();

  for (const doc of snap.docs) {
    if (candidates.length >= limit) break;

    const data = doc.data();

    // テナントフィルタ（tenantId がある場合のみ）
    if (data.tenantId && data.tenantId !== tenantId) continue;

    const { match, reason } = isDemoRecord(data);
    if (match) {
      candidates.push({
        id: doc.id,
        collection: collectionName,
        reason,
        title: (data.title as string) || (data.name as string) || undefined,
      });
    }
  }

  return candidates;
}

// ========================================
// approval_routes サブコレクション対応
// ========================================

async function scanApprovalRoutesWithSteps(
  db: FirebaseFirestore.Firestore,
  tenantId: string,
  limit: number,
): Promise<{ routeCandidates: DocCandidate[]; stepIds: { routeId: string; stepId: string }[] }> {
  const routeCandidates: DocCandidate[] = [];
  const stepIds: { routeId: string; stepId: string }[] = [];
  const snap = await db.collection('approval_routes').get();

  for (const doc of snap.docs) {
    if (routeCandidates.length >= limit) break;

    const data = doc.data();
    if (data.tenantId && data.tenantId !== tenantId) continue;

    const { match, reason } = isDemoRecord(data);
    if (match) {
      routeCandidates.push({
        id: doc.id,
        collection: 'approval_routes',
        reason,
        title: (data.name as string) || undefined,
      });

      // サブコレクション steps を列挙
      const stepsSnap = await db
        .collection('approval_routes')
        .doc(doc.id)
        .collection('steps')
        .get();
      for (const stepDoc of stepsSnap.docs) {
        stepIds.push({ routeId: doc.id, stepId: stepDoc.id });
      }
    }
  }

  return { routeCandidates, stepIds };
}

// ========================================
// 削除実行
// ========================================

async function executePurge(
  db: FirebaseFirestore.Firestore,
  candidates: DocCandidate[],
  routeSteps: { routeId: string; stepId: string }[],
): Promise<{ deleted: number; errors: string[] }> {
  let deleted = 0;
  const errors: string[] = [];

  // Firestore batch は最大 500 operations
  const BATCH_SIZE = 400;
  let batch: WriteBatch = db.batch();
  let batchCount = 0;

  // approval_routes の steps サブコレクションを先に削除
  for (const { routeId, stepId } of routeSteps) {
    const ref = db.collection('approval_routes').doc(routeId).collection('steps').doc(stepId);
    batch.delete(ref);
    batchCount++;

    if (batchCount >= BATCH_SIZE) {
      await batch.commit();
      deleted += batchCount;
      batch = db.batch();
      batchCount = 0;
    }
  }

  // 各コレクションのドキュメント削除
  for (const candidate of candidates) {
    const ref = db.collection(candidate.collection).doc(candidate.id);
    batch.delete(ref);
    batchCount++;

    if (batchCount >= BATCH_SIZE) {
      await batch.commit();
      deleted += batchCount;
      batch = db.batch();
      batchCount = 0;
    }
  }

  // 残りを commit
  if (batchCount > 0) {
    await batch.commit();
    deleted += batchCount;
  }

  return { deleted, errors };
}

// ========================================
// メイン
// ========================================

async function main() {
  validateEnv();

  console.log('========================================');
  console.log('承認デモデータ削除スクリプト');
  console.log('========================================');
  console.log(`モード:     ${PURGE_MODE}`);
  console.log(`テナント:   ${PURGE_TENANT_ID}`);
  console.log(`上限:       ${PURGE_LIMIT}`);
  console.log('');

  const db = initFirebase();

  // 全対象コレクションをスキャン
  const collections = [
    'ringis',
    'ringiAuditLogs',
    'approvalRoutes',
    'approvalLogs',
    'approvalKeys',
  ];

  let allCandidates: DocCandidate[] = [];
  let routeSteps: { routeId: string; stepId: string }[] = [];

  // 通常コレクション
  for (const col of collections) {
    const remaining = PURGE_LIMIT - allCandidates.length;
    if (remaining <= 0) break;

    try {
      const candidates = await scanCollection(db, col, PURGE_TENANT_ID!, remaining);
      allCandidates = allCandidates.concat(candidates);
      console.log(`[${col}] ${candidates.length} 件のデモデータを検出`);
    } catch (err) {
      console.log(`[${col}] スキャン失敗（コレクション未作成の可能性）: ${err}`);
    }
  }

  // approval_routes（サブコレクション付き）
  try {
    const remaining = PURGE_LIMIT - allCandidates.length;
    const { routeCandidates, stepIds } = await scanApprovalRoutesWithSteps(
      db, PURGE_TENANT_ID!, remaining,
    );
    allCandidates = allCandidates.concat(routeCandidates);
    routeSteps = stepIds;
    console.log(`[approval_routes] ${routeCandidates.length} 件のデモデータを検出（steps: ${stepIds.length} 件）`);
  } catch (err) {
    console.log(`[approval_routes] スキャン失敗: ${err}`);
  }

  console.log('');
  console.log(`合計: ${allCandidates.length} 件（+ steps ${routeSteps.length} 件）`);
  console.log('');

  // 候補一覧表示
  if (allCandidates.length > 0) {
    console.log('--- 削除候補 ---');
    for (const c of allCandidates) {
      const title = c.title ? ` "${c.title}"` : '';
      console.log(`  [${c.collection}] ${c.id}${title} — ${c.reason}`);
    }
    console.log('');
  }

  // Dry-run の場合はここで終了
  if (PURGE_MODE === 'DRY_RUN') {
    console.log('✅ DRY_RUN 完了。削除は行われていません。');
    console.log('   実削除するには PURGE_MODE=EXECUTE で再実行してください。');
    return;
  }

  // EXECUTE
  if (allCandidates.length === 0 && routeSteps.length === 0) {
    console.log('✅ 削除対象がありません。');
    return;
  }

  console.log('🔥 EXECUTE モード: 削除を実行します...');
  const { deleted, errors } = await executePurge(db, allCandidates, routeSteps);
  console.log(`✅ 削除完了: ${deleted} 件`);

  if (errors.length > 0) {
    console.log(`⚠️ エラー: ${errors.length} 件`);
    for (const e of errors) {
      console.log(`  - ${e}`);
    }
  }
}

main().catch((err) => {
  console.error('❌ スクリプト実行エラー:', err);
  process.exit(1);
});
