// 支払バッチ API
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyIdToken } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { isAiVpOwner } from '@/lib/auth';
import { toDate } from '@/lib/date';
import {
  isGmoApiConfigured,
  getAccountBalance,
  executeBatchTransfer,
  getTransferRecords,
  generateZenginCsv,
  calculateTransferFee,
} from '@/lib/gmo-bank';
import type { PaymentBatch, PaymentItem } from '@/types/request-engine';
import { generateBatchNumber } from '@/types/request-engine';

const DEFAULT_TENANT_ID = 'defaultTenant';

// GET: 支払バッチ一覧を取得
export async function GET(request: NextRequest) {
  try {
    // 認証チェック
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const idToken = authHeader.substring(7);
    const decodedToken = await verifyIdToken(idToken);

    if (!decodedToken) {
      return NextResponse.json({ error: '無効なトークンです' }, { status: 401 });
    }

    // AI副社長オーナーまたは管理者チェック
    const userDoc = await getAdminDb().collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();
    const userRole = userData?.role || 'user';
    const isAdmin = ['admin', 'system_admin'].includes(userRole);

    if (!isAiVpOwner(decodedToken.email) && !isAdmin) {
      return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const batchId = searchParams.get('batchId');
    const action = searchParams.get('action');

    // 特定のバッチの詳細を取得
    if (batchId) {
      const batchDoc = await getAdminDb().collection('paymentBatches').doc(batchId).get();
      if (!batchDoc.exists) {
        return NextResponse.json({ error: 'バッチが見つかりません' }, { status: 404 });
      }

      const batchData = batchDoc.data();
      const batch: PaymentBatch = {
        id: batchDoc.id,
        tenantId: batchData?.tenantId,
        batchNumber: batchData?.batchNumber,
        paymentDate: toDate(batchData?.paymentDate) || new Date(),
        status: batchData?.status,
        itemCount: batchData?.itemCount || 0,
        totalAmount: batchData?.totalAmount || 0,
        totalFee: batchData?.totalFee || 0,
        confirmedAt: toDate(batchData?.confirmedAt) ?? undefined,
        confirmedBy: batchData?.confirmedBy,
        transferScheduledAt: toDate(batchData?.transferScheduledAt) ?? undefined,
        gmoTransactionId: batchData?.gmoTransactionId,
        executedAt: toDate(batchData?.executedAt) ?? undefined,
        executedBy: batchData?.executedBy,
        createdAt: toDate(batchData?.createdAt) || new Date(),
        createdBy: batchData?.createdBy,
        updatedAt: toDate(batchData?.updatedAt) || new Date(),
      };

      // 支払明細を取得
      const itemsSnapshot = await getAdminDb()
        .collection('paymentItems')
        .where('batchId', '==', batchId)
        .get();

      const items = itemsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: toDate(doc.data().createdAt) || new Date(),
      })) as PaymentItem[];

      // 振込記録を取得
      const transferRecords = await getTransferRecords(batchId);

      // CSVエクスポート
      if (action === 'csv') {
        const csv = generateZenginCsv(items);
        return new NextResponse(csv, {
          headers: {
            'Content-Type': 'text/csv; charset=shift_jis',
            'Content-Disposition': `attachment; filename="${batch.batchNumber}.csv"`,
          },
        });
      }

      return NextResponse.json({
        success: true,
        batch,
        items,
        transferRecords,
      });
    }

    // バッチ一覧を取得
    const snapshot = await getAdminDb()
      .collection('paymentBatches')
      .where('tenantId', '==', DEFAULT_TENANT_ID)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const batches = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        tenantId: data.tenantId,
        batchNumber: data.batchNumber,
        paymentDate: toDate(data.paymentDate) || new Date(),
        status: data.status,
        itemCount: data.itemCount || 0,
        totalAmount: data.totalAmount || 0,
        totalFee: data.totalFee || 0,
        confirmedAt: toDate(data.confirmedAt) ?? undefined,
        transferScheduledAt: toDate(data.transferScheduledAt) ?? undefined,
        executedAt: toDate(data.executedAt) ?? undefined,
        createdAt: toDate(data.createdAt) || new Date(),
        updatedAt: toDate(data.updatedAt) || new Date(),
      } as PaymentBatch;
    });

    // API設定状態も返す
    const gmoConfigured = isGmoApiConfigured();
    let accountBalance = null;
    if (gmoConfigured) {
      accountBalance = await getAccountBalance();
    }

    return NextResponse.json({
      success: true,
      batches,
      count: batches.length,
      gmoConfigured,
      accountBalance,
    });
  } catch (error) {
    console.error('Payment batch API GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: 支払バッチを作成/更新
export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const idToken = authHeader.substring(7);
    const decodedToken = await verifyIdToken(idToken);

    if (!decodedToken) {
      return NextResponse.json({ error: '無効なトークンです' }, { status: 401 });
    }

    // AI副社長オーナーまたは管理者チェック
    const userDoc = await getAdminDb().collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.data();
    const userRole = userData?.role || 'user';
    const isAdmin = ['admin', 'system_admin'].includes(userRole);

    if (!isAiVpOwner(decodedToken.email) && !isAdmin) {
      return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 });
    }

    const userName = userData?.name || userData?.displayName || decodedToken.email || 'Unknown';
    const body = await request.json();
    const { action, batchId, paymentDate, items } = body;

    switch (action) {
      case 'create': {
        // 新規バッチを作成
        if (!paymentDate) {
          return NextResponse.json({ error: 'paymentDateは必須です' }, { status: 400 });
        }

        const batchData = {
          tenantId: DEFAULT_TENANT_ID,
          batchNumber: generateBatchNumber(),
          paymentDate: new Date(paymentDate),
          status: 'draft',
          itemCount: 0,
          totalAmount: 0,
          totalFee: 0,
          createdAt: FieldValue.serverTimestamp(),
          createdBy: decodedToken.uid,
          updatedAt: FieldValue.serverTimestamp(),
        };

        const batchRef = await getAdminDb().collection('paymentBatches').add(batchData);

        // 監査ログ
        await getAdminDb().collection('aiVpAuditLogs').add({
          tenantId: DEFAULT_TENANT_ID,
          actorUserId: decodedToken.uid,
          actorUserName: userName,
          eventType: 'payment_batch_created',
          eventMeta: {
            batchId: batchRef.id,
            batchNumber: batchData.batchNumber,
          },
          createdAt: FieldValue.serverTimestamp(),
        });

        return NextResponse.json({
          success: true,
          batchId: batchRef.id,
          batchNumber: batchData.batchNumber,
        });
      }

      case 'add_items': {
        // 支払明細を追加
        if (!batchId || !items || !Array.isArray(items)) {
          return NextResponse.json({ error: 'batchIdとitemsは必須です' }, { status: 400 });
        }

        const batchRef = getAdminDb().collection('paymentBatches').doc(batchId);
        const batchDoc = await batchRef.get();

        if (!batchDoc.exists) {
          return NextResponse.json({ error: 'バッチが見つかりません' }, { status: 404 });
        }

        if (batchDoc.data()?.status !== 'draft') {
          return NextResponse.json({ error: 'ドラフト状態のバッチにのみ明細を追加できます' }, { status: 400 });
        }

        let addedCount = 0;
        let totalAmount = 0;
        let totalFee = 0;

        for (const item of items) {
          const fee = calculateTransferFee(item.amount, false);

          const itemData = {
            batchId,
            paymentType: item.paymentType || 'expense',
            payeeName: item.payeeName,
            bankCode: item.bankCode,
            bankName: item.bankName,
            branchCode: item.branchCode,
            branchName: item.branchName,
            accountType: item.accountType || 'ordinary',
            accountNumber: item.accountNumber,
            accountHolder: item.accountHolder,
            amount: item.amount,
            fee,
            memo: item.memo || '',
            status: 'pending',
            requestId: item.requestId || null,
            createdAt: FieldValue.serverTimestamp(),
          };

          await getAdminDb().collection('paymentItems').add(itemData);

          addedCount++;
          totalAmount += item.amount;
          totalFee += fee;
        }

        // バッチの集計を更新
        const currentData = batchDoc.data();
        await batchRef.update({
          itemCount: (currentData?.itemCount || 0) + addedCount,
          totalAmount: (currentData?.totalAmount || 0) + totalAmount,
          totalFee: (currentData?.totalFee || 0) + totalFee,
          updatedAt: FieldValue.serverTimestamp(),
        });

        return NextResponse.json({
          success: true,
          addedCount,
          totalAmount,
          totalFee,
        });
      }

      case 'confirm': {
        // バッチを確定
        if (!batchId) {
          return NextResponse.json({ error: 'batchIdは必須です' }, { status: 400 });
        }

        const batchRef = getAdminDb().collection('paymentBatches').doc(batchId);
        const batchDoc = await batchRef.get();

        if (!batchDoc.exists) {
          return NextResponse.json({ error: 'バッチが見つかりません' }, { status: 404 });
        }

        if (batchDoc.data()?.status !== 'draft') {
          return NextResponse.json({ error: 'ドラフト状態のバッチのみ確定できます' }, { status: 400 });
        }

        await batchRef.update({
          status: 'confirmed',
          confirmedAt: FieldValue.serverTimestamp(),
          confirmedBy: decodedToken.uid,
          updatedAt: FieldValue.serverTimestamp(),
        });

        // 監査ログ
        await getAdminDb().collection('aiVpAuditLogs').add({
          tenantId: DEFAULT_TENANT_ID,
          actorUserId: decodedToken.uid,
          actorUserName: userName,
          eventType: 'payment_batch_confirmed',
          eventMeta: {
            batchId,
            batchNumber: batchDoc.data()?.batchNumber,
          },
          createdAt: FieldValue.serverTimestamp(),
        });

        return NextResponse.json({ success: true });
      }

      case 'execute_transfer': {
        // GMO APIで振込を実行
        if (!batchId) {
          return NextResponse.json({ error: 'batchIdは必須です' }, { status: 400 });
        }

        if (!isGmoApiConfigured()) {
          return NextResponse.json({ error: 'GMO API連携が設定されていません' }, { status: 503 });
        }

        const batchRef = getAdminDb().collection('paymentBatches').doc(batchId);
        const batchDoc = await batchRef.get();

        if (!batchDoc.exists) {
          return NextResponse.json({ error: 'バッチが見つかりません' }, { status: 404 });
        }

        if (batchDoc.data()?.status !== 'confirmed') {
          return NextResponse.json({ error: '確定済みバッチのみ振込実行できます' }, { status: 400 });
        }

        const transferDate = body.transferDate || new Date().toISOString().slice(0, 10);

        const result = await executeBatchTransfer(batchId, transferDate);

        // 監査ログ
        await getAdminDb().collection('aiVpAuditLogs').add({
          tenantId: DEFAULT_TENANT_ID,
          actorUserId: decodedToken.uid,
          actorUserName: userName,
          eventType: 'payment_batch_executed',
          eventMeta: {
            batchId,
            batchNumber: batchDoc.data()?.batchNumber,
            processedCount: result.processedCount,
            failedCount: result.failedCount,
          },
          createdAt: FieldValue.serverTimestamp(),
        });

        return NextResponse.json({
          success: result.success,
          processedCount: result.processedCount,
          failedCount: result.failedCount,
          results: result.results,
        });
      }

      default:
        return NextResponse.json({ error: '無効なアクションです' }, { status: 400 });
    }
  } catch (error) {
    console.error('Payment batch API POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
