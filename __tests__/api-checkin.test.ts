/**
 * チェックインAPI バリデーションテスト
 * 実際のAPI呼び出しはE2Eで行うため、ここではバリデーションロジックのみテスト
 */

describe('Checkin API Validation', () => {
  // バリデーション関数を再実装（APIからは直接exportされないため）
  function validateCheckinData(data: unknown): { valid: boolean; error?: string } {
    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'リクエストボディが不正です' };
    }

    const body = data as Record<string, unknown>;

    const requiredFields = ['physicalFatigue', 'mentalFatigue', 'sleep', 'anxiety', 'decisionLoad', 'consulted'];
    for (const field of requiredFields) {
      if (typeof body[field] !== 'number') {
        return { valid: false, error: `${field}は数値で指定してください` };
      }
      const value = body[field] as number;
      if (value < 0 || value > 4 || !Number.isInteger(value)) {
        return { valid: false, error: `${field}は0-4の整数で指定してください` };
      }
    }

    return { valid: true };
  }

  describe('validateCheckinData', () => {
    test('正常なデータはバリデーションを通過する', () => {
      const result = validateCheckinData({
        physicalFatigue: 2,
        mentalFatigue: 1,
        sleep: 3,
        anxiety: 2,
        decisionLoad: 1,
        consulted: 4,
      });
      expect(result.valid).toBe(true);
    });

    test('nullはエラーになる', () => {
      const result = validateCheckinData(null);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('リクエストボディが不正です');
    });

    test('undefinedはエラーになる', () => {
      const result = validateCheckinData(undefined);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('リクエストボディが不正です');
    });

    test('文字列はエラーになる', () => {
      const result = validateCheckinData('invalid');
      expect(result.valid).toBe(false);
    });

    test('必須フィールドが欠けているとエラーになる', () => {
      const result = validateCheckinData({
        physicalFatigue: 2,
        mentalFatigue: 1,
        // sleep が欠けている
        anxiety: 2,
        decisionLoad: 1,
        consulted: 4,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('sleepは数値で指定してください');
    });

    test('範囲外の値（負の数）はエラーになる', () => {
      const result = validateCheckinData({
        physicalFatigue: -1,
        mentalFatigue: 1,
        sleep: 3,
        anxiety: 2,
        decisionLoad: 1,
        consulted: 4,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('physicalFatigueは0-4の整数で指定してください');
    });

    test('範囲外の値（5以上）はエラーになる', () => {
      const result = validateCheckinData({
        physicalFatigue: 5,
        mentalFatigue: 1,
        sleep: 3,
        anxiety: 2,
        decisionLoad: 1,
        consulted: 4,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('physicalFatigueは0-4の整数で指定してください');
    });

    test('小数はエラーになる', () => {
      const result = validateCheckinData({
        physicalFatigue: 2.5,
        mentalFatigue: 1,
        sleep: 3,
        anxiety: 2,
        decisionLoad: 1,
        consulted: 4,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('physicalFatigueは0-4の整数で指定してください');
    });

    test('文字列の数値はエラーになる', () => {
      const result = validateCheckinData({
        physicalFatigue: '2',
        mentalFatigue: 1,
        sleep: 3,
        anxiety: 2,
        decisionLoad: 1,
        consulted: 4,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('physicalFatigueは数値で指定してください');
    });

    test('境界値（0と4）は正常に通過する', () => {
      const result = validateCheckinData({
        physicalFatigue: 0,
        mentalFatigue: 4,
        sleep: 0,
        anxiety: 4,
        decisionLoad: 0,
        consulted: 4,
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('日付フォーマット検証', () => {
    function validateDateFormat(date: string): boolean {
      return /^\d{4}-\d{2}-\d{2}$/.test(date);
    }

    test('YYYY-MM-DD形式は有効', () => {
      expect(validateDateFormat('2026-01-23')).toBe(true);
    });

    test('YYYY/MM/DD形式は無効', () => {
      expect(validateDateFormat('2026/01/23')).toBe(false);
    });

    test('YYYYMMDD形式は無効', () => {
      expect(validateDateFormat('20260123')).toBe(false);
    });

    test('不完全な日付は無効', () => {
      expect(validateDateFormat('2026-01')).toBe(false);
    });

    test('空文字は無効', () => {
      expect(validateDateFormat('')).toBe(false);
    });
  });
});

describe('Intervention trigger rules', () => {
  interface InterventionRule {
    consecutiveDays: number;
    threshold: number;
    deteriorationRate?: number;
  }

  const YELLOW_RULE: InterventionRule = {
    consecutiveDays: 2,
    threshold: 60,
  };

  const RED_RULE: InterventionRule = {
    consecutiveDays: 3,
    threshold: 80,
    deteriorationRate: 0.2,
  };

  function shouldTriggerYellow(
    scores: number[],
    threshold: number,
    consecutiveDays: number
  ): boolean {
    if (scores.length < consecutiveDays) return false;
    const recentScores = scores.slice(0, consecutiveDays);
    return recentScores.every(score => score >= threshold);
  }

  function shouldTriggerRed(
    scores: number[],
    currentScore: number,
    config: InterventionRule
  ): boolean {
    // 閾値超え
    if (currentScore >= config.threshold) return true;

    // 連続日数
    if (scores.length >= config.consecutiveDays) {
      const recentScores = scores.slice(0, config.consecutiveDays);
      if (recentScores.every(score => score >= YELLOW_RULE.threshold)) {
        return true;
      }
    }

    // 悪化率
    if (config.deteriorationRate && scores.length > 0) {
      const weekAgoScore = scores[scores.length - 1] || 0;
      if (weekAgoScore > 0) {
        const rate = (currentScore - weekAgoScore) / weekAgoScore;
        if (rate >= config.deteriorationRate) return true;
      }
    }

    return false;
  }

  describe('イエロートリガー', () => {
    test('2日連続で閾値超えでトリガー', () => {
      const scores = [65, 70]; // 両方60以上
      expect(shouldTriggerYellow(scores, YELLOW_RULE.threshold, YELLOW_RULE.consecutiveDays)).toBe(true);
    });

    test('1日のみ閾値超えではトリガーしない', () => {
      const scores = [65, 55]; // 1日目のみ60以上
      expect(shouldTriggerYellow(scores, YELLOW_RULE.threshold, YELLOW_RULE.consecutiveDays)).toBe(false);
    });

    test('閾値未満の連続ではトリガーしない', () => {
      const scores = [55, 58];
      expect(shouldTriggerYellow(scores, YELLOW_RULE.threshold, YELLOW_RULE.consecutiveDays)).toBe(false);
    });
  });

  describe('レッドトリガー', () => {
    test('現在スコア80以上でトリガー', () => {
      expect(shouldTriggerRed([], 85, RED_RULE)).toBe(true);
    });

    test('3日連続でイエロー閾値超えでトリガー', () => {
      const scores = [65, 70, 68];
      expect(shouldTriggerRed(scores, 50, RED_RULE)).toBe(true);
    });

    test('20%以上の悪化率でトリガー', () => {
      const scores = [50]; // 1週間前のスコア
      const current = 65; // 30%悪化
      expect(shouldTriggerRed(scores, current, RED_RULE)).toBe(true);
    });

    test('条件を満たさない場合はトリガーしない', () => {
      const scores = [45, 50]; // 2日のみ、閾値未満
      expect(shouldTriggerRed(scores, 55, RED_RULE)).toBe(false);
    });
  });
});
