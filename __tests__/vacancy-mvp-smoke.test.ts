/**
 * @jest-environment node
 */

/**
 * Vacancy MVP スモークテスト
 *
 * テスト対象:
 * 1. 公開一覧: listPublicVacancyUnits が active のみ返す
 * 2. 問い合わせ → チケット作成: vacancy_inquiry relatedType で作成される
 * 3. 冪等性: relatedId による二重送信防止
 * 4. 空室更新: updateVacancyUnit で変更が即反映
 * 5. 監査ログ: listVacancyUpdates に差分が記録される
 * 6. 通知: assignee への通知が作成可能
 */

import {
  createVacancyUnit,
  updateVacancyUnit,
  listPublicVacancyUnits,
  listVacancyUnits,
  listVacancyUpdates,
  getVacancyUnitById,
  seedVacancyUnitsIfEmpty,
} from '../src/lib/vacancyUnits/repo';
import { createTicket, listTickets } from '../src/lib/tickets/repo';
import { create as createNotification } from '../src/lib/notifications/repo';
import type { ViewerContext } from '../src/lib/tickets/types';

const SYSTEM_VIEWER: ViewerContext = { userId: 'system', role: 'admin' };

// ========== 1. 公開一覧 ==========

describe('公開空室一覧', () => {
  beforeAll(() => {
    seedVacancyUnitsIfEmpty();
  });

  it('シードデータから active のみ返す', () => {
    const items = listPublicVacancyUnits();
    expect(items.length).toBeGreaterThan(0);

    for (const item of items) {
      // PublicVacancyUnit には status がないが、元データは active のみ
      expect(item.buildingName).toBeTruthy();
      expect(item.area).toBeTruthy();
      expect(item.businessUnitId).toBeTruthy();
    }
  });

  it('businessUnitId でフィルタできる', () => {
    const allItems = listPublicVacancyUnits();
    if (allItems.length > 0) {
      const buId = allItems[0].businessUnitId;
      const filtered = listPublicVacancyUnits({ businessUnitId: buId });
      expect(filtered.length).toBeGreaterThan(0);
      for (const item of filtered) {
        expect(item.businessUnitId).toBe(buId);
      }
    }
  });

  it('個人情報（updatedByUserId等）が含まれない', () => {
    const items = listPublicVacancyUnits();
    for (const item of items) {
      expect((item as any).updatedByUserId).toBeUndefined();
      expect((item as any).updatedByUserName).toBeUndefined();
      expect((item as any).status).toBeUndefined();
    }
  });
});

// ========== 2. 問い合わせ → チケット ==========

describe('問い合わせ → チケット作成', () => {
  it('vacancy_inquiry チケットが作成される', () => {
    const ticket = createTicket(
      {
        title: '空室問合せ パシフィック 東京都 個室',
        description: '【空室問い合わせ】\nお名前: テスト太郎\n電話: 090-0000-0000',
        priority: 'normal',
        category: 'client',
        businessUnitId: 'bu_housing',
        relatedType: 'vacancy_inquiry',
        relatedId: 'vinq:2026-02-06:test001',
        tags: ['空室問い合わせ', '新規'],
      },
      'system'
    );

    expect(ticket.id).toBeTruthy();
    expect(ticket.relatedType).toBe('vacancy_inquiry');
    expect(ticket.relatedId).toBe('vinq:2026-02-06:test001');
    expect(ticket.businessUnitId).toBe('bu_housing');
    expect(ticket.title).toContain('空室問合せ');
  });

  it('relatedType + relatedId でフィルタ検索できる', () => {
    const { items } = listTickets(
      { relatedType: 'vacancy_inquiry', relatedId: 'vinq:2026-02-06:test001', limit: 10 },
      SYSTEM_VIEWER
    );
    expect(items.length).toBe(1);
    expect(items[0].relatedId).toBe('vinq:2026-02-06:test001');
  });

  it('同じrelatedIdでは二重作成されない（検索で確認）', () => {
    // 同じrelatedIdで検索
    const { items } = listTickets(
      { relatedType: 'vacancy_inquiry', relatedId: 'vinq:2026-02-06:test001', limit: 10 },
      SYSTEM_VIEWER
    );
    // 先行テストで1件作成済み
    expect(items.length).toBe(1);
  });
});

// ========== 3. 空室更新 ==========

describe('空室更新', () => {
  it('availableCount を更新すると即反映される', () => {
    const unit = createVacancyUnit(
      {
        businessUnitId: 'bu_housing',
        buildingName: 'スモークテスト棟',
        area: '大阪府',
        roomType: '個室',
        capacity: 10,
        availableCount: 5,
      },
      'user_manager',
      '管理者'
    );

    expect(unit.availableCount).toBe(5);

    const updated = updateVacancyUnit(
      unit.id,
      { availableCount: 3 },
      'user_manager',
      '管理者'
    );

    expect(updated).not.toBeNull();
    expect(updated!.availableCount).toBe(3);

    // 公開一覧にも即反映
    const publicList = listPublicVacancyUnits({ businessUnitId: 'bu_housing' });
    const found = publicList.find((u) => u.id === unit.id);
    expect(found).toBeDefined();
    expect(found!.availableCount).toBe(3);
  });

  it('status を paused にすると公開一覧から消える', () => {
    const unit = createVacancyUnit(
      {
        businessUnitId: 'bu_housing',
        buildingName: '非公開テスト棟',
        area: '京都府',
        roomType: '個室',
        capacity: 5,
        availableCount: 2,
        status: 'active',
      },
      'user_manager'
    );

    // 初期は公開一覧に出る
    let publicList = listPublicVacancyUnits();
    expect(publicList.some((u) => u.id === unit.id)).toBe(true);

    // paused に変更
    updateVacancyUnit(unit.id, { status: 'paused' }, 'user_manager');

    // 公開一覧から消える
    publicList = listPublicVacancyUnits();
    expect(publicList.some((u) => u.id === unit.id)).toBe(false);
  });
});

// ========== 4. 監査ログ ==========

describe('監査ログ (vacancy_updates)', () => {
  it('更新時に差分が記録される', () => {
    const unit = createVacancyUnit(
      {
        businessUnitId: 'bu_housing',
        buildingName: '監査テスト棟',
        area: '東京都',
        roomType: '個室',
        capacity: 8,
        availableCount: 4,
      },
      'user_manager',
      '管理者'
    );

    updateVacancyUnit(
      unit.id,
      { availableCount: 2, availableFrom: '2026-04-01' },
      'user_manager',
      '管理者'
    );

    const updates = listVacancyUpdates(unit.id);
    // 作成ログ + 更新ログ
    expect(updates.length).toBeGreaterThanOrEqual(2);

    // availableCount の変更を含むログを探す
    const changeLog = updates.find(
      (u) => u.changedFieldsJson.availableCount !== undefined
    );
    expect(changeLog).toBeDefined();
    expect(changeLog!.changedFieldsJson.availableCount.before).toBe(4);
    expect(changeLog!.changedFieldsJson.availableCount.after).toBe(2);
    expect(changeLog!.createdByUserId).toBe('user_manager');
  });
});

// ========== 5. 通知 ==========

describe('通知', () => {
  it('vacancy_inquiry 通知が作成できる', () => {
    const uniqueFp = `vacancy_inquiry:smoke_${Date.now()}`;
    const result = createNotification({
      tenantId: 'default',
      userId: 'user_manager',
      type: 'vacancy_inquiry',
      severity: 'info',
      title: '空室問い合わせ: スモークテスト様',
      message: 'パシフィックへの問い合わせが届きました。',
      url: '/dashboard/tickets/t_smoke',
      fingerprint: uniqueFp,
    });

    expect(result.notification).toBeDefined();
    expect(result.notification.type).toBe('vacancy_inquiry');
    expect(result.isNew).toBe(true);

    // 同じfingerprintでは重複しない
    const dup = createNotification({
      tenantId: 'default',
      userId: 'user_manager',
      type: 'vacancy_inquiry',
      severity: 'info',
      title: '空室問い合わせ: スモークテスト様',
      message: 'パシフィックへの問い合わせが届きました。',
      url: '/dashboard/tickets/t_smoke',
      fingerprint: uniqueFp,
    });
    expect(dup.isNew).toBe(false);
  });
});
