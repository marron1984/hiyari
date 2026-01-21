'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { isAiVpOwner } from '@/lib/auth';
import { getExtractions, getIngestions } from '@/lib/ai-vp';
import type { AiVpExtraction, AiVpIngestion } from '@/types/ai-vp';
import { EXTRACTION_STATUS_LABELS, INGESTION_SOURCE_LABELS } from '@/types/ai-vp';
import {
  Brain,
  Plus,
  History,
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  Sparkles,
  Gavel,
  ClipboardCheck,
} from 'lucide-react';

export default function AiVpPage() {
  return (
    <AuthGuard>
      <AiVpContent />
    </AuthGuard>
  );
}

function AiVpContent() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [extractions, setExtractions] = useState<AiVpExtraction[]>([]);
  const [ingestions, setIngestions] = useState<AiVpIngestion[]>([]);

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
      const [extractionsData, ingestionsData] = await Promise.all([
        getExtractions(user.email, 10),
        getIngestions(user.email, 10),
      ]);
      setExtractions(extractionsData);
      setIngestions(ingestionsData);
    } catch (error) {
      console.error('Failed to fetch AI VP data:', error);
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
            <p className="text-gray-500">この機能はAI副社長オーナーのみ利用可能です。</p>
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

  // 統計
  const draftCount = extractions.filter((e) => e.status === 'draft').length;
  const confirmedCount = extractions.filter((e) => e.status === 'confirmed').length;
  const exportedCount = extractions.filter((e) => e.status === 'exported').length;

  return (
    <>
      <Header />
      <main className="pb-20 md:pb-8">
        <div className="max-w-6xl mx-auto px-4 py-6">
          {/* ヘッダー */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">AI副社長</h1>
                <p className="text-sm text-gray-500">情報抽出・タスク生成アシスタント</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={fetchData}>
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Link href="/admin/ai-vp/approval">
                <Button variant="secondary" className="bg-green-50 text-green-700 hover:bg-green-100">
                  <Gavel className="w-4 h-4 mr-1" />
                  最終決裁
                </Button>
              </Link>
              <Link href="/admin/ai-vp/history">
                <Button variant="secondary">
                  <History className="w-4 h-4 mr-1" />
                  履歴
                </Button>
              </Link>
              <Link href="/admin/ai-vp/new">
                <Button>
                  <Plus className="w-4 h-4 mr-1" />
                  新規抽出
                </Button>
              </Link>
            </div>
          </div>

          {/* 統計カード */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{extractions.length}</p>
                  <p className="text-xs text-gray-500">総抽出数</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <Clock className="w-5 h-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{draftCount}</p>
                  <p className="text-xs text-gray-500">下書き</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{confirmedCount}</p>
                  <p className="text-xs text-gray-500">確定済み</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Sparkles className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{exportedCount}</p>
                  <p className="text-xs text-gray-500">実行済み</p>
                </div>
              </div>
            </Card>
          </div>

          {/* クイックアクション */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">クイックスタート</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Link href="/admin/ai-vp/approval" className="block">
                  <div className="p-4 border-2 border-green-200 rounded-lg hover:bg-green-50 transition-colors bg-green-50/50">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-green-100 rounded-lg">
                        <Gavel className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <h3 className="font-medium text-green-700">最終決裁</h3>
                        <p className="text-sm text-green-600">AIレビュー済みを承認</p>
                      </div>
                    </div>
                  </div>
                </Link>
                <Link href="/admin/ai-vp/new?source=text" className="block">
                  <div className="p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <FileText className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-medium">テキスト入力</h3>
                        <p className="text-sm text-gray-500">文字起こしやメモから抽出</p>
                      </div>
                    </div>
                  </div>
                </Link>
                <Link href="/requests" className="block">
                  <div className="p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-purple-100 rounded-lg">
                        <ClipboardCheck className="w-5 h-5 text-purple-600" />
                      </div>
                      <div>
                        <h3 className="font-medium">申請管理</h3>
                        <p className="text-sm text-gray-500">全申請の一覧・レビュー</p>
                      </div>
                    </div>
                  </div>
                </Link>
                <div className="p-4 border rounded-lg bg-gray-50 opacity-60">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gray-200 rounded-lg">
                      <FileText className="w-5 h-5 text-gray-400" />
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-400">音声文字起こし</h3>
                      <p className="text-sm text-gray-400">近日公開</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 最近の抽出 */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">最近の抽出</CardTitle>
              <Link href="/admin/ai-vp/history" className="text-sm text-blue-600 hover:underline">
                すべて表示
              </Link>
            </CardHeader>
            <CardContent>
              {extractions.length === 0 ? (
                <div className="py-8 text-center text-gray-500">
                  <Brain className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p>抽出履歴がありません</p>
                  <Link href="/admin/ai-vp/new">
                    <Button className="mt-4">
                      <Plus className="w-4 h-4 mr-1" />
                      最初の抽出を作成
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {extractions.slice(0, 5).map((extraction) => {
                    const ingestion = ingestions.find((i) => i.id === extraction.ingestionId);
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
                        className="block"
                      >
                        <div className="p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${statusColor}`}>
                                {EXTRACTION_STATUS_LABELS[extraction.status]}
                              </span>
                              <div>
                                <p className="font-medium">{extraction.summaryText || '抽出結果'}</p>
                                <p className="text-sm text-gray-500">
                                  {ingestion && (
                                    <span className="mr-2">
                                      {INGESTION_SOURCE_LABELS[ingestion.sourceType]}
                                    </span>
                                  )}
                                  {extraction.createdAt.toLocaleDateString('ja-JP')}{' '}
                                  {extraction.createdAt.toLocaleTimeString('ja-JP', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </p>
                              </div>
                            </div>
                            <ArrowRight className="w-5 h-5 text-gray-400" />
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
