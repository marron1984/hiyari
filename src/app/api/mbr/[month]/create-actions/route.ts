/**
 * POST /api/mbr/{month}/create-actions
 *
 * Ticket 128: MBR改善タスク自動起票
 *
 * - admin/managerのみ実行可能
 * - 冪等: 同一MBRから何度呼んでも増殖しない
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyIdToken } from '@/lib/firebase-admin';
import { getMbrByMonth } from '@/lib/mbr/mbrRepo';
import { createCorrectiveActionsFromMbr } from '@/lib/mbr/createCorrectiveActionsFromMbr';
import type { AppRole } from '@/config/appRoles';

/** admin / manager / executive のみ許可 */
const ALLOWED_ROLES: AppRole[] = ['admin', 'manager', 'executive'];

async function getAuthUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    return await verifyIdToken(authHeader.replace('Bearer ', ''));
  } catch {
    return null;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ month: string }> }
) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ロールチェック（ヘッダーまたはデフォルト）
  const role = (request.headers.get('x-user-role') || 'staff') as AppRole;
  if (!ALLOWED_ROLES.includes(role)) {
    return NextResponse.json(
      { error: 'この操作には管理者権限が必要です' },
      { status: 403 }
    );
  }

  const { month } = await params;

  // 月フォーマット検証
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json(
      { error: 'Invalid month format. Use YYYY-MM' },
      { status: 400 }
    );
  }

  // MBR取得
  const mbr = getMbrByMonth(month);
  if (!mbr) {
    return NextResponse.json(
      { error: `MBR not found for month ${month}` },
      { status: 404 }
    );
  }

  // nextMonthFocusチェック
  if (!mbr.sections.nextMonthFocus || mbr.sections.nextMonthFocus.length === 0) {
    return NextResponse.json(
      { error: 'MBR has no nextMonthFocus items' },
      { status: 400 }
    );
  }

  try {
    const result = createCorrectiveActionsFromMbr(mbr, user.uid);

    return NextResponse.json({
      createdCount: result.createdCount,
      skippedCount: result.skippedCount,
      created: result.created,
      skipped: result.skipped,
    });
  } catch (error) {
    console.error('[MBR Create Actions] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create corrective actions' },
      { status: 500 }
    );
  }
}
