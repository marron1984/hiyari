/**
 * @jest-environment node
 */

/**
 * MBR (Monthly Business Review) Unit test
 *
 * Ticket 126: generateMbr のテスト
 *
 * テスト対象:
 * 1. getMonthRange: 月の開始日・終了日
 * 2. getPreviousMonth: 前月取得
 * 3. buildFunnelSection: 空室パイプライン集計
 * 4. buildSalesSection: 営業タスク集計
 * 5. generateMbr: フル生成（統合テスト）
 */

import {
  getMonthRange,
  getPreviousMonth,
  buildFunnelSection,
  buildSalesSection,
  generateMbr,
} from '../src/lib/mbr/generateMbr';
import type { Ticket } from '../src/lib/tickets/types';

// ========== ヘルパー ==========

function createTicket(overrides: Partial<Ticket>): Ticket {
  return {
    id: `ticket_${Math.random().toString(36).slice(2)}`,
    title: 'テスト',
    description: '',
    status: 'open',
    priority: 'normal',
    category: 'client',
    businessUnitId: 'bu_001',
    requesterUserId: 'user_001',
    assigneeUserId: 'user_002',
    assigneeRole: null,
    dueAt: null,
    resolvedAt: null,
    closedAt: null,
    tagsJson: null,
    relatedType: null,
    relatedId: null,
    location: null,
    meta: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ========== getMonthRange ==========

describe('getMonthRange', () => {
  it('2025-01 の範囲を正しく返す', () => {
    const { start, end } = getMonthRange('2025-01');
    expect(start.getFullYear()).toBe(2025);
    expect(start.getMonth()).toBe(0); // January
    expect(start.getDate()).toBe(1);
    expect(end.getFullYear()).toBe(2025);
    expect(end.getMonth()).toBe(0);
    expect(end.getDate()).toBe(31);
  });

  it('2025-02 の範囲を正しく返す（28日）', () => {
    const { start, end } = getMonthRange('2025-02');
    expect(start.getDate()).toBe(1);
    expect(end.getDate()).toBe(28);
  });

  it('2024-02 の範囲を正しく返す（閏年 29日）', () => {
    const { start, end } = getMonthRange('2024-02');
    expect(end.getDate()).toBe(29);
  });

  it('2025-12 の範囲を正しく返す', () => {
    const { start, end } = getMonthRange('2025-12');
    expect(start.getMonth()).toBe(11); // December
    expect(end.getDate()).toBe(31);
  });
});

// ========== getPreviousMonth ==========

describe('getPreviousMonth', () => {
  it('2025-03 の前月は 2025-02', () => {
    const result = getPreviousMonth(new Date(2025, 2, 15)); // March 15
    expect(result).toBe('2025-02');
  });

  it('2025-01 の前月は 2024-12', () => {
    const result = getPreviousMonth(new Date(2025, 0, 10)); // January 10
    expect(result).toBe('2024-12');
  });

  it('月は2桁ゼロ埋め', () => {
    const result = getPreviousMonth(new Date(2025, 2, 1)); // March 1
    expect(result).toBe('2025-02');
  });
});

// ========== buildFunnelSection ==========

describe('buildFunnelSection', () => {
  const { start, end } = getMonthRange('2025-01');

  it('空のチケット配列は0件を返す', () => {
    const result = buildFunnelSection([], start, end);
    expect(result.inquiries).toBe(0);
    expect(result.slaBreachCount).toBe(0);
    expect(result.slaBreachRate).toBe(0);
    expect(result.avgDaysToClose).toBe(0);
    expect(result.refTop).toEqual([]);
  });

  it('vacancy_inquiry のみを集計する', () => {
    const tickets = [
      createTicket({
        relatedType: 'vacancy_inquiry',
        createdAt: '2025-01-10T00:00:00Z',
      }),
      createTicket({
        relatedType: 'sales_next_action',
        createdAt: '2025-01-10T00:00:00Z',
      }),
      createTicket({
        relatedType: 'vacancy_inquiry',
        createdAt: '2025-01-15T00:00:00Z',
      }),
    ];

    const result = buildFunnelSection(tickets, start, end);
    expect(result.inquiries).toBe(2);
  });

  it('対象月外のチケットを除外する', () => {
    const tickets = [
      createTicket({
        relatedType: 'vacancy_inquiry',
        createdAt: '2025-01-10T00:00:00Z',
      }),
      createTicket({
        relatedType: 'vacancy_inquiry',
        createdAt: '2024-12-25T00:00:00Z', // 前月
      }),
      createTicket({
        relatedType: 'vacancy_inquiry',
        createdAt: '2025-02-01T00:00:00Z', // 翌月
      }),
    ];

    const result = buildFunnelSection(tickets, start, end);
    expect(result.inquiries).toBe(1);
  });

  it('ステータス別集計が正しい', () => {
    const tickets = [
      createTicket({
        relatedType: 'vacancy_inquiry',
        status: 'open',
        createdAt: '2025-01-10T00:00:00Z',
      }),
      createTicket({
        relatedType: 'vacancy_inquiry',
        status: 'open',
        createdAt: '2025-01-11T00:00:00Z',
      }),
      createTicket({
        relatedType: 'vacancy_inquiry',
        status: 'closed',
        createdAt: '2025-01-12T00:00:00Z',
      }),
    ];

    const result = buildFunnelSection(tickets, start, end);
    expect(result.byStatus['open']).toBe(2);
    expect(result.byStatus['closed']).toBe(1);
  });

  it('SLA超過を正しく計算する', () => {
    const tickets = [
      createTicket({
        relatedType: 'vacancy_inquiry',
        createdAt: '2025-01-05T00:00:00Z',
        closedAt: '2025-01-20T00:00:00Z',
        dueAt: '2025-01-10T00:00:00Z', // SLA超過
      }),
      createTicket({
        relatedType: 'vacancy_inquiry',
        createdAt: '2025-01-05T00:00:00Z',
        closedAt: '2025-01-08T00:00:00Z',
        dueAt: '2025-01-10T00:00:00Z', // SLA内
      }),
    ];

    const result = buildFunnelSection(tickets, start, end);
    expect(result.slaBreachCount).toBe(1);
    expect(result.slaBreachRate).toBe(50); // 1/2 = 50%
  });

  it('平均クローズ日数を計算する', () => {
    const tickets = [
      createTicket({
        relatedType: 'vacancy_inquiry',
        createdAt: '2025-01-01T00:00:00Z',
        closedAt: '2025-01-11T00:00:00Z', // 10日
      }),
      createTicket({
        relatedType: 'vacancy_inquiry',
        createdAt: '2025-01-01T00:00:00Z',
        closedAt: '2025-01-21T00:00:00Z', // 20日
      }),
    ];

    const result = buildFunnelSection(tickets, start, end);
    expect(result.avgDaysToClose).toBe(15); // (10+20)/2
  });

  it('refTop を正しくソートする', () => {
    const tickets = [
      createTicket({ relatedType: 'vacancy_inquiry', businessUnitId: 'bu_a', createdAt: '2025-01-10T00:00:00Z' }),
      createTicket({ relatedType: 'vacancy_inquiry', businessUnitId: 'bu_a', createdAt: '2025-01-11T00:00:00Z' }),
      createTicket({ relatedType: 'vacancy_inquiry', businessUnitId: 'bu_a', createdAt: '2025-01-12T00:00:00Z' }),
      createTicket({ relatedType: 'vacancy_inquiry', businessUnitId: 'bu_b', createdAt: '2025-01-13T00:00:00Z' }),
    ];

    const result = buildFunnelSection(tickets, start, end);
    expect(result.refTop[0].ref).toBe('bu_a');
    expect(result.refTop[0].inquiries).toBe(3);
    expect(result.refTop[1].ref).toBe('bu_b');
    expect(result.refTop[1].inquiries).toBe(1);
  });
});

// ========== buildSalesSection ==========

describe('buildSalesSection', () => {
  const { start, end } = getMonthRange('2025-01');

  it('空のチケット配列は0件を返す', () => {
    const result = buildSalesSection([], start, end);
    expect(result.generated).toBe(0);
    expect(result.completed).toBe(0);
    expect(result.completionRate).toBe(0);
    expect(result.resultDistribution).toEqual([]);
    expect(result.avgLeadTimeDays).toBe(0);
  });

  it('sales_next_action のみを集計する', () => {
    const tickets = [
      createTicket({
        relatedType: 'sales_next_action',
        createdAt: '2025-01-10T00:00:00Z',
      }),
      createTicket({
        relatedType: 'vacancy_inquiry',
        createdAt: '2025-01-10T00:00:00Z',
      }),
    ];

    const result = buildSalesSection(tickets, start, end);
    expect(result.generated).toBe(1);
  });

  it('完了率を正しく計算する', () => {
    const tickets = [
      createTicket({
        relatedType: 'sales_next_action',
        status: 'closed',
        createdAt: '2025-01-10T00:00:00Z',
      }),
      createTicket({
        relatedType: 'sales_next_action',
        status: 'open',
        createdAt: '2025-01-11T00:00:00Z',
      }),
      createTicket({
        relatedType: 'sales_next_action',
        status: 'resolved',
        createdAt: '2025-01-12T00:00:00Z',
      }),
    ];

    const result = buildSalesSection(tickets, start, end);
    expect(result.generated).toBe(3);
    expect(result.completed).toBe(2); // closed + resolved
    expect(result.completionRate).toBe(67); // 2/3 ≈ 67%
  });

  it('resultCode 分布を集計する', () => {
    const tickets = [
      createTicket({
        relatedType: 'sales_next_action',
        status: 'closed',
        meta: { resultCode: 'contacted' },
        createdAt: '2025-01-10T00:00:00Z',
      }),
      createTicket({
        relatedType: 'sales_next_action',
        status: 'closed',
        meta: { resultCode: 'contacted' },
        createdAt: '2025-01-11T00:00:00Z',
      }),
      createTicket({
        relatedType: 'sales_next_action',
        status: 'closed',
        meta: { resultCode: 'not_interested' },
        createdAt: '2025-01-12T00:00:00Z',
      }),
    ];

    const result = buildSalesSection(tickets, start, end);
    expect(result.resultDistribution.length).toBe(2);

    const contacted = result.resultDistribution.find((r) => r.code === 'contacted');
    expect(contacted?.count).toBe(2);
    expect(contacted?.percentage).toBe(67); // 2/3 ≈ 67%
  });

  it('平均リードタイムを計算する', () => {
    const tickets = [
      createTicket({
        relatedType: 'sales_next_action',
        status: 'closed',
        createdAt: '2025-01-01T00:00:00Z',
        closedAt: '2025-01-06T00:00:00Z', // 5日
      }),
      createTicket({
        relatedType: 'sales_next_action',
        status: 'closed',
        createdAt: '2025-01-01T00:00:00Z',
        closedAt: '2025-01-16T00:00:00Z', // 15日
      }),
    ];

    const result = buildSalesSection(tickets, start, end);
    expect(result.avgLeadTimeDays).toBe(10); // (5+15)/2
  });
});

// ========== generateMbr ==========

describe('generateMbr', () => {
  it('指定月でMBRを生成する', () => {
    const mbr = generateMbr('2025-01');
    expect(mbr.month).toBe('2025-01');
    expect(mbr.id).toContain('mbr_2025-01_');
    expect(mbr.generatedAt).toBeTruthy();
    expect(mbr.sections).toBeDefined();
  });

  it('全セクションが含まれる', () => {
    const mbr = generateMbr('2025-01');
    expect(mbr.sections.execSummary).toBeDefined();
    expect(Array.isArray(mbr.sections.execSummary)).toBe(true);
    expect(mbr.sections.funnel).toBeDefined();
    expect(mbr.sections.sales).toBeDefined();
    expect(mbr.sections.aiVpChanges).toBeDefined();
    expect(mbr.sections.suggestions).toBeDefined();
    expect(mbr.sections.ops).toBeDefined();
    expect(mbr.sections.improvementProgress).toBeDefined();
    expect(mbr.sections.nextMonthFocus).toBeDefined();
    expect(Array.isArray(mbr.sections.nextMonthFocus)).toBe(true);
  });

  it('funnelセクションの型が正しい', () => {
    const mbr = generateMbr('2025-01');
    expect(typeof mbr.sections.funnel.inquiries).toBe('number');
    expect(typeof mbr.sections.funnel.slaBreachCount).toBe('number');
    expect(typeof mbr.sections.funnel.slaBreachRate).toBe('number');
    expect(typeof mbr.sections.funnel.avgDaysToClose).toBe('number');
    expect(Array.isArray(mbr.sections.funnel.refTop)).toBe(true);
  });

  it('salesセクションの型が正しい', () => {
    const mbr = generateMbr('2025-01');
    expect(typeof mbr.sections.sales.generated).toBe('number');
    expect(typeof mbr.sections.sales.completed).toBe('number');
    expect(typeof mbr.sections.sales.completionRate).toBe('number');
    expect(Array.isArray(mbr.sections.sales.resultDistribution)).toBe(true);
    expect(typeof mbr.sections.sales.avgLeadTimeDays).toBe('number');
  });

  it('opsセクションの型が正しい', () => {
    const mbr = generateMbr('2025-01');
    expect(typeof mbr.sections.ops.weeklyRunCount).toBe('number');
    expect(typeof mbr.sections.ops.failedRunCount).toBe('number');
    expect(Array.isArray(mbr.sections.ops.failedSteps)).toBe(true);
    expect(typeof mbr.sections.ops.totalItemsProcessed).toBe('number');
    expect(typeof mbr.sections.ops.totalAlertsCreated).toBe('number');
  });

  it('nextMonthFocusが少なくとも1項目ある', () => {
    const mbr = generateMbr('2025-01');
    expect(mbr.sections.nextMonthFocus.length).toBeGreaterThanOrEqual(1);
  });

  it('月を省略すると前月が使われる', () => {
    const mbr = generateMbr();
    const expected = getPreviousMonth();
    expect(mbr.month).toBe(expected);
  });
});
