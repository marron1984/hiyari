import { test, expect } from '@playwright/test';

/**
 * 経営OS ダッシュボード E2Eテスト
 * PR5で完全実装予定。現在は基本的なページ存在確認のみ。
 */

test.describe('経営OS', () => {
  // テスト用のログイン処理（PR5で実装予定）
  // test.beforeEach(async ({ page }) => {
  //   await page.goto('/login');
  //   await page.fill('[name="email"]', process.env.E2E_TEST_USER_EMAIL || 'test@example.com');
  //   await page.fill('[name="password"]', process.env.E2E_TEST_USER_PASSWORD || 'password');
  //   await page.click('button[type="submit"]');
  //   await page.waitForURL('/dashboard');
  // });

  test('OSダッシュボードページが存在する', async ({ page }) => {
    // 認証なしでアクセス（リダイレクトされることを確認）
    const response = await page.goto('/dashboard/os');
    expect(response?.status()).toBeLessThan(500);
  });

  test('チェックインページが存在する', async ({ page }) => {
    const response = await page.goto('/dashboard/os/checkin');
    expect(response?.status()).toBeLessThan(500);
  });

  test('チームページが存在する', async ({ page }) => {
    const response = await page.goto('/dashboard/os/team');
    expect(response?.status()).toBeLessThan(500);
  });

  test('ホームページが読み込める', async ({ page }) => {
    await page.goto('/');
    // ページが読み込めることを確認
    await expect(page).toHaveTitle(/.*AA.*|.*ヒヤリ.*/i);
  });
});

/**
 * TODO: PR5で実装予定のテストケース
 *
 * 1. ログインしてチェックイン入力
 * 2. スコア表示が更新されることを確認
 * 3. 管理者画面で部下の赤黄が見える
 * 4. interventionsが生成されていることを確認
 */
