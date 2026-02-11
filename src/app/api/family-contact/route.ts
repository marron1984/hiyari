/**
 * 家族連絡ログ API
 *
 * GET  /api/family-contact - 一覧取得
 * POST /api/family-contact - 新規作成
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser, isApiUser } from '@/lib/api-auth';
import { listFamilyLogs, createFamilyLog } from '@/lib/familyLog/repo.firestore';
import type { AppRole } from '@/config/appRoles';
import type {
  ListFamilyLogsOptions,
  CreateFamilyLogRequest,
  FamilyLogSubjectType,
  FamilyLogContactType,
  FamilyLogCategory,
  FamilyLogImportance,
  ViewerContext,
} from '@/lib/familyLog/types';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const viewer: ViewerContext = {
      userId: user.uid,
      role: user.role as AppRole,
    };

    const { searchParams } = new URL(request.url);

    const options: ListFamilyLogsOptions = {};

    const subjectId = searchParams.get('subjectId');
    if (subjectId) options.subjectId = subjectId;

    const subjectType = searchParams.get('subjectType');
    if (subjectType) options.subjectType = subjectType as FamilyLogSubjectType;

    const dateFrom = searchParams.get('dateFrom');
    if (dateFrom) options.dateFrom = dateFrom;

    const dateTo = searchParams.get('dateTo');
    if (dateTo) options.dateTo = dateTo;

    const importance = searchParams.get('importance');
    if (importance) options.importance = importance as FamilyLogImportance;

    const category = searchParams.get('category');
    if (category) options.category = category as FamilyLogCategory;

    const contactType = searchParams.get('contactType');
    if (contactType) options.contactType = contactType as FamilyLogContactType;

    const recordedByUserId = searchParams.get('recordedByUserId');
    if (recordedByUserId) options.recordedByUserId = recordedByUserId;

    const q = searchParams.get('q');
    if (q) options.q = q;

    const limit = searchParams.get('limit');
    if (limit) options.limit = parseInt(limit, 10);

    const offset = searchParams.get('offset');
    if (offset) options.offset = parseInt(offset, 10);

    const { logs, total } = await listFamilyLogs(viewer, options);

    return NextResponse.json({ logs, total });
  } catch (error) {
    console.error('Error listing family logs:', error);
    return NextResponse.json(
      { error: '連絡ログの取得に失敗しました' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireApiUser(request);
    if (!isApiUser(authResult)) return authResult;
    const user = authResult;

    const body = await request.json();

    const createRequest: CreateFamilyLogRequest = {
      subjectType: body.subjectType || 'client',
      subjectId: body.subjectId,
      contactType: body.contactType,
      direction: body.direction,
      category: body.category,
      importance: body.importance || 'normal',
      counterpartName: body.counterpartName,
      counterpartRelation: body.counterpartRelation,
      summary: body.summary,
      detail: body.detail,
      occurredAt: body.occurredAt || new Date().toISOString(),
      relatedType: body.relatedType,
      relatedId: body.relatedId,
    };

    if (!createRequest.subjectId || !createRequest.summary) {
      return NextResponse.json(
        { error: '必須項目が不足しています' },
        { status: 400 }
      );
    }

    const log = await createFamilyLog(createRequest, user.uid);

    return NextResponse.json({ log }, { status: 201 });
  } catch (error) {
    console.error('Error creating family log:', error);
    return NextResponse.json(
      { error: '連絡ログの作成に失敗しました' },
      { status: 500 }
    );
  }
}
