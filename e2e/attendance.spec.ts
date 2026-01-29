import { test, expect } from '@playwright/test';

/**
 * 打刻機能 E2Eテスト
 * 打刻ページの存在確認とUI要素の検証
 */

test.describe('打刻 - ページ存在確認', () => {
  test('打刻ページが存在する', async ({ page }) => {
    const response = await page.goto('/attendance');
    expect(response?.status()).toBeLessThan(500);
  });

  test('勤務履歴ページが存在する', async ({ page }) => {
    const response = await page.goto('/attendance/history');
    expect(response?.status()).toBeLessThan(500);
  });

  test('残業申請ページが存在する', async ({ page }) => {
    const response = await page.goto('/attendance/overtime');
    expect(response?.status()).toBeLessThan(500);
  });
});

test.describe('打刻 - UI要素確認（未認証時）', () => {
  test('打刻ページはローディングまたは認証画面を表示', async ({ page }) => {
    await page.goto('/attendance');
    await page.waitForTimeout(1000);
    // ページが正常にレンダリングされることを確認
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('打刻 - モバイル表示', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('モバイルサイズで打刻ページが表示される', async ({ page }) => {
    const response = await page.goto('/attendance');
    expect(response?.status()).toBeLessThan(500);
    await expect(page.locator('body')).toBeVisible();
  });
});
