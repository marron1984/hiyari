/**
 * 未収別の回収フロー情報 API
 *
 * GET /api/collection/receivable/[receivableId] - フロー情報取得
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/firebase-admin';
import {
  getAssignmentByReceivableId,
  getStepLogsByReceivable,
  getTemplateById,
  listStepsByTemplate,
  pauseAssignment,
  resumeAssignment,
} from '@/lib/collection/repo';
import { canViewCollectionFlow } from '@/lib/collection/types';
import type { ViewerContext } from '@/lib/collection/types';
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ receivableId: string }> }
) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    if (!canViewCollectionFlow(currentUser.role)) {
      return NextResponse.json(
        { error: '閲覧権限がありません' },
        { status: 403 }
      );
    }

    const { receivableId } = await params;
    const assignment = getAssignmentByReceivableId(receivableId);

    if (!assignment) {
      return NextResponse.json({
        assignment: null,
        template: null,
        steps: [],
        stepLogs: [],
      });
    }

    const template = getTemplateById(assignment.templateId);
    const steps = listStepsByTemplate(assignment.templateId);
    const stepLogs = getStepLogsByReceivable(receivableId);

    return NextResponse.json({
      assignment,
      template,
      steps,
      stepLogs,
    });
  } catch (error) {
    console.error('Error fetching flow info:', error);
    return NextResponse.json(
      { error: 'フロー情報の取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ receivableId: string }> }
) {
  try {
    const currentUser = await authenticateRequest(request);
    if (!currentUser) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const { receivableId } = await params;
    const body = await request.json();
    const { action } = body;

    if (action === 'pause') {
      const assignment = pauseAssignment(receivableId, currentUser.id);
      if (!assignment) {
        return NextResponse.json(
          { error: '一時停止に失敗しました' },
          { status: 400 }
        );
      }
      return NextResponse.json({ assignment });
    }

    if (action === 'resume') {
      const assignment = resumeAssignment(receivableId, currentUser.id);
      if (!assignment) {
        return NextResponse.json(
          { error: '再開に失敗しました' },
          { status: 400 }
        );
      }
      return NextResponse.json({ assignment });
    }

    return NextResponse.json(
      { error: '不明なアクションです' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error executing action:', error);
    return NextResponse.json(
      { error: 'アクションの実行に失敗しました' },
      { status: 500 }
    );
  }
}
