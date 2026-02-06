/**
 * @jest-environment node
 */

/**
 * Ticket 129: MBR改善タスク進捗フィードバック テスト
 *
 * テスト対象:
 * 1. extractMonthFromSourceId: sourceIdから月を抽出
 * 2. getRecentMonths: 過去N月分のリスト
 * 3. buildImprovementProgress: 改善進捗集計
 * 4. generateMbr: improvementProgress セクション含有
 */

import {
  extractMonthFromSourceId,
  getRecentMonths,
  buildImprovementProgress,
} from '../src/lib/mbr/buildImprovementProgress';
import { create as createCA } from '../src/lib/correctiveActions/repo';
import { generateMbr } from '../src/lib/mbr/generateMbr';

// ========== extractMonthFromSourceId ==========

describe('extractMonthFromSourceId', () => {
  it('正しいフォーマットから月を抽出する', () => {
    expect(extractMonthFromSourceId('mbr:2025-01:abc123')).toBe('2025-01');
  });

  it('異なる月を正しく抽出する', () => {
    expect(extractMonthFromSourceId('mbr:2024-12:xyz')).toBe('2024-12');
  });

  it('nullを返す（null入力）', () => {
    expect(extractMonthFromSourceId(null)).toBeNull();
  });

  it('nullを返す（不正フォーマット）', () => {
    expect(extractMonthFromSourceId('invalid')).toBeNull();
  });

  it('nullを返す（空文字）', () => {
    expect(extractMonthFromSourceId('')).toBeNull();
  });
});

// ========== getRecentMonths ==========

describe('getRecentMonths', () => {
  it('3ヶ月分を返す', () => {
    const months = getRecentMonths('2025-03', 3);
    expect(months).toEqual(['2025-03', '2025-02', '2025-01']);
  });

  it('年をまたぐ場合も正しい', () => {
    const months = getRecentMonths('2025-02', 3);
    expect(months).toEqual(['2025-02', '2025-01', '2024-12']);
  });

  it('1ヶ月分を返す', () => {
    const months = getRecentMonths('2025-06', 1);
    expect(months).toEqual(['2025-06']);
  });
});

// ========== buildImprovementProgress ==========

describe('buildImprovementProgress', () => {
  it('MBR改善タスクがない場合、全て0を返す', () => {
    const result = buildImprovementProgress('2050-01');
    expect(result.totalTasks).toBe(0);
    expect(result.totalDone).toBe(0);
    expect(result.overallCompletionRate).toBe(0);
    expect(result.blockedTop).toEqual([]);
    expect(result.overdueTop).toEqual([]);
    expect(result.blockedTopReasons).toEqual([]);
    expect(result.byMonth).toHaveLength(3);
  });

  it('byMonthが3ヶ月分ある', () => {
    const result = buildImprovementProgress('2050-06');
    expect(result.byMonth).toHaveLength(3);
    expect(result.byMonth[0].month).toBe('2050-06');
    expect(result.byMonth[1].month).toBe('2050-05');
    expect(result.byMonth[2].month).toBe('2050-04');
  });

  it('sourceType=mbr_focus の是正措置を集計する', () => {
    // テスト用MBR改善タスクを作成
    createCA(
      {
        title: '[MBR改善] 2050-10 テスト改善A',
        description: 'テスト',
        severity: 'major',
        sourceType: 'mbr_focus',
        sourceId: 'mbr:2050-10:aaa',
      },
      'user_admin'
    );
    createCA(
      {
        title: '[MBR改善] 2050-10 テスト改善B',
        description: 'テスト',
        severity: 'major',
        sourceType: 'mbr_focus',
        sourceId: 'mbr:2050-10:bbb',
      },
      'user_admin'
    );

    const result = buildImprovementProgress('2050-10');
    expect(result.totalTasks).toBe(2);
    // 両方 open 状態なので done は 0
    expect(result.totalDone).toBe(0);
    expect(result.overallCompletionRate).toBe(0);

    // 月別集計
    const monthData = result.byMonth.find((m) => m.month === '2050-10');
    expect(monthData).toBeDefined();
    expect(monthData!.total).toBe(2);
    expect(monthData!.openCount).toBe(2);
  });

  it('sourceType=manual の是正措置は集計しない', () => {
    createCA(
      {
        title: '通常の是正措置',
        description: 'テスト',
        severity: 'minor',
        sourceType: 'manual',
        sourceId: null,
      },
      'user_admin'
    );

    const result = buildImprovementProgress('2050-11');
    // mbr_focus でないので含まれない
    const monthData = result.byMonth.find((m) => m.month === '2050-11');
    expect(monthData!.total).toBe(0);
  });

  it('対象月外のタスクは月別集計に含まれない', () => {
    createCA(
      {
        title: '[MBR改善] 2050-12 別月タスク',
        description: 'テスト',
        severity: 'major',
        sourceType: 'mbr_focus',
        sourceId: 'mbr:2050-12:ccc',
      },
      'user_admin'
    );

    // 2050-09 でビルド → 2050-12 は対象外
    const result = buildImprovementProgress('2050-09');
    const monthData = result.byMonth.find((m) => m.month === '2050-12');
    // 2050-12 は byMonth に含まれない（2050-09, 2050-08, 2050-07 のみ）
    expect(monthData).toBeUndefined();
  });
});

// ========== generateMbr 統合テスト ==========

describe('generateMbr improvementProgress統合', () => {
  it('improvementProgressセクションが生成される', () => {
    const mbr = generateMbr('2025-01');
    expect(mbr.sections.improvementProgress).toBeDefined();
    expect(typeof mbr.sections.improvementProgress.totalTasks).toBe('number');
    expect(typeof mbr.sections.improvementProgress.totalDone).toBe('number');
    expect(typeof mbr.sections.improvementProgress.overallCompletionRate).toBe('number');
    expect(Array.isArray(mbr.sections.improvementProgress.byMonth)).toBe(true);
    expect(Array.isArray(mbr.sections.improvementProgress.blockedTop)).toBe(true);
    expect(Array.isArray(mbr.sections.improvementProgress.overdueTop)).toBe(true);
    expect(Array.isArray(mbr.sections.improvementProgress.blockedTopReasons)).toBe(true);
  });

  it('byMonthが3ヶ月分の構造を持つ', () => {
    const mbr = generateMbr('2025-06');
    expect(mbr.sections.improvementProgress.byMonth).toHaveLength(3);
    for (const m of mbr.sections.improvementProgress.byMonth) {
      expect(m.month).toBeTruthy();
      expect(typeof m.openCount).toBe('number');
      expect(typeof m.inProgressCount).toBe('number');
      expect(typeof m.completedCount).toBe('number');
      expect(typeof m.completionRate).toBe('number');
      expect(typeof m.overdueCount).toBe('number');
      expect(typeof m.total).toBe('number');
    }
  });
});
