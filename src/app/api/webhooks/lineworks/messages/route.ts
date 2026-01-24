import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import {
  determineRiskLevel,
  determineCategory,
  generateDefaultReply,
} from '@/lib/ai-vp-messages';
import { AiReplyStatus } from '@/types/ai-vp';

// Firebase Admin SDK初期化
if (getApps().length === 0) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (serviceAccount) {
    try {
      initializeApp({
        credential: cert(JSON.parse(serviceAccount)),
      });
    } catch {
      // Already initialized or error
    }
  }
}

const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || 'default';
const LINEWORKS_WEBHOOK_TOKEN = process.env.LINEWORKS_WEBHOOK_TOKEN;
const APP_ENV = process.env.NEXT_PUBLIC_APP_ENV || 'production';

interface LineWorksMessagePayload {
  type: string;
  source: {
    userId: string;
    channelId?: string;
    domainId?: number;
  };
  issuedTime: string;
  content: {
    type: string;
    text?: string;
    postback?: string;
  };
}

/**
 * LINE WORKS Webhook受信エンドポイント
 * POST /api/webhooks/lineworks/messages
 */
export async function POST(request: NextRequest) {
  try {
    // トークン検証
    const webhookToken = request.headers.get('X-Webhook-Token');
    if (!webhookToken || webhookToken !== LINEWORKS_WEBHOOK_TOKEN) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();

    // 検証リクエストの場合
    if (body.type === 'verification') {
      return NextResponse.json({ challenge: body.challenge });
    }

    // メッセージイベント以外は無視
    if (body.type !== 'message') {
      return NextResponse.json({ ok: true, message: 'Event type ignored' });
    }

    const payload = body as LineWorksMessagePayload;

    // テキストメッセージ以外は無視
    if (payload.content.type !== 'text' || !payload.content.text) {
      return NextResponse.json({ ok: true, message: 'Non-text message ignored' });
    }

    const db = getFirestore();
    const now = Timestamp.now();

    // メッセージを保存
    const messageId = `lw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const messageData = {
      tenantId: DEFAULT_TENANT_ID,
      messageId,
      roomId: payload.source.channelId || 'direct',
      senderId: payload.source.userId,
      senderName: 'LINE WORKS User', // TODO: ユーザー名を取得
      text: payload.content.text,
      receivedAt: now,
      createdAt: now,
    };

    const messageRef = await db.collection('lwMessages').add(messageData);

    // リスクレベルとカテゴリを判定
    const riskLevel = determineRiskLevel(payload.content.text);
    const category = determineCategory(payload.content.text);

    // AI返信の下書きを生成
    const draftText = generateDefaultReply(category, riskLevel);

    // L1は自動返信可能、L2/L3は承認待ち
    const status: AiReplyStatus = riskLevel === 'L1' ? 'draft' : 'pending_approval';

    // エスカレーション理由
    let escalationReason: string | undefined;
    if (riskLevel === 'L3') {
      escalationReason = '高リスク判定のため吉田承認が必要です';
    } else if (riskLevel === 'L2') {
      escalationReason = '中リスク判定のため管理者承認が必要です';
    }

    // AI返信を作成
    const replyData = {
      tenantId: DEFAULT_TENANT_ID,
      messageId: messageRef.id,
      riskLevel,
      category,
      draftText,
      status,
      escalationReason,
      createdAt: now,
      updatedAt: now,
    };

    const replyRef = await db.collection('aiReplies').add(replyData);

    // 監査ログを記録
    const auditData = {
      tenantId: DEFAULT_TENANT_ID,
      replyId: replyRef.id,
      action: 'message_received',
      details: {
        messageId: messageRef.id,
        riskLevel,
        category,
        status,
        textLength: payload.content.text.length,
      },
      dryRun: APP_ENV === 'preview',
      createdAt: now,
    };

    await db.collection('aiReplyAuditLogs').add(auditData);

    // L1の場合、Preview環境でなければ自動送信処理をキックできる
    // TODO: PR4で実装 - 自動送信ジョブ

    return NextResponse.json({
      ok: true,
      messageId: messageRef.id,
      replyId: replyRef.id,
      riskLevel,
      category,
      status,
      preview: APP_ENV === 'preview',
    });

  } catch (error) {
    // エラーログ（機密情報は出さない）
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      { error: 'Internal server error', message: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * ヘルスチェック用GET
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: 'AI VP LINE WORKS Webhook',
    env: APP_ENV,
    timestamp: new Date().toISOString(),
  });
}
