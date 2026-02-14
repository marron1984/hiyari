import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { isAiVpOwner } from '@/lib/auth';
import { sendLineWorksMessage } from '@/lib/lineworks';
import { AiReplyStatus } from '@/types/ai-vp';

const DEFAULT_TENANT_ID = 'defaultTenant';
const APP_ENV = process.env.NEXT_PUBLIC_APP_ENV || 'production';

interface ApprovalRequest {
  decision: 'approve' | 'revise' | 'reject';
  note?: string;
  revisedText?: string;
  approverId: string;
  approverName: string;
}

/**
 * AI返信承認API
 * POST /api/ai-vp/replies/[id]/approve
 *
 * decision: approve | revise | reject
 * - approve: 下書きをそのまま承認して送信
 * - revise: 修正テキストで承認して送信
 * - reject: 却下（送信しない）
 *
 * Preview環境（APP_ENV=preview）では送信せずdry-runとして記録。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: replyId } = await params;
    const userEmail = request.headers.get('X-User-Email');

    // 権限チェック
    if (!userEmail || !isAiVpOwner(userEmail)) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'AI VP owner access required' },
        { status: 401 }
      );
    }

    const body = await request.json() as ApprovalRequest;
    const { decision, note, revisedText, approverId, approverName } = body;

    if (!decision || !['approve', 'revise', 'reject'].includes(decision)) {
      return NextResponse.json(
        { error: 'Bad request', message: 'Invalid decision' },
        { status: 400 }
      );
    }

    if (decision === 'revise' && !revisedText) {
      return NextResponse.json(
        { error: 'Bad request', message: 'revisedText is required for revise decision' },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    const now = Timestamp.now();
    const isPreview = APP_ENV === 'preview';

    // 返信を取得
    const replyRef = db.collection('aiReplies').doc(replyId);
    const replyDoc = await replyRef.get();

    if (!replyDoc.exists) {
      return NextResponse.json(
        { error: 'Not found', message: 'Reply not found' },
        { status: 404 }
      );
    }

    const replyData = replyDoc.data()!;

    // 既に処理済みかチェック
    if (['sent', 'rejected'].includes(replyData.status)) {
      return NextResponse.json(
        { error: 'Bad request', message: `Reply already ${replyData.status}` },
        { status: 400 }
      );
    }

    // 承認記録を作成
    const approvalData = {
      tenantId: DEFAULT_TENANT_ID,
      replyId,
      approverId: approverId || 'unknown',
      approverName: approverName || 'Unknown',
      decision,
      note: note || null,
      revisedText: revisedText || null,
      decidedAt: now,
      createdAt: now,
    };

    const approvalRef = await db.collection('aiApprovals').add(approvalData);

    // 却下の場合
    if (decision === 'reject') {
      await replyRef.update({
        status: 'rejected' as AiReplyStatus,
        updatedAt: now,
      });

      // 監査ログ
      await db.collection('aiReplyAuditLogs').add({
        tenantId: DEFAULT_TENANT_ID,
        replyId,
        action: 'rejected',
        actorId: approverId,
        actorName: approverName,
        details: { note, approvalId: approvalRef.id },
        dryRun: isPreview,
        createdAt: now,
      });

      return NextResponse.json({
        ok: true,
        decision: 'reject',
        approvalId: approvalRef.id,
        status: 'rejected',
        sent: false,
        preview: isPreview,
      });
    }

    // 承認/修正の場合
    const finalText = decision === 'revise' ? revisedText : replyData.draftText;

    // Preview環境の場合は送信しない
    if (isPreview) {
      await replyRef.update({
        status: 'approved' as AiReplyStatus,
        finalText,
        updatedAt: now,
      });

      // 監査ログ（dry-run）
      await db.collection('aiReplyAuditLogs').add({
        tenantId: DEFAULT_TENANT_ID,
        replyId,
        action: 'approved_dry_run',
        actorId: approverId,
        actorName: approverName,
        details: {
          decision,
          note,
          approvalId: approvalRef.id,
          finalTextLength: finalText.length,
        },
        dryRun: true,
        createdAt: now,
      });

      return NextResponse.json({
        ok: true,
        decision,
        approvalId: approvalRef.id,
        status: 'approved',
        sent: false,
        preview: true,
        message: 'Preview environment: message not sent (dry-run)',
      });
    }

    // 本番環境：LINE WORKSに送信
    // メッセージを取得してroomIdを得る
    const messageDoc = await db.collection('lwMessages').doc(replyData.messageId).get();

    if (!messageDoc.exists) {
      await replyRef.update({
        status: 'failed' as AiReplyStatus,
        updatedAt: now,
      });

      return NextResponse.json(
        { error: 'Not found', message: 'Original message not found' },
        { status: 404 }
      );
    }

    const messageData = messageDoc.data()!;
    const roomId = messageData.roomId;

    // LINE WORKSに送信
    const sendResult = await sendLineWorksMessage(finalText, roomId);

    if (sendResult.success) {
      await replyRef.update({
        status: 'sent' as AiReplyStatus,
        finalText,
        sentAt: now,
        updatedAt: now,
      });

      // 監査ログ
      await db.collection('aiReplyAuditLogs').add({
        tenantId: DEFAULT_TENANT_ID,
        replyId,
        action: 'sent',
        actorId: approverId,
        actorName: approverName,
        details: {
          decision,
          note,
          approvalId: approvalRef.id,
          roomId,
          finalTextLength: finalText.length,
        },
        dryRun: false,
        createdAt: now,
      });

      return NextResponse.json({
        ok: true,
        decision,
        approvalId: approvalRef.id,
        status: 'sent',
        sent: true,
        preview: false,
      });
    } else {
      // 送信失敗
      await replyRef.update({
        status: 'failed' as AiReplyStatus,
        updatedAt: now,
      });

      // 監査ログ
      await db.collection('aiReplyAuditLogs').add({
        tenantId: DEFAULT_TENANT_ID,
        replyId,
        action: 'send_failed',
        actorId: approverId,
        actorName: approverName,
        details: {
          decision,
          note,
          approvalId: approvalRef.id,
          error: sendResult.error,
        },
        dryRun: false,
        createdAt: now,
      });

      return NextResponse.json(
        { error: 'Send failed', message: sendResult.error },
        { status: 500 }
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Internal server error', message },
      { status: 500 }
    );
  }
}
