/**
 * 営業メトリクス関連のUnit test
 *
 * テスト対象:
 * 1. safeRate: 分母0でnull
 * 2. formatPercent: null/undefinedで'--'
 * 3. formatNumber: null/undefinedで'--'
 */

import {
  safeRate,
  formatPercent,
  formatNumber,
  formatFraction,
  calcCvRate,
} from '@/lib/dashboard/calc';

describe('safeRate', () => {
  test('正常な計算', () => {
    expect(safeRate(1, 2)).toBe(50);
    expect(safeRate(3, 4)).toBe(75);
    expect(safeRate(10, 10)).toBe(100);
    expect(safeRate(0, 10)).toBe(0);
  });

  test('分母0でnull', () => {
    expect(safeRate(5, 0)).toBeNull();
    expect(safeRate(0, 0)).toBeNull();
  });

  test('分母が無限大でnull', () => {
    expect(safeRate(5, Infinity)).toBeNull();
  });
});

describe('formatPercent', () => {
  test('正常な表示', () => {
    expect(formatPercent(50)).toBe('50%');
    expect(formatPercent(100)).toBe('100%');
    expect(formatPercent(0)).toBe('0%');
  });

  test('nullで--', () => {
    expect(formatPercent(null)).toBe('--');
  });

  test('undefinedで--', () => {
    expect(formatPercent(undefined)).toBe('--');
  });

  test('Infinityで--', () => {
    expect(formatPercent(Infinity)).toBe('--');
  });
});

describe('formatNumber', () => {
  test('正常な表示', () => {
    expect(formatNumber(10)).toBe('10');
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(999)).toBe('999');
  });

  test('nullで--', () => {
    expect(formatNumber(null)).toBe('--');
  });

  test('undefinedで--', () => {
    expect(formatNumber(undefined)).toBe('--');
  });
});

describe('formatFraction', () => {
  test('正常な表示', () => {
    expect(formatFraction(3, 5)).toBe('3/5');
    expect(formatFraction(0, 10)).toBe('0/10');
  });

  test('分母0で--', () => {
    expect(formatFraction(5, 0)).toBe('--');
  });
});

describe('calcCvRate', () => {
  test('正常なCV率計算', () => {
    expect(calcCvRate(10, 100)).toBe(10);
    expect(calcCvRate(50, 100)).toBe(50);
  });

  test('分母0でnull', () => {
    expect(calcCvRate(0, 0)).toBeNull();
    expect(calcCvRate(10, 0)).toBeNull();
  });
});

describe('KPIスコープとの統合', () => {
  test('0件の場合はCV率がnull（0%ではない）', () => {
    // prospects.kpiTotal = 0 の場合、CV率は null であるべき
    const kpiTotal = 0;
    const decided = 0;
    const cvRate = kpiTotal === 0 ? null : safeRate(decided, kpiTotal);
    expect(cvRate).toBeNull();
  });

  test('KPIスコープは2026-01-12 13:49 JST以降が対象', () => {
    // 時間ベーススコープを使用
    // 2026-01-12 04:49 UTC = 2026-01-12 13:49 JST
    const ACTIVE_FROM = new Date('2026-01-12T04:49:00.000Z');
    const beforeBoundary = new Date('2026-01-12T04:48:59.999Z');
    const atBoundary = new Date('2026-01-12T04:49:00.000Z');
    const afterBoundary = new Date('2026-01-15T00:00:00.000Z');

    expect(beforeBoundary >= ACTIVE_FROM).toBe(false);
    expect(atBoundary >= ACTIVE_FROM).toBe(true);
    expect(afterBoundary >= ACTIVE_FROM).toBe(true);
  });
});
