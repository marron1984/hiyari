/**
 * @jest-environment node
 */

/**
 * Ticket 133: 詰まり原因 → 改善アクションテンプレ提案
 *
 * テスト対象:
 * 1. BLOCKED_ACTION_TEMPLATES: 全8コードにテンプレがある
 * 2. getAdvicesForReasonCode: コードから推奨アクションを取得
 * 3. buildImprovementProgress: blockedReasonAdvices が生成される
 * 4. generateMbr: blockedReasonAdvices がセクションに含まれる
 */

import {
  BLOCKED_ACTION_TEMPLATES,
  getAdvicesForReasonCode,
} from '../src/lib/mbr/blockedActionTemplates';
import { BLOCKED_REASON_CODES } from '../src/lib/correctiveActions/types';
import { create as createCA, blockAction } from '../src/lib/correctiveActions/repo';
import { buildImprovementProgress } from '../src/lib/mbr/buildImprovementProgress';
import { generateMbr } from '../src/lib/mbr/generateMbr';
import type { ViewerContext } from '../src/lib/correctiveActions/types';

const MANAGER: ViewerContext = { userId: 'user_manager', role: 'manager' };

// ========== テンプレート定義 ==========

describe('BLOCKED_ACTION_TEMPLATES', () => {
  it('全8種類の理由コードにテンプレートがある', () => {
    for (const code of BLOCKED_REASON_CODES) {
      expect(BLOCKED_ACTION_TEMPLATES[code]).toBeDefined();
    }
  });

  it('各テンプレートにlabelとadvices(3件)がある', () => {
    for (const code of BLOCKED_REASON_CODES) {
      const tmpl = BLOCKED_ACTION_TEMPLATES[code];
      expect(tmpl.label).toBeTruthy();
      expect(tmpl.advices).toHaveLength(3);
      for (const advice of tmpl.advices) {
        expect(typeof advice).toBe('string');
        expect(advice.length).toBeGreaterThan(0);
      }
    }
  });

  it('waiting_customer のアドバイスにフォローアップが含まれる', () => {
    const tmpl = BLOCKED_ACTION_TEMPLATES.waiting_customer;
    const hasFollowUp = tmpl.advices.some((a) => a.includes('フォローアップ'));
    expect(hasFollowUp).toBe(true);
  });

  it('resource_shortage のアドバイスにタスク分割が含まれる', () => {
    const tmpl = BLOCKED_ACTION_TEMPLATES.resource_shortage;
    const hasSplit = tmpl.advices.some((a) => a.includes('分割') || a.includes('委譲'));
    expect(hasSplit).toBe(true);
  });
});

// ========== getAdvicesForReasonCode ==========

describe('getAdvicesForReasonCode', () => {
  it('有効なコードで推奨アクションを返す', () => {
    const advices = getAdvicesForReasonCode('waiting_customer');
    expect(advices).toHaveLength(3);
    expect(advices[0]).toContain('フォローアップ');
  });

  it('maxCountで件数を制限できる', () => {
    const advices = getAdvicesForReasonCode('waiting_documents', 2);
    expect(advices).toHaveLength(2);
  });

  it('maxCount=1で1件のみ返す', () => {
    const advices = getAdvicesForReasonCode('system_issue', 1);
    expect(advices).toHaveLength(1);
  });

  it('不明なコードでは空配列を返す', () => {
    const advices = getAdvicesForReasonCode('unknown_code');
    expect(advices).toEqual([]);
  });
});

// ========== buildImprovementProgress統合 ==========

describe('buildImprovementProgress blockedReasonAdvices', () => {
  it('ブロック中タスクがある場合、advicesが付与される', () => {
    const month = '2070-01';
    const ca = createCA(
      {
        title: '[T133] テストアドバイス',
        description: 'テスト',
        severity: 'major',
        sourceType: 'mbr_focus',
        sourceId: `mbr:${month}:t133_a`,
      },
      'user_manager',
      { skipAutoAssign: true }
    );
    blockAction(ca.id, { blockedReasonCode: 'waiting_customer' }, MANAGER);

    const result = buildImprovementProgress(month);

    expect(result.blockedReasonAdvices.length).toBeGreaterThanOrEqual(1);

    const customerAdvice = result.blockedReasonAdvices.find(
      (a) => a.code === 'waiting_customer'
    );
    expect(customerAdvice).toBeDefined();
    expect(customerAdvice!.advices.length).toBeGreaterThan(0);
    expect(customerAdvice!.advices.length).toBeLessThanOrEqual(3);
    expect(customerAdvice!.label).toBe('相手待ち');
    expect(customerAdvice!.count).toBeGreaterThanOrEqual(1);
  });

  it('blockedReasonAdvicesとblockedTopReasonsの件数が一致する', () => {
    const month = '2070-02';
    const ca1 = createCA(
      {
        title: '[T133] 一致テスト1',
        description: 'テスト',
        severity: 'major',
        sourceType: 'mbr_focus',
        sourceId: `mbr:${month}:t133_b1`,
      },
      'user_manager',
      { skipAutoAssign: true }
    );
    blockAction(ca1.id, { blockedReasonCode: 'resource_shortage' }, MANAGER);

    const ca2 = createCA(
      {
        title: '[T133] 一致テスト2',
        description: 'テスト',
        severity: 'major',
        sourceType: 'mbr_focus',
        sourceId: `mbr:${month}:t133_b2`,
      },
      'user_manager',
      { skipAutoAssign: true }
    );
    blockAction(ca2.id, { blockedReasonCode: 'unclear_requirement' }, MANAGER);

    const result = buildImprovementProgress(month);

    // blockedReasonAdvices と blockedTopReasons は同じ理由コードを持つ
    expect(result.blockedReasonAdvices.length).toBe(result.blockedTopReasons.length);
    for (let i = 0; i < result.blockedReasonAdvices.length; i++) {
      expect(result.blockedReasonAdvices[i].code).toBe(result.blockedTopReasons[i].code);
      expect(result.blockedReasonAdvices[i].count).toBe(result.blockedTopReasons[i].count);
    }
  });

  it('各adviceエントリの構造が正しい', () => {
    const result = buildImprovementProgress('2070-01');

    for (const entry of result.blockedReasonAdvices) {
      expect(typeof entry.code).toBe('string');
      expect(typeof entry.label).toBe('string');
      expect(typeof entry.count).toBe('number');
      expect(Array.isArray(entry.advices)).toBe(true);
      expect(entry.advices.length).toBeLessThanOrEqual(3);
    }
  });
});

// ========== generateMbr統合 ==========

describe('generateMbr blockedReasonAdvices統合', () => {
  it('improvementProgressにblockedReasonAdvicesが含まれる', () => {
    const mbr = generateMbr('2025-01');
    expect(Array.isArray(mbr.sections.improvementProgress.blockedReasonAdvices)).toBe(true);
  });

  it('ブロックタスクがある場合、advicesが空でない', () => {
    const month = '2070-03';
    const ca = createCA(
      {
        title: '[T133] MBR統合テスト',
        description: 'テスト',
        severity: 'major',
        sourceType: 'mbr_focus',
        sourceId: `mbr:${month}:t133_c`,
      },
      'user_manager',
      { skipAutoAssign: true }
    );
    blockAction(ca.id, { blockedReasonCode: 'system_issue' }, MANAGER);

    const mbr = generateMbr(month);
    const advices = mbr.sections.improvementProgress.blockedReasonAdvices;

    expect(advices.length).toBeGreaterThanOrEqual(1);
    const sysAdvice = advices.find((a) => a.code === 'system_issue');
    expect(sysAdvice).toBeDefined();
    expect(sysAdvice!.advices[0]).toContain('再現手順');
  });
});
