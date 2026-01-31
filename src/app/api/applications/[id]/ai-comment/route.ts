// AI副社長・申請承認補助コメント API

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';
import {
  generateApprovalComment,
  getApprovalComment,
} from '@/lib/ai-approval-comment';

// GET: AIコメントを取得
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: applicationId } = await params;

    // 認証チェック
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const auth = getAdminAuth();

    try {
      await auth.verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // 既存のコメントを取得
    let comment = await getApprovalComment(applicationId);

    // コメントがなければ自動生成
    if (!comment) {
      comment = await generateApprovalComment(applicationId, 'system', false);
    }

    return NextResponse.json({
      success: true,
      comment: {
        id: comment.id,
        applicationId: comment.applicationId,
        applicationType: comment.applicationType,
        promptVersion: comment.promptVersion,
        similarApprovalRate: comment.similarApprovalRate,
        similarRejectionRate: comment.similarRejectionRate,
        referenceCaseIds: comment.referenceCaseIds,
        missingInfo: comment.missingInfo,
        cautions: comment.cautions,
        createdAt: comment.createdAt.toISOString(),
        createdBy: comment.createdBy,
        isRegenerated: comment.isRegenerated,
      },
    });
  } catch (error) {
    console.error('Failed to get AI comment:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'コメントの取得に失敗しました' },
      { status: 500 }
    );
  }
}

// POST: AIコメントを再生成
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: applicationId } = await params;

    // 認証チェック
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const auth = getAdminAuth();

    let userId: string;
    try {
      const decoded = await auth.verifyIdToken(token);
      userId = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // コメントを再生成
    const comment = await generateApprovalComment(applicationId, userId, true);

    return NextResponse.json({
      success: true,
      comment: {
        id: comment.id,
        applicationId: comment.applicationId,
        applicationType: comment.applicationType,
        promptVersion: comment.promptVersion,
        similarApprovalRate: comment.similarApprovalRate,
        similarRejectionRate: comment.similarRejectionRate,
        referenceCaseIds: comment.referenceCaseIds,
        missingInfo: comment.missingInfo,
        cautions: comment.cautions,
        createdAt: comment.createdAt.toISOString(),
        createdBy: comment.createdBy,
        isRegenerated: comment.isRegenerated,
      },
    });
  } catch (error) {
    console.error('Failed to regenerate AI comment:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'コメントの再生成に失敗しました' },
      { status: 500 }
    );
  }
}
