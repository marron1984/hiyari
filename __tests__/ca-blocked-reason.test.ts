/**
 * @jest-environment node
 */

/**
 * Ticket 131: 改善タスクの blocked 理由テンプレート化
 *
 * テスト対象:
 * 1. blocked 理由コード定義
 * 2. blockAction: meta に保存・events に記録
 * 3. unblockAction: 解除・events に記録
 * 4. 冪等性: 二重ブロック防止
 * 5. 集計関数
 */

import {
  create as createCA,
  blockAction,
  unblockAction,
  listEvents,
  getById,
  listCorrectiveActions,
} from '../src/lib/correctiveActions/repo';
import {
  BLOCKED_REASON_CONFIG,
  BLOCKED_REASON_CODES,
  CA_STATUS_CONFIG,
} from '../src/lib/correctiveActions/types';
import type {
  BlockedReasonCode,
  ViewerContext,
  CorrectiveAction,
} from '../src/lib/correctiveActions/types';
import { getBlockedReasonsStats } from '../src/lib/correctiveActions/statsBlockedReasons';

const MANAGER: ViewerContext = { userId: 'user_manager', role: 'manager' };
const STAFF: ViewerContext = { userId: 'user_staff', role: 'staff' };

// ========== ヘルパー ==========

function createTestCA(title: string, ownerUserId?: string): CorrectiveAction {
  return createCA(
    {
      title,
      description: 'テスト用',
      severity: 'major',
      sourceType: 'manual',
      ownerUserId: ownerUserId ?? null,
    },
    'user_manager',
    { skipAutoAssign: true }
  );
}

// ========== 理由コード定義 ==========

describe('BlockedReasonCode 定義', () => {
  it('8種類の理由コードが定義されている', () => {
    expect(BLOCKED_REASON_CODES).toHaveLength(8);
  });

  it('各コードにlabelとiconが設定されている', () => {
    for (const code of BLOCKED_REASON_CODES) {
      const config = BLOCKED_REASON_CONFIG[code];
      expect(config.label).toBeTruthy();
      expect(config.icon).toBeTruthy();
    }
  });

  it('waiting_customer が含まれる', () => {
    expect(BLOCKED_REASON_CODES).toContain('waiting_customer');
    expect(BLOCKED_REASON_CONFIG.waiting_customer.label).toBe('相手待ち');
  });

  it('CA_STATUS_CONFIG に blocked が含まれる', () => {
    expect(CA_STATUS_CONFIG.blocked).toBeDefined();
    expect(CA_STATUS_CONFIG.blocked.label).toBe('ブロック中');
  });
});

// ========== blockAction ==========

describe('blockAction', () => {
  it('ブロックするとstatusがblockedになる', () => {
    const ca = createTestCA('ブロックテスト1');
    expect(ca.status).toBe('open');

    const result = blockAction(
      ca.id,
      { blockedReasonCode: 'waiting_customer' },
      MANAGER
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.item.status).toBe('blocked');
    }
  });

  it('meta に blockedReasonCode が保存される', () => {
    const ca = createTestCA('ブロックテスト2');
    const result = blockAction(
      ca.id,
      {
        blockedReasonCode: 'waiting_documents',
        blockedReasonNote: 'テストメモ',
        nextReviewAt: '2026-03-01T00:00:00Z',
      },
      MANAGER
    );

    expect(result.success).toBe(true);
    if (result.success) {
      const meta = result.item.meta as Record<string, unknown>;
      expect(meta.blockedReasonCode).toBe('waiting_documents');
      expect(meta.blockedReasonNote).toBe('テストメモ');
      expect(meta.nextReviewAt).toBe('2026-03-01T00:00:00Z');
      expect(meta.blockedAt).toBeTruthy();
      expect(meta.blockedByUserId).toBe('user_manager');
    }
  });

  it('events に blocked イベントが記録される', () => {
    const ca = createTestCA('ブロックテスト3');
    const result = blockAction(
      ca.id,
      { blockedReasonCode: 'resource_shortage' },
      MANAGER
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.event.action).toBe('blocked');
      expect(result.event.correctiveActionId).toBe(ca.id);
      expect(result.event.note).toContain('resource_shortage');

      const events = listEvents(ca.id);
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0].action).toBe('blocked');
    }
  });

  it('blockedReasonNote なしでもブロックできる', () => {
    const ca = createTestCA('ブロックテスト4');
    const result = blockAction(
      ca.id,
      { blockedReasonCode: 'system_issue' },
      MANAGER
    );

    expect(result.success).toBe(true);
    if (result.success) {
      const meta = result.item.meta as Record<string, unknown>;
      expect(meta.blockedReasonCode).toBe('system_issue');
      expect(meta.blockedReasonNote).toBeNull();
    }
  });

  it('完了済みのタスクはブロックできない', () => {
    const ca = createTestCA('完了済みテスト');
    // 手動でcompletedに変更（changeStatusを使う）
    const { changeStatus } = require('../src/lib/correctiveActions/repo');
    changeStatus(ca.id, 'completed', MANAGER);

    const result = blockAction(
      ca.id,
      { blockedReasonCode: 'other' },
      MANAGER
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('ブロックに変更できません');
    }
  });

  it('既にブロック中のタスクは再ブロックできない', () => {
    const ca = createTestCA('二重ブロックテスト');
    blockAction(ca.id, { blockedReasonCode: 'waiting_customer' }, MANAGER);

    const result = blockAction(
      ca.id,
      { blockedReasonCode: 'waiting_vendor' },
      MANAGER
    );

    expect(result.success).toBe(false);
  });

  it('ownerでもブロックできる', () => {
    const ca = createTestCA('ownerブロックテスト', 'user_staff');
    const ownerViewer: ViewerContext = { userId: 'user_staff', role: 'staff' };
    const result = blockAction(
      ca.id,
      { blockedReasonCode: 'unclear_requirement' },
      ownerViewer
    );

    expect(result.success).toBe(true);
  });
});

// ========== unblockAction ==========

describe('unblockAction', () => {
  it('ブロック解除でin_progressに戻せる', () => {
    const ca = createTestCA('解除テスト1');
    blockAction(ca.id, { blockedReasonCode: 'waiting_customer' }, MANAGER);

    const result = unblockAction(ca.id, 'in_progress', MANAGER);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.item.status).toBe('in_progress');
    }
  });

  it('ブロック解除でopenに戻せる', () => {
    const ca = createTestCA('解除テスト2');
    blockAction(ca.id, { blockedReasonCode: 'waiting_documents' }, MANAGER);

    const result = unblockAction(ca.id, 'open', MANAGER);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.item.status).toBe('open');
    }
  });

  it('events に unblocked イベントが記録される', () => {
    const ca = createTestCA('解除テスト3');
    blockAction(ca.id, { blockedReasonCode: 'waiting_vendor' }, MANAGER);
    const result = unblockAction(ca.id, 'in_progress', MANAGER);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.event.action).toBe('unblocked');

      const events = listEvents(ca.id);
      const actions = events.map((e) => e.action);
      expect(actions).toContain('unblocked');
      expect(actions).toContain('blocked');
      expect(events).toHaveLength(2);
    }
  });

  it('ブロック中でないタスクは解除できない', () => {
    const ca = createTestCA('非ブロック解除テスト');
    const result = unblockAction(ca.id, 'open', MANAGER);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('ブロック中ではありません');
    }
  });

  it('meta にunblockedAt が記録される', () => {
    const ca = createTestCA('解除meta確認');
    blockAction(ca.id, { blockedReasonCode: 'resource_shortage' }, MANAGER);
    const result = unblockAction(ca.id, 'in_progress', MANAGER);

    expect(result.success).toBe(true);
    if (result.success) {
      const meta = result.item.meta as Record<string, unknown>;
      expect(meta.unblockedAt).toBeTruthy();
      expect(meta.unblockedByUserId).toBe('user_manager');
      // 元のblocked情報は履歴として残る
      expect(meta.blockedReasonCode).toBe('resource_shortage');
    }
  });
});

// ========== 集計 ==========

describe('getBlockedReasonsStats', () => {
  it('ブロック中タスクの理由分布を返す', () => {
    // テスト用に複数のブロックタスクを作成
    const ca1 = createTestCA('集計テスト_waiting_customer');
    const ca2 = createTestCA('集計テスト_waiting_documents');
    const ca3 = createTestCA('集計テスト_waiting_customer2');

    blockAction(ca1.id, { blockedReasonCode: 'waiting_customer' }, MANAGER);
    blockAction(ca2.id, { blockedReasonCode: 'waiting_documents' }, MANAGER);
    blockAction(ca3.id, { blockedReasonCode: 'waiting_customer' }, MANAGER);

    const stats = getBlockedReasonsStats();

    expect(stats.totalBlocked).toBeGreaterThanOrEqual(3);
    expect(stats.distribution.length).toBeGreaterThanOrEqual(2);

    // waiting_customer がトップになるはず
    const customerDist = stats.distribution.find((d) => d.code === 'waiting_customer');
    expect(customerDist).toBeDefined();
    expect(customerDist!.count).toBeGreaterThanOrEqual(2);
  });

  it('topReasonが正しく設定される', () => {
    const stats = getBlockedReasonsStats();

    if (stats.totalBlocked > 0) {
      expect(stats.topReason).not.toBeNull();
      expect(stats.topReason!.count).toBeGreaterThan(0);
    }
  });
});

// ========== getById でmeta確認 ==========

describe('getById with meta', () => {
  it('ブロックされたタスクのmetaが取得できる', () => {
    const ca = createTestCA('getByIdメタ確認');
    blockAction(
      ca.id,
      { blockedReasonCode: 'waiting_internal_approval', blockedReasonNote: '部長確認中' },
      MANAGER
    );

    const result = getById(ca.id, MANAGER);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.item.status).toBe('blocked');
      const meta = result.item.meta as Record<string, unknown>;
      expect(meta.blockedReasonCode).toBe('waiting_internal_approval');
      expect(meta.blockedReasonNote).toBe('部長確認中');
    }
  });
});
