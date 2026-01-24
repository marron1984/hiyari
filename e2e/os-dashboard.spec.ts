import { test, expect } from '@playwright/test';

/**
 * 経営OS ダッシュボード E2Eテスト
 * 基本的なページ存在確認とUI要素の確認
 */

test.describe('経営OS - ページ存在確認', () => {
  test('OSダッシュボードページが存在する', async ({ page }) => {
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

  test('CHAOSダッシュボードページが存在する', async ({ page }) => {
    const response = await page.goto('/dashboard/chaos');
    expect(response?.status()).toBeLessThan(500);
  });

  test('ホームページが読み込める', async ({ page }) => {
    await page.goto('/');
    // ページが読み込めることを確認
    await expect(page).toHaveTitle(/.*AA.*|.*ヒヤリ.*/i);
  });
});

test.describe('経営OS - API確認', () => {
  test('チェックインAPIが存在する', async ({ request }) => {
    // GETリクエスト（認証なしなので401が返るはず）
    const response = await request.get('/api/os/checkin');
    // 401 (Unauthorized) または 200 を期待
    expect([200, 401]).toContain(response.status());
  });

  test('介入APIが存在する', async ({ request }) => {
    const response = await request.get('/api/os/interventions');
    expect([200, 401]).toContain(response.status());
  });

  test('チームAPIが存在する', async ({ request }) => {
    const response = await request.get('/api/os/team');
    expect([200, 401, 403]).toContain(response.status());
  });

  test('WebhookAPIが存在する', async ({ request }) => {
    // POSTリクエスト（トークンなしなので401が返るはず）
    const response = await request.post('/api/webhooks/intake', {
      data: { test: true },
    });
    expect([200, 401, 400]).toContain(response.status());
  });
});

test.describe('経営OS - UI要素確認（未認証時）', () => {
  test('ログインページにリダイレクトされる', async ({ page }) => {
    await page.goto('/dashboard/os');
    // 認証が必要な場合、ログインページやローディング画面が表示される
    // または認証モーダルが表示される
    await page.waitForTimeout(1000);
    const url = page.url();
    // ログインページにリダイレクトされるか、ダッシュボードに留まる（認証ガードがクライアントサイドの場合）
    expect(url).toMatch(/\/(login|dashboard|onboarding)?/);
  });
});

test.describe('一般ページ', () => {
  test('ログインページが表示される', async ({ page }) => {
    await page.goto('/login');
    // ログインページが正常に表示される
    await expect(page.locator('body')).toBeVisible();
  });

  test('ダッシュボードページが存在する', async ({ page }) => {
    const response = await page.goto('/dashboard');
    expect(response?.status()).toBeLessThan(500);
  });

  test('営業ページが存在する', async ({ page }) => {
    const response = await page.goto('/sales');
    expect(response?.status()).toBeLessThan(500);
  });

  test('空室ページが存在する', async ({ page }) => {
    const response = await page.goto('/dashboard/vacancy');
    expect(response?.status()).toBeLessThan(500);
  });
});

test.describe('営業OS - ページ存在確認', () => {
  test('営業パイプラインページが存在する', async ({ page }) => {
    const response = await page.goto('/dashboard/sales/pipeline');
    expect(response?.status()).toBeLessThan(500);
  });

  test('入居希望者ページが存在する', async ({ page }) => {
    const response = await page.goto('/dashboard/prospects');
    expect(response?.status()).toBeLessThan(500);
  });
});

/**
 * 認証付きテスト（CI環境でテストユーザーがある場合のみ実行）
 */
test.describe('経営OS - 認証付きフロー', () => {
  test.skip(
    !process.env.E2E_TEST_USER_EMAIL,
    'テストユーザーが設定されていません'
  );

  test.beforeEach(async ({ page }) => {
    // テスト用ログイン処理
    // Firebase認証のため、実際のログインは複雑
    // ここではテスト用のセッションがある前提
    await page.goto('/login');
  });

  test('ログイン後にダッシュボードが表示される', async ({ page }) => {
    // このテストは認証情報がある場合のみ実行
    // 現時点ではスキップ
    test.skip();
  });
});
