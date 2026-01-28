/**
 * @jest-environment node
 */
import {
  PROSPECTS_CUTOFF_DATE,
  getProspectCutoffDate,
  isProspectValid,
  isProspectPurgeTarget,
} from '../src/lib/prospect-purge';
import { Prospect, ProspectStatus } from '../src/types/prospect';

// テスト用のモックプロスペクト作成ヘルパー
function createMockProspect(overrides: Partial<Prospect> = {}): Prospect {
  return {
    id: 'test-id',
    tenantId: 'defaultTenant',
    status: '新規受付' as ProspectStatus,
    receivedAt: new Date('2026-01-15'),
    createdAt: new Date('2026-01-15'),
    ...overrides,
  };
}

describe('prospect-purge', () => {
  describe('PROSPECTS_CUTOFF_DATE', () => {
    it('カットオフ日が2026-01-01（UTC）であること', () => {
      expect(PROSPECTS_CUTOFF_DATE.getUTCFullYear()).toBe(2026);
      expect(PROSPECTS_CUTOFF_DATE.getUTCMonth()).toBe(0); // January
      expect(PROSPECTS_CUTOFF_DATE.getUTCDate()).toBe(1);
    });
  });

  describe('getProspectCutoffDate', () => {
    it('inquiryDateがあればそれを使用', () => {
      const prospect = createMockProspect({
        inquiryDate: '2025-06-15',
        receivedAt: new Date('2026-02-01'),
        createdAt: new Date('2026-03-01'),
      });
      const result = getProspectCutoffDate(prospect);
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(5); // June
      expect(result.getDate()).toBe(15);
    });

    it('inquiryDateがなければreceivedAtを使用', () => {
      const prospect = createMockProspect({
        inquiryDate: undefined,
        receivedAt: new Date('2025-08-20'),
        createdAt: new Date('2026-03-01'),
      });
      const result = getProspectCutoffDate(prospect);
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(7); // August
    });

    it('inquiryDateもreceivedAtもなければcreatedAtを使用', () => {
      const prospect = createMockProspect({
        inquiryDate: undefined,
        receivedAt: undefined as unknown as Date,
        createdAt: new Date('2025-12-25'),
      });
      const result = getProspectCutoffDate(prospect);
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(11); // December
    });

    it('無効なinquiryDate文字列の場合はreceivedAtにフォールバック', () => {
      const prospect = createMockProspect({
        inquiryDate: 'invalid-date',
        receivedAt: new Date('2026-04-01'),
        createdAt: new Date('2026-05-01'),
      });
      const result = getProspectCutoffDate(prospect);
      expect(result.getFullYear()).toBe(2026);
      expect(result.getMonth()).toBe(3); // April
    });
  });

  describe('isProspectValid', () => {
    it('2026年以降のデータは有効', () => {
      const prospect = createMockProspect({
        receivedAt: new Date('2026-01-01'),
      });
      expect(isProspectValid(prospect)).toBe(true);
    });

    it('2026年1月1日ちょうどのデータは有効', () => {
      const prospect = createMockProspect({
        receivedAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      expect(isProspectValid(prospect)).toBe(true);
    });

    it('2025年12月31日のデータは無効', () => {
      const prospect = createMockProspect({
        receivedAt: new Date('2025-12-31T23:59:59.999Z'),
      });
      expect(isProspectValid(prospect)).toBe(false);
    });

    it('2025年以前のデータは無効', () => {
      const prospect = createMockProspect({
        inquiryDate: '2024-06-15',
        receivedAt: new Date('2024-06-15'),
      });
      expect(isProspectValid(prospect)).toBe(false);
    });

    it('2027年以降のデータは有効', () => {
      const prospect = createMockProspect({
        receivedAt: new Date('2027-03-15'),
      });
      expect(isProspectValid(prospect)).toBe(true);
    });
  });

  describe('isProspectPurgeTarget', () => {
    it('2025年以前のデータはパージ対象', () => {
      const prospect = createMockProspect({
        receivedAt: new Date('2025-06-15'),
      });
      expect(isProspectPurgeTarget(prospect)).toBe(true);
    });

    it('2026年以降のデータはパージ対象外', () => {
      const prospect = createMockProspect({
        receivedAt: new Date('2026-02-01'),
      });
      expect(isProspectPurgeTarget(prospect)).toBe(false);
    });

    it('isProspectValidの逆の結果を返す', () => {
      const prospect2025 = createMockProspect({
        receivedAt: new Date('2025-11-01'),
      });
      const prospect2026 = createMockProspect({
        receivedAt: new Date('2026-01-15'),
      });

      expect(isProspectPurgeTarget(prospect2025)).toBe(!isProspectValid(prospect2025));
      expect(isProspectPurgeTarget(prospect2026)).toBe(!isProspectValid(prospect2026));
    });
  });

  describe('複合ケース', () => {
    it('inquiryDateが2026年でも他フィールドが2025年なら有効', () => {
      // inquiryDateが優先されるので2026年と判定される
      const prospect = createMockProspect({
        inquiryDate: '2026-01-05',
        receivedAt: new Date('2025-12-20'),
        createdAt: new Date('2025-12-20'),
      });
      expect(isProspectValid(prospect)).toBe(true);
    });

    it('inquiryDateが2025年なら他フィールドが2026年でも無効', () => {
      // inquiryDateが優先されるので2025年と判定される
      const prospect = createMockProspect({
        inquiryDate: '2025-11-30',
        receivedAt: new Date('2026-01-10'),
        createdAt: new Date('2026-01-10'),
      });
      expect(isProspectValid(prospect)).toBe(false);
    });
  });
});
