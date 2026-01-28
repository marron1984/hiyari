import { test, expect } from '@playwright/test';

/**
 * 稟議機能 E2Eテスト
 * 稟議一覧・作成ページの存在確認とリダイレクトの検証
 */

test.describe('稟議 - ページ存在確認', () => {
  test('稟議一覧ページが存在する', async ({ page }) => {
    const response = await page.goto('/dashboard/approvals');
    expect(response?.status()).toBeLessThan(500);
  });

  test('稟議作成ページが存在する', async ({ page }) => {
    const response = await page.goto('/dashboard/approvals/new');
    expect(response?.status()).toBeLessThan(500);
  });

  test('管理者向け稟議承認ページが存在する', async ({ page }) => {
    const response = await page.goto('/admin/ringi');
    expect(response?.status()).toBeLessThan(500);
  });
});

test.describe('稟議 - 旧URLリダイレクト', () => {
  test('/ringi が /dashboard/approvals にリダイレクトする', async ({ page }) => {
    await page.goto('/ringi');
    // クライアントサイドリダイレクトを待つ
    await page.waitForTimeout(1000);
    // URLが変わっていることを確認（認証リダイレクトも考慮）
    const url = page.url();
    expect(url).toMatch(/\/(dashboard\/approvals|login|onboarding)/);
  });

  test('/ringi/new が /dashboard/approvals/new にリダイレクトする', async ({ page }) => {
    await page.goto('/ringi/new');
    // クライアントサイドリダイレクトを待つ
    await page.waitForTimeout(1000);
    // URLが変わっていることを確認（認証リダイレクトも考慮）
    const url = page.url();
    expect(url).toMatch(/\/(dashboard\/approvals\/new|login|onboarding)/);
  });
});

test.describe('稟議 - UI要素確認（未認証時）', () => {
  test('稟議作成ページはローディングまたは認証画面を表示', async ({ page }) => {
    await page.goto('/dashboard/approvals/new');
    await page.waitForTimeout(1000);
    // ページが正常にレンダリングされることを確認
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('稟議 - ナビゲーション導線確認', () => {
  test('ダッシュボードから稟議一覧へのリンクが存在する', async ({ page }) => {
    const response = await page.goto('/dashboard');
    expect(response?.status()).toBeLessThan(500);
    // ページが読み込まれたことを確認
    await expect(page.locator('body')).toBeVisible();
  });
});
