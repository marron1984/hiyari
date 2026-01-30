/**
 * 入居希望者 時間ベーススコープのUnit test
 *
 * テスト対象:
 * 1. isActiveProspectByTime: 受信日時が2026-01-12 13:49以降かの判定
 * 2. applyProspectTimeScope: 時間スコープを配列に適用
 * 3. isProspectInFullScope: 時間 + internal_no の完全スコープ判定
 * 4. applyFullProspectScope: 完全スコープを配列に適用
 */

import {
  isActiveProspectByTime,
  applyProspectTimeScope,
  isProspectInFullScope,
  applyFullProspectScope,
  getProspectBaseDate,
  PROSPECTS_ACTIVE_FROM,
  PROSPECTS_ACTIVE_FROM_DISPLAY,
} from '@/lib/prospect';
import type { Prospect, ProspectStatus } from '@/types/prospect';

// テスト用のProspectを作成するヘルパー
function createMockProspectWithDate(
  receivedAt: Date,
  internalNo?: string
): Prospect {
  return {
    id: 'test-id',
    tenantId: 'defaultTenant',
    status: '新規受付' as ProspectStatus,
    receivedAt,
    createdAt: receivedAt,
    internalNo,
  } as Prospect;
}

describe('PROSPECTS_ACTIVE_FROM', () => {
  test('PROSPECTS_ACTIVE_FROMは2026-01-12 04:49 UTC', () => {
    expect(PROSPECTS_ACTIVE_FROM.toISOString()).toBe('2026-01-12T04:49:00.000Z');
  });

  test('PROSPECTS_ACTIVE_FROM_DISPLAYは2026-01-12 13:49', () => {
    expect(PROSPECTS_ACTIVE_FROM_DISPLAY).toBe('2026-01-12 13:49');
  });
});

describe('getProspectBaseDate', () => {
  test('receivedAtが最優先', () => {
    const receivedAt = new Date('2026-01-15T00:00:00Z');
    const createdAt = new Date('2026-01-01T00:00:00Z');
    const prospect = {
      ...createMockProspectWithDate(receivedAt),
      createdAt,
      inquiryDate: '2026-01-05',
    } as Prospect;

    const result = getProspectBaseDate(prospect);
    expect(result).toEqual(receivedAt);
  });

  test('receivedAtがない場合はinquiryDateを使用', () => {
    const prospect = {
      id: 'test-id',
      tenantId: 'defaultTenant',
      status: '新規受付' as ProspectStatus,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      inquiryDate: '2026-01-10',
    } as Prospect;

    const result = getProspectBaseDate(prospect);
    expect(result.toISOString().slice(0, 10)).toBe('2026-01-10');
  });

  test('receivedAtもinquiryDateもない場合はcreatedAtを使用', () => {
    const createdAt = new Date('2026-01-01T00:00:00Z');
    const prospect = {
      id: 'test-id',
      tenantId: 'defaultTenant',
      status: '新規受付' as ProspectStatus,
      createdAt,
    } as Prospect;

    const result = getProspectBaseDate(prospect);
    expect(result).toEqual(createdAt);
  });
});

describe('isActiveProspectByTime', () => {
  test('2026-01-12 13:49 JSTちょうどは有効', () => {
    // 2026-01-12 13:49 JST = 2026-01-12 04:49 UTC
    const prospect = createMockProspectWithDate(
      new Date('2026-01-12T04:49:00.000Z')
    );
    expect(isActiveProspectByTime(prospect)).toBe(true);
  });

  test('2026-01-12 13:49 JST以降は有効', () => {
    const prospect = createMockProspectWithDate(
      new Date('2026-01-12T05:00:00.000Z')
    );
    expect(isActiveProspectByTime(prospect)).toBe(true);
  });

  test('2026-01-12 13:48 JSTは無効', () => {
    // 2026-01-12 13:48 JST = 2026-01-12 04:48 UTC
    const prospect = createMockProspectWithDate(
      new Date('2026-01-12T04:48:00.000Z')
    );
    expect(isActiveProspectByTime(prospect)).toBe(false);
  });

  test('2026-01-01は無効', () => {
    const prospect = createMockProspectWithDate(
      new Date('2026-01-01T00:00:00.000Z')
    );
    expect(isActiveProspectByTime(prospect)).toBe(false);
  });

  test('2026-01-15は有効', () => {
    const prospect = createMockProspectWithDate(
      new Date('2026-01-15T00:00:00.000Z')
    );
    expect(isActiveProspectByTime(prospect)).toBe(true);
  });

  test('2025年のデータは無効', () => {
    const prospect = createMockProspectWithDate(
      new Date('2025-12-31T23:59:59.000Z')
    );
    expect(isActiveProspectByTime(prospect)).toBe(false);
  });
});

describe('applyProspectTimeScope', () => {
  test('空配列は空配列を返す', () => {
    const result = applyProspectTimeScope([]);
    expect(result).toEqual([]);
  });

  test('時間スコープ内のみをフィルタリング', () => {
    const prospects = [
      createMockProspectWithDate(new Date('2026-01-01T00:00:00Z')), // 無効
      createMockProspectWithDate(new Date('2026-01-12T04:48:00Z')), // 無効
      createMockProspectWithDate(new Date('2026-01-12T04:49:00Z')), // 有効
      createMockProspectWithDate(new Date('2026-01-15T00:00:00Z')), // 有効
    ];

    const result = applyProspectTimeScope(prospects);

    expect(result.length).toBe(2);
  });
});

describe('isProspectInFullScope', () => {
  test('時間スコープ内 + internal_no >= 251 は有効', () => {
    const prospect = createMockProspectWithDate(
      new Date('2026-01-15T00:00:00Z'),
      '251'
    );
    expect(isProspectInFullScope(prospect)).toBe(true);
  });

  test('時間スコープ内 + internal_no < 251 は無効', () => {
    const prospect = createMockProspectWithDate(
      new Date('2026-01-15T00:00:00Z'),
      '250'
    );
    expect(isProspectInFullScope(prospect)).toBe(false);
  });

  test('時間スコープ外 + internal_no >= 251 は無効', () => {
    const prospect = createMockProspectWithDate(
      new Date('2026-01-01T00:00:00Z'),
      '251'
    );
    expect(isProspectInFullScope(prospect)).toBe(false);
  });

  test('時間スコープ外 + internal_no未設定 は無効', () => {
    const prospect = createMockProspectWithDate(
      new Date('2026-01-01T00:00:00Z')
    );
    expect(isProspectInFullScope(prospect)).toBe(false);
  });

  test('時間スコープ内 + internal_no未設定 は無効', () => {
    const prospect = createMockProspectWithDate(
      new Date('2026-01-15T00:00:00Z')
    );
    expect(isProspectInFullScope(prospect)).toBe(false);
  });
});

describe('applyFullProspectScope', () => {
  test('空配列は空配列を返す', () => {
    const result = applyFullProspectScope([]);
    expect(result).toEqual([]);
  });

  test('完全スコープを適用', () => {
    const prospects = [
      // 時間外 + 番号OK → 無効
      createMockProspectWithDate(new Date('2026-01-01T00:00:00Z'), '251'),
      // 時間OK + 番号NG → 無効
      createMockProspectWithDate(new Date('2026-01-15T00:00:00Z'), '250'),
      // 時間OK + 番号OK → 有効
      createMockProspectWithDate(new Date('2026-01-15T00:00:00Z'), '251'),
      // 時間OK + 番号OK → 有効
      createMockProspectWithDate(new Date('2026-01-20T00:00:00Z'), '300'),
      // 時間OK + 番号なし → 無効
      createMockProspectWithDate(new Date('2026-01-15T00:00:00Z')),
    ];

    const result = applyFullProspectScope(prospects);

    expect(result.length).toBe(2);
    expect(result[0].internalNo).toBe('251');
    expect(result[1].internalNo).toBe('300');
  });

  test('全て完全スコープ対象の場合はすべて返す', () => {
    const prospects = [
      createMockProspectWithDate(new Date('2026-01-15T00:00:00Z'), '251'),
      createMockProspectWithDate(new Date('2026-01-20T00:00:00Z'), '252'),
      createMockProspectWithDate(new Date('2026-02-01T00:00:00Z'), '300'),
    ];

    const result = applyFullProspectScope(prospects);

    expect(result.length).toBe(3);
  });

  test('全てスコープ外の場合は空配列を返す', () => {
    const prospects = [
      createMockProspectWithDate(new Date('2026-01-01T00:00:00Z'), '251'),
      createMockProspectWithDate(new Date('2026-01-15T00:00:00Z'), '100'),
      createMockProspectWithDate(new Date('2026-01-05T00:00:00Z')),
    ];

    const result = applyFullProspectScope(prospects);

    expect(result.length).toBe(0);
  });
});

describe('スコープ境界テスト', () => {
  test('2026-01-12 13:49:00 JST はスコープ内', () => {
    const borderDate = new Date('2026-01-12T04:49:00.000Z');
    const prospect = createMockProspectWithDate(borderDate, '251');

    expect(isActiveProspectByTime(prospect)).toBe(true);
    expect(isProspectInFullScope(prospect)).toBe(true);
  });

  test('2026-01-12 13:48:59 JST はスコープ外', () => {
    const borderDate = new Date('2026-01-12T04:48:59.000Z');
    const prospect = createMockProspectWithDate(borderDate, '251');

    expect(isActiveProspectByTime(prospect)).toBe(false);
    expect(isProspectInFullScope(prospect)).toBe(false);
  });
});
