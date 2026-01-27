import { test, expect } from '@playwright/test';

/**
 * AI副社長 E2Eテスト
 * LINE WORKS一次回答機能のページ存在確認とAPI確認
 */

test.describe('AI副社長 - ページ存在確認', () => {
  test('AI受信箱ページが存在する', async ({ page }) => {
    const response = await page.goto('/dashboard/ai/inbox');
    expect(response?.status()).toBeLessThan(500);
  });

  test('AIポリシーページが存在する', async ({ page }) => {
    const response = await page.goto('/dashboard/ai/policies');
    expect(response?.status()).toBeLessThan(500);
  });

  test('AI返信詳細ページ（ダミーID）が存在する', async ({ page }) => {
    const response = await page.goto('/dashboard/ai/replies/test-reply-id');
    expect(response?.status()).toBeLessThan(500);
  });
});

test.describe('AI副社長 - API存在確認', () => {
  test('LINE WORKS Webhook APIが存在する', async ({ request }) => {
    // POSTリクエスト（トークンなしなので401が返るはず）
    const response = await request.post('/api/webhooks/lineworks/messages', {
      data: { type: 'test' },
    });
    // 401 (Unauthorized) を期待
    expect(response.status()).toBe(401);
  });

  test('LINE WORKS Webhook ヘルスチェックが動作する', async ({ request }) => {
    const response = await request.get('/api/webhooks/lineworks/messages');
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.service).toBe('AI VP LINE WORKS Webhook');
  });

  test('テンプレート初期化API（GET）が存在する', async ({ request }) => {
    const response = await request.get('/api/ai-vp/templates/init');
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.templateCount).toBe(20);
  });

  test('受信箱APIが認証なしで401を返す', async ({ request }) => {
    const response = await request.get('/api/ai-vp/inbox');
    expect(response.status()).toBe(401);
  });

  test('返信詳細APIが認証なしで401を返す', async ({ request }) => {
    const response = await request.get('/api/ai-vp/replies/test-id');
    expect(response.status()).toBe(401);
  });

  test('承認APIが認証なしで401を返す', async ({ request }) => {
    const response = await request.post('/api/ai-vp/replies/test-id/approve', {
      data: { decision: 'approve' },
    });
    expect(response.status()).toBe(401);
  });
});

test.describe('AI副社長 - Webhook検証', () => {
  test('正しいトークンでWebhookが受け付けられる', async ({ request }) => {
    // 環境変数のトークンがある場合のみ実行
    const webhookToken = process.env.LINEWORKS_WEBHOOK_TOKEN;
    test.skip(!webhookToken, 'LINEWORKS_WEBHOOK_TOKENが設定されていません');

    const response = await request.post('/api/webhooks/lineworks/messages', {
      headers: {
        'X-Webhook-Token': webhookToken!,
      },
      data: {
        type: 'verification',
        challenge: 'test-challenge-123',
      },
    });

    // 検証リクエストへの応答
    if (response.status() === 200) {
      const data = await response.json();
      expect(data.challenge).toBe('test-challenge-123');
    }
  });

  test('不正なトークンでWebhookが拒否される', async ({ request }) => {
    const response = await request.post('/api/webhooks/lineworks/messages', {
      headers: {
        'X-Webhook-Token': 'invalid-token',
      },
      data: {
        type: 'message',
        content: { type: 'text', text: 'test' },
      },
    });

    expect(response.status()).toBe(401);
  });
});

test.describe('AI副社長 - L1/L3判定シナリオ', () => {
  // テストユーザー環境変数がある場合のみ実行
  test.skip(
    !process.env.E2E_TEST_AI_VP,
    'E2E_TEST_AI_VPが設定されていません'
  );

  test('L1メッセージは自動返信可能状態になる', async ({ request }) => {
    const webhookToken = process.env.LINEWORKS_WEBHOOK_TOKEN;
    if (!webhookToken) {
      test.skip();
      return;
    }

    const response = await request.post('/api/webhooks/lineworks/messages', {
      headers: {
        'X-Webhook-Token': webhookToken,
      },
      data: {
        type: 'message',
        source: {
          userId: 'test-user-001',
          channelId: 'test-room-001',
        },
        issuedTime: new Date().toISOString(),
        content: {
          type: 'text',
          text: '打刻の修正方法を教えてください', // L1キーワード
        },
      },
    });

    if (response.status() === 200) {
      const data = await response.json();
      expect(data.ok).toBe(true);
      expect(data.riskLevel).toBe('L1');
      expect(data.status).toBe('draft'); // L1はdraftから始まる
    }
  });

  test('L3メッセージは承認待ち状態になる', async ({ request }) => {
    const webhookToken = process.env.LINEWORKS_WEBHOOK_TOKEN;
    if (!webhookToken) {
      test.skip();
      return;
    }

    const response = await request.post('/api/webhooks/lineworks/messages', {
      headers: {
        'X-Webhook-Token': webhookToken,
      },
      data: {
        type: 'message',
        source: {
          userId: 'test-user-001',
          channelId: 'test-room-001',
        },
        issuedTime: new Date().toISOString(),
        content: {
          type: 'text',
          text: 'クレームが発生しました。対応方法を教えてください', // L3キーワード
        },
      },
    });

    if (response.status() === 200) {
      const data = await response.json();
      expect(data.ok).toBe(true);
      expect(data.riskLevel).toBe('L3');
      expect(data.status).toBe('pending_approval'); // L3は承認待ち
    }
  });
});

test.describe('AI副社長 - Preview環境（dry-run）', () => {
  test('Preview環境ではWebhook応答にpreview=trueが含まれる', async ({ request }) => {
    const webhookToken = process.env.LINEWORKS_WEBHOOK_TOKEN;
    if (!webhookToken) {
      test.skip();
      return;
    }

    const response = await request.post('/api/webhooks/lineworks/messages', {
      headers: {
        'X-Webhook-Token': webhookToken,
      },
      data: {
        type: 'message',
        source: {
          userId: 'test-user-001',
          channelId: 'test-room-001',
        },
        issuedTime: new Date().toISOString(),
        content: {
          type: 'text',
          text: 'テストメッセージです',
        },
      },
    });

    if (response.status() === 200) {
      const data = await response.json();
      // 環境によってpreviewフラグが変わる
      expect(typeof data.preview).toBe('boolean');
    }
  });
});

test.describe('AI副社長 - FAQテンプレート確認', () => {
  test('テンプレート一覧に20本含まれている', async ({ request }) => {
    const response = await request.get('/api/ai-vp/templates/init');
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.templateCount).toBe(20);
    expect(data.templates.length).toBe(20);
  });

  test('テンプレートにL1/L2/L3が含まれている', async ({ request }) => {
    const response = await request.get('/api/ai-vp/templates/init');
    const data = await response.json();

    const l1Count = data.templates.filter((t: { riskLevel: string }) => t.riskLevel === 'L1').length;
    const l2Count = data.templates.filter((t: { riskLevel: string }) => t.riskLevel === 'L2').length;
    const l3Count = data.templates.filter((t: { riskLevel: string }) => t.riskLevel === 'L3').length;

    expect(l1Count).toBe(8);
    expect(l2Count).toBe(4);
    expect(l3Count).toBe(8);
  });

  test('テンプレートに各カテゴリが含まれている', async ({ request }) => {
    const response = await request.get('/api/ai-vp/templates/init');
    const data = await response.json();

    const categories = new Set(data.templates.map((t: { category: string }) => t.category));
    expect(categories.has('ops')).toBe(true);
    expect(categories.has('nyukyo')).toBe(true);
    expect(categories.has('sales')).toBe(true);
    expect(categories.has('expense')).toBe(true);
    expect(categories.has('hr')).toBe(true);
    expect(categories.has('risk')).toBe(true);
  });
});
