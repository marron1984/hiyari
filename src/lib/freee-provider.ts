// ======== freee支払いプロバイダー ========
// ダミー実装（インターフェース確定用）

import type {
  Payment,
  PaymentStatus,
  PaymentExecutionResult,
  PaymentProviderInterface,
} from '@/types/payment';
import type {
  FreeeIntegration,
  FreeePaymentResult,
  FreeeCompany,
  FreeeWalletable,
  FreeePartner,
} from '@/types/freee';
import { getFreeeIntegration, refreshFreeeTokenIfNeeded } from './freee-token';

// ======== freeeクライアント（ダミー） ========

/**
 * freee APIクライアント（ダミー実装）
 * 本番では実際のfreee APIを呼び出す
 */
export class FreeeApiClient {
  private accessToken: string;
  private companyId: number;

  constructor(accessToken: string, companyId: number) {
    this.accessToken = accessToken;
    this.companyId = companyId;
  }

  /**
   * 事業所情報を取得（ダミー）
   */
  async getCompany(): Promise<FreeeCompany> {
    console.log('[FreeeApiClient] 事業所情報取得', { companyId: this.companyId });
    // ダミー: 固定値を返す
    return {
      id: this.companyId,
      name: 'テスト事業所',
      displayName: 'テスト事業所（ダミー）',
    };
  }

  /**
   * 口座一覧を取得（ダミー）
   */
  async getWalletables(): Promise<FreeeWalletable[]> {
    console.log('[FreeeApiClient] 口座一覧取得', { companyId: this.companyId });
    // ダミー: 固定値を返す
    return [
      { id: 1, name: 'メイン銀行口座', type: 'bank_account', walletableBalance: 1000000 },
      { id: 2, name: '経費用クレジットカード', type: 'credit_card' },
    ];
  }

  /**
   * 取引先一覧を取得（ダミー）
   */
  async getPartners(): Promise<FreeePartner[]> {
    console.log('[FreeeApiClient] 取引先一覧取得', { companyId: this.companyId });
    // ダミー: 固定値を返す
    return [
      { id: 1, name: '株式会社テスト', code: 'TEST001' },
      { id: 2, name: '有限会社サンプル', code: 'SAMPLE001' },
    ];
  }

  /**
   * 取引先を検索/作成（ダミー）
   */
  async findOrCreatePartner(name: string): Promise<FreeePartner> {
    console.log('[FreeeApiClient] 取引先検索/作成', { companyId: this.companyId, name });
    // ダミー: 新規作成したことにする
    return {
      id: Date.now(),
      name,
      code: `AUTO-${Date.now()}`,
    };
  }

  /**
   * 支払依頼を作成（ダミー）
   */
  async createPaymentRequest(params: {
    title: string;
    totalAmount: number;
    partnerId: number;
    partnerName: string;
    description?: string;
    targetDate?: string;
  }): Promise<{ id: number }> {
    console.log('[FreeeApiClient] 支払依頼作成', {
      companyId: this.companyId,
      ...params,
    });
    // ダミー: 成功を返す
    return { id: Date.now() };
  }

  /**
   * 振込依頼を作成（ダミー）
   */
  async createTransfer(params: {
    fromWalletableId: number;
    amount: number;
    transferDate: string;
    toAccountName: string;
    toAccountNumber: string;
    toBankCode: string;
    toBranchCode: string;
    toAccountType: 'ordinary' | 'checking';
    description?: string;
  }): Promise<{ id: number }> {
    console.log('[FreeeApiClient] 振込依頼作成', {
      companyId: this.companyId,
      ...params,
    });
    // ダミー: 成功を返す
    return { id: Date.now() };
  }

  /**
   * 支払依頼ステータスを取得（ダミー）
   */
  async getPaymentRequestStatus(paymentRequestId: number): Promise<string> {
    console.log('[FreeeApiClient] 支払依頼ステータス取得', {
      companyId: this.companyId,
      paymentRequestId,
    });
    // ダミー: 完了を返す
    return 'settled';
  }
}

// ======== freee支払いプロバイダー ========

/**
 * freee支払いプロバイダー（ダミー実装）
 */
export class FreeePaymentProvider implements PaymentProviderInterface {
  private name = 'FreeePaymentProvider';
  private integration: FreeeIntegration;

  constructor(integration: FreeeIntegration) {
    this.integration = integration;
  }

  /**
   * 支払いを実行
   */
  async execute(payment: Payment): Promise<PaymentExecutionResult> {
    console.log(`[${this.name}] 支払い実行開始`, {
      paymentId: payment.id,
      amount: payment.amount,
      payeeName: payment.payeeName,
      companyId: this.integration.companyId,
    });

    // 連携チェック
    if (!this.integration.connected || !this.integration.accessToken || !this.integration.companyId) {
      return {
        success: false,
        errorCode: 'FREEE_NOT_CONNECTED',
        errorMessage: 'freee連携が設定されていません',
      };
    }

    try {
      // トークンリフレッシュ（必要な場合）
      const refreshedIntegration = await refreshFreeeTokenIfNeeded(this.integration);
      if (!refreshedIntegration?.accessToken) {
        return {
          success: false,
          errorCode: 'FREEE_TOKEN_EXPIRED',
          errorMessage: 'freeeトークンの更新に失敗しました',
        };
      }

      const client = new FreeeApiClient(
        refreshedIntegration.accessToken,
        refreshedIntegration.companyId!
      );

      // 1. 取引先を検索/作成
      const partner = await client.findOrCreatePartner(payment.payeeName);
      console.log(`[${this.name}] 取引先: ${partner.name} (ID: ${partner.id})`);

      // 2. 支払依頼を作成
      const paymentRequest = await client.createPaymentRequest({
        title: payment.applicationTitle,
        totalAmount: payment.amount,
        partnerId: partner.id,
        partnerName: partner.name,
        description: `AA-HUB支払依頼 #${payment.applicationId}`,
        targetDate: new Date().toISOString().split('T')[0],
      });
      console.log(`[${this.name}] 支払依頼作成: ID ${paymentRequest.id}`);

      // 3. 銀行振込の場合は振込依頼も作成
      let transferId: number | undefined;
      if (payment.paymentMethod === 'bank_transfer' && payment.bankAccount) {
        // デフォルト口座（ID: 1）から振込
        const transfer = await client.createTransfer({
          fromWalletableId: 1,
          amount: payment.amount,
          transferDate: new Date().toISOString().split('T')[0],
          toAccountName: payment.bankAccount.accountHolder,
          toAccountNumber: payment.bankAccount.accountNumber,
          toBankCode: payment.bankAccount.bankCode,
          toBranchCode: payment.bankAccount.branchCode,
          toAccountType: payment.bankAccount.accountType,
          description: `支払依頼 #${paymentRequest.id}`,
        });
        transferId = transfer.id;
        console.log(`[${this.name}] 振込依頼作成: ID ${transferId}`);
      }

      // 4. トランザクションIDを生成
      const transactionId = `FREEE-${paymentRequest.id}${transferId ? `-T${transferId}` : ''}`;

      console.log(`[${this.name}] 支払い成功`, {
        paymentId: payment.id,
        transactionId,
        freeePaymentRequestId: paymentRequest.id,
        freeeTransferId: transferId,
      });

      return {
        success: true,
        transactionId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '不明なエラー';
      console.error(`[${this.name}] 支払い失敗`, {
        paymentId: payment.id,
        error: errorMessage,
      });

      return {
        success: false,
        errorCode: 'FREEE_API_ERROR',
        errorMessage,
      };
    }
  }

  /**
   * 支払いステータスを確認
   */
  async checkStatus(transactionId: string): Promise<PaymentStatus> {
    console.log(`[${this.name}] ステータス確認`, { transactionId });

    // transactionIdからfreee支払依頼IDを抽出
    const match = transactionId.match(/^FREEE-(\d+)/);
    if (!match) {
      return 'failed';
    }

    const paymentRequestId = parseInt(match[1], 10);

    try {
      if (!this.integration.accessToken || !this.integration.companyId) {
        return 'failed';
      }

      const client = new FreeeApiClient(
        this.integration.accessToken,
        this.integration.companyId
      );

      const status = await client.getPaymentRequestStatus(paymentRequestId);

      // freeeステータスをPaymentStatusにマッピング
      switch (status) {
        case 'settled':
        case 'closed':
          return 'completed';
        case 'approved':
          return 'processing';
        case 'rejected':
          return 'failed';
        default:
          return 'processing';
      }
    } catch (error) {
      console.error(`[${this.name}] ステータス確認失敗`, { error });
      return 'failed';
    }
  }

  /**
   * プロバイダー名を取得
   */
  getName(): string {
    return this.name;
  }
}

// ======== ダミー freee プロバイダー ========

/**
 * ダミー freee プロバイダー（テスト用）
 * freee連携が未設定の場合に使用
 */
export class DummyFreeeProvider implements PaymentProviderInterface {
  private name = 'DummyFreeeProvider';

  async execute(payment: Payment): Promise<PaymentExecutionResult> {
    console.log(`[${this.name}] ダミー支払い実行`, {
      paymentId: payment.id,
      amount: payment.amount,
      payeeName: payment.payeeName,
    });

    // シミュレーション用の遅延
    await new Promise((resolve) => setTimeout(resolve, 500));

    // テスト用: 金額が888888円の場合はfreeeエラーをシミュレート
    if (payment.amount === 888888) {
      console.log(`[${this.name}] freeeエラーシミュレーション`);
      return {
        success: false,
        errorCode: 'FREEE_TEST_ERROR',
        errorMessage: 'freee APIエラーシミュレーション',
      };
    }

    const transactionId = `FREEE-DUMMY-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    console.log(`[${this.name}] ダミー支払い成功`, { transactionId });

    return {
      success: true,
      transactionId,
    };
  }

  async checkStatus(transactionId: string): Promise<PaymentStatus> {
    console.log(`[${this.name}] ダミーステータス確認`, { transactionId });
    return 'completed';
  }

  getName(): string {
    return this.name;
  }
}

// ======== プロバイダー取得 ========

/**
 * freee支払いプロバイダーを取得
 * 連携が設定されていればFreeePaymentProvider、なければDummyFreeeProvider
 */
export async function getFreeePaymentProvider(): Promise<PaymentProviderInterface> {
  try {
    const integration = await getFreeeIntegration();

    if (integration?.connected && integration.accessToken && integration.companyId) {
      console.log('[FreeeProvider] freee連携有効、実プロバイダー使用');
      return new FreeePaymentProvider(integration);
    }
  } catch (error) {
    console.error('[FreeeProvider] 連携情報取得失敗', error);
  }

  console.log('[FreeeProvider] freee連携無効、ダミープロバイダー使用');
  return new DummyFreeeProvider();
}
