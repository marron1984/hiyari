/**
 * @jest-environment node
 */
import {
  PROSPECT_MIN_INTERNAL_NO,
  isProspectActiveByInternalNo,
  isProspectActive,
} from '../src/lib/prospect';
import { Prospect, ProspectStatus } from '../src/types/prospect';

// テスト用のモックプロスペクト作成ヘルパー
function createMockProspect(overrides: Partial<Prospect> = {}): Prospect {
  return {
    id: 'test-id',
    tenantId: 'defaultTenant',
    status: '新規受付' as ProspectStatus,
    receivedAt: new Date('2026-01-15'),
    createdAt: new Date('2026-01-15'),
    internalNo: 300, // デフォルトは有効な番号
    ...overrides,
  };
}

describe('prospect-scope', () => {
  describe('PROSPECT_MIN_INTERNAL_NO', () => {
    it('最小有効社内Noが252であること', () => {
      expect(PROSPECT_MIN_INTERNAL_NO).toBe(252);
    });
  });

  describe('isProspectActiveByInternalNo', () => {
    it('internalNo >= 252 は有効', () => {
      const prospect = createMockProspect({ internalNo: 252 });
      expect(isProspectActiveByInternalNo(prospect)).toBe(true);
    });

    it('internalNo = 252 のちょうど境界値は有効', () => {
      const prospect = createMockProspect({ internalNo: 252 });
      expect(isProspectActiveByInternalNo(prospect)).toBe(true);
    });

    it('internalNo > 252 は有効', () => {
      const prospect = createMockProspect({ internalNo: 1000 });
      expect(isProspectActiveByInternalNo(prospect)).toBe(true);
    });

    it('internalNo = 251 は無効', () => {
      const prospect = createMockProspect({ internalNo: 251 });
      expect(isProspectActiveByInternalNo(prospect)).toBe(false);
    });

    it('internalNo < 252 は無効', () => {
      const prospect = createMockProspect({ internalNo: 100 });
      expect(isProspectActiveByInternalNo(prospect)).toBe(false);
    });

    it('internalNo = 1 は無効', () => {
      const prospect = createMockProspect({ internalNo: 1 });
      expect(isProspectActiveByInternalNo(prospect)).toBe(false);
    });

    it('internalNo = 0 は無効', () => {
      const prospect = createMockProspect({ internalNo: 0 });
      expect(isProspectActiveByInternalNo(prospect)).toBe(false);
    });

    it('internalNo = null は無効', () => {
      const prospect = createMockProspect({ internalNo: null });
      expect(isProspectActiveByInternalNo(prospect)).toBe(false);
    });

    it('internalNo = undefined は無効', () => {
      const prospect = createMockProspect({ internalNo: undefined });
      expect(isProspectActiveByInternalNo(prospect)).toBe(false);
    });
  });

  describe('isProspectActive', () => {
    it('internalNo >= 252 は有効', () => {
      const prospect = createMockProspect({ internalNo: 300 });
      expect(isProspectActive(prospect)).toBe(true);
    });

    it('internalNo < 252 は無効', () => {
      const prospect = createMockProspect({ internalNo: 200 });
      expect(isProspectActive(prospect)).toBe(false);
    });

    it('internalNo = null は無効', () => {
      const prospect = createMockProspect({ internalNo: null });
      expect(isProspectActive(prospect)).toBe(false);
    });

    it('internalNo = undefined は無効', () => {
      const prospect = createMockProspect({ internalNo: undefined });
      expect(isProspectActive(prospect)).toBe(false);
    });
  });

  describe('境界値テスト', () => {
    it('internalNo = 252 は有効（境界値）', () => {
      const prospect = createMockProspect({ internalNo: 252 });
      expect(isProspectActive(prospect)).toBe(true);
    });

    it('internalNo = 251 は無効（境界値-1）', () => {
      const prospect = createMockProspect({ internalNo: 251 });
      expect(isProspectActive(prospect)).toBe(false);
    });

    it('internalNo = 253 は有効（境界値+1）', () => {
      const prospect = createMockProspect({ internalNo: 253 });
      expect(isProspectActive(prospect)).toBe(true);
    });
  });

  describe('ステータスとの組み合わせ', () => {
    it('クローズでも internalNo >= 252 なら表示対象', () => {
      const prospect = createMockProspect({
        internalNo: 300,
        status: 'クローズ' as ProspectStatus,
      });
      expect(isProspectActive(prospect)).toBe(true);
    });

    it('入居決定でも internalNo < 252 なら非表示', () => {
      const prospect = createMockProspect({
        internalNo: 100,
        status: '入居決定' as ProspectStatus,
      });
      expect(isProspectActive(prospect)).toBe(false);
    });

    it('新規受付で internalNo >= 252 なら有効', () => {
      const prospect = createMockProspect({
        internalNo: 500,
        status: '新規受付' as ProspectStatus,
      });
      expect(isProspectActive(prospect)).toBe(true);
    });
  });
});
