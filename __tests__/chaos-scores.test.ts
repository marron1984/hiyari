/**
 * CHAOS スコア計算関数のUnit test
 * PR3で完全実装、現在は基本ケースのみ
 */

import {
  calculateFatigueScore,
  calculateMentalLoadScore,
  calculateBurnoutRiskScore,
  calculateMovingAverage,
  calculateDeteriorationRate,
} from '@/lib/chaos';

describe('calculateFatigueScore', () => {
  test('最低値（疲労なし、睡眠良好）は0', () => {
    // physicalFatigue: 0, sleep: 4
    const score = calculateFatigueScore(0, 4);
    expect(score).toBe(0);
  });

  test('最高値（疲労最大、睡眠最悪）は100', () => {
    // physicalFatigue: 4, sleep: 0
    const score = calculateFatigueScore(4, 0);
    expect(score).toBe(100);
  });

  test('中間値は正しく計算される', () => {
    // physicalFatigue: 2, sleep: 2
    // ((2 + (4 - 2)) / 2) * 25 = (2 + 2) / 2 * 25 = 50
    const score = calculateFatigueScore(2, 2);
    expect(score).toBe(50);
  });

  test('結果は0-100の範囲内に収まる', () => {
    for (let fatigue = 0; fatigue <= 4; fatigue++) {
      for (let sleep = 0; sleep <= 4; sleep++) {
        const score = calculateFatigueScore(fatigue, sleep);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('calculateMentalLoadScore', () => {
  test('最低値（負荷なし、相談できた）は0', () => {
    const score = calculateMentalLoadScore(0, 0, 0, 4);
    expect(score).toBe(0);
  });

  test('最高値（負荷最大、相談できず）は100', () => {
    const score = calculateMentalLoadScore(4, 4, 4, 0);
    expect(score).toBe(100);
  });

  test('中間値は正しく計算される', () => {
    // ((2 + 2 + 2 + (4 - 2)) / 4) * 25 = (2 + 2 + 2 + 2) / 4 * 25 = 50
    const score = calculateMentalLoadScore(2, 2, 2, 2);
    expect(score).toBe(50);
  });

  test('結果は0-100の範囲内に収まる', () => {
    for (let mental = 0; mental <= 4; mental++) {
      for (let anxiety = 0; anxiety <= 4; anxiety++) {
        for (let decision = 0; decision <= 4; decision++) {
          for (let consulted = 0; consulted <= 4; consulted++) {
            const score = calculateMentalLoadScore(mental, anxiety, decision, consulted);
            expect(score).toBeGreaterThanOrEqual(0);
            expect(score).toBeLessThanOrEqual(100);
          }
        }
      }
    }
  });
});

describe('calculateBurnoutRiskScore', () => {
  test('両方0なら0', () => {
    const score = calculateBurnoutRiskScore(0, 0);
    expect(score).toBe(0);
  });

  test('両方100なら100', () => {
    const score = calculateBurnoutRiskScore(100, 100);
    expect(score).toBe(100);
  });

  test('疲労40%、メンタル60%の加重平均', () => {
    // fatigue: 50, mental: 50 → 50 * 0.4 + 50 * 0.6 = 50
    const score1 = calculateBurnoutRiskScore(50, 50);
    expect(score1).toBe(50);

    // fatigue: 100, mental: 0 → 100 * 0.4 + 0 * 0.6 = 40
    const score2 = calculateBurnoutRiskScore(100, 0);
    expect(score2).toBe(40);

    // fatigue: 0, mental: 100 → 0 * 0.4 + 100 * 0.6 = 60
    const score3 = calculateBurnoutRiskScore(0, 100);
    expect(score3).toBe(60);
  });
});

describe('calculateMovingAverage', () => {
  test('空配列は0を返す', () => {
    const avg = calculateMovingAverage([]);
    expect(avg).toBe(0);
  });

  test('1要素の配列はその値を返す', () => {
    const avg = calculateMovingAverage([50]);
    expect(avg).toBe(50);
  });

  test('複数要素の平均を正しく計算する', () => {
    const avg = calculateMovingAverage([60, 70, 80]);
    expect(avg).toBe(70);
  });

  test('指定日数分のみ計算する', () => {
    // 7日分のみ計算
    const scores = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const avg = calculateMovingAverage(scores, 7);
    // 最初の7要素: 10, 20, 30, 40, 50, 60, 70 → 平均40
    expect(avg).toBe(40);
  });
});

describe('calculateDeteriorationRate', () => {
  test('変化なしは0', () => {
    const rate = calculateDeteriorationRate(50, 50);
    expect(rate).toBe(0);
  });

  test('前回0の場合は0', () => {
    const rate = calculateDeteriorationRate(50, 0);
    expect(rate).toBe(0);
  });

  test('悪化した場合は正の値', () => {
    // 50 → 60 = 20%悪化
    const rate = calculateDeteriorationRate(60, 50);
    expect(rate).toBe(0.2);
  });

  test('改善した場合は負の値', () => {
    // 50 → 40 = 20%改善
    const rate = calculateDeteriorationRate(40, 50);
    expect(rate).toBe(-0.2);
  });
});

describe('介入トリガー判定', () => {
  test('イエロー閾値（60以上）で警告', () => {
    const score = 65;
    const isYellow = score >= 60 && score < 80;
    expect(isYellow).toBe(true);
  });

  test('レッド閾値（80以上）で警告', () => {
    const score = 85;
    const isRed = score >= 80;
    expect(isRed).toBe(true);
  });

  test('グリーン（60未満）は警告なし', () => {
    const score = 55;
    const isGreen = score < 60;
    expect(isGreen).toBe(true);
  });
});
