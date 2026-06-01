/**
 * @jest-environment node
 */

/**
 * Ticket 128: MBR → 改善タスク自動起票テスト
 *
 * テスト対象:
 * 1. createCorrectiveActionsFromMbr: 起票・冪等・通知
 * 2. buildSourceId: 冪等ID生成
 * 3. 権限: SourceType に mbr_focus が含まれること
 */

import {
  createCorrectiveActionsFromMbr,
  buildSourceId,
} from '../src/lib/mbr/createCorrectiveActionsFromMbr';
import { listCorrectiveActions } from '../src/lib/correctiveActions/repo';
import { SOURCE_TYPE_CONFIG } from '../src/lib/correctiveActions/types';
import type { Mbr } from '../src/lib/mbr/types';

// ========== テスト用MBR ==========

function createTestMbr(month: string, focusItems: string[]): Mbr {
  return {
    id: `mbr_${month}_test`,
    month,
    generatedAt: '2025-01-20T10:00:00Z',
    sections: {
      execSummary: ['テスト概要'],
      funnel: {
        inquiries: 10,
        slaBreachCount: 3,
        slaBreachRate: 30,
        avgDaysToClose: 7,
        byStatus: { open: 5, closed: 5 },
        refTop: [],
      },
      sales: {
        generated: 20,
        completed: 10,
        completionRate: 50,
        resultDistribution: [],
        avgLeadTimeDays: 5,
      },
      aiVpChanges: {
        totalEvents: 3,
        byAction: {},
        recentEvents: [],
      },
      suggestions: {
        openCount: 2,
        acceptedCount: 1,
        dismissedCount: 0,
        acceptedKeys: [],
      },
      ops: {
        weeklyRunCount: 4,
        failedRunCount: 1,
        failedSteps: ['step_a'],
        totalItemsProcessed: 100,
        totalAlertsCreated: 5,
      },
      improvementProgress: {
        byMonth: [],
        totalTasks: 0,
        totalDone: 0,
        overallCompletionRate: 0,
        blockedTop: [],
        overdueTop: [],
        blockedTopReasons: [],
        blockedReasonAdvices: [],
      },
      nextMonthFocus: focusItems,
    },
  };
}

// ========== SourceType ==========

describe('SourceType mbr_focus', () => {
  it('mbr_focus が SOURCE_TYPE_CONFIG に含まれる', () => {
    expect(SOURCE_TYPE_CONFIG.mbr_focus).toBeDefined();
    expect(SOURCE_TYPE_CONFIG.mbr_focus.label).toBe('MBR改善');
  });
});

// ========== buildSourceId ==========

describe('buildSourceId', () => {
  it('月とフォーカスアイテムから一意のIDを生成する', () => {
    const id1 = buildSourceId('2025-01', 'SLA超過率を改善する');
    const id2 = buildSourceId('2025-01', 'no_answer率を下げる');
    expect(id1).not.toBe(id2);
  });

  it('同じ入力に対して同じIDを生成する（冪等）', () => {
    const id1 = buildSourceId('2025-01', 'SLA超過率を改善する');
    const id2 = buildSourceId('2025-01', 'SLA超過率を改善する');
    expect(id1).toBe(id2);
  });

  it('異なる月は異なるIDを生成する', () => {
    const id1 = buildSourceId('2025-01', 'SLA超過率を改善する');
    const id2 = buildSourceId('2025-02', 'SLA超過率を改善する');
    expect(id1).not.toBe(id2);
  });

  it('mbr:{YYYY-MM}:{hash} フォーマットである', () => {
    const id = buildSourceId('2025-03', 'テスト改善');
    expect(id).toMatch(/^mbr:2025-03:/);
  });
});

// ========== createCorrectiveActionsFromMbr ==========

describe('createCorrectiveActionsFromMbr', () => {
  it('nextMonthFocusの各項目に対して是正措置を起票する', () => {
    const mbr = createTestMbr('2040-01', [
      'SLA超過率を20%以下にする',
      '営業完了率を60%以上に改善',
    ]);

    const result = createCorrectiveActionsFromMbr(mbr, 'user_admin');
    expect(result.createdCount).toBe(2);
    expect(result.skippedCount).toBe(0);
    expect(result.created).toHaveLength(2);
    expect(result.created[0].title).toContain('[MBR改善]');
    expect(result.created[0].title).toContain('2040-01');
  });

  it('最大5件まで起票する', () => {
    const mbr = createTestMbr('2040-02', [
      '改善1', '改善2', '改善3', '改善4', '改善5', '改善6', '改善7',
    ]);

    const result = createCorrectiveActionsFromMbr(mbr, 'user_admin');
    expect(result.createdCount).toBe(5);
  });

  it('冪等: 同じMBRから2回起票しても増殖しない', () => {
    const mbr = createTestMbr('2040-03', ['冪等テスト改善']);

    const result1 = createCorrectiveActionsFromMbr(mbr, 'user_admin');
    expect(result1.createdCount).toBe(1);
    expect(result1.skippedCount).toBe(0);

    const result2 = createCorrectiveActionsFromMbr(mbr, 'user_admin');
    expect(result2.createdCount).toBe(0);
    expect(result2.skippedCount).toBe(1);
    expect(result2.skipped[0].reason).toBe('既に起票済み');
  });

  it('起票された是正措置がsourceType=mbr_focusで保存される', () => {
    const mbr = createTestMbr('2040-04', ['ソースタイプ確認']);

    createCorrectiveActionsFromMbr(mbr, 'user_admin');

    const viewer = { userId: 'user_admin', role: 'admin' as const };
    const { items } = listCorrectiveActions(viewer, { sourceType: 'mbr_focus' });
    const found = items.find((ca) => ca.title.includes('2040-04'));
    expect(found).toBeDefined();
    expect(found!.sourceType).toBe('mbr_focus');
    expect(found!.severity).toBe('major');
    expect(found!.status).toBe('open');
  });

  it('dueAtが設定される', () => {
    const mbr = createTestMbr('2040-05', ['期限テスト']);

    const result = createCorrectiveActionsFromMbr(mbr, 'user_admin');
    expect(result.createdCount).toBe(1);

    const viewer = { userId: 'user_admin', role: 'admin' as const };
    const { items } = listCorrectiveActions(viewer, { sourceType: 'mbr_focus' });
    const found = items.find((ca) => ca.title.includes('2040-05'));
    expect(found).toBeDefined();
    expect(found!.dueAt).toBeTruthy();
    expect(found!.dueAt).toContain('2040-06'); // 翌月末
  });

  it('空のnextMonthFocusでは起票しない', () => {
    const mbr = createTestMbr('2040-06', []);

    const result = createCorrectiveActionsFromMbr(mbr, 'user_admin');
    expect(result.createdCount).toBe(0);
    expect(result.skippedCount).toBe(0);
  });

  it('descriptionに改善根拠が含まれる', () => {
    const mbr = createTestMbr('2040-07', ['根拠確認テスト']);
    // slaBreachRate > 20, completionRate < 60 を設定済み

    createCorrectiveActionsFromMbr(mbr, 'user_admin');

    const viewer = { userId: 'user_admin', role: 'admin' as const };
    const { items } = listCorrectiveActions(viewer, { sourceType: 'mbr_focus' });
    const found = items.find((ca) => ca.title.includes('2040-07'));
    expect(found).toBeDefined();
    expect(found!.description).toContain('SLA超過率');
    expect(found!.description).toContain('営業タスク完了率');
    expect(found!.description).toContain('/dashboard/mbr');
  });
});
