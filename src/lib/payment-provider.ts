// ======== 支払いプロバイダー ========
// ダミー実装（ログ出力のみ）またはfreee連携

import type {
  Payment,
  PaymentStatus,
  PaymentExecutionResult,
  PaymentProviderInterface,
} from '@/types/payment';
import { getFreeePaymentProvider } from './freee-provider';
import { getFreeeIntegration } from './freee-token';

/**
 * ダミー支払いプロバイダー
 * 本番環境では銀行API/決済APIに置き換え
 */
export class DummyPaymentProvider implements PaymentProviderInterface {
  private name = 'DummyPaymentProvider';

  /**
   * 支払いを実行（ダミー: ログ出力のみ）
   */
  async execute(payment: Payment): Promise<PaymentExecutionResult> {
    console.log(`[${this.name}] 支払い実行開始`, {
      paymentId: payment.id,
      amount: payment.amount,
      payeeName: payment.payeeName,
      paymentMethod: payment.paymentMethod,
      bankAccount: payment.bankAccount ? {
        bankName: payment.bankAccount.bankName,
        branchName: payment.bankAccount.branchName,
        accountNumber: '****' + payment.bankAccount.accountNumber.slice(-4),
      } : undefined,
    });

    // シミュレーション用の遅延
    await new Promise((resolve) => setTimeout(resolve, 500));

    // テスト用: 金額が999999円の場合は失敗をシミュレート
    if (payment.amount === 999999) {
      console.log(`[${this.name}] 支払い失敗（テスト用失敗）`, {
        paymentId: payment.id,
      });
      return {
        success: false,
        errorCode: 'TEST_FAILURE',
        errorMessage: 'テスト用の失敗シミュレーション',
      };
    }

    // 成功
    const transactionId = `DUMMY-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    console.log(`[${this.name}] 支払い成功`, {
      paymentId: payment.id,
      transactionId,
    });

    return {
      success: true,
      transactionId,
    };
  }

  /**
   * 支払いステータスを確認（ダミー: 常にcompleted）
   */
  async checkStatus(transactionId: string): Promise<PaymentStatus> {
    console.log(`[${this.name}] ステータス確認`, { transactionId });
    return 'completed';
  }

  /**
   * プロバイダー名を取得
   */
  getName(): string {
    return this.name;
  }
}

/**
 * デフォルトの支払いプロバイダーを取得（同期版）
 * freee連携チェックなし、常にDummyを返す
 */
export function getPaymentProvider(): PaymentProviderInterface {
  return new DummyPaymentProvider();
}

/**
 * 支払いプロバイダーを取得（非同期版）
 * freee連携が有効な場合はfreeeプロバイダーを返す
 */
export async function getPaymentProviderAsync(): Promise<PaymentProviderInterface> {
  try {
    // freee連携チェック
    const freeeIntegration = await getFreeeIntegration();

    if (freeeIntegration?.connected && freeeIntegration.accessToken && freeeIntegration.companyId) {
      console.log('[PaymentProvider] freee連携有効、freeeプロバイダー使用');
      return await getFreeePaymentProvider();
    }
  } catch (error) {
    console.error('[PaymentProvider] freee連携チェック失敗', error);
  }

  // 環境変数での切り替え
  // if (process.env.PAYMENT_PROVIDER === 'bank_api') {
  //   return new BankApiPaymentProvider();
  // }

  console.log('[PaymentProvider] ダミープロバイダー使用');
  return new DummyPaymentProvider();
}
