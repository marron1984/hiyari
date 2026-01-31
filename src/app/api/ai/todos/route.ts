// ======== AI副社長「今日のTODO」API ========
// GET: TODO一覧・サマリー取得
// POST: TODO完了

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyIdToken } from '@/lib/firebase-admin';
import { hasMinRole } from '@/lib/auth';
import {
  getTodos,
  getTodoDashboardSummary,
  completeTodo,
  getLatestGenerationLog,
  generateDailyTodos,
} from '@/lib/todo-generator';
import type { TodoPriority, TodoSource, TodoRole } from '@/types/todo';
import type { UserRole } from '@/types';

/**
 * 認証チェック
 */
async function authenticateUser(request: NextRequest): Promise<{
  userId: string;
  userName: string;
  userRole: string;
} | NextResponse> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }

  const idToken = authHeader.substring(7);
  const decodedToken = await verifyIdToken(idToken);

  if (!decodedToken) {
    return NextResponse.json({ error: '無効なトークンです' }, { status: 401 });
  }

  const userDoc = await getAdminDb().collection('users').doc(decodedToken.uid).get();
  const userData = userDoc.data();

  return {
    userId: decodedToken.uid,
    userName: userData?.name || decodedToken.email || 'Unknown',
    userRole: userData?.role || 'user',
  };
}

/**
 * GET: TODO一覧・サマリー取得
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateUser(request);
    if (authResult instanceof NextResponse) return authResult;

    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action') || 'list';

    switch (action) {
      case 'list': {
        // TODO一覧取得
        const priority = searchParams.get('priority') as TodoPriority | null;
        const source = searchParams.get('source') as TodoSource | null;
        const role = searchParams.get('role') as TodoRole | null;
        const date = searchParams.get('date');
        const includeCompleted = searchParams.get('includeCompleted') === 'true';
        const limitStr = searchParams.get('limit');
        const all = searchParams.get('all') === 'true';

        const todos = await getTodos({
          userId: all && hasMinRole(authResult.userRole as UserRole, 'admin') ? undefined : authResult.userId,
          priority: priority || undefined,
          source: source || undefined,
          role: role || undefined,
          date: date || undefined,
          includeCompleted,
          limit: limitStr ? parseInt(limitStr, 10) : 50,
        });

        return NextResponse.json({
          success: true,
          todos,
          count: todos.length,
        });
      }

      case 'summary': {
        // ダッシュボードサマリー取得
        const date = searchParams.get('date');
        const all = searchParams.get('all') === 'true';

        const summary = await getTodoDashboardSummary(
          all && hasMinRole(authResult.userRole as UserRole, 'admin') ? undefined : authResult.userId,
          date || undefined
        );

        return NextResponse.json({
          success: true,
          summary,
        });
      }

      case 'status': {
        // 生成ログ取得
        const latestLog = await getLatestGenerationLog();

        return NextResponse.json({
          success: true,
          latestGeneration: latestLog,
        });
      }

      default:
        return NextResponse.json({ error: '無効なアクションです' }, { status: 400 });
    }
  } catch (error) {
    console.error('TODO API GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST: TODO完了 / 手動生成
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateUser(request);
    if (authResult instanceof NextResponse) return authResult;

    const body = await request.json();
    const { action, todoId } = body;

    switch (action) {
      case 'complete': {
        // TODO完了
        if (!todoId) {
          return NextResponse.json({ error: 'todoIdが必要です' }, { status: 400 });
        }

        const success = await completeTodo(todoId, authResult.userId);

        if (success) {
          return NextResponse.json({ success: true, message: 'TODOを完了しました' });
        } else {
          return NextResponse.json({ error: '完了に失敗しました' }, { status: 500 });
        }
      }

      case 'generate': {
        // 手動生成（管理者のみ）
        if (!hasMinRole(authResult.userRole as UserRole, 'admin')) {
          return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 });
        }

        const result = await generateDailyTodos();

        return NextResponse.json({
          success: result.success,
          result,
        });
      }

      default:
        return NextResponse.json({ error: '無効なアクションです' }, { status: 400 });
    }
  } catch (error) {
    console.error('TODO API POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
