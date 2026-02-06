/**
 * @jest-environment node
 */

/**
 * leadScore 提案エンジン Unit test
 *
 * Ticket 124: buildLeadScoreSuggestions のテスト
 *
 * テスト対象:
 * 1. aggregateMetrics: チケット集計
 * 2. applyPatchPreview: パッチ適用プレビュー
 * 3. ルール: SLA超過、見学率低、not_interested率高
 * 4. 自動で設定が書き換わらないこと（重要）
 */

import { aggregateMetrics, applyPatchPreview } from '../src/lib/sales/buildLeadScoreSuggestions';
import type { Ticket, SalesResultCode } from '../src/lib/tickets/types';

// テスト用チケット生成ヘルパー
function createSalesTicket(overrides: {
  resultCode: SalesResultCode;
  ref?: string;
  stage?: string;
  businessUnitId?: string;
  closedAt?: string;
  dueAt?: string;
}): Ticket {
  const now = new Date();
  const closedAt = overrides.closedAt || now.toISOString();
  return {
    id: `ticket_${Math.random().toString(36).slice(2)}`,
    title: 'テスト営業タスク',
    description: 'テスト',
    status: 'closed',
    priority: 'normal',
    category: 'client',
    businessUnitId: overrides.businessUnitId || 'bu_001',
    requesterUserId: 'user_001',
    assigneeUserId: 'user_002',
    assigneeRole: null,
    dueAt: overrides.dueAt || null,
    resolvedAt: null,
    closedAt,
    tagsJson: null,
    relatedType: 'sales_next_action',
    relatedId: null,
    location: null,
    meta: {
      resultCode: overrides.resultCode,
      ref: overrides.ref,
      stage: overrides.stage,
    },
    createdAt: closedAt,
    updatedAt: closedAt,
  };
}

describe('aggregateMetrics', () => {
  it('空のチケット配列は空の集計を返す', () => {
    const result = aggregateMetrics([], 14);
    expect(result.totalTickets).toBe(0);
    expect(result.resultDistribution).toEqual([]);
    expect(result.slaBreachRate).toBe(0);
  });

  it('sales_next_action以外のチケットは除外する', () => {
    const tickets: Ticket[] = [
      {
        ...createSalesTicket({ resultCode: 'contacted' }),
        relatedType: 'ai_vp', // sales_next_actionではない
      },
    ];
    const result = aggregateMetrics(tickets, 14);
    expect(result.totalTickets).toBe(0);
  });

  it('status=closed以外のチケットは除外する', () => {
    const tickets: Ticket[] = [
      {
        ...createSalesTicket({ resultCode: 'contacted' }),
        status: 'open',
      },
    ];
    const result = aggregateMetrics(tickets, 14);
    expect(result.totalTickets).toBe(0);
  });

  it('resultCode分布を正しく集計する', () => {
    const tickets = [
      createSalesTicket({ resultCode: 'contacted' }),
      createSalesTicket({ resultCode: 'contacted' }),
      createSalesTicket({ resultCode: 'tour_scheduled' }),
      createSalesTicket({ resultCode: 'not_interested' }),
      createSalesTicket({ resultCode: 'not_interested' }),
    ];

    const result = aggregateMetrics(tickets, 30);
    expect(result.totalTickets).toBe(5);

    const contacted = result.resultDistribution.find((d) => d.code === 'contacted');
    expect(contacted?.count).toBe(2);
    expect(contacted?.percentage).toBe(40);

    const notInterested = result.resultDistribution.find((d) => d.code === 'not_interested');
    expect(notInterested?.count).toBe(2);
    expect(notInterested?.percentage).toBe(40);
  });

  it('SLA超過を正しく計算する', () => {
    const pastDue = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const closedLate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

    const tickets = [
      createSalesTicket({ resultCode: 'contacted', dueAt: pastDue, closedAt: closedLate }),
      createSalesTicket({ resultCode: 'contacted' }), // dueAtなし
    ];

    const result = aggregateMetrics(tickets, 30);
    expect(result.slaBreachCount).toBe(1);
    expect(result.slaBreachRate).toBe(50);
  });

  it('ref別の成功率を計算する', () => {
    const tickets = [
      createSalesTicket({ resultCode: 'accepted', ref: 'web' }),
      createSalesTicket({ resultCode: 'not_interested', ref: 'web' }),
      createSalesTicket({ resultCode: 'accepted', ref: 'referral' }),
      createSalesTicket({ resultCode: 'accepted', ref: 'referral' }),
    ];

    const result = aggregateMetrics(tickets, 30);

    const webRate = result.refSuccessRates.find((r) => r.ref === 'web');
    expect(webRate?.rate).toBe(50); // 1/2

    const referralRate = result.refSuccessRates.find((r) => r.ref === 'referral');
    expect(referralRate?.rate).toBe(100); // 2/2
  });

  it('ステージ進展率を計算する', () => {
    const tickets = [
      createSalesTicket({ resultCode: 'tour_scheduled', stage: 'new' }),
      createSalesTicket({ resultCode: 'not_interested', stage: 'new' }),
      createSalesTicket({ resultCode: 'contacted', stage: 'new' }),
    ];

    const result = aggregateMetrics(tickets, 30);
    const newStage = result.stageProgression.find((s) => s.stage === 'new');
    expect(newStage?.total).toBe(3);
    expect(newStage?.progressed).toBe(1); // tour_scheduledのみ
    expect(newStage?.rate).toBe(33); // 1/3 ≈ 33%
  });

  it('期間外のチケットを除外する', () => {
    const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const recentDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

    const tickets = [
      createSalesTicket({ resultCode: 'contacted', closedAt: oldDate }),
      createSalesTicket({ resultCode: 'contacted', closedAt: recentDate }),
    ];

    const result = aggregateMetrics(tickets, 14);
    expect(result.totalTickets).toBe(1); // 直近14日分のみ
  });
});

describe('applyPatchPreview', () => {
  it('パッチをデルタとして適用する', () => {
    const result = applyPatchPreview({
      weights: { tickets_urgent: 3 } as any,
    });

    // デフォルトのtickets_urgentは5、+3で8になるべき
    expect(result.weights.tickets_urgent).toBe(8);
  });

  it('0-100の範囲にクランプする', () => {
    const result = applyPatchPreview({
      weights: { licenses_expired: 95 } as any, // 10 + 95 = 105 → 100
    });
    expect(result.weights.licenses_expired).toBe(100);
  });

  it('パッチのないフィールドは変更しない', () => {
    const result = applyPatchPreview({
      weights: { tickets_urgent: 1 } as any,
    });

    // tickets_urgentだけ変更、他は元のまま
    expect(result.weights.tickets_urgent).toBe(6); // 5 + 1
    expect(result.weights.licenses_expired).toBe(10); // 変更なし
    expect(result.weights.repairs_highrisk).toBe(8);  // 変更なし
  });

  it('空のパッチは現在設定をそのまま返す', () => {
    const result = applyPatchPreview({});
    expect(result.weights.tickets_urgent).toBe(5); // デフォルト
  });
});

describe('設定の自動書き換え防止', () => {
  it('aggregateMetricsは設定を変更しない（読み取り専用）', () => {
    const tickets = [
      createSalesTicket({ resultCode: 'contacted' }),
    ];
    // aggregateMetricsは設定に触れないことを確認
    const result = aggregateMetrics(tickets, 14);
    expect(result).toBeDefined();
    // 型安全: aggregateMetricsはSalesMetricsAggregationを返す（configではない）
    expect(result).not.toHaveProperty('weights');
    expect(result).not.toHaveProperty('thresholds');
  });

  it('applyPatchPreviewは設定を保存しない（プレビューのみ）', () => {
    const preview1 = applyPatchPreview({
      weights: { tickets_urgent: 50 } as any,
    });
    // プレビュー後に再度取得しても元の値
    const preview2 = applyPatchPreview({});
    expect(preview2.weights.tickets_urgent).toBe(5); // デフォルト値のまま
    expect(preview1.weights.tickets_urgent).toBe(55); // 5 + 50
  });
});
