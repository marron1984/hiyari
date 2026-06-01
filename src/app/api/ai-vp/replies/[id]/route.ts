import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { authenticateRequest } from '@/lib/firebase-admin';
import { isAiVpOwner } from '@/lib/auth';
import { toDate } from '@/lib/date';

/**
 * AI返信詳細取得API
 * GET /api/ai-vp/replies/[id]
 *
 * 返信、元メッセージ、承認履歴、テンプレートを取得
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: replyId } = await params;

    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    if (!isAiVpOwner(currentUser.email)) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'AI VP owner access required' },
        { status: 403 }
      );
    }

    const db = getFirestore();

    // 返信を取得
    const replyDoc = await db.collection('aiReplies').doc(replyId).get();

    if (!replyDoc.exists) {
      return NextResponse.json(
        { error: 'Not found', message: 'Reply not found' },
        { status: 404 }
      );
    }

    const replyData = replyDoc.data()!;
    const reply = {
      id: replyDoc.id,
      messageId: replyData.messageId,
      riskLevel: replyData.riskLevel,
      category: replyData.category,
      draftText: replyData.draftText,
      finalText: replyData.finalText,
      status: replyData.status,
      templateId: replyData.templateId,
      escalationReason: replyData.escalationReason,
      createdAt: toDate(replyData.createdAt)?.toISOString(),
      updatedAt: toDate(replyData.updatedAt)?.toISOString(),
      sentAt: toDate(replyData.sentAt)?.toISOString(),
    };

    // 元メッセージを取得
    let message = null;
    if (replyData.messageId) {
      const messageDoc = await db.collection('lwMessages').doc(replyData.messageId).get();
      if (messageDoc.exists) {
        const messageData = messageDoc.data()!;
        message = {
          id: messageDoc.id,
          messageId: messageData.messageId,
          roomId: messageData.roomId,
          senderId: messageData.senderId,
          senderName: messageData.senderName,
          senderRole: messageData.senderRole,
          text: messageData.text,
          receivedAt: toDate(messageData.receivedAt)?.toISOString(),
          createdAt: toDate(messageData.createdAt)?.toISOString(),
        };
      }
    }

    // 承認履歴を取得
    const approvalsSnapshot = await db.collection('aiApprovals')
      .where('replyId', '==', replyId)
      .orderBy('createdAt', 'desc')
      .get();

    const approvals = approvalsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        approverId: data.approverId,
        approverName: data.approverName,
        decision: data.decision,
        note: data.note,
        revisedText: data.revisedText,
        decidedAt: toDate(data.decidedAt)?.toISOString(),
        createdAt: toDate(data.createdAt)?.toISOString(),
      };
    });

    // テンプレートを取得
    let template = null;
    if (replyData.templateId) {
      const templateDoc = await db.collection('aiTemplates').doc(replyData.templateId).get();
      if (templateDoc.exists) {
        const templateData = templateDoc.data()!;
        template = {
          id: templateDoc.id,
          key: templateData.key,
          title: templateData.title,
          category: templateData.category,
          riskLevel: templateData.riskLevel,
        };
      }
    }

    return NextResponse.json({
      ok: true,
      reply,
      message,
      approvals,
      template,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Internal server error', message },
      { status: 500 }
    );
  }
}
