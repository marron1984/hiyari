/**
 * 入居確率スコアリングのUnit test
 * PR6: 入居確率の設定と実行
 */

import {
  calculateAgeScore,
  calculateCareLevelScore,
  calculateStatusScore,
  calculateContactMethodScore,
  calculateVisitScore,
  calculateDocumentsScore,
  calculateDaysElapsedPenalty,
  determineRank,
  calculateMoveInProbability,
  calculateBatchMoveInProbability,
  aggregateByRank,
  calculateExpectedMoveIns,
  DEFAULT_MOVEIN_SCORING_CONFIG,
  MOVEIN_STATUS_SCORES,
  MoveInProbabilityResult,
} from '@/lib/scoring';
import { ProspectStatus, CareLevel, Prospect } from '@/types/prospect';

describe('calculateAgeScore', () => {
  test('年齢不明は0点', () => {
    const result = calculateAgeScore(undefined);
    expect(result.score).toBe(0);
    expect(result.reason.description).toBe('年齢不明');
  });

  test('59歳以下は5点', () => {
    const result = calculateAgeScore(55);
    expect(result.score).toBe(5);
  });

  test('60-69歳は10点', () => {
    const result = calculateAgeScore(65);
    expect(result.score).toBe(10);
  });

  test('70-79歳は15点', () => {
    const result = calculateAgeScore(75);
    expect(result.score).toBe(15);
  });

  test('80-89歳は20点', () => {
    const result = calculateAgeScore(85);
    expect(result.score).toBe(20);
  });

  test('90歳以上は25点', () => {
    const result = calculateAgeScore(95);
    expect(result.score).toBe(25);
  });

  test('境界値: 60歳', () => {
    const result = calculateAgeScore(60);
    expect(result.score).toBe(10);
  });

  test('境界値: 90歳', () => {
    const result = calculateAgeScore(90);
    expect(result.score).toBe(25);
  });
});

describe('calculateCareLevelScore', () => {
  test('介護度不明は0点', () => {
    const result = calculateCareLevelScore(undefined);
    expect(result.score).toBe(0);
  });

  test('自立は5点', () => {
    const result = calculateCareLevelScore('自立');
    expect(result.score).toBe(5);
  });

  test('要支援1は10点', () => {
    const result = calculateCareLevelScore('要支援1');
    expect(result.score).toBe(10);
  });

  test('要介護3は22点', () => {
    const result = calculateCareLevelScore('要介護3');
    expect(result.score).toBe(22);
  });

  test('要介護5は28点', () => {
    const result = calculateCareLevelScore('要介護5');
    expect(result.score).toBe(28);
  });

  test('申請中は10点', () => {
    const result = calculateCareLevelScore('申請中');
    expect(result.score).toBe(10);
  });
});

describe('calculateStatusScore', () => {
  test('新規受付は5点', () => {
    const result = calculateStatusScore('新規受付');
    expect(result.score).toBe(5);
  });

  test('見学設定済は18点', () => {
    const result = calculateStatusScore('見学設定済');
    expect(result.score).toBe(18);
  });

  test('申込中は25点', () => {
    const result = calculateStatusScore('申込中');
    expect(result.score).toBe(25);
  });

  test('入居決定は35点', () => {
    const result = calculateStatusScore('入居決定');
    expect(result.score).toBe(35);
  });

  test('見送りは0点', () => {
    const result = calculateStatusScore('見送り');
    expect(result.score).toBe(0);
  });

  test('クローズは0点', () => {
    const result = calculateStatusScore('クローズ');
    expect(result.score).toBe(0);
  });

  test('全ステータスがスコアを持つ', () => {
    const statuses: ProspectStatus[] = [
      '新規受付', '折返し待ち', '面談設定済', '見学設定済',
      '申込中', '審査中', '入居待ち', '入居決定', '見送り', 'クローズ'
    ];
    statuses.forEach(status => {
      const result = calculateStatusScore(status);
      expect(typeof result.score).toBe('number');
    });
  });
});

describe('calculateContactMethodScore', () => {
  test('連絡元不明は5点', () => {
    const result = calculateContactMethodScore(undefined);
    expect(result.score).toBe(5);
  });

  test('電話は15点', () => {
    const result = calculateContactMethodScore('phone');
    expect(result.score).toBe(15);
  });

  test('紹介は18点', () => {
    const result = calculateContactMethodScore('referral');
    expect(result.score).toBe(18);
  });

  test('notta-formは12点', () => {
    const result = calculateContactMethodScore('notta-form');
    expect(result.score).toBe(12);
  });
});

describe('calculateVisitScore', () => {
  test('見学未設定は0点', () => {
    const result = calculateVisitScore(undefined, '新規受付');
    expect(result.score).toBe(0);
  });

  test('見学設定済（tourRequestDate）は15点', () => {
    const result = calculateVisitScore('2026-02-01', '新規受付');
    expect(result.score).toBe(15);
  });

  test('見学設定済（ステータス）は15点', () => {
    const result = calculateVisitScore(undefined, '見学設定済');
    expect(result.score).toBe(15);
  });

  test('見学完了（申込中）は20点', () => {
    const result = calculateVisitScore(undefined, '申込中');
    expect(result.score).toBe(20);
  });

  test('見学完了（入居決定）は20点', () => {
    const result = calculateVisitScore(undefined, '入居決定');
    expect(result.score).toBe(20);
  });
});

describe('calculateDocumentsScore', () => {
  test('書類未提出は0点', () => {
    const result = calculateDocumentsScore(undefined);
    expect(result.score).toBe(0);
  });

  test('書類なしは0点', () => {
    const result = calculateDocumentsScore([]);
    expect(result.score).toBe(0);
  });

  test('書類提出ありは10点', () => {
    const result = calculateDocumentsScore([{ id: '1' }]);
    expect(result.score).toBe(10);
  });

  test('複数書類も10点', () => {
    const result = calculateDocumentsScore([{ id: '1' }, { id: '2' }, { id: '3' }]);
    expect(result.score).toBe(10);
    expect(result.reason.description).toContain('3件');
  });
});

describe('calculateDaysElapsedPenalty', () => {
  test('受信日不明はペナルティなし', () => {
    const result = calculateDaysElapsedPenalty(undefined);
    expect(result.penalty).toBe(0);
  });

  test('3日以内はペナルティなし', () => {
    const receivedAt = new Date();
    receivedAt.setDate(receivedAt.getDate() - 2);
    const result = calculateDaysElapsedPenalty(receivedAt);
    expect(result.penalty).toBe(0);
  });

  test('7日経過は5点減点', () => {
    const receivedAt = new Date();
    receivedAt.setDate(receivedAt.getDate() - 8);
    const result = calculateDaysElapsedPenalty(receivedAt);
    expect(result.penalty).toBe(5);
  });

  test('14日経過は10点減点', () => {
    const receivedAt = new Date();
    receivedAt.setDate(receivedAt.getDate() - 15);
    const result = calculateDaysElapsedPenalty(receivedAt);
    expect(result.penalty).toBe(10);
  });

  test('30日経過は20点減点', () => {
    const receivedAt = new Date();
    receivedAt.setDate(receivedAt.getDate() - 35);
    const result = calculateDaysElapsedPenalty(receivedAt);
    expect(result.penalty).toBe(20);
  });

  test('60日経過は30点減点', () => {
    const receivedAt = new Date();
    receivedAt.setDate(receivedAt.getDate() - 65);
    const result = calculateDaysElapsedPenalty(receivedAt);
    expect(result.penalty).toBe(30);
  });
});

describe('determineRank', () => {
  test('75以上はAランク', () => {
    expect(determineRank(75)).toBe('A');
    expect(determineRank(100)).toBe('A');
  });

  test('55-74はBランク', () => {
    expect(determineRank(55)).toBe('B');
    expect(determineRank(74)).toBe('B');
  });

  test('35-54はCランク', () => {
    expect(determineRank(35)).toBe('C');
    expect(determineRank(54)).toBe('C');
  });

  test('35未満はDランク', () => {
    expect(determineRank(34)).toBe('D');
    expect(determineRank(0)).toBe('D');
  });
});

describe('calculateMoveInProbability', () => {
  test('最小ケース: 情報なし', () => {
    const result = calculateMoveInProbability({});
    expect(result.probability).toBeGreaterThanOrEqual(0);
    expect(result.probability).toBeLessThanOrEqual(100);
    expect(result.rank).toBeDefined();
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  test('高確率ケース: 高齢・高介護度・進んだステータス', () => {
    const prospect: Partial<Prospect> = {
      age: 85,
      careLevel: '要介護5',
      status: '申込中',
      source: 'referral',
      documents: [{ id: '1' } as any],
      receivedAt: new Date(),
    };
    const result = calculateMoveInProbability(prospect);
    expect(result.probability).toBeGreaterThan(50);
    expect(['A', 'B']).toContain(result.rank);
  });

  test('低確率ケース: 若い・自立・新規', () => {
    const prospect: Partial<Prospect> = {
      age: 55,
      careLevel: '自立',
      status: '新規受付',
    };
    const result = calculateMoveInProbability(prospect);
    expect(result.probability).toBeLessThan(50);
    expect(['C', 'D']).toContain(result.rank);
  });

  test('経過日数によるペナルティが適用される', () => {
    const recentDate = new Date();
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 60);

    const recentProspect: Partial<Prospect> = {
      age: 80,
      careLevel: '要介護3',
      status: '新規受付',
      receivedAt: recentDate,
    };

    const oldProspect: Partial<Prospect> = {
      age: 80,
      careLevel: '要介護3',
      status: '新規受付',
      receivedAt: oldDate,
    };

    const recentResult = calculateMoveInProbability(recentProspect);
    const oldResult = calculateMoveInProbability(oldProspect);

    expect(recentResult.probability).toBeGreaterThan(oldResult.probability);
  });

  test('configVersionが結果に含まれる', () => {
    const result = calculateMoveInProbability({}, DEFAULT_MOVEIN_SCORING_CONFIG, 5);
    expect(result.configVersion).toBe(5);
  });

  test('推奨アクションが設定される', () => {
    const result = calculateMoveInProbability({});
    expect(result.recommendedAction).toBeDefined();
    expect(result.recommendedAction.length).toBeGreaterThan(0);
  });

  test('理由内訳が全て含まれる', () => {
    const prospect: Partial<Prospect> = {
      age: 80,
      careLevel: '要介護3',
      status: '見学設定済',
      source: 'phone',
      documents: [{ id: '1' } as any],
      receivedAt: new Date(),
    };
    const result = calculateMoveInProbability(prospect);

    const factors = result.reasons.map(r => r.factor);
    expect(factors).toContain('age');
    expect(factors).toContain('careLevel');
    expect(factors).toContain('status');
    expect(factors).toContain('contactMethod');
    expect(factors).toContain('visit');
    expect(factors).toContain('documents');
    expect(factors).toContain('daysElapsed');
  });
});

describe('calculateBatchMoveInProbability', () => {
  test('複数案件を一括計算', () => {
    const prospects: Partial<Prospect>[] = [
      { id: 'p1', age: 80, status: '新規受付' },
      { id: 'p2', age: 75, status: '見学設定済' },
      { id: 'p3', age: 85, status: '申込中' },
    ];

    const results = calculateBatchMoveInProbability(prospects);
    expect(results.size).toBe(3);
    expect(results.has('p1')).toBe(true);
    expect(results.has('p2')).toBe(true);
    expect(results.has('p3')).toBe(true);
  });

  test('IDなしの案件はスキップ', () => {
    const prospects: Partial<Prospect>[] = [
      { id: 'p1', age: 80 },
      { age: 75 }, // IDなし
    ];

    const results = calculateBatchMoveInProbability(prospects);
    expect(results.size).toBe(1);
  });
});

describe('aggregateByRank', () => {
  test('ランク別に集計', () => {
    const results = new Map<string, MoveInProbabilityResult>();
    results.set('p1', { rawScore: 100, probability: 80, rank: 'A', recommendedAction: '', reasons: [], configVersion: 1 });
    results.set('p2', { rawScore: 80, probability: 60, rank: 'B', recommendedAction: '', reasons: [], configVersion: 1 });
    results.set('p3', { rawScore: 60, probability: 40, rank: 'C', recommendedAction: '', reasons: [], configVersion: 1 });
    results.set('p4', { rawScore: 40, probability: 20, rank: 'D', recommendedAction: '', reasons: [], configVersion: 1 });
    results.set('p5', { rawScore: 90, probability: 70, rank: 'B', recommendedAction: '', reasons: [], configVersion: 1 });

    const counts = aggregateByRank(results);
    expect(counts.A).toBe(1);
    expect(counts.B).toBe(2);
    expect(counts.C).toBe(1);
    expect(counts.D).toBe(1);
  });
});

describe('calculateExpectedMoveIns', () => {
  test('期待入居数を計算', () => {
    const results = new Map<string, MoveInProbabilityResult>();
    results.set('p1', { rawScore: 100, probability: 80, rank: 'A', recommendedAction: '', reasons: [], configVersion: 1 });
    results.set('p2', { rawScore: 80, probability: 60, rank: 'B', recommendedAction: '', reasons: [], configVersion: 1 });
    results.set('p3', { rawScore: 60, probability: 40, rank: 'C', recommendedAction: '', reasons: [], configVersion: 1 });

    // 期待値: 0.8 + 0.6 + 0.4 = 1.8
    const expected = calculateExpectedMoveIns(results);
    expect(expected).toBe(1.8);
  });

  test('空の場合は0', () => {
    const results = new Map<string, MoveInProbabilityResult>();
    const expected = calculateExpectedMoveIns(results);
    expect(expected).toBe(0);
  });
});

describe('設定のカスタマイズ', () => {
  test('カスタム閾値でランク判定', () => {
    const customConfig = {
      ...DEFAULT_MOVEIN_SCORING_CONFIG,
      rankThresholds: {
        A: 90,
        B: 70,
        C: 50,
      },
    };

    expect(determineRank(85, customConfig)).toBe('B');
    expect(determineRank(65, customConfig)).toBe('C');
    expect(determineRank(45, customConfig)).toBe('D');
  });
});
