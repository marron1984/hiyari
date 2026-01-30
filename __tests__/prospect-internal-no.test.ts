/**
 * 入居希望者 internal_no 自動付番・KPIスコープのUnit test
 *
 * テスト対象:
 * 1. isKpiTargetInternalNo: internal_noがKPI対象（251以上）かの判定
 * 2. isProspectKpiTarget: ProspectがKPI対象かの判定
 * 3. applyProspectKpiScope: Prospect配列にKPIスコープを適用
 */

import {
  isKpiTargetInternalNo,
  isProspectKpiTarget,
  applyProspectKpiScope,
  KPI_MIN_INTERNAL_NO,
} from '@/lib/prospect';
import type { Prospect, ProspectStatus } from '@/types/prospect';

// テスト用のProspectを作成するヘルパー
function createMockProspect(internalNo: string | number | undefined | null): Prospect {
  return {
    id: 'test-id',
    tenantId: 'defaultTenant',
    status: '新規受付' as ProspectStatus,
    receivedAt: new Date(),
    createdAt: new Date(),
    internalNo: internalNo as string | undefined,
  } as Prospect;
}

describe('KPI_MIN_INTERNAL_NO', () => {
  test('KPI_MIN_INTERNAL_NOは251', () => {
    expect(KPI_MIN_INTERNAL_NO).toBe(251);
  });
});

describe('isKpiTargetInternalNo', () => {
  test('undefined はKPI対象外', () => {
    expect(isKpiTargetInternalNo(undefined)).toBe(false);
  });

  test('null はKPI対象外', () => {
    expect(isKpiTargetInternalNo(null)).toBe(false);
  });

  test('空文字 はKPI対象外', () => {
    expect(isKpiTargetInternalNo('')).toBe(false);
  });

  test('250 はKPI対象外', () => {
    expect(isKpiTargetInternalNo(250)).toBe(false);
    expect(isKpiTargetInternalNo('250')).toBe(false);
  });

  test('251 はKPI対象', () => {
    expect(isKpiTargetInternalNo(251)).toBe(true);
    expect(isKpiTargetInternalNo('251')).toBe(true);
  });

  test('100 はKPI対象外', () => {
    expect(isKpiTargetInternalNo(100)).toBe(false);
    expect(isKpiTargetInternalNo('100')).toBe(false);
  });

  test('0 はKPI対象外', () => {
    expect(isKpiTargetInternalNo(0)).toBe(false);
    expect(isKpiTargetInternalNo('0')).toBe(false);
  });

  test('252 はKPI対象', () => {
    expect(isKpiTargetInternalNo(252)).toBe(true);
    expect(isKpiTargetInternalNo('252')).toBe(true);
  });

  test('500 はKPI対象', () => {
    expect(isKpiTargetInternalNo(500)).toBe(true);
    expect(isKpiTargetInternalNo('500')).toBe(true);
  });

  test('数値でない文字列 はKPI対象外', () => {
    expect(isKpiTargetInternalNo('abc')).toBe(false);
    expect(isKpiTargetInternalNo('IMPORT-123')).toBe(false);
  });
});

describe('isProspectKpiTarget', () => {
  test('internal_no=251 のProspectはKPI対象', () => {
    const prospect = createMockProspect('251');
    expect(isProspectKpiTarget(prospect)).toBe(true);
  });

  test('internal_no=252 のProspectはKPI対象', () => {
    const prospect = createMockProspect('252');
    expect(isProspectKpiTarget(prospect)).toBe(true);
  });

  test('internal_no=250 のProspectはKPI対象外', () => {
    const prospect = createMockProspect('250');
    expect(isProspectKpiTarget(prospect)).toBe(false);
  });

  test('internal_no=undefined のProspectはKPI対象外', () => {
    const prospect = createMockProspect(undefined);
    expect(isProspectKpiTarget(prospect)).toBe(false);
  });
});

describe('applyProspectKpiScope', () => {
  test('空配列は空配列を返す', () => {
    const result = applyProspectKpiScope([]);
    expect(result).toEqual([]);
  });

  test('KPI対象のみをフィルタリング', () => {
    const prospects = [
      createMockProspect('249'),
      createMockProspect('250'),
      createMockProspect('251'),
      createMockProspect('252'),
      createMockProspect(undefined),
    ];

    const result = applyProspectKpiScope(prospects);

    expect(result.length).toBe(2);
    expect(result[0].internalNo).toBe('251');
    expect(result[1].internalNo).toBe('252');
  });

  test('全てKPI対象の場合はすべて返す', () => {
    const prospects = [
      createMockProspect('251'),
      createMockProspect('300'),
      createMockProspect('500'),
    ];

    const result = applyProspectKpiScope(prospects);

    expect(result.length).toBe(3);
  });

  test('全てKPI対象外の場合は空配列を返す', () => {
    const prospects = [
      createMockProspect('100'),
      createMockProspect('200'),
      createMockProspect('250'),
      createMockProspect(undefined),
    ];

    const result = applyProspectKpiScope(prospects);

    expect(result.length).toBe(0);
  });

  test('元の配列は変更されない（イミュータブル）', () => {
    const prospects = [
      createMockProspect('250'),
      createMockProspect('251'),
    ];
    const originalLength = prospects.length;

    applyProspectKpiScope(prospects);

    expect(prospects.length).toBe(originalLength);
  });
});

describe('自動付番ルール', () => {
  test('KPI_MIN_INTERNAL_NO - 1 = 250 が境界値', () => {
    // カウンタが250以下なら、次は251から開始する
    expect(KPI_MIN_INTERNAL_NO - 1).toBe(250);
  });

  test('251が最初のKPI対象番号', () => {
    expect(isKpiTargetInternalNo(KPI_MIN_INTERNAL_NO)).toBe(true);
    expect(isKpiTargetInternalNo(KPI_MIN_INTERNAL_NO - 1)).toBe(false);
  });
});
