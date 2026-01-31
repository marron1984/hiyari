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
import { getTodoSummary, getAllTodoSummaries } from '@/lib/todo-summary';
import type { TodoPriority, TodoSource, TodoRole } from '@/types/todo';
import type { UserRole } from '@/types';

/**
 * UserRoleをTodoRoleにマッピング
 */
function mapUserRoleToTodoRole(userRole: string): TodoRole {
  switch (userRole) {
    case 'system_admin':
    case 'admin':
      return 'exec';
    case 'leader':
      return 'manager';
    default:
      return 'staff';
  }
}

/**
 * 今日の日付を取得（YYYY-MM-DD形式、JST）
 */
function getTodayString(): string {
  const now = new Date();
  const jstOffset = 9 * 60 * 60 * 1000;
  const jst = new Date(now.getTime() + jstOffset);
  return jst.toISOString().split('T')[0];
}

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
 * 部分的なデータ取得失敗時もエラーを返さず、取得できたデータを返す
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateUser(request);
    if (authResult instanceof NextResponse) return authResult;

    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get('action') || 'list';

    // 警告メッセージを収集
    const warnings: string[] = [];

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

        let todos: Awaited<ReturnType<typeof getTodos>> = [];
        try {
          todos = await getTodos({
            userId: all && hasMinRole(authResult.userRole as UserRole, 'admin') ? undefined : authResult.userId,
            priority: priority || undefined,
            source: source || undefined,
            role: role || undefined,
            date: date || undefined,
            includeCompleted,
            limit: limitStr ? parseInt(limitStr, 10) : 50,
          });
        } catch (todoError) {
          console.error('getTodos error:', todoError);
          warnings.push('TODO一覧の取得に失敗しました');
        }

        return NextResponse.json({
          success: true,
          todos,
          count: todos.length,
          warnings: warnings.length > 0 ? warnings : undefined,
        });
      }

      case 'summary': {
        // ダッシュボードサマリー取得
        const date = searchParams.get('date');
        const all = searchParams.get('all') === 'true';

        let summary: Awaited<ReturnType<typeof getTodoDashboardSummary>> | null = null;
        try {
          summary = await getTodoDashboardSummary(
            all && hasMinRole(authResult.userRole as UserRole, 'admin') ? undefined : authResult.userId,
            date || undefined
          );
        } catch (summaryError) {
          console.error('getTodoDashboardSummary error:', summaryError);
          warnings.push('サマリーの取得に一部失敗しました');
          // デフォルトサマリーを返す
          summary = {
            date: date || getTodayString(),
            totalTodos: 0,
            completedTodos: 0,
            pendingTodos: 0,
            byPriority: {
              HIGH: { total: 0, completed: 0 },
              MEDIUM: { total: 0, completed: 0 },
              LOW: { total: 0, completed: 0 },
            },
            bySource: {
              OVERTIME: { total: 0, completed: 0 },
              APPROVAL: { total: 0, completed: 0 },
              SALES: { total: 0, completed: 0 },
              DOCUMENT: { total: 0, completed: 0 },
              PROSPECT: { total: 0, completed: 0 },
            },
            recentTodos: [],
          };
        }

        // AI要約を取得（ロール別）- 失敗してもエラーにしない
        let aiSummary: Awaited<ReturnType<typeof getTodoSummary>> | null = null;
        try {
          const userTodoRole = mapUserRoleToTodoRole(authResult.userRole);
          aiSummary = await getTodoSummary(date || getTodayString(), userTodoRole);
        } catch (aiError) {
          console.error('getTodoSummary error:', aiError);
          warnings.push('AI要約の取得に失敗しました');
        }

        return NextResponse.json({
          success: true,
          summary,
          aiSummary: aiSummary ? {
            text: aiSummary.summary,
            generatedBy: aiSummary.generatedBy,
            role: aiSummary.role,
          } : null,
          warnings: warnings.length > 0 ? warnings : undefined,
        });
      }

      case 'ai-summaries': {
        // 全ロールのAI要約を取得（管理者向け）
        const date = searchParams.get('date') || getTodayString();

        let summaries: Awaited<ReturnType<typeof getAllTodoSummaries>> = {
          exec: null,
          manager: null,
          staff: null,
        };
        try {
          summaries = await getAllTodoSummaries(date);
        } catch (summariesError) {
          console.error('getAllTodoSummaries error:', summariesError);
          warnings.push('AI要約の取得に失敗しました');
        }

        return NextResponse.json({
          success: true,
          date,
          summaries: {
            exec: summaries.exec ? {
              text: summaries.exec.summary,
              generatedBy: summaries.exec.generatedBy,
              stats: summaries.exec.stats,
            } : null,
            manager: summaries.manager ? {
              text: summaries.manager.summary,
              generatedBy: summaries.manager.generatedBy,
              stats: summaries.manager.stats,
            } : null,
            staff: summaries.staff ? {
              text: summaries.staff.summary,
              generatedBy: summaries.staff.generatedBy,
              stats: summaries.staff.stats,
            } : null,
          },
          warnings: warnings.length > 0 ? warnings : undefined,
        });
      }

      case 'status': {
        // 生成ログ取得
        let latestLog: Awaited<ReturnType<typeof getLatestGenerationLog>> | null = null;
        try {
          latestLog = await getLatestGenerationLog();
        } catch (logError) {
          console.error('getLatestGenerationLog error:', logError);
          warnings.push('生成ログの取得に失敗しました');
        }

        return NextResponse.json({
          success: true,
          latestGeneration: latestLog,
          warnings: warnings.length > 0 ? warnings : undefined,
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
