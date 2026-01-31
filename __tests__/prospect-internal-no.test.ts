/**
 * 入居希望者 時間ベーススコープのUnit test
 *
 * テスト対象:
 * 1. isActiveProspectByTime: Prospectが時間スコープ内かの判定
 * 2. getProspectBaseDate: 基準日時を取得（receivedAt > inquiryDate > createdAt）
 * 3. applyProspectTimeScope: Prospect配列に時間スコープを適用
 *
 * 注意: internal_no によるスコープは廃止され、
 * 2026-01-12 13:49 JST 以降の時間ベーススコープのみを使用
 */

import {
  PROSPECTS_ACTIVE_FROM,
  isActiveProspectByTime,
  getProspectBaseDate,
  applyProspectTimeScope,
} from '@/lib/prospect';
import type { Prospect, ProspectStatus } from '@/types/prospect';

// テスト用のProspectを作成するヘルパー
function createMockProspect(overrides: Partial<Prospect> = {}): Prospect {
  return {
    id: 'test-id',
    tenantId: 'defaultTenant',
    status: '新規受付' as ProspectStatus,
    receivedAt: new Date('2026-01-15'),
    createdAt: new Date('2026-01-15'),
    ...overrides,
  } as Prospect;
}

describe('PROSPECTS_ACTIVE_FROM', () => {
  test('有効データ開始日時は2026-01-12 04:49 UTC', () => {
    expect(PROSPECTS_ACTIVE_FROM.toISOString()).toBe('2026-01-12T04:49:00.000Z');
  });

  test('JSTでは2026-01-12 13:49', () => {
    // UTCから9時間加算でJST
    const jstHour = PROSPECTS_ACTIVE_FROM.getUTCHours() + 9;
    expect(jstHour).toBe(13);
    expect(PROSPECTS_ACTIVE_FROM.getUTCMinutes()).toBe(49);
  });
});

describe('getProspectBaseDate', () => {
  test('receivedAtが最優先', () => {
    const prospect = createMockProspect({
      receivedAt: new Date('2026-01-20'),
      inquiryDate: '2026-01-15',
      createdAt: new Date('2026-01-10'),
    });
    const baseDate = getProspectBaseDate(prospect);
    expect(baseDate.toISOString()).toBe('2026-01-20T00:00:00.000Z');
  });

  test('receivedAtがなければinquiryDateを使用', () => {
    const prospect = createMockProspect({
      receivedAt: undefined as unknown as Date,
      inquiryDate: '2026-01-15',
      createdAt: new Date('2026-01-10'),
    });
    const baseDate = getProspectBaseDate(prospect);
    expect(baseDate.toISOString().startsWith('2026-01-15')).toBe(true);
  });

  test('receivedAt/inquiryDateがなければcreatedAtを使用', () => {
    const prospect = createMockProspect({
      receivedAt: undefined as unknown as Date,
      inquiryDate: undefined,
      createdAt: new Date('2026-01-10'),
    });
    const baseDate = getProspectBaseDate(prospect);
    expect(baseDate.toISOString()).toBe('2026-01-10T00:00:00.000Z');
  });
});

describe('isActiveProspectByTime', () => {
  test('境界日時ちょうどは有効', () => {
    const prospect = createMockProspect({
      receivedAt: new Date('2026-01-12T04:49:00.000Z'),
    });
    expect(isActiveProspectByTime(prospect)).toBe(true);
  });

  test('境界日時の1ms後は有効', () => {
    const prospect = createMockProspect({
      receivedAt: new Date('2026-01-12T04:49:00.001Z'),
    });
    expect(isActiveProspectByTime(prospect)).toBe(true);
  });

  test('境界日時の1ms前は無効', () => {
    const prospect = createMockProspect({
      receivedAt: new Date('2026-01-12T04:48:59.999Z'),
    });
    expect(isActiveProspectByTime(prospect)).toBe(false);
  });

  test('2025年のデータは無効', () => {
    const prospect = createMockProspect({
      receivedAt: new Date('2025-12-31'),
    });
    expect(isActiveProspectByTime(prospect)).toBe(false);
  });

  test('2026-01-01のデータは無効（境界日時より前）', () => {
    const prospect = createMockProspect({
      receivedAt: new Date('2026-01-01'),
    });
    expect(isActiveProspectByTime(prospect)).toBe(false);
  });

  test('2026-01-15のデータは有効', () => {
    const prospect = createMockProspect({
      receivedAt: new Date('2026-01-15'),
    });
    expect(isActiveProspectByTime(prospect)).toBe(true);
  });

  test('2026-02-01のデータは有効', () => {
    const prospect = createMockProspect({
      receivedAt: new Date('2026-02-01'),
    });
    expect(isActiveProspectByTime(prospect)).toBe(true);
  });
});

describe('applyProspectTimeScope', () => {
  test('空配列は空配列を返す', () => {
    const result = applyProspectTimeScope([]);
    expect(result).toEqual([]);
  });

  test('有効なProspectのみをフィルタリング', () => {
    const prospects = [
      createMockProspect({ id: 'old-1', receivedAt: new Date('2026-01-01') }),
      createMockProspect({ id: 'old-2', receivedAt: new Date('2026-01-10') }),
      createMockProspect({ id: 'new-1', receivedAt: new Date('2026-01-15') }),
      createMockProspect({ id: 'new-2', receivedAt: new Date('2026-01-20') }),
    ];

    const result = applyProspectTimeScope(prospects);

    expect(result.length).toBe(2);
    expect(result.map(p => p.id)).toEqual(['new-1', 'new-2']);
  });

  test('全て有効な場合はすべて返す', () => {
    const prospects = [
      createMockProspect({ receivedAt: new Date('2026-01-15') }),
      createMockProspect({ receivedAt: new Date('2026-01-20') }),
      createMockProspect({ receivedAt: new Date('2026-02-01') }),
    ];

    const result = applyProspectTimeScope(prospects);

    expect(result.length).toBe(3);
  });

  test('全て無効な場合は空配列を返す', () => {
    const prospects = [
      createMockProspect({ receivedAt: new Date('2025-12-01') }),
      createMockProspect({ receivedAt: new Date('2026-01-01') }),
      createMockProspect({ receivedAt: new Date('2026-01-10') }),
    ];

    const result = applyProspectTimeScope(prospects);

    expect(result.length).toBe(0);
  });

  test('元の配列は変更されない（イミュータブル）', () => {
    const prospects = [
      createMockProspect({ receivedAt: new Date('2026-01-01') }),
      createMockProspect({ receivedAt: new Date('2026-01-15') }),
    ];
    const originalLength = prospects.length;

    applyProspectTimeScope(prospects);

    expect(prospects.length).toBe(originalLength);
  });
});

describe('KPI対象判定（時間ベース）', () => {
  test('境界日時以降のデータのみがKPI対象', () => {
    const oldProspect = createMockProspect({ receivedAt: new Date('2026-01-01') });
    const newProspect = createMockProspect({ receivedAt: new Date('2026-01-15') });

    expect(isActiveProspectByTime(oldProspect)).toBe(false);
    expect(isActiveProspectByTime(newProspect)).toBe(true);
  });
});
