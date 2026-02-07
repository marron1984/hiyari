/**
 * @jest-environment node
 */

/**
 * Ticket 127: MBR Role Home ウィジェットテスト
 *
 * テスト対象:
 * 1. ROLE_WIDGET_CONFIG に mbr が正しく設定されているか
 * 2. buildMbrWidget: MBRデータあり/なし
 * 3. 権限: staff/leader には mbr が含まれないこと
 */

import { ROLE_WIDGET_CONFIG, WIDGET_LABELS } from '../src/lib/roleHome/types';
import type { MbrWidget } from '../src/lib/roleHome/types';
import { buildMbrWidget } from '../src/lib/roleHome/widgetBuilder';
import { saveMbr, clearAllMbrs } from '../src/lib/mbr/mbrRepo';
import type { Mbr } from '../src/lib/mbr/types';

// ========== テスト用MBR ==========

function createTestMbr(month: string): Mbr {
  return {
    id: `mbr_${month}_test`,
    month,
    generatedAt: '2025-01-20T10:00:00Z',
    sections: {
      execSummary: ['テスト概要'],
      funnel: {
        inquiries: 10,
        slaBreachCount: 2,
        slaBreachRate: 20,
        avgDaysToClose: 7,
        byStatus: { open: 5, closed: 5 },
        refTop: [],
      },
      sales: {
        generated: 20,
        completed: 15,
        completionRate: 75,
        resultDistribution: [],
        avgLeadTimeDays: 5,
      },
      aiVpChanges: {
        totalEvents: 3,
        byAction: {},
        recentEvents: [],
      },
      suggestions: {
        openCount: 1,
        acceptedCount: 2,
        dismissedCount: 0,
        acceptedKeys: ['tourConversionWeight'],
      },
      ops: {
        weeklyRunCount: 4,
        failedRunCount: 0,
        failedSteps: [],
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
      },
      nextMonthFocus: ['テスト項目'],
    },
  };
}

// ========== ROLE_WIDGET_CONFIG ==========

describe('ROLE_WIDGET_CONFIG にmbrが含まれるロール', () => {
  it('manager に mbr が含まれる', () => {
    expect(ROLE_WIDGET_CONFIG.manager).toContain('mbr');
  });

  it('executive に mbr が含まれる', () => {
    expect(ROLE_WIDGET_CONFIG.executive).toContain('mbr');
  });

  it('admin に mbr が含まれる', () => {
    expect(ROLE_WIDGET_CONFIG.admin).toContain('mbr');
  });
});

describe('ROLE_WIDGET_CONFIG にmbrが含まれないロール', () => {
  it('staff に mbr が含まれない', () => {
    expect(ROLE_WIDGET_CONFIG.staff).not.toContain('mbr');
  });

  it('leader に mbr が含まれない', () => {
    expect(ROLE_WIDGET_CONFIG.leader).not.toContain('mbr');
  });

  it('auditor に mbr が含まれない', () => {
    expect(ROLE_WIDGET_CONFIG.auditor).not.toContain('mbr');
  });
});

// ========== WIDGET_LABELS ==========

describe('WIDGET_LABELS', () => {
  it('mbr のラベルが定義されている', () => {
    expect(WIDGET_LABELS.mbr).toBe('月次改善レビュー');
  });
});

// ========== buildMbrWidget ==========

describe('buildMbrWidget', () => {
  beforeEach(() => {
    clearAllMbrs();
  });

  it('MBRがない場合、available=false / severity=warning を返す', () => {
    const widget = buildMbrWidget();
    expect(widget.type).toBe('mbr');
    expect(widget.available).toBe(false);
    expect(widget.latestMonth).toBeNull();
    expect(widget.generatedAt).toBeNull();
    expect(widget.severity).toBe('warning');
    expect(widget.href).toBe('/dashboard/mbr');
  });

  it('MBRがある場合、available=true / severity=info を返す', () => {
    saveMbr(createTestMbr('2030-06'));

    const widget = buildMbrWidget();
    expect(widget.type).toBe('mbr');
    expect(widget.available).toBe(true);
    expect(widget.latestMonth).toBe('2030-06');
    expect(widget.generatedAt).toBe('2025-01-20T10:00:00Z');
    expect(widget.severity).toBe('info');
  });

  it('複数MBRがある場合、最新月を返す', () => {
    saveMbr(createTestMbr('2030-10'));
    saveMbr(createTestMbr('2030-11'));
    saveMbr(createTestMbr('2030-12'));

    const widget = buildMbrWidget();
    expect(widget.latestMonth).toBe('2030-12');
    expect(widget.available).toBe(true);
  });

  it('isEmpty は常に false', () => {
    const widget = buildMbrWidget();
    expect(widget.isEmpty).toBe(false);
  });

  it('title が正しい', () => {
    const widget = buildMbrWidget();
    expect(widget.title).toBe('月次改善レビュー');
  });
});
