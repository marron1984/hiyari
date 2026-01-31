'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { hasMinRole } from '@/lib/auth';
import {
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Clock,
  FileText,
  Users,
  Briefcase,
  RefreshCw,
  ExternalLink,
  Filter,
  Zap,
  Calendar,
  CircleDot,
} from 'lucide-react';
import type { TodoItem, TodoPriority, TodoSource, TodoDashboardSummary } from '@/types/todo';
import { MessageSquare, Bot } from 'lucide-react';

// AI要約の型
interface AiSummary {
  text: string;
  generatedBy: 'ai' | 'rule';
  role: string;
}

export default function TodoDashboardPage() {
  return (
    <AuthGuard>
      <TodoDashboardContent />
    </AuthGuard>
  );
}

function TodoDashboardContent() {
  const { user, firebaseUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<TodoDashboardSummary | null>(null);
  const [aiSummary, setAiSummary] = useState<AiSummary | null>(null);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [filter, setFilter] = useState<{
    priority?: TodoPriority;
    source?: TodoSource;
    showAll: boolean;
  }>({ showAll: false });
  const [completing, setCompleting] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const isAdmin = hasMinRole(user?.role, 'admin');

  // データ取得
  const fetchData = useCallback(async () => {
    if (!firebaseUser) return;

    try {
      const token = await firebaseUser.getIdToken();

      // サマリーとTODO一覧を取得
      const [summaryRes, todosRes] = await Promise.all([
        fetch(`/api/ai/todos?action=summary${filter.showAll ? '&all=true' : ''}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(
          `/api/ai/todos?action=list${filter.showAll ? '&all=true' : ''}${
            filter.priority ? `&priority=${filter.priority}` : ''
          }${filter.source ? `&source=${filter.source}` : ''}`,
          { headers: { Authorization: `Bearer ${token}` } }
        ),
      ]);

      if (summaryRes.ok) {
        const data = await summaryRes.json();
        setSummary(data.summary);
        if (data.aiSummary) {
          setAiSummary(data.aiSummary);
        }
      }

      if (todosRes.ok) {
        const data = await todosRes.json();
        setTodos(data.todos);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, filter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // TODO完了
  const handleComplete = async (todoId: string) => {
    if (!firebaseUser) return;

    setCompleting(todoId);

    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/ai/todos', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'complete', todoId }),
      });

      if (res.ok) {
        setTodos((prev) => prev.filter((t) => t.id !== todoId));
        if (summary) {
          setSummary({
            ...summary,
            completedTodos: summary.completedTodos + 1,
            pendingTodos: summary.pendingTodos - 1,
          });
        }
      }
    } catch (error) {
      console.error('Failed to complete todo:', error);
    } finally {
      setCompleting(null);
    }
  };

  // 手動生成
  const handleGenerate = async () => {
    if (!firebaseUser) return;

    setGenerating(true);

    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/ai/todos', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'generate' }),
      });

      if (res.ok) {
        await fetchData();
        alert('TODOを再生成しました');
      } else {
        const error = await res.json();
        alert(error.error || '生成に失敗しました');
      }
    } catch (error) {
      alert('生成に失敗しました');
    } finally {
      setGenerating(false);
    }
  };

  // 優先度バッジ
  const priorityBadge = (priority: TodoPriority) => {
    const config = {
      HIGH: { variant: 'danger' as const, icon: AlertCircle, label: '高' },
      MEDIUM: { variant: 'warning' as const, icon: AlertTriangle, label: '中' },
      LOW: { variant: 'info' as const, icon: CircleDot, label: '低' },
    };
    const { variant, icon: Icon, label } = config[priority];
    return (
      <Badge variant={variant} className="flex items-center gap-1">
        <Icon className="w-3 h-3" />
        {label}
      </Badge>
    );
  };

  // ソースアイコン
  const sourceIcon = (source: TodoSource) => {
    const icons = {
      OVERTIME: Clock,
      APPROVAL: FileText,
      SALES: Briefcase,
      DOCUMENT: FileText,
      PROSPECT: Users,
    };
    const Icon = icons[source];
    return <Icon className="w-4 h-4" />;
  };

  // ソースラベル
  const sourceLabel = (source: TodoSource) => {
    const labels = {
      OVERTIME: '勤怠',
      APPROVAL: '承認',
      SALES: '営業',
      DOCUMENT: '書類',
      PROSPECT: '入居希望',
    };
    return labels[source];
  };

  if (loading) {
    return (
      <>
        <Header />
        <Loading />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="pb-20 md:pb-8">
        <div className="max-w-4xl mx-auto px-4 py-6">
          {/* ヘッダー */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Zap className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">今日のTODO</h1>
                <p className="text-sm text-gray-500">AI副社長が自動生成した優先タスク</p>
              </div>
            </div>

            {isAdmin && (
              <Button onClick={handleGenerate} disabled={generating} variant="outline">
                {generating ? (
                  <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-1" />
                )}
                再生成
              </Button>
            )}
          </div>

          {/* サマリーカード */}
          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Card>
                <CardContent className="pt-4">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-gray-900">{summary.pendingTodos}</p>
                    <p className="text-sm text-gray-500">未完了</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-green-600">{summary.completedTodos}</p>
                    <p className="text-sm text-gray-500">完了</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-red-600">
                      {summary.byPriority.HIGH.total - summary.byPriority.HIGH.completed}
                    </p>
                    <p className="text-sm text-gray-500">緊急</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-yellow-600">
                      {summary.byPriority.MEDIUM.total - summary.byPriority.MEDIUM.completed}
                    </p>
                    <p className="text-sm text-gray-500">要対応</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* AI要約カード */}
          {aiSummary && (
            <Card className="mb-6 border-purple-200 bg-gradient-to-r from-purple-50 to-white">
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-purple-100 rounded-full shrink-0">
                    <Bot className="w-5 h-5 text-purple-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium text-purple-700">AI副社長より</span>
                      <Badge variant={aiSummary.generatedBy === 'ai' ? 'info' : 'default'}>
                        {aiSummary.generatedBy === 'ai' ? 'AI生成' : 'ルールベース'}
                      </Badge>
                    </div>
                    <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                      {aiSummary.text}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* フィルター */}
          <Card className="mb-6">
            <CardContent className="pt-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1 text-sm text-gray-600">
                  <Filter className="w-4 h-4" />
                  <span>フィルター:</span>
                </div>

                {/* 優先度フィルター */}
                <div className="flex gap-1">
                  {(['HIGH', 'MEDIUM', 'LOW'] as TodoPriority[]).map((p) => (
                    <Button
                      key={p}
                      size="sm"
                      variant={filter.priority === p ? 'primary' : 'outline'}
                      onClick={() =>
                        setFilter((prev) => ({
                          ...prev,
                          priority: prev.priority === p ? undefined : p,
                        }))
                      }
                    >
                      {p === 'HIGH' ? '高' : p === 'MEDIUM' ? '中' : '低'}
                    </Button>
                  ))}
                </div>

                {/* ソースフィルター */}
                <div className="flex gap-1">
                  {(['OVERTIME', 'APPROVAL', 'SALES', 'DOCUMENT'] as TodoSource[]).map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={filter.source === s ? 'primary' : 'outline'}
                      onClick={() =>
                        setFilter((prev) => ({
                          ...prev,
                          source: prev.source === s ? undefined : s,
                        }))
                      }
                    >
                      {sourceLabel(s)}
                    </Button>
                  ))}
                </div>

                {/* 全員表示（管理者のみ） */}
                {isAdmin && (
                  <Button
                    size="sm"
                    variant={filter.showAll ? 'primary' : 'outline'}
                    onClick={() => setFilter((prev) => ({ ...prev, showAll: !prev.showAll }))}
                  >
                    <Users className="w-4 h-4 mr-1" />
                    全員
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* TODO一覧 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                タスク一覧
                <Badge variant="default">{todos.length}件</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {todos.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500" />
                  <p>すべてのタスクが完了しています</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {todos.map((todo) => (
                    <div
                      key={todo.id}
                      className={`p-4 rounded-lg border ${
                        todo.priority === 'HIGH'
                          ? 'border-red-200 bg-red-50'
                          : todo.priority === 'MEDIUM'
                            ? 'border-yellow-200 bg-yellow-50'
                            : 'border-gray-200 bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {priorityBadge(todo.priority)}
                            <span className="flex items-center gap-1 text-xs text-gray-500">
                              {sourceIcon(todo.source)}
                              {sourceLabel(todo.source)}
                            </span>
                            {todo.staleDays && todo.staleDays > 0 && (
                              <span className="text-xs text-orange-600">
                                {todo.staleDays}日滞留
                              </span>
                            )}
                          </div>
                          <h3 className="font-medium text-gray-900">{todo.title}</h3>
                          <p className="text-sm text-gray-600 mt-1">{todo.description}</p>
                        </div>

                        <div className="flex items-center gap-2">
                          <Link href={todo.link}>
                            <Button size="sm" variant="outline">
                              <ExternalLink className="w-4 h-4" />
                            </Button>
                          </Link>
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => handleComplete(todo.id!)}
                            disabled={completing === todo.id}
                          >
                            {completing === todo.id ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <CheckCircle className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 優先度説明 */}
          <Card className="mt-6">
            <CardContent className="pt-4">
              <div className="text-sm text-gray-600 space-y-2">
                <p className="font-medium">優先度の基準:</p>
                <ul className="space-y-1">
                  <li className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <span>
                      <strong>高:</strong> 法務・労務リスク（未申請残業など）
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-500" />
                    <span>
                      <strong>中:</strong> 承認滞留（2日以上）、営業停滞（期限超過）
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CircleDot className="w-4 h-4 text-blue-500" />
                    <span>
                      <strong>低:</strong> 書類未提出、その他
                    </span>
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
