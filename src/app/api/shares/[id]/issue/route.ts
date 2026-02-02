/**
 * 外部共有 発行API
 *
 * POST /api/shares/[id]/issue
 *
 * Task 040: 承認フロー対応
 * 承認完了後にのみ呼び出し可能。トークンを生成しURLを発行する。
 */

import { NextRequest, NextResponse } from 'next/server';
import { issueShare, getShareById } from '@/lib/shares/share-service';
import { getApprovalRequest, approveRequest } from '@/lib/approvals/requestRepo';

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * POST /api/shares/[id]/issue
 * 共有を発行（承認後）
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: shareId } = await context.params;

    // 共有パッケージの存在確認
    const share = getShareById(shareId);
    if (!share) {
      return NextResponse.json(
        { success: false, error: '共有パッケージが見つかりません' },
        { status: 404 }
      );
    }

    // 承認待ち状態の確認
    if (share.status !== 'pending_approval') {
      return NextResponse.json(
        { success: false, error: '承認待ち状態でのみ発行が可能です' },
        { status: 400 }
      );
    }

    // 承認申請を承認（approvals側）
    if (share.approvalRequestId) {
      const approvalReq = getApprovalRequest(share.approvalRequestId);
      if (approvalReq && approvalReq.status === 'pending') {
        // TODO: 実際の承認者情報を取得
        approveRequest(
          share.approvalRequestId,
          'manager', // TODO: 実際のユーザーIDを取得
          '承認者',  // TODO: 実際のユーザー名を取得
          '外部共有を承認しました'
        );
      }
    }

    // 共有を発行
    // TODO: 実際のユーザーIDを取得
    const result = issueShare(
      shareId,
      'manager',
      '承認者'
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      shareId: result.response.shareId,
      shareUrl: result.response.shareUrl,
      token: result.response.token, // 一度だけ表示
      status: result.response.status,
      issuedAt: result.response.issuedAt,
      expiresAt: result.response.expiresAt,
      message: 'このトークンは一度だけ表示されます。安全に保管してください。',
    });
  } catch (error) {
    console.error('Failed to issue share:', error);
    return NextResponse.json(
      { success: false, error: '共有の発行に失敗しました' },
      { status: 500 }
    );
  }
}
