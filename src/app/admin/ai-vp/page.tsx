'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardHeader, CardTitle, CardContent, Button } from '@/components/ui';
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
  Activity,
  Users,
  Heart,
  Calculator,
  BookOpen,
  Inbox,
  Building2,
  ListTodo,
  Shield,
  TrendingUp,
  MessageSquare,
} from 'lucide-react';

// メニュー定義
interface MenuItem {
  href: string;
  icon: typeof Brain;
  title: string;
  description: string;
  bgColor: string;
  iconColor: string;
  highlight?: boolean;
}

interface MenuCategory {
  title: string;
  description: string;
  items: MenuItem[];
}

const MENU_CATEGORIES: MenuCategory[] = [
  {
    title: '承認・管理',
    description: 'AIレビューの最終確認と抽出管理',
    items: [
      {
        href: '/admin/ai-vp/approval',
        icon: Gavel,
        title: '最終決裁',
        description: 'AIレビュー済み案件の承認',
        bgColor: 'bg-green-100',
        iconColor: 'text-green-600',
        highlight: true,
      },
      {
        href: '/admin/ai-vp/new',
        icon: Plus,
        title: '新規抽出',
        description: 'テキストや音声から情報抽出',
        bgColor: 'bg-blue-100',
        iconColor: 'text-blue-600',
      },
      {
        href: '/admin/ai-vp/history',
        icon: History,
        title: '抽出履歴',
        description: '過去の抽出結果一覧',
        bgColor: 'bg-gray-100',
        iconColor: 'text-gray-600',
      },
    ],
  },
  {
    title: '予測・分析',
    description: '人材・組織の健康状態をモニタリング',
    items: [
      {
        href: '/dashboard/ai-vp/human-risk',
        icon: Users,
        title: '人材リスク予測',
        description: '離職・メンタル不調の早期検知',
        bgColor: 'bg-red-100',
        iconColor: 'text-red-600',
        highlight: true,
      },
      {
        href: '/dashboard/ai/organization-health',
        icon: Heart,
        title: '組織健康モニタリング',
        description: 'チームの健康度を可視化',
        bgColor: 'bg-pink-100',
        iconColor: 'text-pink-600',
      },
      {
        href: '/admin/ai-vp/condition',
        icon: Activity,
        title: 'コンディション管理',
        description: 'スタッフの日々の状態を把握',
        bgColor: 'bg-emerald-100',
        iconColor: 'text-emerald-600',
      },
    ],
  },
  {
    title: '意思決定支援',
    description: 'AIによる判断・説明のサポート',
    items: [
      {
        href: '/dashboard/ai-vp/simulation',
        icon: Calculator,
        title: 'シミュレーション',
        description: '採用・離職の影響を予測',
        bgColor: 'bg-indigo-100',
        iconColor: 'text-indigo-600',
      },
      {
        href: '/dashboard/ai-vp/yoshida-learning',
        icon: BookOpen,
        title: '吉田式学習',
        description: '意思決定パターンをAIが学習',
        bgColor: 'bg-amber-100',
        iconColor: 'text-amber-600',
      },
      {
        href: '/dashboard/ai-vp/explanation',
        icon: MessageSquare,
        title: 'AI説明文作成',
        description: '金融・医療・行政向け説明生成',
        bgColor: 'bg-cyan-100',
        iconColor: 'text-cyan-600',
      },
    ],
  },
  {
    title: 'コミュニケーション',
    description: 'AIによるメッセージ・タスク管理',
    items: [
      {
        href: '/dashboard/ai/inbox',
        icon: Inbox,
        title: 'AI受信箱',
        description: 'LWメッセージのAI返信管理',
        bgColor: 'bg-violet-100',
        iconColor: 'text-violet-600',
      },
      {
        href: '/dashboard/ai/todos',
        icon: ListTodo,
        title: 'AIタスク',
        description: 'AIからの提案タスク一覧',
        bgColor: 'bg-orange-100',
        iconColor: 'text-orange-600',
      },
      {
        href: '/dashboard/ai/policies',
        icon: Shield,
        title: 'ポリシー管理',
        description: 'AI動作ルールの設定',
        bgColor: 'bg-slate-100',
        iconColor: 'text-slate-600',
      },
    ],
  },
];

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
                <p className="text-sm text-gray-500">経営判断支援・業務自動化アシスタント</p>
              </div>
            </div>
            <Button variant="secondary" onClick={fetchData}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>

          {/* 統計カード */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
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

          {/* メニューカテゴリ */}
          <div className="space-y-8 mb-8">
            {MENU_CATEGORIES.map((category) => (
              <Card key={category.title}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">{category.title}</CardTitle>
                  <p className="text-sm text-gray-500">{category.description}</p>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {category.items.map((item) => (
                      <Link key={item.href} href={item.href} className="block">
                        <div
                          className={`p-4 border rounded-lg hover:shadow-md transition-all ${
                            item.highlight
                              ? 'border-2 border-green-200 bg-green-50/50 hover:bg-green-50'
                              : 'hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`p-2 ${item.bgColor} rounded-lg flex-shrink-0`}>
                              <item.icon className={`w-5 h-5 ${item.iconColor}`} />
                            </div>
                            <div className="min-w-0">
                              <h3
                                className={`font-medium ${
                                  item.highlight ? 'text-green-700' : 'text-gray-900'
                                }`}
                              >
                                {item.title}
                              </h3>
                              <p
                                className={`text-sm ${
                                  item.highlight ? 'text-green-600' : 'text-gray-500'
                                }`}
                              >
                                {item.description}
                              </p>
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

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
