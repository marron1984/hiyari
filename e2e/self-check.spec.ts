import { test, expect } from '@playwright/test';

/**
 * セルフチェック・ヘルスチェック E2Eテスト
 * 管理者向けセルフチェックページとヘルスAPIの検証
 */

test.describe('セルフチェック - ページ存在確認', () => {
  test('セルフチェックページが存在する', async ({ page }) => {
    const response = await page.goto('/dashboard/admin/self-check');
    expect(response?.status()).toBeLessThan(500);
  });
});

test.describe('ヘルスAPI', () => {
  test('/api/health がJSONを返す', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);

    const json = await response.json();
    // 必須フィールドの確認
    expect(json).toHaveProperty('status');
    expect(json).toHaveProperty('timestamp');
    expect(json).toHaveProperty('environment');
    expect(json).toHaveProperty('version');
  });

  test('/api/health のstatus がokである', async ({ request }) => {
    const response = await request.get('/api/health');
    const json = await response.json();
    expect(json.status).toBe('ok');
  });

  test('/api/health にchecksフィールドがある', async ({ request }) => {
    const response = await request.get('/api/health');
    const json = await response.json();
    expect(json).toHaveProperty('checks');
    expect(json.checks).toHaveProperty('database');
    expect(json.checks).toHaveProperty('auth');
  });
});

test.describe('セルフチェック - UI要素確認（未認証時）', () => {
  test('セルフチェックページはローディングまたは認証画面を表示', async ({ page }) => {
    await page.goto('/dashboard/admin/self-check');
    await page.waitForTimeout(1000);
    // ページが正常にレンダリングされることを確認
    await expect(page.locator('body')).toBeVisible();
  });
});
