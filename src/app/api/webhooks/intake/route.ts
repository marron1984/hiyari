// Yoom からの Webhook 受信 API
import { NextRequest, NextResponse } from 'next/server';
import { saveIntakeEvent, createAuditLog } from '@/lib/chaos';

// Webhook トークン検証
function verifyWebhookToken(request: NextRequest): boolean {
  const token = request.headers.get('X-Webhook-Token');
  const expectedToken = process.env.WEBHOOK_TOKEN;

  if (!expectedToken) {
    console.warn('WEBHOOK_TOKEN is not configured');
    return false;
  }

  return token === expectedToken;
}

export async function POST(request: NextRequest) {
  try {
    // トークン検証
    if (!verifyWebhookToken(request)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();

    // 必須フィールドの検証
    if (!body.source) {
      return NextResponse.json(
        { error: 'source is required' },
        { status: 400 }
      );
    }

    // IntakeEvent として保存
    const eventId = await saveIntakeEvent(
      body.source,
      body,
      body.raw_transcript
    );

    // 監査ログ
    await createAuditLog(
      'system',
      'Webhook',
      'intake_received',
      'intakeEvent',
      eventId,
      { source: body.source }
    );

    // TODO: 入居希望者への正規化とスコアリング
    // const prospect = await normalizeToProspect(body);
    // const scoring = await runScoring(prospect.id);

    return NextResponse.json({
      success: true,
      eventId,
      message: 'Intake event received and saved',
    });
  } catch (error) {
    console.error('Webhook intake error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ヘルスチェック用
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/webhooks/intake',
    method: 'POST',
    requiredHeaders: ['X-Webhook-Token'],
  });
}
