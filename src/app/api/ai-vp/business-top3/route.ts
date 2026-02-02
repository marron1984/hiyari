/**
 * AI副社長 - 事業別Top3 API
 *
 * GET /api/ai-vp/business-top3
 *
 * クエリパラメータ:
 * - businessUnitId: 特定事業のTop3のみ取得（省略時は全事業）
 *
 * Task 042: AI VP Business Top3 Implementation
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getAllBusinessTop3,
  getBusinessTop3,
  getAlertTop3,
} from '@/lib/aiVp/businessTop3';
import type { ViewerContext } from '@/lib/business/types';

/**
 * GET /api/ai-vp/business-top3
 *
 * 事業別Top3アクションを取得
 * - role+scopeにより、閲覧可能な事業のみ返却
 */
export async function GET(request: NextRequest) {
  try {
    // 認証・権限情報（簡易版：ヘッダーから取得）
    const userId = request.headers.get('x-user-id') || 'user_001';
    const role = (request.headers.get('x-user-role') || 'manager') as ViewerContext['role'];

    // 権限チェック（manager以上のみ）
    if (!['manager', 'admin', 'executive', 'auditor'].includes(role)) {
      return NextResponse.json(
        { error: '権限がありません。manager以上の権限が必要です。' },
        { status: 403 }
      );
    }

    const viewer: ViewerContext = { userId, role };

    const { searchParams } = new URL(request.url);
    const businessUnitId = searchParams.get('businessUnitId');

    // 特定事業のみ
    if (businessUnitId) {
      const result = getBusinessTop3(businessUnitId, viewer);
      if (!result) {
        return NextResponse.json(
          { error: '事業が見つからないか、アクセス権限がありません' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        businessUnit: result,
        generatedAt: new Date().toISOString(),
      });
    }

    // 全事業のTop3
    const summary = getAllBusinessTop3(viewer);

    // 全社アラートも追加
    const globalAlerts = getAlertTop3(viewer);

    return NextResponse.json({
      ...summary,
      globalAlerts,
    });
  } catch (error) {
    console.error('[AI-VP Business Top3] Error:', error);
    return NextResponse.json(
      { error: '事業別Top3の取得に失敗しました' },
      { status: 500 }
    );
  }
}
