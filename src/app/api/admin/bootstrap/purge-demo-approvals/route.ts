import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

/**
 * POST /api/admin/bootstrap/purge-demo-approvals
 *
 * デモ・テスト用の承認データを一括削除
 *
 * Body:
 * {
 *   tenantId: string,
 *   dryRun?: boolean,   // true = 削除対象の件数のみ返す（デフォルト true）
 * }
 *
 * 対象コレクション:
 * - ringis (isDemo===true || seedTag存在 || createdBy==='seed'|'system')
 * - ringiAuditLogs (同上の条件)
 * - approval_routes / approvalRoutes (seedTag存在)
 * - approval_routes/{id}/steps (親が削除対象の場合)
 * - approvalLogs (seedTag存在)
 * - approvalKeys (seedTag存在)
 */

interface PurgeRequest {
  tenantId: string;
  dryRun?: boolean;
}

interface CollectionResult {
  collection: string;
  count: number;
}

async function countAndDeleteDemoDocs(
  adminDb: FirebaseFirestore.Firestore,
  collectionName: string,
  tenantId: string,
  dryRun: boolean,
): Promise<CollectionResult> {
  const colRef = adminDb.collection(collectionName);

  // デモデータの条件でクエリ
  const conditions = [
    colRef.where('tenantId', '==', tenantId).where('isDemo', '==', true),
    colRef.where('tenantId', '==', tenantId).where('createdBy', '==', 'seed'),
    colRef.where('tenantId', '==', tenantId).where('createdBy', '==', 'system'),
  ];

  const docIds = new Set<string>();

  for (const q of conditions) {
    try {
      const snap = await q.get();
      snap.docs.forEach((d) => docIds.add(d.id));
    } catch {
      // Index missing - try broader approach
    }
  }

  // seedTag が存在するドキュメントも対象
  try {
    const allDocs = await colRef.where('tenantId', '==', tenantId).get();
    allDocs.docs.forEach((d) => {
      const data = d.data();
      if (data.seedTag || data.isDemo === true) {
        docIds.add(d.id);
      }
    });
  } catch {
    // Collection may not exist
  }

  if (!dryRun && docIds.size > 0) {
    // バッチ削除（400件ずつ）
    const ids = Array.from(docIds);
    for (let i = 0; i < ids.length; i += 400) {
      const batch = adminDb.batch();
      const chunk = ids.slice(i, i + 400);
      for (const id of chunk) {
        batch.delete(colRef.doc(id));
      }
      await batch.commit();
    }
  }

  return { collection: collectionName, count: docIds.size };
}

async function deleteSubcollection(
  adminDb: FirebaseFirestore.Firestore,
  parentCollection: string,
  subcollection: string,
  parentIds: string[],
  dryRun: boolean,
): Promise<CollectionResult> {
  let totalCount = 0;

  for (const parentId of parentIds) {
    const subRef = adminDb.collection(parentCollection).doc(parentId).collection(subcollection);
    const snap = await subRef.get();
    totalCount += snap.size;

    if (!dryRun && snap.size > 0) {
      const batch = adminDb.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }

  return { collection: `${parentCollection}/{id}/${subcollection}`, count: totalCount };
}

export async function POST(request: NextRequest) {
  try {
    const body: PurgeRequest = await request.json();
    const { tenantId, dryRun = true } = body;

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId は必須です' }, { status: 400 });
    }

    const adminDb = getAdminDb();
    const results: CollectionResult[] = [];

    // メインコレクションの削除
    const collections = [
      'ringis',
      'ringiAuditLogs',
      'approval_routes',
      'approvalRoutes',
      'approvalLogs',
      'approvalKeys',
    ];

    // まず approval_routes の削除対象IDを取得（サブコレクション削除用）
    const routeRef = adminDb.collection('approval_routes');
    const routeSnap = await routeRef.where('tenantId', '==', tenantId).get();
    const routeIds = routeSnap.docs
      .filter((d) => {
        const data = d.data();
        return data.seedTag || data.isDemo === true || data.createdBy === 'seed' || data.createdBy === 'system';
      })
      .map((d) => d.id);

    // サブコレクション (steps) の削除
    if (routeIds.length > 0) {
      const subResult = await deleteSubcollection(adminDb, 'approval_routes', 'steps', routeIds, dryRun);
      results.push(subResult);
    }

    // 各コレクションの削除
    for (const col of collections) {
      const result = await countAndDeleteDemoDocs(adminDb, col, tenantId, dryRun);
      results.push(result);
    }

    const totalCount = results.reduce((sum, r) => sum + r.count, 0);

    return NextResponse.json({
      mode: dryRun ? 'dry-run' : 'execute',
      tenantId,
      totalCount,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
