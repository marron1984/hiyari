'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { isAiVpOwner } from '@/lib/auth';
import { getExtraction, getIngestion, updateExtraction } from '@/lib/ai-vp';
import { getAuth } from 'firebase/auth';
import type { AiVpExtraction, AiVpIngestion, ExtractedJson, ActionType } from '@/types/ai-vp';
import {
  EXTRACTION_STATUS_LABELS,
  INGESTION_SOURCE_LABELS,
  TASK_CATEGORY_LABELS,
  URGENCY_LABELS,
  IMPORTANCE_LABELS,
} from '@/types/ai-vp';
import {
  Brain,
  ArrowLeft,
  CheckCircle,
  Play,
  AlertCircle,
  Users,
  AlertTriangle,
  Lightbulb,
  FileText,
  Bell,
  Loader2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export default function ExtractionDetailPage() {
  return (
    <AuthGuard>
      <ExtractionDetailContent />
    </AuthGuard>
  );
}

function ExtractionDetailContent() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const extractionId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [extraction, setExtraction] = useState<AiVpExtraction | null>(null);
  const [ingestion, setIngestion] = useState<AiVpIngestion | null>(null);
  const [executing, setExecuting] = useState<string | null>(null);
  const [executedActions, setExecutedActions] = useState<Set<string>>(new Set());
  const [showRawText, setShowRawText] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 権限チェック
  useEffect(() => {
    if (user && !isAiVpOwner(user.email)) {
      router.push('/dashboard');
    }
  }, [user, router]);

  const fetchData = useCallback(async () => {
    if (!user?.email || !extractionId) return;
    setLoading(true);
    try {
      const extractionData = await getExtraction(extractionId, user.email);
      setExtraction(extractionData);

      if (extractionData?.ingestionId) {
        const ingestionData = await getIngestion(extractionData.ingestionId, user.email);
        setIngestion(ingestionData);
      }
    } catch (err) {
      console.error('Failed to fetch extraction:', err);
      setError('抽出データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [user?.email, extractionId]);

  useEffect(() => {
    if (user?.email && isAiVpOwner(user.email)) {
      fetchData();
    }
  }, [user?.email, fetchData]);

  const handleConfirm = async () => {
    if (!extraction || !user) return;
    try {
      await updateExtraction(
        extraction.id,
        { status: 'confirmed' },
        user.id,
        user.name || user.email || 'Unknown',
        user.email || ''
      );
      setExtraction({ ...extraction, status: 'confirmed' });
    } catch (err) {
      console.error('Failed to confirm:', err);
      setError('確定に失敗しました');
    }
  };

  const executeAction = async (actionType: ActionType, payload: unknown, key: string) => {
    if (!extraction || !user) return;
    setExecuting(key);
    setError(null);

    try {
      const auth = getAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('認証が必要です');
      const idToken = await currentUser.getIdToken();

      const response = await fetch('/api/ai-vp/actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          actionType,
          extractionId: extraction.id,
          payload,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'アクション実行に失敗しました');
      }

      setExecutedActions((prev) => new Set([...prev, key]));

      // ステータス更新
      if (extraction.status === 'confirmed') {
        setExtraction({ ...extraction, status: 'exported' });
      }
    } catch (err) {
      console.error('Action execution error:', err);
      setError(err instanceof Error ? err.message : 'アクション実行に失敗しました');
    } finally {
      setExecuting(null);
    }
  };

  if (!user || !isAiVpOwner(user.email)) {
    return (
      <>
        <Header />
        <main className="pb-20 md:pb-8">
          <div className="max-w-4xl mx-auto px-4 py-16 text-center">
            <AlertCircle className="w-16 h-16 mx-auto mb-4 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">アクセス権限がありません</h1>
          </div>
        </main>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <Header />
        <Loading text="読み込み中..." />
      </>
    );
  }

  if (!extraction) {
    return (
      <>
        <Header />
        <main className="pb-20 md:pb-8">
          <div className="max-w-4xl mx-auto px-4 py-16 text-center">
            <AlertCircle className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">抽出データが見つかりません</h1>
            <Link href="/admin/ai-vp">
              <Button className="mt-4">AI副社長に戻る</Button>
            </Link>
          </div>
        </main>
      </>
    );
  }

  const { extractedJson } = extraction;
  const statusColor =
    extraction.status === 'draft'
      ? 'bg-yellow-100 text-yellow-800'
      : extraction.status === 'confirmed'
      ? 'bg-blue-100 text-blue-800'
      : extraction.status === 'exported'
      ? 'bg-green-100 text-green-800'
      : 'bg-red-100 text-red-800';

  return (
    <>
      <Header />
      <main className="pb-20 md:pb-8">
        <div className="max-w-6xl mx-auto px-4 py-6">
          {/* ヘッダー */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/admin/ai-vp')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg">
                  <Brain className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold">抽出結果</h1>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor}`}>
                      {EXTRACTION_STATUS_LABELS[extraction.status]}
                    </span>
                    {ingestion && (
                      <span>{INGESTION_SOURCE_LABELS[ingestion.sourceType]}</span>
                    )}
                    <span>
                      {extraction.createdAt.toLocaleDateString('ja-JP')}{' '}
                      {extraction.createdAt.toLocaleTimeString('ja-JP', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {extraction.status === 'draft' && (
              <Button onClick={handleConfirm}>
                <CheckCircle className="w-4 h-4 mr-1" />
                確定する
              </Button>
            )}
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* サマリー */}
          <Card className="mb-6">
            <CardContent className="py-4">
              <p className="text-lg">{extraction.summaryText}</p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 左カラム: タスク・エンティティ */}
            <div className="space-y-6">
              {/* タスク */}
              {extractedJson.tasks.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="w-5 h-5" />
                      タスク ({extractedJson.tasks.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {extractedJson.tasks.map((task, idx) => (
                        <div key={idx} className="p-3 border rounded-lg">
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="font-medium">{task.title}</h4>
                              {task.background && (
                                <p className="text-sm text-gray-600 mt-1">{task.background}</p>
                              )}
                              <div className="flex flex-wrap gap-2 mt-2">
                                <Badge variant="default">
                                  {TASK_CATEGORY_LABELS[task.category]}
                                </Badge>
                                <Badge
                                  variant={task.urgency === 'high' ? 'danger' : 'default'}
                                >
                                  緊急度: {URGENCY_LABELS[task.urgency]}
                                </Badge>
                                <Badge
                                  variant={task.importance === 'high' ? 'warning' : 'default'}
                                >
                                  重要度: {IMPORTANCE_LABELS[task.importance]}
                                </Badge>
                              </div>
                              {task.ownerName && (
                                <p className="text-sm text-gray-500 mt-1">
                                  担当: {task.ownerName}
                                </p>
                              )}
                              {task.recommendedNextAction && (
                                <p className="text-sm text-blue-600 mt-1">
                                  推奨アクション: {task.recommendedNextAction}
                                </p>
                              )}
                            </div>
                            <span className="text-xs text-gray-400">
                              {Math.round(task.confidence * 100)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* エンティティ */}
              {extractedJson.entities.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="w-5 h-5" />
                      エンティティ ({extractedJson.entities.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {extractedJson.entities.map((entity, idx) => (
                        <Badge key={idx} variant="default" className="text-sm">
                          <span className="text-gray-500 mr-1">{entity.type}:</span>
                          {entity.value}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* 右カラム: 提案レコード・アクション */}
            <div className="space-y-6">
              {/* 入居希望者 */}
              {extractedJson.proposedRecords.inquiries.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-blue-600" />
                      入居希望者 ({extractedJson.proposedRecords.inquiries.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {extractedJson.proposedRecords.inquiries.map((inquiry, idx) => {
                        const key = `inquiry-${idx}`;
                        const isExecuted = executedActions.has(key);
                        return (
                          <div key={idx} className="p-3 border rounded-lg">
                            <div className="flex justify-between items-start">
                              <div>
                                <h4 className="font-medium">
                                  {inquiry.customerName || '名前未登録'}
                                  {inquiry.age && ` (${inquiry.age}歳)`}
                                  {inquiry.gender && ` ${inquiry.gender}`}
                                </h4>
                                {inquiry.careLevel && (
                                  <p className="text-sm text-gray-600">{inquiry.careLevel}</p>
                                )}
                                {inquiry.desiredFacility && (
                                  <p className="text-sm text-gray-600">
                                    希望施設: {inquiry.desiredFacility}
                                  </p>
                                )}
                                {inquiry.salesCompanyName && (
                                  <p className="text-sm text-gray-600">
                                    営業: {inquiry.salesCompanyName}
                                    {inquiry.salesRepName && ` (${inquiry.salesRepName})`}
                                  </p>
                                )}
                              </div>
                              <Button
                                size="sm"
                                variant={isExecuted ? 'secondary' : 'primary'}
                                disabled={
                                  executing === key ||
                                  isExecuted ||
                                  extraction.status === 'draft'
                                }
                                onClick={() =>
                                  executeAction('create_inquiry', inquiry, key)
                                }
                              >
                                {executing === key ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : isExecuted ? (
                                  <>
                                    <CheckCircle className="w-4 h-4 mr-1" />
                                    作成済
                                  </>
                                ) : (
                                  <>
                                    <Play className="w-4 h-4 mr-1" />
                                    作成
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ヒヤリハット */}
              {extractedJson.proposedRecords.hiyarihat.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-orange-600" />
                      ヒヤリハット ({extractedJson.proposedRecords.hiyarihat.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {extractedJson.proposedRecords.hiyarihat.map((hh, idx) => {
                        const key = `hiyarihat-${idx}`;
                        const isExecuted = executedActions.has(key);
                        return (
                          <div key={idx} className="p-3 border rounded-lg">
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="flex items-center gap-2">
                                  <Badge variant={hh.severity >= 4 ? 'danger' : 'warning'}>
                                    重大度: {hh.severity}
                                  </Badge>
                                  <span className="text-sm text-gray-500">
                                    {hh.date} {hh.timeSlot}
                                  </span>
                                </div>
                                <p className="mt-1">{hh.body}</p>
                                {hh.action && (
                                  <p className="text-sm text-gray-600 mt-1">
                                    対応: {hh.action}
                                  </p>
                                )}
                              </div>
                              <Button
                                size="sm"
                                variant={isExecuted ? 'secondary' : 'primary'}
                                disabled={
                                  executing === key ||
                                  isExecuted ||
                                  extraction.status === 'draft'
                                }
                                onClick={() =>
                                  executeAction('create_hiyarihat', hh, key)
                                }
                              >
                                {executing === key ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : isExecuted ? (
                                  <>
                                    <CheckCircle className="w-4 h-4 mr-1" />
                                    登録済
                                  </>
                                ) : (
                                  <>
                                    <Play className="w-4 h-4 mr-1" />
                                    登録
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* 改善アイデア */}
              {extractedJson.proposedRecords.kaizen.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Lightbulb className="w-5 h-5 text-yellow-600" />
                      改善アイデア ({extractedJson.proposedRecords.kaizen.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {extractedJson.proposedRecords.kaizen.map((kaizen, idx) => {
                        const key = `kaizen-${idx}`;
                        const isExecuted = executedActions.has(key);
                        return (
                          <div key={idx} className="p-3 border rounded-lg">
                            <div className="flex justify-between items-start">
                              <div>
                                <h4 className="font-medium">{kaizen.title}</h4>
                                <p className="text-sm text-gray-600 mt-1">{kaizen.body}</p>
                              </div>
                              <Button
                                size="sm"
                                variant={isExecuted ? 'secondary' : 'primary'}
                                disabled={
                                  executing === key ||
                                  isExecuted ||
                                  extraction.status === 'draft'
                                }
                                onClick={() =>
                                  executeAction('create_kaizen', kaizen, key)
                                }
                              >
                                {executing === key ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : isExecuted ? (
                                  <>
                                    <CheckCircle className="w-4 h-4 mr-1" />
                                    登録済
                                  </>
                                ) : (
                                  <>
                                    <Play className="w-4 h-4 mr-1" />
                                    登録
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* LINE WORKS通知 */}
              {extractedJson.alerts.lineworks.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Bell className="w-5 h-5 text-green-600" />
                      LINE WORKS通知 ({extractedJson.alerts.lineworks.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {extractedJson.alerts.lineworks.map((alert, idx) => {
                        const key = `lineworks-${idx}`;
                        const isExecuted = executedActions.has(key);
                        return (
                          <div key={idx} className="p-3 border rounded-lg">
                            <div className="flex justify-between items-start">
                              <div>
                                <Badge
                                  variant={
                                    alert.urgency === 'high'
                                      ? 'danger'
                                      : alert.urgency === 'mid'
                                      ? 'warning'
                                      : 'default'
                                  }
                                >
                                  {URGENCY_LABELS[alert.urgency]}
                                </Badge>
                                <p className="mt-1">{alert.message}</p>
                              </div>
                              <Button
                                size="sm"
                                variant={isExecuted ? 'secondary' : 'primary'}
                                disabled={
                                  executing === key ||
                                  isExecuted ||
                                  extraction.status === 'draft'
                                }
                                onClick={() =>
                                  executeAction('notify_lineworks', alert, key)
                                }
                              >
                                {executing === key ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : isExecuted ? (
                                  <>
                                    <CheckCircle className="w-4 h-4 mr-1" />
                                    送信済
                                  </>
                                ) : (
                                  <>
                                    <Play className="w-4 h-4 mr-1" />
                                    送信
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {/* 元テキスト */}
          {ingestion && (
            <Card className="mt-6">
              <CardHeader>
                <button
                  onClick={() => setShowRawText(!showRawText)}
                  className="flex items-center justify-between w-full"
                >
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    元テキスト
                  </CardTitle>
                  {showRawText ? (
                    <ChevronUp className="w-5 h-5" />
                  ) : (
                    <ChevronDown className="w-5 h-5" />
                  )}
                </button>
              </CardHeader>
              {showRawText && (
                <CardContent>
                  <pre className="p-4 bg-gray-50 rounded-lg text-sm whitespace-pre-wrap font-mono max-h-96 overflow-y-auto">
                    {ingestion.rawText}
                  </pre>
                </CardContent>
              )}
            </Card>
          )}
        </div>
      </main>
    </>
  );
}
