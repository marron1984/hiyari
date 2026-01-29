/**
 * 承認経路関連のUnit test
 *
 * テスト対象:
 * 1. formatAmountCondition: 金額条件の表示
 * 2. APPROVER_ROLE_LABELS: ロールラベル
 * 3. RingiApprovalFlow型の構造
 */

import {
  formatAmountCondition,
  APPROVER_ROLE_LABELS,
  ApproverRole,
  RingiApprovalFlow,
  RingiApprovalFlowStep,
  RingiApprovalRoute,
  RingiApprovalRouteStep,
} from '@/types/ringi';

describe('formatAmountCondition', () => {
  test('金額制限なし（両方null）', () => {
    expect(formatAmountCondition(null, null)).toBe('金額制限なし');
  });

  test('上限のみ', () => {
    expect(formatAmountCondition(null, 500000)).toBe('500,000円以下');
    expect(formatAmountCondition(null, 1000000)).toBe('1,000,000円以下');
    expect(formatAmountCondition(null, 100)).toBe('100円以下');
  });

  test('下限のみ', () => {
    expect(formatAmountCondition(500000, null)).toBe('500,000円以上');
    expect(formatAmountCondition(1000000, null)).toBe('1,000,000円以上');
    expect(formatAmountCondition(100, null)).toBe('100円以上');
  });

  test('上限と下限両方', () => {
    expect(formatAmountCondition(100000, 500000)).toBe('100,000円 〜 500,000円');
    expect(formatAmountCondition(0, 1000000)).toBe('0円 〜 1,000,000円');
    expect(formatAmountCondition(500000, 500000)).toBe('500,000円 〜 500,000円');
  });
});

describe('APPROVER_ROLE_LABELS', () => {
  test('全てのロールにラベルが存在する', () => {
    const roles: ApproverRole[] = ['manager', 'leader', 'admin', 'exec'];
    roles.forEach((role) => {
      expect(APPROVER_ROLE_LABELS[role]).toBeDefined();
      expect(typeof APPROVER_ROLE_LABELS[role]).toBe('string');
      expect(APPROVER_ROLE_LABELS[role].length).toBeGreaterThan(0);
    });
  });

  test('正しいラベル値', () => {
    expect(APPROVER_ROLE_LABELS.manager).toBe('部門長');
    expect(APPROVER_ROLE_LABELS.leader).toBe('拠点長');
    expect(APPROVER_ROLE_LABELS.admin).toBe('管理者');
    expect(APPROVER_ROLE_LABELS.exec).toBe('経営層');
  });
});

describe('RingiApprovalFlow', () => {
  test('承認フローの構造検証', () => {
    const flow: RingiApprovalFlow = {
      ringiId: 'ringi-123',
      routeId: 'route-456',
      routeName: 'テスト経路',
      currentStepOrder: 1,
      steps: [
        {
          stepOrder: 1,
          approverType: 'ROLE',
          approverValue: 'leader',
          approverName: '拠点長',
          required: true,
          status: 'pending',
        },
        {
          stepOrder: 2,
          approverType: 'ROLE',
          approverValue: 'admin',
          approverName: '管理者',
          required: true,
          status: 'pending',
        },
      ],
    };

    expect(flow.ringiId).toBe('ringi-123');
    expect(flow.routeId).toBe('route-456');
    expect(flow.routeName).toBe('テスト経路');
    expect(flow.currentStepOrder).toBe(1);
    expect(flow.steps.length).toBe(2);
    expect(flow.steps[0].stepOrder).toBe(1);
    expect(flow.steps[0].approverType).toBe('ROLE');
    expect(flow.steps[0].status).toBe('pending');
    expect(flow.completedAt).toBeUndefined();
  });

  test('承認済みステップ', () => {
    const step: RingiApprovalFlowStep = {
      stepOrder: 1,
      approverType: 'ROLE',
      approverValue: 'leader',
      approverName: '拠点長',
      required: true,
      status: 'approved',
      approvedBy: 'user-789',
      approvedByName: '山田太郎',
      approvedAt: new Date('2026-01-15T10:30:00Z'),
      comment: '問題ありません',
    };

    expect(step.status).toBe('approved');
    expect(step.approvedBy).toBe('user-789');
    expect(step.approvedByName).toBe('山田太郎');
    expect(step.approvedAt).toBeInstanceOf(Date);
    expect(step.comment).toBe('問題ありません');
  });

  test('スキップされたステップ', () => {
    const step: RingiApprovalFlowStep = {
      stepOrder: 2,
      approverType: 'USER',
      approverValue: 'user-specific',
      approverName: '特定ユーザー',
      required: false,
      status: 'skipped',
    };

    expect(step.status).toBe('skipped');
    expect(step.required).toBe(false);
    expect(step.approvedBy).toBeUndefined();
  });
});

describe('RingiApprovalRoute', () => {
  test('経路の構造検証', () => {
    const route: RingiApprovalRoute = {
      id: 'route-1',
      tenantId: 'defaultTenant',
      name: '通常稟議',
      description: '50万円未満の通常稟議',
      category: '備品購入',
      branchId: null,
      minAmount: null,
      maxAmount: 500000,
      isActive: true,
      isDefault: false,
      priority: 10,
      steps: [
        {
          id: 'step-1',
          routeId: 'route-1',
          stepOrder: 1,
          approverType: 'ROLE',
          approverValue: 'leader',
          required: true,
          createdAt: new Date(),
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'system',
      createdByName: 'システム',
    };

    expect(route.id).toBe('route-1');
    expect(route.name).toBe('通常稟議');
    expect(route.category).toBe('備品購入');
    expect(route.branchId).toBeNull();
    expect(route.minAmount).toBeNull();
    expect(route.maxAmount).toBe(500000);
    expect(route.isActive).toBe(true);
    expect(route.isDefault).toBe(false);
    expect(route.priority).toBe(10);
    expect(route.steps.length).toBe(1);
  });

  test('デフォルト経路', () => {
    const route: RingiApprovalRoute = {
      id: 'route-default',
      tenantId: 'defaultTenant',
      name: 'デフォルト経路',
      category: null,
      branchId: null,
      minAmount: null,
      maxAmount: null,
      isActive: true,
      isDefault: true,
      priority: 999,
      steps: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'system',
      createdByName: 'システム',
    };

    expect(route.isDefault).toBe(true);
    expect(route.category).toBeNull();
    expect(route.branchId).toBeNull();
    expect(route.priority).toBe(999);
  });
});

describe('RingiApprovalRouteStep', () => {
  test('ROLEベースのステップ', () => {
    const step: RingiApprovalRouteStep = {
      id: 'step-1',
      routeId: 'route-1',
      stepOrder: 1,
      approverType: 'ROLE',
      approverValue: 'leader',
      required: true,
      createdAt: new Date(),
    };

    expect(step.approverType).toBe('ROLE');
    expect(step.approverValue).toBe('leader');
    expect(step.approverName).toBeUndefined();
  });

  test('USERベースのステップ', () => {
    const step: RingiApprovalRouteStep = {
      id: 'step-2',
      routeId: 'route-1',
      stepOrder: 2,
      approverType: 'USER',
      approverValue: 'user-123',
      approverName: '田中花子',
      required: true,
      createdAt: new Date(),
    };

    expect(step.approverType).toBe('USER');
    expect(step.approverValue).toBe('user-123');
    expect(step.approverName).toBe('田中花子');
  });

  test('任意ステップ', () => {
    const step: RingiApprovalRouteStep = {
      id: 'step-3',
      routeId: 'route-1',
      stepOrder: 3,
      approverType: 'ROLE',
      approverValue: 'exec',
      required: false,
      createdAt: new Date(),
    };

    expect(step.required).toBe(false);
  });
});
