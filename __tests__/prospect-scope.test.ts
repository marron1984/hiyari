/**
 * @jest-environment node
 */
import {
  PROSPECTS_ACTIVE_FROM,
  isActiveProspectByTime,
  applyProspectTimeScope,
  isProspectInFullScope,
  applyFullProspectScope,
} from '../src/lib/prospect';
import { Prospect, ProspectStatus } from '../src/types/prospect';

// テスト用のモックプロスペクト作成ヘルパー
function createMockProspect(overrides: Partial<Prospect> = {}): Prospect {
  return {
    id: 'test-id',
    tenantId: 'defaultTenant',
    status: '新規受付' as ProspectStatus,
    receivedAt: new Date('2026-01-15'),
    createdAt: new Date('2026-01-15'),
    ...overrides,
  };
}

describe('prospect-scope（時間ベース）', () => {
  describe('PROSPECTS_ACTIVE_FROM', () => {
    it('有効データ開始日時が2026-01-12 04:49 UTC (JST 13:49)であること', () => {
      expect(PROSPECTS_ACTIVE_FROM.toISOString()).toBe('2026-01-12T04:49:00.000Z');
    });
  });

  describe('isActiveProspectByTime', () => {
    it('receivedAt >= 2026-01-12 13:49 JST は有効', () => {
      const prospect = createMockProspect({
        receivedAt: new Date('2026-01-12T04:50:00.000Z'), // 2026-01-12 13:50 JST
      });
      expect(isActiveProspectByTime(prospect)).toBe(true);
    });

    it('receivedAt = 2026-01-12 04:49 UTC のちょうど境界値は有効', () => {
      const prospect = createMockProspect({
        receivedAt: new Date('2026-01-12T04:49:00.000Z'),
      });
      expect(isActiveProspectByTime(prospect)).toBe(true);
    });

    it('receivedAt > 境界日時 は有効', () => {
      const prospect = createMockProspect({
        receivedAt: new Date('2026-01-15T00:00:00.000Z'),
      });
      expect(isActiveProspectByTime(prospect)).toBe(true);
    });

    it('receivedAt < 境界日時 は無効', () => {
      const prospect = createMockProspect({
        receivedAt: new Date('2026-01-12T04:48:59.999Z'), // 境界の1秒前
      });
      expect(isActiveProspectByTime(prospect)).toBe(false);
    });

    it('receivedAt = 2026-01-01 は無効', () => {
      const prospect = createMockProspect({
        receivedAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      expect(isActiveProspectByTime(prospect)).toBe(false);
    });

    it('2025年のデータは無効', () => {
      const prospect = createMockProspect({
        receivedAt: new Date('2025-12-31T23:59:59.999Z'),
      });
      expect(isActiveProspectByTime(prospect)).toBe(false);
    });
  });

  describe('inquiryDateフォールバック', () => {
    it('receivedAtがなくinquiryDateが有効範囲内なら有効', () => {
      const prospect = createMockProspect({
        receivedAt: undefined as unknown as Date,
        inquiryDate: '2026-01-15',
        createdAt: new Date('2026-01-01'),
      });
      expect(isActiveProspectByTime(prospect)).toBe(true);
    });

    it('receivedAtがなくinquiryDateが範囲外なら無効', () => {
      const prospect = createMockProspect({
        receivedAt: undefined as unknown as Date,
        inquiryDate: '2026-01-01',
        createdAt: new Date('2026-01-01'),
      });
      expect(isActiveProspectByTime(prospect)).toBe(false);
    });
  });

  describe('createdAtフォールバック', () => {
    it('receivedAt/inquiryDateがなくcreatedAtが有効範囲内なら有効', () => {
      const prospect = createMockProspect({
        receivedAt: undefined as unknown as Date,
        inquiryDate: undefined,
        createdAt: new Date('2026-01-15'),
      });
      expect(isActiveProspectByTime(prospect)).toBe(true);
    });
  });

  describe('applyProspectTimeScope', () => {
    it('空配列は空配列を返す', () => {
      const result = applyProspectTimeScope([]);
      expect(result).toEqual([]);
    });

    it('有効な日時のもののみをフィルタリング', () => {
      const prospects = [
        createMockProspect({ id: '1', receivedAt: new Date('2026-01-01') }),
        createMockProspect({ id: '2', receivedAt: new Date('2026-01-10') }),
        createMockProspect({ id: '3', receivedAt: new Date('2026-01-12T04:49:00.000Z') }),
        createMockProspect({ id: '4', receivedAt: new Date('2026-01-15') }),
      ];

      const result = applyProspectTimeScope(prospects);

      expect(result.length).toBe(2);
      expect(result.map(p => p.id)).toEqual(['3', '4']);
    });

    it('全て有効な場合はすべて返す', () => {
      const prospects = [
        createMockProspect({ receivedAt: new Date('2026-01-15') }),
        createMockProspect({ receivedAt: new Date('2026-01-20') }),
        createMockProspect({ receivedAt: new Date('2026-02-01') }),
      ];

      const result = applyProspectTimeScope(prospects);

      expect(result.length).toBe(3);
    });

    it('全て無効な場合は空配列を返す', () => {
      const prospects = [
        createMockProspect({ receivedAt: new Date('2025-12-01') }),
        createMockProspect({ receivedAt: new Date('2026-01-01') }),
        createMockProspect({ receivedAt: new Date('2026-01-10') }),
      ];

      const result = applyProspectTimeScope(prospects);

      expect(result.length).toBe(0);
    });
  });

  describe('ステータスとの組み合わせ', () => {
    it('クローズでも有効な日時なら時間スコープ内', () => {
      const prospect = createMockProspect({
        receivedAt: new Date('2026-01-15'),
        status: 'クローズ' as ProspectStatus,
      });
      expect(isActiveProspectByTime(prospect)).toBe(true);
    });

    it('入居決定でも範囲外日時なら時間スコープ外', () => {
      const prospect = createMockProspect({
        receivedAt: new Date('2026-01-01'),
        status: '入居決定' as ProspectStatus,
      });
      expect(isActiveProspectByTime(prospect)).toBe(false);
    });

    it('新規受付で有効日時なら時間スコープ内', () => {
      const prospect = createMockProspect({
        receivedAt: new Date('2026-01-15'),
        status: '新規受付' as ProspectStatus,
      });
      expect(isActiveProspectByTime(prospect)).toBe(true);
    });
  });
});

describe('isProspectInFullScope', () => {
  it('時間スコープ内のProspectは完全スコープ内', () => {
    const prospect = createMockProspect({
      receivedAt: new Date('2026-01-15'),
    });
    expect(isProspectInFullScope(prospect)).toBe(true);
  });

  it('時間スコープ外のProspectは完全スコープ外', () => {
    const prospect = createMockProspect({
      receivedAt: new Date('2026-01-01'),
    });
    expect(isProspectInFullScope(prospect)).toBe(false);
  });
});

describe('applyFullProspectScope', () => {
  it('時間スコープのみでフィルタリング', () => {
    const prospects = [
      createMockProspect({ id: '1', receivedAt: new Date('2026-01-01') }),
      createMockProspect({ id: '2', receivedAt: new Date('2026-01-15') }),
    ];

    const result = applyFullProspectScope(prospects);

    expect(result.length).toBe(1);
    expect(result[0].id).toBe('2');
  });
});
