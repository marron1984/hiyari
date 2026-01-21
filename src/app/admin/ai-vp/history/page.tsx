'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, Select } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { isAiVpOwner } from '@/lib/auth';
import { getExtractions, getIngestions, getAiVpAuditLogs } from '@/lib/ai-vp';
import type { AiVpExtraction, AiVpIngestion, AiVpAuditLog, ExtractionStatus } from '@/types/ai-vp';
import {
  EXTRACTION_STATUS_LABELS,
  INGESTION_SOURCE_LABELS,
} from '@/types/ai-vp';
import {
  Brain,
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  FileText,
  Clock,
  Activity,
} from 'lucide-react';

export default function AiVpHistoryPage() {
  return (
    <AuthGuard>
      <AiVpHistoryContent />
    </AuthGuard>
  );
}

function AiVpHistoryContent() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [extractions, setExtractions] = useState<AiVpExtraction[]>([]);
  const [ingestions, setIngestions] = useState<AiVpIngestion[]>([]);
  const [auditLogs, setAuditLogs] = useState<AiVpAuditLog[]>([]);
  const [tab, setTab] = useState<'extractions' | 'audit'>('extractions');
  const [statusFilter, setStatusFilter] = useState<ExtractionStatus | ''>('');

  // 権限チェック
  useEffect(() => {
    if (user && !isAiVpOwner(user.email)) {
      router.push('/dashboard');
    }
  }, [user, router]);

  const fetchData = useCallback(async () => {
    if (!user?.email) return;
    setLoading(true);
    try {
      const [extractionsData, ingestionsData, logsData] = await Promise.all([
        getExtractions(user.email, 100),
        getIngestions(user.email, 100),
        getAiVpAuditLogs(user.email, 100),
      ]);
      setExtractions(extractionsData);
      setIngestions(ingestionsData);
      setAuditLogs(logsData);
    } catch (error) {
      console.error('Failed to fetch history:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.email]);

  useEffect(() => {
    if (user?.email && isAiVpOwner(user.email)) {
      fetchData();
    }
  }, [user?.email, fetchData]);

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

  // フィルタリング
  const filteredExtractions = statusFilter
    ? extractions.filter((e) => e.status === statusFilter)
    : extractions;

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
                  <h1 className="text-2xl font-bold">履歴</h1>
                  <p className="text-sm text-gray-500">抽出履歴・監査ログ</p>
                </div>
              </div>
            </div>
            <Button variant="secondary" onClick={fetchData}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>

          {/* タブ */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setTab('extractions')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                tab === 'extractions'
                  ? 'bg-purple-100 text-purple-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <FileText className="w-4 h-4 inline mr-1" />
              抽出履歴 ({extractions.length})
            </button>
            <button
              onClick={() => setTab('audit')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                tab === 'audit'
                  ? 'bg-purple-100 text-purple-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Activity className="w-4 h-4 inline mr-1" />
              監査ログ ({auditLogs.length})
            </button>
          </div>

          {tab === 'extractions' && (
            <>
              {/* フィルター */}
              <Card className="p-4 mb-6">
                <div className="flex gap-4">
                  <div className="w-48">
                    <Select
                      value={statusFilter}
                      onChange={(e) =>
                        setStatusFilter(e.target.value as ExtractionStatus | '')
                      }
                      options={[
                        { value: '', label: '全ステータス' },
                        { value: 'draft', label: '下書き' },
                        { value: 'confirmed', label: '確定済み' },
                        { value: 'exported', label: '実行済み' },
                        { value: 'failed', label: '失敗' },
                      ]}
                    />
                  </div>
                </div>
              </Card>

              {/* 抽出一覧 */}
              <div className="space-y-3">
                {filteredExtractions.length === 0 ? (
                  <Card className="p-8 text-center text-gray-500">
                    <Brain className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p>抽出履歴がありません</p>
                  </Card>
                ) : (
                  filteredExtractions.map((extraction) => {
                    const ingestion = ingestions.find(
                      (i) => i.id === extraction.ingestionId
                    );
                    const statusColor =
                      extraction.status === 'draft'
                        ? 'bg-yellow-100 text-yellow-800'
                        : extraction.status === 'confirmed'
                        ? 'bg-blue-100 text-blue-800'
                        : extraction.status === 'exported'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800';

                    return (
                      <Link
                        key={extraction.id}
                        href={`/admin/ai-vp/extraction/${extraction.id}`}
                      >
                        <Card className="p-4 hover:bg-gray-50 transition-colors cursor-pointer">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span
                                className={`px-2 py-1 rounded text-xs font-medium ${statusColor}`}
                              >
                                {EXTRACTION_STATUS_LABELS[extraction.status]}
                              </span>
                              <div>
                                <p className="font-medium">
                                  {extraction.summaryText || '抽出結果'}
                                </p>
                                <div className="flex items-center gap-2 text-sm text-gray-500">
                                  {ingestion && (
                                    <span>
                                      {INGESTION_SOURCE_LABELS[ingestion.sourceType]}
                                    </span>
                                  )}
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {extraction.createdAt.toLocaleDateString('ja-JP')}{' '}
                                    {extraction.createdAt.toLocaleTimeString('ja-JP', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                  {extraction.modelMeta?.tokenUsage && (
                                    <span className="text-gray-400">
                                      {extraction.modelMeta.tokenUsage.input +
                                        extraction.modelMeta.tokenUsage.output}{' '}
                                      tokens
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <ArrowRight className="w-5 h-5 text-gray-400" />
                          </div>
                        </Card>
                      </Link>
                    );
                  })
                )}
              </div>
            </>
          )}

          {tab === 'audit' && (
            <Card>
              <CardHeader>
                <CardTitle>監査ログ</CardTitle>
              </CardHeader>
              <CardContent>
                {auditLogs.length === 0 ? (
                  <div className="py-8 text-center text-gray-500">
                    <Activity className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p>監査ログがありません</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {auditLogs.map((log) => {
                      const eventLabels: Record<string, string> = {
                        ingestion_created: '取り込み作成',
                        extraction_started: '抽出開始',
                        extraction_completed: '抽出完了',
                        extraction_failed: '抽出失敗',
                        extraction_confirmed: '抽出確定',
                        action_executed: 'アクション実行',
                        action_failed: 'アクション失敗',
                      };

                      const eventColors: Record<string, string> = {
                        ingestion_created: 'bg-blue-100 text-blue-800',
                        extraction_started: 'bg-purple-100 text-purple-800',
                        extraction_completed: 'bg-green-100 text-green-800',
                        extraction_failed: 'bg-red-100 text-red-800',
                        extraction_confirmed: 'bg-indigo-100 text-indigo-800',
                        action_executed: 'bg-teal-100 text-teal-800',
                        action_failed: 'bg-orange-100 text-orange-800',
                      };

                      return (
                        <div
                          key={log.id}
                          className="flex items-center gap-3 p-3 border rounded-lg"
                        >
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              eventColors[log.eventType] || 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {eventLabels[log.eventType] || log.eventType}
                          </span>
                          <div className="flex-1">
                            <p className="text-sm">
                              {log.actorUserName}
                              {typeof log.eventMeta?.actionType === 'string' && (
                                <span className="text-gray-500">
                                  {' '}
                                  - {log.eventMeta.actionType}
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-gray-500">
                              {log.createdAt.toLocaleDateString('ja-JP')}{' '}
                              {log.createdAt.toLocaleTimeString('ja-JP', {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </>
  );
}
