// ======== freee支払いプロバイダー ========

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
import { FREEE_OAUTH_CONFIG } from '@/types/freee';
import type { JournalEntry } from '@/types/accounting-template';
import { getFreeeIntegration, refreshFreeeTokenIfNeeded } from './freee-token';
import {
  matchAccountingTemplate,
  generateJournalEntry,
  generateDescription,
} from './accounting-template';

const API_BASE = FREEE_OAUTH_CONFIG.apiBaseUrl;

// ======== freeeクライアント ========

/**
 * freee APIクライアント
 */
export class FreeeApiClient {
  private accessToken: string;
  private companyId: number;

  constructor(accessToken: string, companyId: number) {
    this.accessToken = accessToken;
    this.companyId = companyId;
  }

  private async apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${API_BASE}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`freee API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  /**
   * 事業所情報を取得
   */
  async getCompany(): Promise<FreeeCompany> {
    const data = await this.apiRequest<{ company: { id: number; name: string; display_name?: string } }>(
      `/api/1/companies/${this.companyId}`
    );
    return {
      id: data.company.id,
      name: data.company.name,
      displayName: data.company.display_name || data.company.name,
    };
  }

  /**
   * 口座一覧を取得
   */
  async getWalletables(): Promise<FreeeWalletable[]> {
    const data = await this.apiRequest<{ walletables: Array<{ id: number; name: string; type: string; walletable_balance?: number }> }>(
      `/api/1/walletables?company_id=${this.companyId}`
    );
    return data.walletables.map((w) => ({
      id: w.id,
      name: w.name,
      type: w.type as FreeeWalletable['type'],
      walletableBalance: w.walletable_balance,
    }));
  }

  /**
   * 取引先一覧を取得
   */
  async getPartners(): Promise<FreeePartner[]> {
    const data = await this.apiRequest<{ partners: Array<{ id: number; name: string; code?: string }> }>(
      `/api/1/partners?company_id=${this.companyId}`
    );
    return data.partners.map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
    }));
  }

  /**
   * 取引先を検索/作成
   */
  async findOrCreatePartner(name: string): Promise<FreeePartner> {
    // まず名前で検索
    const searchData = await this.apiRequest<{ partners: Array<{ id: number; name: string; code?: string }> }>(
      `/api/1/partners?company_id=${this.companyId}&keyword=${encodeURIComponent(name)}`
    );

    const existing = searchData.partners.find((p) => p.name === name);
    if (existing) {
      return { id: existing.id, name: existing.name, code: existing.code };
    }

    // 見つからなければ新規作成
    const createData = await this.apiRequest<{ partner: { id: number; name: string; code?: string } }>(
      `/api/1/partners`,
      {
        method: 'POST',
        body: JSON.stringify({
          company_id: this.companyId,
          name,
        }),
      }
    );

    return {
      id: createData.partner.id,
      name: createData.partner.name,
      code: createData.partner.code,
    };
  }

  /**
   * 支払依頼を作成
   */
  async createPaymentRequest(params: {
    title: string;
    totalAmount: number;
    partnerId: number;
    partnerName: string;
    description?: string;
    targetDate?: string;
  }): Promise<{ id: number }> {
    const data = await this.apiRequest<{ payment_request: { id: number } }>(
      `/api/1/payment_requests`,
      {
        method: 'POST',
        body: JSON.stringify({
          company_id: this.companyId,
          title: params.title,
          total_amount: params.totalAmount,
          partner_id: params.partnerId,
          description: params.description,
          payment_date: params.targetDate,
        }),
      }
    );
    return { id: data.payment_request.id };
  }

  /**
   * 振込依頼を作成
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
    const data = await this.apiRequest<{ transfer: { id: number } }>(
      `/api/1/transfers`,
      {
        method: 'POST',
        body: JSON.stringify({
          company_id: this.companyId,
          from_walletable_id: params.fromWalletableId,
          from_walletable_type: 'bank_account',
          to_walletable_id: null,
          amount: params.amount,
          date: params.transferDate,
          description: params.description,
        }),
      }
    );
    return { id: data.transfer.id };
  }

  /**
   * 支払依頼ステータスを取得
   */
  async getPaymentRequestStatus(paymentRequestId: number): Promise<string> {
    const data = await this.apiRequest<{ payment_request: { status: string } }>(
      `/api/1/payment_requests/${paymentRequestId}?company_id=${this.companyId}`
    );
    return data.payment_request.status;
  }

  /**
   * 仕訳（取引）を作成
   */
  async createDeal(journalEntry: JournalEntry): Promise<{ id: number }> {
    const data = await this.apiRequest<{ deal: { id: number } }>(
      `/api/1/deals`,
      {
        method: 'POST',
        body: JSON.stringify({
          company_id: this.companyId,
          issue_date: journalEntry.issueDate,
          type: journalEntry.type === 'expense' ? 'expense' : 'income',
          partner_id: journalEntry.partnerId,
          details: journalEntry.details.map((d) => ({
            account_item_id: d.accountItemId,
            tax_code: d.taxCode,
            amount: d.amount,
            description: d.description,
          })),
        }),
      }
    );
    return { id: data.deal.id };
  }
}

// ======== freee支払いプロバイダー ========

/**
 * freee支払いプロバイダー
 */
export class FreeePaymentProvider implements PaymentProviderInterface {
  private name = 'FreeePaymentProvider';
  private integration: FreeeIntegration;
  private branchId?: string;
  private purpose?: string;
  private invoiceNumber?: string;

  constructor(
    integration: FreeeIntegration,
    options?: { branchId?: string; purpose?: string; invoiceNumber?: string }
  ) {
    this.integration = integration;
    this.branchId = options?.branchId;
    this.purpose = options?.purpose;
    this.invoiceNumber = options?.invoiceNumber;
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

    // === 仕訳テンプレートマッチング ===
    const templateMatch = await matchAccountingTemplate(payment, this.branchId, this.purpose);

    if (!templateMatch.matched || !templateMatch.template) {
      console.error(`[${this.name}] 仕訳テンプレートなし`, {
        paymentId: payment.id,
        reason: templateMatch.reason,
      });
      return {
        success: false,
        errorCode: 'NO_ACCOUNTING_TEMPLATE',
        errorMessage: templateMatch.reason || '条件に一致する仕訳テンプレートがありません。管理者に連絡してください。',
      };
    }

    console.log(`[${this.name}] 仕訳テンプレートマッチ`, {
      templateId: templateMatch.template.id,
      templateName: templateMatch.template.name,
    });

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

      // 2. 仕訳データを生成
      const journalEntry = generateJournalEntry(templateMatch.template, payment, {
        purpose: this.purpose,
        invoiceNumber: this.invoiceNumber,
        partnerId: partner.id,
      });

      // 3. freeeに仕訳（取引）を作成
      const deal = await client.createDeal(journalEntry);
      console.log(`[${this.name}] 仕訳作成: ID ${deal.id}`);

      // 4. 支払依頼を作成（摘要はテンプレートから生成）
      const description = generateDescription(templateMatch.template, payment, {
        purpose: this.purpose,
        invoiceNumber: this.invoiceNumber,
      });

      const paymentRequest = await client.createPaymentRequest({
        title: payment.applicationTitle,
        totalAmount: payment.amount,
        partnerId: partner.id,
        partnerName: partner.name,
        description,
        targetDate: new Date().toISOString().split('T')[0],
      });
      console.log(`[${this.name}] 支払依頼作成: ID ${paymentRequest.id}`);

      // 5. 銀行振込の場合は振込依頼も作成
      let transferId: number | undefined;
      if (payment.paymentMethod === 'bank_transfer' && payment.bankAccount) {
        // テンプレートの決済口座IDを使用、なければデフォルト口座（ID: 1）
        const walletableId = templateMatch.template.freeeSettings?.walletableId || 1;
        const transfer = await client.createTransfer({
          fromWalletableId: walletableId,
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

      // 6. トランザクションIDを生成
      const transactionId = `FREEE-${deal.id}-P${paymentRequest.id}${transferId ? `-T${transferId}` : ''}`;

      console.log(`[${this.name}] 支払い成功`, {
        paymentId: payment.id,
        transactionId,
        freeeDealId: deal.id,
        freeePaymentRequestId: paymentRequest.id,
        freeeTransferId: transferId,
        templateName: templateMatch.template.name,
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
  private branchId?: string;
  private purpose?: string;

  constructor(options?: { branchId?: string; purpose?: string }) {
    this.branchId = options?.branchId;
    this.purpose = options?.purpose;
  }

  async execute(payment: Payment): Promise<PaymentExecutionResult> {
    console.log(`[${this.name}] ダミー支払い実行`, {
      paymentId: payment.id,
      amount: payment.amount,
      payeeName: payment.payeeName,
    });

    // === 仕訳テンプレートマッチング（ダミーでもチェック） ===
    const templateMatch = await matchAccountingTemplate(payment, this.branchId, this.purpose);

    if (!templateMatch.matched || !templateMatch.template) {
      console.error(`[${this.name}] 仕訳テンプレートなし`, {
        paymentId: payment.id,
        reason: templateMatch.reason,
      });
      return {
        success: false,
        errorCode: 'NO_ACCOUNTING_TEMPLATE',
        errorMessage: templateMatch.reason || '条件に一致する仕訳テンプレートがありません。管理者に連絡してください。',
      };
    }

    console.log(`[${this.name}] 仕訳テンプレートマッチ`, {
      templateId: templateMatch.template.id,
      templateName: templateMatch.template.name,
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
    console.log(`[${this.name}] ダミー支払い成功`, {
      transactionId,
      templateName: templateMatch.template.name,
    });

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

export interface FreeeProviderOptions {
  branchId?: string;
  purpose?: string;
  invoiceNumber?: string;
}

/**
 * freee支払いプロバイダーを取得
 * 連携が設定されていればFreeePaymentProvider、なければDummyFreeeProvider
 */
export async function getFreeePaymentProvider(
  options?: FreeeProviderOptions
): Promise<PaymentProviderInterface> {
  try {
    const integration = await getFreeeIntegration();

    if (integration?.connected && integration.accessToken && integration.companyId) {
      console.log('[FreeeProvider] freee連携有効、実プロバイダー使用');
      return new FreeePaymentProvider(integration, options);
    }
  } catch (error) {
    console.error('[FreeeProvider] 連携情報取得失敗', error);
  }

  console.log('[FreeeProvider] freee連携無効、ダミープロバイダー使用');
  return new DummyFreeeProvider(options);
}
