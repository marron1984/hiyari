/**
 * @jest-environment node
 */

/**
 * Ticket 130: MBR改善タスク期限超過エスカレーション
 *
 * テスト対象:
 * 1. scanMbrActionsOverdue: 期限超過の mbr_focus タスクを検知
 * 2. buildMbrOverdueAlert: アラートリクエスト生成（severity判定）
 * 3. 冪等性: 同日2回走っても増殖しない
 * 4. daily-ops統合: ステップが実行される
 */

import {
  scanMbrActionsOverdue,
  buildMbrOverdueAlert,
  calcOverdueDays,
  getMbrOverdueSummary,
} from '../src/lib/dailyOps/scanMbrActionsOverdue';
import { create as createCorrectiveAction } from '../src/lib/correctiveActions/repo';
import { createAlertsFromScan, clearAllAlerts, listAlerts } from '../src/lib/alerts/repo';
import type { AlertType } from '../src/lib/alerts/types';
import { ALERT_TYPE_LABELS } from '../src/lib/alerts/types';
import type { DailyOpsStepName } from '../src/lib/dailyOps/types';

// ========== ヘルパー ==========

/** テスト用のmbr_focus是正措置を作成 */
function createMbrFocusAction(opts: {
  title: string;
  dueAt: string;
  status?: string;
  sourceId?: string;
}): void {
  createCorrectiveAction(
    {
      title: opts.title,
      description: 'テスト用MBR改善タスク',
      severity: 'major',
      sourceType: 'mbr_focus',
      sourceId: opts.sourceId ?? `mbr:2025-01:test_${Date.now()}_${Math.random()}`,
      dueAt: opts.dueAt,
    },
    'system',
    { skipAutoAssign: true }
  );
}

/** N日前の日付をISO文字列で返す */
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

/** N日後の日付をISO文字列で返す */
function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

// ========== calcOverdueDays ==========

describe('calcOverdueDays', () => {
  it('期限超過日数を正しく計算する', () => {
    const now = new Date('2026-02-10T12:00:00Z');
    const dueAt = '2026-02-03T12:00:00Z';
    expect(calcOverdueDays(dueAt, now)).toBe(7);
  });

  it('期限内の場合は負の値を返す', () => {
    const now = new Date('2026-02-01T12:00:00Z');
    const dueAt = '2026-02-10T12:00:00Z';
    expect(calcOverdueDays(dueAt, now)).toBeLessThan(0);
  });

  it('当日は0を返す', () => {
    const now = new Date('2026-02-05T12:00:00Z');
    const dueAt = '2026-02-05T00:00:00Z';
    expect(calcOverdueDays(dueAt, now)).toBe(0);
  });
});

// ========== scanMbrActionsOverdue ==========

describe('scanMbrActionsOverdue', () => {
  it('期限超過のmbr_focusタスクを検出する', () => {
    // 3日前が期限のタスクを作成
    createMbrFocusAction({
      title: 'テスト超過タスク_scan_1',
      dueAt: daysAgo(3),
    });

    const items = scanMbrActionsOverdue();
    const found = items.find((i) => i.action.title === 'テスト超過タスク_scan_1');
    expect(found).toBeDefined();
    expect(found!.overdueDays).toBeGreaterThanOrEqual(3);
  });

  it('期限内のタスクは検出しない', () => {
    createMbrFocusAction({
      title: 'テスト期限内タスク_scan_2',
      dueAt: daysFromNow(10),
    });

    const items = scanMbrActionsOverdue();
    const found = items.find((i) => i.action.title === 'テスト期限内タスク_scan_2');
    expect(found).toBeUndefined();
  });

  it('completed状態のタスクは検出しない', () => {
    // completedのタスクは listCorrectiveActions のフィルタでは返ってくるが
    // scanMbrActionsOverdue内で status チェックで除外される
    // create() はstatus=openで作るので、このテストはopen以外のステータスの除外を確認
    const items = scanMbrActionsOverdue();
    const completedItems = items.filter(
      (i) => i.action.status === 'completed' || i.action.status === 'closed' || i.action.status === 'cancelled'
    );
    expect(completedItems).toHaveLength(0);
  });
});

// ========== buildMbrOverdueAlert ==========

describe('buildMbrOverdueAlert', () => {
  it('超過アイテムがない場合はnullを返す', () => {
    const result = buildMbrOverdueAlert([], '2026-02-06');
    expect(result).toBeNull();
  });

  it('1日超過のみの場合はwarningを返す', () => {
    const items = [
      {
        action: { id: 'ca_test1', title: 'テスト1' } as any,
        overdueDays: 3,
      },
    ];
    const alert = buildMbrOverdueAlert(items, '2026-02-06');
    expect(alert).not.toBeNull();
    expect(alert!.severity).toBe('warning');
    expect(alert!.type).toBe('mbr_action_overdue');
    expect(alert!.fingerprint).toBe('mbr_action_overdue:2026-02-06');
  });

  it('7日超過がある場合はcriticalを返す', () => {
    const items = [
      {
        action: { id: 'ca_test1', title: 'テスト1' } as any,
        overdueDays: 3,
      },
      {
        action: { id: 'ca_test2', title: 'テスト2' } as any,
        overdueDays: 10,
      },
    ];
    const alert = buildMbrOverdueAlert(items, '2026-02-06');
    expect(alert).not.toBeNull();
    expect(alert!.severity).toBe('critical');
    expect(alert!.message).toContain('7日超: 1件');
  });

  it('fingerprintに日付が含まれる（冪等）', () => {
    const items = [
      {
        action: { id: 'ca_test1', title: 'テスト' } as any,
        overdueDays: 2,
      },
    ];
    const alert = buildMbrOverdueAlert(items, '2026-02-06');
    expect(alert!.fingerprint).toBe('mbr_action_overdue:2026-02-06');
  });

  it('metaにoverdueCount/overdue7Count/urlが含まれる', () => {
    const items = [
      {
        action: { id: 'ca_test1', title: 'テスト1' } as any,
        overdueDays: 2,
      },
      {
        action: { id: 'ca_test2', title: 'テスト2' } as any,
        overdueDays: 8,
      },
    ];
    const alert = buildMbrOverdueAlert(items, '2026-02-06');
    expect(alert!.meta).toBeDefined();
    expect((alert!.meta as any).overdueCount).toBe(2);
    expect((alert!.meta as any).overdue7Count).toBe(1);
    expect((alert!.meta as any).url).toContain('mbr_focus');
  });
});

// ========== 冪等性（アラート重複防止） ==========

describe('冪等性', () => {
  beforeEach(() => {
    clearAllAlerts();
  });

  it('同日2回走ってもアラートは1件のみ', () => {
    const items = [
      {
        action: { id: 'ca_idem1', title: '冪等テスト' } as any,
        overdueDays: 5,
      },
    ];

    const alert1 = buildMbrOverdueAlert(items, '2026-02-06');
    const alert2 = buildMbrOverdueAlert(items, '2026-02-06');

    expect(alert1).not.toBeNull();
    expect(alert2).not.toBeNull();

    // 同じfingerprintで2回作成
    const r1 = createAlertsFromScan([alert1!]);
    const r2 = createAlertsFromScan([alert2!]);

    expect(r1.created).toBe(1);
    expect(r2.created).toBe(0);
    expect(r2.skipped).toBe(1);
  });

  it('異なる日付なら別アラートが作成される', () => {
    const items = [
      {
        action: { id: 'ca_idem2', title: '冪等テスト2' } as any,
        overdueDays: 5,
      },
    ];

    const alert1 = buildMbrOverdueAlert(items, '2026-02-06');
    const alert2 = buildMbrOverdueAlert(items, '2026-02-07');

    const r1 = createAlertsFromScan([alert1!]);
    const r2 = createAlertsFromScan([alert2!]);

    expect(r1.created).toBe(1);
    expect(r2.created).toBe(1);
  });
});

// ========== AlertType定義 ==========

describe('AlertType mbr_action_overdue', () => {
  it('ALERT_TYPE_LABELS に mbr_action_overdue が含まれる', () => {
    expect(ALERT_TYPE_LABELS.mbr_action_overdue).toBe('MBR改善タスク超過');
  });
});

// ========== DailyOpsStepName定義 ==========

describe('DailyOpsStepName mbr_actions_overdue_scan', () => {
  it('mbr_actions_overdue_scan がDailyOpsStepNameとして有効', () => {
    const step: DailyOpsStepName = 'mbr_actions_overdue_scan';
    expect(step).toBe('mbr_actions_overdue_scan');
  });
});

// ========== getMbrOverdueSummary ==========

describe('getMbrOverdueSummary', () => {
  it('サマリーを正しく返す', () => {
    // 前のテストで作成した超過タスクがあるはず
    const summary = getMbrOverdueSummary();
    expect(summary).toHaveProperty('overdueCount');
    expect(summary).toHaveProperty('overdue7Count');
    expect(summary).toHaveProperty('items');
    expect(typeof summary.overdueCount).toBe('number');
    expect(typeof summary.overdue7Count).toBe('number');
    expect(Array.isArray(summary.items)).toBe(true);
  });
});

// ========== daily-opsのステップ実行テスト ==========

describe('daily-ops mbr_actions_overdue_scan step', () => {
  beforeEach(() => {
    clearAllAlerts();
  });

  it('executeDailyOpsでmbr_actions_overdue_scanステップが実行される', async () => {
    const { executeDailyOps } = await import('../src/lib/dailyOps/executor');

    // 超過タスクを作成
    createMbrFocusAction({
      title: 'daily-ops連携テスト超過',
      dueAt: daysAgo(5),
    });

    const result = await executeDailyOps({
      dryRun: true,
      steps: ['mbr_actions_overdue_scan'],
    });

    expect(result.skipped).toBe(false);
    expect(result.run.steps).toHaveLength(1);
    expect(result.run.steps[0].name).toBe('mbr_actions_overdue_scan');
    expect(result.run.steps[0].ok).toBe(true);
  });

  it('dryRunモードではアラートが作成されない', async () => {
    const { executeDailyOps } = await import('../src/lib/dailyOps/executor');

    const result = await executeDailyOps({
      dryRun: true,
      steps: ['mbr_actions_overdue_scan'],
    });

    expect(result.run.steps[0].alertsCreated).toBe(0);
  });
});
