'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, Input } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { PreviewBadge } from '@/components/PreviewBadge';
import { isAiVpOwner } from '@/lib/auth';
import {
  LwMessage,
  AiReply,
  AiReplyRiskLevel,
  AiReplyCategory,
  AiReplyStatus,
  AI_REPLY_RISK_LABELS,
  AI_REPLY_RISK_COLORS,
  AI_REPLY_CATEGORY_LABELS,
  AI_REPLY_STATUS_LABELS,
  AI_REPLY_STATUS_COLORS,
} from '@/types/ai-vp';
import {
  Bot,
  MessageSquare,
  Filter,
  Search,
  AlertTriangle,
  CheckCircle,
  Clock,
  Send,
  X,
  ChevronRight,
  Shield,
  Inbox,
  RefreshCw,
} from 'lucide-react';

// ダミーデータ（PR2以降で実データに置き換え）
const DUMMY_MESSAGES: (LwMessage & { reply?: AiReply })[] = [
  {
    id: 'msg1',
    messageId: 'lw_msg_001',
    roomId: 'room_001',
    senderId: 'user_001',
    senderName: '山田太郎',
    senderRole: 'staff',
    text: '入居者様の書類提出について確認したいのですが、必要書類は何ですか？',
    receivedAt: new Date(Date.now() - 1000 * 60 * 30),
    createdAt: new Date(Date.now() - 1000 * 60 * 30),
    reply: {
      id: 'reply1',
      messageId: 'msg1',
      riskLevel: 'L1',
      category: 'nyukyo',
      draftText: '入居に必要な書類は以下の通りです...',
      status: 'sent',
      createdAt: new Date(Date.now() - 1000 * 60 * 29),
      sentAt: new Date(Date.now() - 1000 * 60 * 28),
    },
  },
  {
    id: 'msg2',
    messageId: 'lw_msg_002',
    roomId: 'room_001',
    senderId: 'user_002',
    senderName: '佐藤花子',
    senderRole: 'staff',
    text: '紹介会社への返金対応について相談です。契約解除になった場合の手続きを教えてください。',
    receivedAt: new Date(Date.now() - 1000 * 60 * 15),
    createdAt: new Date(Date.now() - 1000 * 60 * 15),
    reply: {
      id: 'reply2',
      messageId: 'msg2',
      riskLevel: 'L3',
      category: 'expense',
      draftText: '返金に関する判断は吉田の承認が必要です...',
      status: 'pending_approval',
      escalationReason: '金銭に関わる判断のため吉田承認が必要',
      createdAt: new Date(Date.now() - 1000 * 60 * 14),
    },
  },
  {
    id: 'msg3',
    messageId: 'lw_msg_003',
    roomId: 'room_002',
    senderId: 'user_003',
    senderName: '田中一郎',
    senderRole: 'staff',
    text: '勤怠の打刻を間違えてしまいました。修正方法を教えてください。',
    receivedAt: new Date(Date.now() - 1000 * 60 * 5),
    createdAt: new Date(Date.now() - 1000 * 60 * 5),
    reply: {
      id: 'reply3',
      messageId: 'msg3',
      riskLevel: 'L1',
      category: 'ops',
      draftText: '打刻修正の手順をご案内します...',
      status: 'draft',
      createdAt: new Date(Date.now() - 1000 * 60 * 4),
    },
  },
  {
    id: 'msg4',
    messageId: 'lw_msg_004',
    roomId: 'room_001',
    senderId: 'user_004',
    senderName: '鈴木次郎',
    senderRole: 'staff',
    text: '入居者のご家族からクレームがありました。対応方法を教えてください。',
    receivedAt: new Date(Date.now() - 1000 * 60 * 2),
    createdAt: new Date(Date.now() - 1000 * 60 * 2),
    reply: {
      id: 'reply4',
      messageId: 'msg4',
      riskLevel: 'L3',
      category: 'risk',
      draftText: 'クレーム対応は吉田に確認が必要です...',
      status: 'pending_approval',
      escalationReason: 'クレーム対応は高リスクのため吉田承認が必要',
      createdAt: new Date(Date.now() - 1000 * 60 * 1),
    },
  },
];

export default function AiInboxPage() {
  return (
    <AuthGuard>
      <AiInboxContent />
    </AuthGuard>
  );
}

function AiInboxContent() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<(LwMessage & { reply?: AiReply })[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRisk, setFilterRisk] = useState<AiReplyRiskLevel | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<AiReplyStatus | 'all'>('all');

  const canAccess = user && isAiVpOwner(user.email);

  useEffect(() => {
    const fetchData = async () => {
      if (!canAccess) {
        setLoading(false);
        return;
      }

      // TODO: PR2で実データに置き換え
      await new Promise(resolve => setTimeout(resolve, 500));
      setMessages(DUMMY_MESSAGES);
      setLoading(false);
    };

    fetchData();
  }, [canAccess]);

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
            <p className="text-gray-500">AI副社長機能は吉田のみアクセス可能です。</p>
          </div>
        </main>
      </>
    );
  }

  // フィルター適用
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

  // 統計
  const stats = {
    total: messages.length,
    pendingApproval: messages.filter(m => m.reply?.status === 'pending_approval').length,
    draft: messages.filter(m => m.reply?.status === 'draft').length,
    sent: messages.filter(m => m.reply?.status === 'sent').length,
    l3Count: messages.filter(m => m.reply?.riskLevel === 'L3').length,
  };

  const formatTime = (date: Date) => {
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
                AI副社長（吉田チーム）
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                LINE WORKSからの質問に一次回答を行います
              </p>
            </div>
            <div className="flex gap-2">
              <Link href="/dashboard/ai/policies">
                <Button variant="outline" size="sm">
                  <Shield className="w-4 h-4 mr-1" />
                  ポリシー
                </Button>
              </Link>
              <Button variant="outline" size="sm">
                <RefreshCw className="w-4 h-4 mr-1" />
                更新
              </Button>
            </div>
          </div>

          {/* 注意文 */}
          <Card className="mb-6 bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-800">
                    これは支援のための仕組みです。評価や査定のためではありません。
                  </p>
                  <p className="text-xs text-blue-600 mt-1">
                    L1（低リスク）は自動返信、L2/L3は承認後に送信されます。AI副社長として明示し、吉田本人になりすますことはしません。
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
            <Card className={`p-4 ${stats.l3Count > 0 ? 'bg-red-50' : ''}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">高リスク（L3）</p>
                  <p className={`text-2xl font-bold ${stats.l3Count > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                    {stats.l3Count}
                  </p>
                </div>
                <AlertTriangle className={`w-8 h-8 ${stats.l3Count > 0 ? 'text-red-300' : 'text-gray-300'}`} />
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
                                {AI_REPLY_CATEGORY_LABELS[msg.reply.category]}
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
