'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardContent, Badge, Button, Input } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { PreviewBadge } from '@/components/PreviewBadge';
import { isAiVpOwner } from '@/lib/auth';
import {
  AiReplyRiskLevel,
  AiReplyCategory,
  AiReplyStatus,
  AI_REPLY_RISK_COLORS,
  AI_REPLY_CATEGORY_LABELS,
  AI_REPLY_STATUS_LABELS,
  AI_REPLY_STATUS_COLORS,
} from '@/types/ai-vp';
import {
  Bot,
  Search,
  AlertTriangle,
  Clock,
  Send,
  ChevronRight,
  Shield,
  Inbox,
  RefreshCw,
} from 'lucide-react';

interface InboxMessage {
  id: string;
  messageId: string;
  roomId: string;
  senderId: string;
  senderName: string;
  senderRole?: string;
  text: string;
  receivedAt: string;
  createdAt: string;
  reply: {
    id: string;
    messageId: string;
    riskLevel: AiReplyRiskLevel;
    category: string;
    draftText: string;
    finalText?: string;
    status: AiReplyStatus;
    templateId?: string;
    escalationReason?: string;
    createdAt: string;
    updatedAt?: string;
    sentAt?: string;
  } | null;
}

interface InboxStats {
  total: number;
  pendingApproval: number;
  draft: number;
  sent: number;
  rejected: number;
  l1: number;
  l2: number;
  l3: number;
}

export default function AiInboxPage() {
  return (
    <AuthGuard>
      <AiInboxContent />
    </AuthGuard>
  );
}

function AiInboxContent() {
  const { user, firebaseUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [stats, setStats] = useState<InboxStats>({ total: 0, pendingApproval: 0, draft: 0, sent: 0, rejected: 0, l1: 0, l2: 0, l3: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRisk, setFilterRisk] = useState<AiReplyRiskLevel | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<AiReplyStatus | 'all'>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const canAccess = user && isAiVpOwner(user.email);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (!canAccess || !firebaseUser) return;
    if (isRefresh) setRefreshing(true);

    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/ai-vp/inbox', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      setMessages(data.messages || []);
      setStats(data.stats || { total: 0, pendingApproval: 0, draft: 0, sent: 0, rejected: 0, l1: 0, l2: 0, l3: 0 });
      setFetchError(null);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : 'データ取得エラー');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canAccess, firebaseUser]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <>
        <Header />
        <Loading text="メッセージを読み込み中..." />
      </>
    );
  }

  if (!canAccess) {
    return (
      <>
        <Header />
        <main className="pb-8">
          <div className="max-w-4xl mx-auto px-4 py-12 text-center">
            <Shield className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <h1 className="text-xl font-bold text-gray-900 mb-2">アクセス権限がありません</h1>
            <p className="text-gray-500">この機能は吉田のみアクセス可能です。</p>
          </div>
        </main>
      </>
    );
  }

  // フィルター適用（検索はクライアントサイド、risk/statusはAPI側でも対応可）
  const filteredMessages = messages.filter(msg => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!msg.text.toLowerCase().includes(query) &&
          !msg.senderName.toLowerCase().includes(query)) {
        return false;
      }
    }
    if (filterRisk !== 'all' && msg.reply?.riskLevel !== filterRisk) {
      return false;
    }
    if (filterStatus !== 'all' && msg.reply?.status !== filterStatus) {
      return false;
    }
    return true;
  });

  const formatTime = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 1000 / 60);

    if (minutes < 60) return `${minutes}分前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}時間前`;
    return date.toLocaleDateString('ja-JP');
  };

  return (
    <>
      <Header />
      <PreviewBadge />
      <main className="pb-8">
        <div className="max-w-5xl mx-auto px-4 py-6">
          {/* ヘッダー */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center">
                <Bot className="w-6 h-6 mr-2 text-indigo-600" />
                吉田受信箱
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                LINE WORKSからの質問に吉田として返答します
              </p>
            </div>
            <div className="flex gap-2">
              <Link href="/dashboard/ai/policies">
                <Button variant="outline" size="sm">
                  <Shield className="w-4 h-4 mr-1" />
                  ポリシー
                </Button>
              </Link>
              <Button variant="outline" size="sm" onClick={() => fetchData(true)} disabled={refreshing}>
                <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
                更新
              </Button>
            </div>
          </div>

          {/* エラー表示 */}
          {fetchError && (
            <Card className="mb-6 bg-red-50 border-red-200">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-800">データ取得エラー</p>
                    <p className="text-xs text-red-600 mt-1">{fetchError}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 注意文 */}
          <Card className="mb-6 bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-800">
                    スタッフには吉田本人からの返答として送信されます。
                  </p>
                  <p className="text-xs text-blue-600 mt-1">
                    L1（低リスク）は自動返信、L2/L3は承認後に送信されます。評価や査定のためではありません。
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 統計カード */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">総メッセージ</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                </div>
                <Inbox className="w-8 h-8 text-gray-300" />
              </div>
            </Card>
            <Card className={`p-4 ${stats.pendingApproval > 0 ? 'bg-yellow-50' : ''}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">承認待ち</p>
                  <p className={`text-2xl font-bold ${stats.pendingApproval > 0 ? 'text-yellow-600' : 'text-gray-400'}`}>
                    {stats.pendingApproval}
                  </p>
                </div>
                <Clock className={`w-8 h-8 ${stats.pendingApproval > 0 ? 'text-yellow-300' : 'text-gray-300'}`} />
              </div>
            </Card>
            <Card className={`p-4 ${stats.l3 > 0 ? 'bg-red-50' : ''}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">高リスク（L3）</p>
                  <p className={`text-2xl font-bold ${stats.l3 > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                    {stats.l3}
                  </p>
                </div>
                <AlertTriangle className={`w-8 h-8 ${stats.l3 > 0 ? 'text-red-300' : 'text-gray-300'}`} />
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">送信済み</p>
                  <p className="text-2xl font-bold text-green-600">{stats.sent}</p>
                </div>
                <Send className="w-8 h-8 text-green-300" />
              </div>
            </Card>
          </div>

          {/* フィルター */}
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <Input
                      placeholder="メッセージ・送信者で検索..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <select
                    value={filterRisk}
                    onChange={(e) => setFilterRisk(e.target.value as AiReplyRiskLevel | 'all')}
                    className="px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="all">全リスク</option>
                    <option value="L1">L1（低）</option>
                    <option value="L2">L2（中）</option>
                    <option value="L3">L3（高）</option>
                  </select>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value as AiReplyStatus | 'all')}
                    className="px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="all">全ステータス</option>
                    <option value="draft">下書き</option>
                    <option value="pending_approval">承認待ち</option>
                    <option value="sent">送信済み</option>
                    <option value="rejected">却下</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* メッセージ一覧 */}
          <div className="space-y-3">
            {filteredMessages.length === 0 ? (
              <Card className="p-8 text-center">
                <Inbox className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">
                  {searchQuery || filterRisk !== 'all' || filterStatus !== 'all'
                    ? '条件に一致するメッセージがありません'
                    : 'メッセージがありません'}
                </p>
              </Card>
            ) : (
              filteredMessages.map((msg) => (
                <Link
                  key={msg.id}
                  href={`/dashboard/ai/replies/${msg.reply?.id || msg.id}`}
                >
                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        {/* リスクレベルバッジ */}
                        <div className="flex-shrink-0">
                          {msg.reply?.riskLevel && (
                            <Badge className={`${AI_REPLY_RISK_COLORS[msg.reply.riskLevel].bg} ${AI_REPLY_RISK_COLORS[msg.reply.riskLevel].text}`}>
                              {msg.reply.riskLevel}
                            </Badge>
                          )}
                        </div>

                        {/* メッセージ本文 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-gray-900">{msg.senderName}</span>
                            <span className="text-xs text-gray-400">{formatTime(msg.receivedAt)}</span>
                            {msg.reply?.category && (
                              <Badge className="bg-gray-100 text-gray-600 text-xs">
                                {AI_REPLY_CATEGORY_LABELS[msg.reply.category as AiReplyCategory] || msg.reply.category}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-700 line-clamp-2">{msg.text}</p>
                          {msg.reply?.escalationReason && (
                            <p className="text-xs text-orange-600 mt-1 flex items-center">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              {msg.reply.escalationReason}
                            </p>
                          )}
                        </div>

                        {/* ステータス */}
                        <div className="flex-shrink-0 flex items-center gap-2">
                          {msg.reply?.status && (
                            <Badge className={`${AI_REPLY_STATUS_COLORS[msg.reply.status].bg} ${AI_REPLY_STATUS_COLORS[msg.reply.status].text}`}>
                              {AI_REPLY_STATUS_LABELS[msg.reply.status]}
                            </Badge>
                          )}
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))
            )}
          </div>
        </div>
      </main>
    </>
  );
}
