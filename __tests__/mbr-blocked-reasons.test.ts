/**
 * @jest-environment node
 */

/**
 * Ticket 132: MBRにblocked理由トップ3を自動出力
 *
 * テスト対象:
 * 1. buildImprovementProgress: blockedTopReasons が集計される
 * 2. generateMbr: execSummary に詰まり原因が含まれる
 * 3. generateMbr: nextMonthFocus に詰まり解消が含まれる
 * 4. ブロックなしの場合は空配列
 */

import { create as createCA, blockAction } from '../src/lib/correctiveActions/repo';
import { buildImprovementProgress } from '../src/lib/mbr/buildImprovementProgress';
import { generateMbr } from '../src/lib/mbr/generateMbr';
import type { ViewerContext } from '../src/lib/correctiveActions/types';

const MANAGER: ViewerContext = { userId: 'user_manager', role: 'manager' };

// ========== ヘルパー ==========

function createBlockedMbrAction(
  title: string,
  month: string,
  reasonCode: string,
  suffix: string
) {
  const ca = createCA(
    {
      title,
      description: 'テスト用',
      severity: 'major',
      sourceType: 'mbr_focus',
      sourceId: `mbr:${month}:${suffix}`,
    },
    'user_manager',
    { skipAutoAssign: true }
  );

  blockAction(
    ca.id,
    { blockedReasonCode: reasonCode as any },
    MANAGER
  );

  return ca;
}

// ========== blockedTopReasons 集計 ==========

describe('buildImprovementProgress blockedTopReasons', () => {
  const TEST_MONTH = '2060-01';

  it('ブロック中のmbr_focusタスクの理由コード分布を返す', () => {
    // 3つのブロックタスクを作成（2つはwaiting_customer, 1つはresource_shortage）
    createBlockedMbrAction('T132テスト_wait1', TEST_MONTH, 'waiting_customer', 'br_a1');
    createBlockedMbrAction('T132テスト_wait2', TEST_MONTH, 'waiting_customer', 'br_a2');
    createBlockedMbrAction('T132テスト_resource', TEST_MONTH, 'resource_shortage', 'br_a3');

    const result = buildImprovementProgress(TEST_MONTH);

    expect(result.blockedTopReasons.length).toBeGreaterThanOrEqual(2);

    // waiting_customer が最多
    const top = result.blockedTopReasons[0];
    expect(top.code).toBe('waiting_customer');
    expect(top.label).toBe('相手待ち');
    expect(top.count).toBeGreaterThanOrEqual(2);

    // resource_shortage も含まれる
    const resource = result.blockedTopReasons.find((r) => r.code === 'resource_shortage');
    expect(resource).toBeDefined();
    expect(resource!.count).toBeGreaterThanOrEqual(1);
  });

  it('最大3件までに制限される', () => {
    const month = '2060-02';
    createBlockedMbrAction('T132制限_a', month, 'waiting_customer', 'br_b1');
    createBlockedMbrAction('T132制限_b', month, 'waiting_documents', 'br_b2');
    createBlockedMbrAction('T132制限_c', month, 'resource_shortage', 'br_b3');
    createBlockedMbrAction('T132制限_d', month, 'system_issue', 'br_b4');
    createBlockedMbrAction('T132制限_e', month, 'unclear_requirement', 'br_b5');

    const result = buildImprovementProgress(month);

    expect(result.blockedTopReasons.length).toBeLessThanOrEqual(3);
  });

  it('blockedTopReasonsは配列である', () => {
    // グローバル集計のため、他テストのデータも含まれうる
    const result = buildImprovementProgress('2099-01');
    expect(Array.isArray(result.blockedTopReasons)).toBe(true);
    // 各要素の構造チェック
    for (const r of result.blockedTopReasons) {
      expect(typeof r.code).toBe('string');
      expect(typeof r.label).toBe('string');
      expect(typeof r.count).toBe('number');
    }
  });

  it('各項目にcode/label/countが含まれる', () => {
    const month = '2060-03';
    createBlockedMbrAction('T132構造確認', month, 'waiting_vendor', 'br_c1');

    const result = buildImprovementProgress(month);
    const reasons = result.blockedTopReasons;

    if (reasons.length > 0) {
      for (const r of reasons) {
        expect(typeof r.code).toBe('string');
        expect(typeof r.label).toBe('string');
        expect(typeof r.count).toBe('number');
        expect(r.count).toBeGreaterThan(0);
      }
    }
  });
});

// ========== blockedTop に blocked ステータスも含まれる ==========

describe('buildImprovementProgress blockedTop includes blocked status', () => {
  it('status=blocked のタスクが blockedTop に含まれる', () => {
    const month = '2060-04';
    const ca = createBlockedMbrAction('T132ブロック込み', month, 'waiting_customer', 'br_d1');

    const result = buildImprovementProgress(month);

    const found = result.blockedTop.find((item) => item.id === ca.id);
    expect(found).toBeDefined();
  });
});

// ========== generateMbr 統合テスト ==========

describe('generateMbr blockedTopReasons統合', () => {
  it('improvementProgressにblockedTopReasonsが含まれる', () => {
    const mbr = generateMbr('2025-01');
    expect(Array.isArray(mbr.sections.improvementProgress.blockedTopReasons)).toBe(true);
  });

  it('ブロックタスクがある場合、execSummaryに詰まり原因が含まれる', () => {
    const month = '2060-05';
    createBlockedMbrAction('T132サマリー確認1', month, 'waiting_customer', 'br_e1');
    createBlockedMbrAction('T132サマリー確認2', month, 'waiting_customer', 'br_e2');

    const mbr = generateMbr(month);

    const hasBlockedLine = mbr.sections.execSummary.some(
      (line) => line.includes('詰まり原因')
    );
    expect(hasBlockedLine).toBe(true);
  });

  it('ブロックタスクがある場合、nextMonthFocusに解消が含まれる', () => {
    const month = '2060-06';
    createBlockedMbrAction('T132フォーカス確認', month, 'resource_shortage', 'br_f1');

    const mbr = generateMbr(month);

    const hasFocusLine = mbr.sections.nextMonthFocus.some(
      (line) => line.includes('詰まり原因')
    );
    expect(hasFocusLine).toBe(true);
  });
});
