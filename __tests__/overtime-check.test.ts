/**
 * 勤怠・残業申請 突合ロジックのUnit test
 *
 * テスト対象:
 * 1. calculateActualOvertimeMinutes: 実績残業時間を計算
 * 2. determineOvertimeCheckStatus: 突合ステータスを判定
 * 3. executeOvertimeCheck: 1件の突合を実行
 */

import {
  calculateActualOvertimeMinutes,
  determineOvertimeCheckStatus,
  executeOvertimeCheck,
  OvertimeCheckInput,
  shouldNotify,
  generateNotificationMessage,
  generateOvertimeApplicationUrl,
} from '@/lib/overtime-check';
import { STANDARD_WORK_MINUTES, OVERTIME_CHECK_THRESHOLDS } from '@/types/attendance';

describe('STANDARD_WORK_MINUTES', () => {
  test('所定労働時間は480分（8時間）', () => {
    expect(STANDARD_WORK_MINUTES).toBe(480);
  });
});

describe('OVERTIME_CHECK_THRESHOLDS', () => {
  test('OK閾値は15分', () => {
    expect(OVERTIME_CHECK_THRESHOLDS.OK_DIFF).toBe(15);
  });

  test('WARN閾値は60分', () => {
    expect(OVERTIME_CHECK_THRESHOLDS.WARN_DIFF).toBe(60);
  });

  test('NG閾値（申請なし）は30分', () => {
    expect(OVERTIME_CHECK_THRESHOLDS.NG_NO_REQUEST).toBe(30);
  });
});

describe('calculateActualOvertimeMinutes', () => {
  test('480分（8時間）以下は残業0分', () => {
    expect(calculateActualOvertimeMinutes(480)).toBe(0);
    expect(calculateActualOvertimeMinutes(400)).toBe(0);
    expect(calculateActualOvertimeMinutes(0)).toBe(0);
  });

  test('480分超過分が残業時間', () => {
    expect(calculateActualOvertimeMinutes(510)).toBe(30); // 30分残業
    expect(calculateActualOvertimeMinutes(540)).toBe(60); // 1時間残業
    expect(calculateActualOvertimeMinutes(600)).toBe(120); // 2時間残業
  });
});

describe('determineOvertimeCheckStatus', () => {
  describe('OK判定', () => {
    test('差が0分はOK', () => {
      const result = determineOvertimeCheckStatus(60, 60);
      expect(result.status).toBe('OK');
      expect(result.diffMinutes).toBe(0);
    });

    test('差が+15分以内はOK', () => {
      const result = determineOvertimeCheckStatus(75, 60);
      expect(result.status).toBe('OK');
      expect(result.diffMinutes).toBe(15);
    });

    test('差が-15分以内はOK', () => {
      const result = determineOvertimeCheckStatus(45, 60);
      expect(result.status).toBe('OK');
      expect(result.diffMinutes).toBe(-15);
    });
  });

  describe('WARN判定', () => {
    test('差が16分はWARN', () => {
      const result = determineOvertimeCheckStatus(76, 60);
      expect(result.status).toBe('WARN');
      expect(result.diffMinutes).toBe(16);
    });

    test('差が60分はWARN', () => {
      const result = determineOvertimeCheckStatus(120, 60);
      expect(result.status).toBe('WARN');
      expect(result.diffMinutes).toBe(60);
    });

    test('差が-30分はWARN', () => {
      const result = determineOvertimeCheckStatus(30, 60);
      expect(result.status).toBe('WARN');
      expect(result.diffMinutes).toBe(-30);
    });
  });

  describe('NG判定（大きな差異）', () => {
    test('差が61分超はNG', () => {
      const result = determineOvertimeCheckStatus(121, 60);
      expect(result.status).toBe('NG');
      expect(result.diffMinutes).toBe(61);
    });

    test('差が-70分はNG', () => {
      const result = determineOvertimeCheckStatus(0, 70);
      expect(result.status).toBe('NG');
      expect(result.diffMinutes).toBe(-70);
    });
  });

  describe('NG判定（申請なしで残業30分超）', () => {
    test('申請なしで残業31分はNG', () => {
      const result = determineOvertimeCheckStatus(31, 0);
      expect(result.status).toBe('NG');
      expect(result.message).toContain('残業申請がありません');
    });

    test('申請なしで残業60分はNG', () => {
      const result = determineOvertimeCheckStatus(60, 0);
      expect(result.status).toBe('NG');
    });

    test('申請なしで残業30分はNG閾値以下なのでWARN（差が15分超）', () => {
      // 実績30分・申請0分 → 差は30分 → WARN
      const result = determineOvertimeCheckStatus(30, 0);
      expect(result.status).toBe('WARN');
    });

    test('申請なしで残業15分以内はOK', () => {
      const result = determineOvertimeCheckStatus(15, 0);
      expect(result.status).toBe('OK');
    });

    test('申請なしで残業0分はOK', () => {
      const result = determineOvertimeCheckStatus(0, 0);
      expect(result.status).toBe('OK');
    });
  });
});

describe('executeOvertimeCheck', () => {
  const baseInput: OvertimeCheckInput = {
    userId: 'user-1',
    userName: 'テストユーザー',
    employeeCode: 'EMP001',
    branchId: 'branch-1',
    tenantId: 'tenant-1',
    workDate: '2026-01-30',
  };

  test('勤怠なし・申請なしはOK（残業0分）', () => {
    const result = executeOvertimeCheck(baseInput);
    expect(result.status).toBe('OK');
    expect(result.actualOvertimeMinutes).toBe(0);
    expect(result.requestedMinutes).toBe(0);
  });

  test('勤怠あり（残業60分）・申請あり（60分）はOK', () => {
    const result = executeOvertimeCheck({
      ...baseInput,
      timeEntry: { id: 'entry-1', totalWorkMinutes: 540 }, // 9時間 = 残業1時間
      overtimeApplication: { id: 'app-1', requestedMinutes: 60, status: 'approved' },
    });
    expect(result.status).toBe('OK');
    expect(result.actualOvertimeMinutes).toBe(60);
    expect(result.requestedMinutes).toBe(60);
    expect(result.diffMinutes).toBe(0);
  });

  test('勤怠あり（残業60分）・申請なしはNG', () => {
    const result = executeOvertimeCheck({
      ...baseInput,
      timeEntry: { id: 'entry-1', totalWorkMinutes: 540 },
    });
    expect(result.status).toBe('NG');
    expect(result.actualOvertimeMinutes).toBe(60);
    expect(result.requestedMinutes).toBe(0);
  });

  test('勤怠あり（残業90分）・申請あり（60分）はWARN（30分差）', () => {
    const result = executeOvertimeCheck({
      ...baseInput,
      timeEntry: { id: 'entry-1', totalWorkMinutes: 570 }, // 9.5時間 = 残業90分
      overtimeApplication: { id: 'app-1', requestedMinutes: 60, status: 'approved' },
    });
    expect(result.status).toBe('WARN');
    expect(result.actualOvertimeMinutes).toBe(90);
    expect(result.diffMinutes).toBe(30);
  });

  test('timeEntryIdとapplicationIdが保存される', () => {
    const result = executeOvertimeCheck({
      ...baseInput,
      timeEntry: { id: 'entry-123', totalWorkMinutes: 540 },
      overtimeApplication: { id: 'app-456', requestedMinutes: 60, status: 'submitted' },
    });
    expect(result.timeEntryId).toBe('entry-123');
    expect(result.applicationId).toBe('app-456');
    expect(result.applicationStatus).toBe('submitted');
  });
});

describe('shouldNotify', () => {
  test('NGは通知する', () => {
    expect(shouldNotify('NG')).toBe(true);
  });

  test('WARNは通知する', () => {
    expect(shouldNotify('WARN')).toBe(true);
  });

  test('OKは通知しない', () => {
    expect(shouldNotify('OK')).toBe(false);
  });
});

describe('generateNotificationMessage', () => {
  const baseCheck = {
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    userId: 'user-1',
    userName: 'テストユーザー',
    employeeCode: 'EMP001',
    workDate: '2026-01-30',
    actualWorkMinutes: 540,
    actualOvertimeMinutes: 60,
    requestedMinutes: 0,
    status: 'NG' as const,
    diffMinutes: 60,
    message: '残業申請がありません（実績: 1:00）',
    notified: false,
    checkedAt: new Date(),
  };

  test('NGメッセージは「要対応」を含む', () => {
    const { title, message } = generateNotificationMessage(baseCheck, 'ng');
    expect(title).toContain('要対応');
    expect(title).toContain('2026/01/30');
    expect(message).toBe(baseCheck.message);
  });

  test('WARNメッセージは「確認」を含む', () => {
    const warnCheck = { ...baseCheck, status: 'WARN' as const };
    const { title } = generateNotificationMessage(warnCheck, 'warn');
    expect(title).toContain('確認');
  });
});

describe('generateOvertimeApplicationUrl', () => {
  test('残業申請画面のURLを生成', () => {
    const url = generateOvertimeApplicationUrl('2026-01-30');
    expect(url).toBe('/dashboard/attendance/overtime/new?date=2026-01-30');
  });
});
