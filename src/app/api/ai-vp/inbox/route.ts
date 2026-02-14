import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { isAiVpOwner } from '@/lib/auth';
import { toDate } from '@/lib/date';
import { AiReplyRiskLevel, AiReplyStatus } from '@/types/ai-vp';

const DEFAULT_TENANT_ID = 'defaultTenant';

/**
 * AI受信箱一覧API
 * GET /api/ai-vp/inbox
 *
 * クエリパラメータ:
 * - status: フィルター（draft/pending_approval/sent/rejected）
 * - riskLevel: フィルター（L1/L2/L3）
 * - limit: 件数（デフォルト50）
 */
export async function GET(request: NextRequest) {
  try {
    const userEmail = request.headers.get('X-User-Email');

    // 権限チェック
    if (!userEmail || !isAiVpOwner(userEmail)) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'AI VP owner access required' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status') as AiReplyStatus | null;
    const riskFilter = searchParams.get('riskLevel') as AiReplyRiskLevel | null;
    const limitParam = searchParams.get('limit');
    const limitCount = limitParam ? parseInt(limitParam, 10) : 50;

    const db = getAdminDb();

    // メッセージを取得
    const messagesSnapshot = await db.collection('lwMessages')
      .where('tenantId', '==', DEFAULT_TENANT_ID)
      .orderBy('receivedAt', 'desc')
      .limit(limitCount)
      .get();

    interface MessageData {
      id: string;
      messageId: string;
      roomId: string;
      senderId: string;
      senderName: string;
      senderRole?: string;
      text: string;
      receivedAt: string;
      createdAt: string;
    }

    const messages: MessageData[] = messagesSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        messageId: data.messageId,
        roomId: data.roomId,
        senderId: data.senderId,
        senderName: data.senderName,
        senderRole: data.senderRole,
        text: data.text,
        receivedAt: toDate(data.receivedAt)?.toISOString() || '',
        createdAt: toDate(data.createdAt)?.toISOString() || '',
      };
    });

    // 返信を取得
    const repliesSnapshot = await db.collection('aiReplies')
      .where('tenantId', '==', DEFAULT_TENANT_ID)
      .orderBy('createdAt', 'desc')
      .limit(limitCount * 2)
      .get();

    interface ReplyData {
      id: string;
      messageId: string;
      riskLevel: AiReplyRiskLevel;
      category: string;
      draftText: string;
      finalText?: string;
      status: AiReplyStatus;
      templateId?: string;
      escalationReason?: string;
      createdAt: string;
      updatedAt?: string;
      sentAt?: string;
    }

    const repliesMap = new Map<string, ReplyData>();
    repliesSnapshot.docs.forEach(doc => {
      const data = doc.data();
      repliesMap.set(data.messageId, {
        id: doc.id,
        messageId: data.messageId,
        riskLevel: data.riskLevel,
        category: data.category,
        draftText: data.draftText,
        finalText: data.finalText,
        status: data.status,
        templateId: data.templateId,
        escalationReason: data.escalationReason,
        createdAt: toDate(data.createdAt)?.toISOString() || '',
        updatedAt: toDate(data.updatedAt)?.toISOString(),
        sentAt: toDate(data.sentAt)?.toISOString(),
      });
    });

    // メッセージと返信を結合
    let results = messages.map(msg => ({
      ...msg,
      reply: repliesMap.get(msg.id) || null,
    }));

    // フィルター適用
    if (statusFilter) {
      results = results.filter(r => r.reply?.status === statusFilter);
    }
    if (riskFilter) {
      results = results.filter(r => r.reply?.riskLevel === riskFilter);
    }

    // 統計
    const stats = {
      total: results.length,
      pendingApproval: results.filter(r => r.reply?.status === 'pending_approval').length,
      draft: results.filter(r => r.reply?.status === 'draft').length,
      sent: results.filter(r => r.reply?.status === 'sent').length,
      rejected: results.filter(r => r.reply?.status === 'rejected').length,
      l1: results.filter(r => r.reply?.riskLevel === 'L1').length,
      l2: results.filter(r => r.reply?.riskLevel === 'L2').length,
      l3: results.filter(r => r.reply?.riskLevel === 'L3').length,
    };

    return NextResponse.json({
      ok: true,
      messages: results,
      stats,
      filters: {
        status: statusFilter,
        riskLevel: riskFilter,
        limit: limitCount,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Internal server error', message },
      { status: 500 }
    );
  }
}
