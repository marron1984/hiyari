// ======== GMOあおぞらネット銀行 API連携ライブラリ ========
// 振込処理の自動化

import { getAdminDb } from './firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { toDate } from './date';
import type {
  PaymentBatch,
  PaymentItem,
  TransferRecord,
} from '@/types/request-engine';

const DEFAULT_TENANT_ID = 'defaultTenant';

// GMO API設定
const GMO_API_BASE_URL = process.env.GMO_BANK_API_URL || 'https://api.gmo-aozora.com/ganb/api/corporation/v1';
const GMO_CLIENT_ID = process.env.GMO_BANK_CLIENT_ID;
const GMO_CLIENT_SECRET = process.env.GMO_BANK_CLIENT_SECRET;
const GMO_ACCOUNT_ID = process.env.GMO_BANK_ACCOUNT_ID;

/**
 * GMO API連携が設定されているかチェック
 */
export function isGmoApiConfigured(): boolean {
  return !!(GMO_CLIENT_ID && GMO_CLIENT_SECRET && GMO_ACCOUNT_ID);
}

/**
 * GMO APIアクセストークンを取得
 */
async function getGmoAccessToken(): Promise<string | null> {
  if (!isGmoApiConfigured()) {
    console.warn('GMO Bank API credentials not configured');
    return null;
  }

  try {
    const response = await fetch(`${GMO_API_BASE_URL}/auth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: GMO_CLIENT_ID!,
        client_secret: GMO_CLIENT_SECRET!,
        scope: 'transfer',
      }),
    });

    if (!response.ok) {
      console.error('GMO auth failed:', response.status);
      return null;
    }

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error('GMO auth error:', error);
    return null;
  }
}

/**
 * 口座残高を取得
 */
export async function getAccountBalance(): Promise<{
  balance: number;
  availableBalance: number;
} | null> {
  const accessToken = await getGmoAccessToken();
  if (!accessToken) return null;

  try {
    const response = await fetch(
      `${GMO_API_BASE_URL}/accounts/${GMO_ACCOUNT_ID}/balance`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.error('GMO balance check failed:', response.status);
      return null;
    }

    const data = await response.json();
    return {
      balance: data.balance || 0,
      availableBalance: data.availableBalance || 0,
    };
  } catch (error) {
    console.error('GMO balance error:', error);
    return null;
  }
}

/**
 * 振込を予約
 */
export async function scheduleTransfer(
  item: PaymentItem,
  transferDate: string // YYYY-MM-DD
): Promise<{
  success: boolean;
  transferId?: string;
  error?: string;
}> {
  const accessToken = await getGmoAccessToken();
  if (!accessToken) {
    return { success: false, error: 'API認証に失敗しました' };
  }

  try {
    // 口座種別をGMO形式に変換
    const accountTypeMap: Record<string, string> = {
      ordinary: '1',  // 普通
      current: '2',   // 当座
      savings: '4',   // 貯蓄
    };

    const requestBody = {
      accountId: GMO_ACCOUNT_ID,
      transferDate: transferDate.replace(/-/g, ''),
      transfers: [
        {
          bankCode: item.bankCode,
          branchCode: item.branchCode,
          accountType: accountTypeMap[item.accountType] || '1',
          accountNumber: item.accountNumber,
          accountName: item.accountHolder,
          amount: item.amount,
          transferPurpose: item.memo || '給与/経費',
        },
      ],
    };

    const response = await fetch(`${GMO_API_BASE_URL}/transfers`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('GMO transfer failed:', response.status, errorText);
      return {
        success: false,
        error: `振込予約失敗: ${response.status}`,
      };
    }

    const data = await response.json();
    return {
      success: true,
      transferId: data.transferId || data.transactions?.[0]?.transferId,
    };
  } catch (error) {
    console.error('GMO transfer error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '振込予約エラー',
    };
  }
}

/**
 * 振込状況を確認
 */
export async function checkTransferStatus(
  transferId: string
): Promise<{
  status: 'pending' | 'completed' | 'failed' | 'unknown';
  message?: string;
}> {
  const accessToken = await getGmoAccessToken();
  if (!accessToken) {
    return { status: 'unknown', message: 'API認証に失敗しました' };
  }

  try {
    const response = await fetch(
      `${GMO_API_BASE_URL}/transfers/${transferId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      return { status: 'unknown', message: 'ステータス取得失敗' };
    }

    const data = await response.json();

    // GMOのステータスを変換
    const statusMap: Record<string, 'pending' | 'completed' | 'failed'> = {
      'PROCESSING': 'pending',
      'COMPLETED': 'completed',
      'FAILED': 'failed',
      'CANCELLED': 'failed',
    };

    return {
      status: statusMap[data.status] || 'unknown',
      message: data.statusMessage,
    };
  } catch (error) {
    console.error('GMO status check error:', error);
    return { status: 'unknown', message: '確認エラー' };
  }
}

/**
 * 振込記録を保存
 */
export async function createTransferRecord(
  batchId: string,
  itemId: string,
  gmoResponse: {
    transferId: string;
    status?: string;
    error?: string;
  }
): Promise<string> {
  const recordData = {
    tenantId: DEFAULT_TENANT_ID,
    batchId,
    itemId,
    gmoTransactionId: gmoResponse.transferId,
    gmoStatus: gmoResponse.status || 'scheduled',
    gmoResponse,
    status: gmoResponse.error ? 'failed' : 'pending',
    errorCode: gmoResponse.error ? 'API_ERROR' : null,
    errorMessage: gmoResponse.error || null,
    scheduledAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  };

  const docRef = await getAdminDb().collection('transferRecords').add(recordData);
  return docRef.id;
}

/**
 * 振込記録を取得
 */
export async function getTransferRecords(
  batchId: string
): Promise<TransferRecord[]> {
  const snapshot = await getAdminDb()
    .collection('transferRecords')
    .where('batchId', '==', batchId)
    .orderBy('createdAt', 'desc')
    .get();

  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      tenantId: data.tenantId,
      batchId: data.batchId,
      itemId: data.itemId,
      gmoTransactionId: data.gmoTransactionId,
      gmoStatus: data.gmoStatus,
      gmoResponse: data.gmoResponse,
      status: data.status,
      errorCode: data.errorCode,
      errorMessage: data.errorMessage,
      scheduledAt: toDate(data.scheduledAt) || new Date(),
      executedAt: toDate(data.executedAt),
      createdAt: toDate(data.createdAt) || new Date(),
    } as TransferRecord;
  });
}

/**
 * 支払バッチの振込を一括実行
 */
export async function executeBatchTransfer(
  batchId: string,
  transferDate: string
): Promise<{
  success: boolean;
  processedCount: number;
  failedCount: number;
  results: Array<{
    itemId: string;
    success: boolean;
    transferId?: string;
    error?: string;
  }>;
}> {
  // バッチの支払明細を取得
  const itemsSnapshot = await getAdminDb()
    .collection('paymentItems')
    .where('batchId', '==', batchId)
    .where('status', '==', 'pending')
    .get();

  const results: Array<{
    itemId: string;
    success: boolean;
    transferId?: string;
    error?: string;
  }> = [];

  let processedCount = 0;
  let failedCount = 0;

  for (const itemDoc of itemsSnapshot.docs) {
    const item = itemDoc.data() as PaymentItem;
    const itemId = itemDoc.id;

    const transferResult = await scheduleTransfer(
      { ...item, id: itemId } as PaymentItem,
      transferDate
    );

    if (transferResult.success) {
      processedCount++;

      // 支払明細を更新
      await itemDoc.ref.update({
        status: 'scheduled',
        transferId: transferResult.transferId,
      });

      // 振込記録を保存
      await createTransferRecord(batchId, itemId, {
        transferId: transferResult.transferId!,
      });
    } else {
      failedCount++;

      // 支払明細を失敗に更新
      await itemDoc.ref.update({
        status: 'failed',
        errorMessage: transferResult.error,
      });

      // 振込記録を保存（エラー）
      await createTransferRecord(batchId, itemId, {
        transferId: '',
        error: transferResult.error,
      });
    }

    results.push({
      itemId,
      success: transferResult.success,
      transferId: transferResult.transferId,
      error: transferResult.error,
    });
  }

  // バッチのステータスを更新
  const batchRef = getAdminDb().collection('paymentBatches').doc(batchId);
  await batchRef.update({
    status: failedCount === 0 ? 'transfer_scheduled' : 'failed',
    transferScheduledAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {
    success: failedCount === 0,
    processedCount,
    failedCount,
    results,
  };
}

/**
 * 全銀フォーマットのCSVを生成
 */
export function generateZenginCsv(items: PaymentItem[]): string {
  const lines: string[] = [];

  // ヘッダーレコード
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  lines.push(`1,21,0,${dateStr},${items.length},${items.reduce((sum, i) => sum + i.amount, 0)}`);

  // データレコード
  items.forEach((item, index) => {
    const accountTypeCode = item.accountType === 'ordinary' ? '1' :
                           item.accountType === 'current' ? '2' : '4';

    lines.push([
      '2', // レコード区分
      item.bankCode.padStart(4, '0'),
      item.bankName.padEnd(15, ' ').slice(0, 15),
      item.branchCode.padStart(3, '0'),
      item.branchName.padEnd(15, ' ').slice(0, 15),
      accountTypeCode,
      item.accountNumber.padStart(7, '0'),
      item.accountHolder.padEnd(30, ' ').slice(0, 30),
      item.amount.toString().padStart(10, '0'),
      (index + 1).toString().padStart(6, '0'), // 連番
    ].join(','));
  });

  // トレーラーレコード
  lines.push(`8,${items.length},${items.reduce((sum, i) => sum + i.amount, 0)}`);

  // エンドレコード
  lines.push('9');

  return lines.join('\r\n');
}

/**
 * 振込手数料を計算
 */
export function calculateTransferFee(
  amount: number,
  isSameBank: boolean = false
): number {
  // GMOあおぞらネット銀行の振込手数料（2024年参考）
  if (isSameBank) {
    return 0; // 同行間は無料
  }

  // 他行宛て
  if (amount < 30000) {
    return 145;
  }
  return 145; // 3万円以上も同額
}
