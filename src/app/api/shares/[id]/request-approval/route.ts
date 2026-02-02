/**
 * 外部共有 承認依頼API
 *
 * POST /api/shares/[id]/request-approval
 *
 * Task 040: 承認フロー対応
 */

import { NextRequest, NextResponse } from 'next/server';
import { requestShareApproval, getShareById } from '@/lib/shares/share-service';

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * POST /api/shares/[id]/request-approval
 * 承認依頼を作成
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

    // 承認依頼を作成
    // TODO: 実際のユーザーIDを取得
    const result = requestShareApproval(
      shareId,
      'admin',
      '管理者'
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
      approvalRequestId: result.response.approvalRequestId,
      status: result.response.status,
      message: '承認依頼が作成されました。承認後にURLが発行されます。',
    });
  } catch (error) {
    console.error('Failed to request approval:', error);
    return NextResponse.json(
      { success: false, error: '承認依頼の作成に失敗しました' },
      { status: 500 }
    );
  }
}
