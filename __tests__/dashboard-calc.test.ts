// ======== ダッシュボード計算ユーティリティのテスト ========

import {
  safeRate,
  formatPercent,
  formatFraction,
  formatNumber,
  calcOccupancyRate,
  calcCvRate,
  calcInterventionRate,
  extractIndexUrl,
  toDashboardError,
} from '../src/lib/dashboard/calc';

describe('dashboard/calc', () => {
  describe('safeRate', () => {
    it('分母が0の場合はnullを返す', () => {
      expect(safeRate(0, 0)).toBe(null);
      expect(safeRate(5, 0)).toBe(null);
    });

    it('正常な計算ができる', () => {
      expect(safeRate(1, 2)).toBe(50);
      expect(safeRate(1, 4)).toBe(25);
      expect(safeRate(3, 4)).toBe(75);
    });

    it('100%を正しく計算する', () => {
      expect(safeRate(10, 10)).toBe(100);
    });

    it('0%を正しく計算する', () => {
      expect(safeRate(0, 10)).toBe(0);
    });

    it('四捨五入される', () => {
      expect(safeRate(1, 3)).toBe(33); // 33.33... → 33
      expect(safeRate(2, 3)).toBe(67); // 66.66... → 67
    });

    it('分母がInfinityの場合はnullを返す', () => {
      expect(safeRate(1, Infinity)).toBe(null);
    });

    it('分母がNaNの場合はnullを返す', () => {
      expect(safeRate(1, NaN)).toBe(null);
    });
  });

  describe('formatPercent', () => {
    it('nullの場合は"--"を返す', () => {
      expect(formatPercent(null)).toBe('--');
    });

    it('undefinedの場合は"--"を返す', () => {
      expect(formatPercent(undefined)).toBe('--');
    });

    it('数値の場合は"%"付きで返す', () => {
      expect(formatPercent(50)).toBe('50%');
      expect(formatPercent(0)).toBe('0%');
      expect(formatPercent(100)).toBe('100%');
    });

    it('NaNの場合は"--"を返す', () => {
      expect(formatPercent(NaN)).toBe('--');
    });

    it('Infinityの場合は"--"を返す', () => {
      expect(formatPercent(Infinity)).toBe('--');
    });
  });

  describe('formatFraction', () => {
    it('分母が0の場合は"--"を返す', () => {
      expect(formatFraction(0, 0)).toBe('--');
      expect(formatFraction(5, 0)).toBe('--');
    });

    it('正常な分数を返す', () => {
      expect(formatFraction(3, 5)).toBe('3/5');
      expect(formatFraction(0, 10)).toBe('0/10');
    });

    it('分母がInfinityの場合は"--"を返す', () => {
      expect(formatFraction(1, Infinity)).toBe('--');
    });
  });

  describe('formatNumber', () => {
    it('nullの場合は"--"を返す', () => {
      expect(formatNumber(null)).toBe('--');
    });

    it('undefinedの場合は"--"を返す', () => {
      expect(formatNumber(undefined)).toBe('--');
    });

    it('数値を文字列で返す', () => {
      expect(formatNumber(42)).toBe('42');
      expect(formatNumber(0)).toBe('0');
    });

    it('NaNの場合は"--"を返す', () => {
      expect(formatNumber(NaN)).toBe('--');
    });
  });

  describe('calcOccupancyRate', () => {
    it('定員が0の場合はnullを返す', () => {
      expect(calcOccupancyRate(0, 0)).toBe(null);
    });

    it('稼働率を正しく計算する', () => {
      // 定員10, 空室2 → 入居8 → 80%
      expect(calcOccupancyRate(10, 2)).toBe(80);
      // 定員10, 空室0 → 入居10 → 100%
      expect(calcOccupancyRate(10, 0)).toBe(100);
      // 定員10, 空室10 → 入居0 → 0%
      expect(calcOccupancyRate(10, 10)).toBe(0);
    });
  });

  describe('calcCvRate', () => {
    it('総案件数が0の場合はnullを返す', () => {
      expect(calcCvRate(0, 0)).toBe(null);
    });

    it('CV率を正しく計算する', () => {
      expect(calcCvRate(5, 10)).toBe(50);
      expect(calcCvRate(0, 10)).toBe(0);
      expect(calcCvRate(10, 10)).toBe(100);
    });
  });

  describe('calcInterventionRate', () => {
    it('総介入数が0の場合はnullを返す（100%ではない）', () => {
      expect(calcInterventionRate(0, 0)).toBe(null);
    });

    it('介入実施率を正しく計算する', () => {
      expect(calcInterventionRate(8, 10)).toBe(80);
      expect(calcInterventionRate(0, 10)).toBe(0);
      expect(calcInterventionRate(10, 10)).toBe(100);
    });
  });

  describe('extractIndexUrl', () => {
    it('FirebaseエラーからインデックスURLを抽出する', () => {
      const error = new Error(
        'The query requires an index. You can create it here: https://console.firebase.google.com/v1/r/project/test/firestore/indexes'
      );
      expect(extractIndexUrl(error)).toBe(
        'https://console.firebase.google.com/v1/r/project/test/firestore/indexes'
      );
    });

    it('URLがない場合はundefinedを返す', () => {
      const error = new Error('Some other error');
      expect(extractIndexUrl(error)).toBeUndefined();
    });

    it('Error以外の値の場合はundefinedを返す', () => {
      expect(extractIndexUrl('string error')).toBeUndefined();
      expect(extractIndexUrl(null)).toBeUndefined();
    });
  });

  describe('toDashboardError', () => {
    it('インデックス必須エラーを正しく変換する', () => {
      const error = new Error(
        'The query requires an index. You can create it here: https://console.firebase.google.com/v1/r/project/test/firestore/indexes'
      );
      const result = toDashboardError(error);
      expect(result.code).toBe('INDEX_REQUIRED');
      expect(result.createIndexUrl).toBe(
        'https://console.firebase.google.com/v1/r/project/test/firestore/indexes'
      );
    });

    it('権限エラーを正しく変換する', () => {
      const error = new Error('permission-denied');
      const result = toDashboardError(error);
      expect(result.code).toBe('PERMISSION_DENIED');
    });

    it('不明なエラーをUNKNOWNとして変換する', () => {
      const error = new Error('Unknown error');
      const result = toDashboardError(error);
      expect(result.code).toBe('UNKNOWN');
      expect(result.message).toBe('Unknown error');
    });
  });
});
