'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { isAiVpOwner } from '@/lib/auth';
import {
  MessageCircle,
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  User,
  Clock,
  CheckCircle,
  Send,
  Brain,
  Lightbulb,
  EyeOff,
  ChevronRight,
  Inbox,
  Loader2,
  X,
  BookOpen,
} from 'lucide-react';
import type { FukushaQuestion } from '@/types/fukusha-ask';
import { FUKUSHA_CATEGORY_LABELS } from '@/types/fukusha-ask';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: '未処理', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  processed: { label: 'AI処理済', color: 'bg-blue-100 text-blue-700', icon: Brain },
  replied: { label: '返信済み', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  archived: { label: 'アーカイブ', color: 'bg-gray-100 text-gray-700', icon: Clock },
};

export default function AskInboxPage() {
  return (
    <AuthGuard>
      <AskInboxContent />
    </AuthGuard>
  );
}

function AskInboxContent() {
  const { user, firebaseUser } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<FukushaQuestion[]>([]);
  const [selectedQuestion, setSelectedQuestion] = useState<FukushaQuestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('pending,processed');

  // 権限チェック
  useEffect(() => {
    if (user && !isAiVpOwner(user.email)) {
      router.push('/dashboard');
    }
  }, [user, router]);

  const fetchQuestions = useCallback(async () => {
    if (!firebaseUser) return;
    setLoading(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      const res = await fetch(`/api/fukusha-ask?admin=true&status=${statusFilter}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (res.ok) {
        setQuestions(data.questions || []);
      } else {
        setError(data.error || '取得に失敗しました');
      }
    } catch (err) {
      console.error('Failed to fetch questions:', err);
      setError('データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, statusFilter]);

  useEffect(() => {
    if (user?.email && isAiVpOwner(user.email) && firebaseUser) {
      fetchQuestions();
    }
  }, [user?.email, firebaseUser, fetchQuestions]);

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

  // ステータス別の件数を計算
  const pendingCount = questions.filter(q => q.status === 'pending').length;
  const processedCount = questions.filter(q => q.status === 'processed').length;
  const repliedCount = questions.filter(q => q.status === 'replied').length;

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
                  <Inbox className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">ふくしゃに聞く</h1>
                  <p className="text-sm text-gray-500">判断相談（AI一次整理）</p>
                </div>
              </div>
            </div>
            <Button variant="secondary" onClick={fetchQuestions}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>

          {/* エラー表示 */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-5 h-5" />
              <span>{error}</span>
              <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">×</button>
            </div>
          )}

          {/* フィルター */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setStatusFilter('pending,processed')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                statusFilter === 'pending,processed'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              未返信 ({pendingCount + processedCount})
            </button>
            <button
              onClick={() => setStatusFilter('replied')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                statusFilter === 'replied'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              返信済み ({repliedCount})
            </button>
            <button
              onClick={() => setStatusFilter('')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                statusFilter === ''
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              すべて ({questions.length})
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 質問一覧 */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageCircle className="w-5 h-5" />
                    質問一覧
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {questions.length === 0 ? (
                    <div className="py-8 text-center text-gray-500">
                      <Inbox className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                      <p>質問がありません</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {questions.map((question) => (
                        <QuestionCard
                          key={question.id}
                          question={question}
                          isSelected={selectedQuestion?.id === question.id}
                          onSelect={() => setSelectedQuestion(question)}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* 詳細パネル */}
            <div>
              {selectedQuestion ? (
                <QuestionDetailPanel
                  question={selectedQuestion}
                  onClose={() => setSelectedQuestion(null)}
                  onReplySuccess={() => {
                    fetchQuestions();
                    setSelectedQuestion(null);
                  }}
                  firebaseUser={firebaseUser}
                />
              ) : (
                <Card className="p-6 text-center">
                  <MessageCircle className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p className="text-gray-500">質問を選択してください</p>
                </Card>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

/**
 * 質問カード
 */
function QuestionCard({
  question,
  isSelected,
  onSelect,
}: {
  question: FukushaQuestion;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const statusConfig = STATUS_CONFIG[question.status];
  const StatusIcon = statusConfig.icon;

  return (
    <div
      className={`p-4 rounded-lg cursor-pointer transition-all ${
        isSelected ? 'ring-2 ring-purple-500 bg-purple-50' : 'bg-gray-50 hover:bg-gray-100'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Badge className={`${statusConfig.color} text-xs`}>
              <StatusIcon className="w-3 h-3 mr-1" />
              {statusConfig.label}
            </Badge>
            <Badge className="bg-gray-100 text-gray-700 text-xs">
              {FUKUSHA_CATEGORY_LABELS[question.category]}
            </Badge>
            {question.isAnonymous && (
              <Badge className="bg-purple-100 text-purple-700 text-xs">
                <EyeOff className="w-3 h-3 mr-1" />
                匿名
              </Badge>
            )}
          </div>
          <p className="font-medium text-gray-900 truncate">
            {question.title || question.content.slice(0, 50)}
          </p>
          <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
            <User className="w-3 h-3" />
            <span>{question.isAnonymous ? '匿名' : question.userName}</span>
            {question.userBaseName && <span className="text-gray-400">({question.userBaseName})</span>}
            <span>•</span>
            <span>{new Date(question.createdAt).toLocaleDateString('ja-JP')}</span>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
      </div>
    </div>
  );
}

/**
 * 詳細パネル
 */
function QuestionDetailPanel({
  question,
  onClose,
  onReplySuccess,
  firebaseUser,
}: {
  question: FukushaQuestion;
  onClose: () => void;
  onReplySuccess: () => void;
  firebaseUser: any;
}) {
  const [replyContent, setReplyContent] = useState(question.aiDraftReply || '');
  const [replyNote, setReplyNote] = useState('');
  const [saveToDecisionLog, setSaveToDecisionLog] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 質問が変わったら返信内容をリセット
  useEffect(() => {
    setReplyContent(question.aiDraftReply || '');
    setReplyNote('');
    setSaveToDecisionLog(false);
    setError(null);
  }, [question.id, question.aiDraftReply]);

  const handleSendReply = async () => {
    if (!replyContent.trim()) {
      setError('返信内容を入力してください');
      return;
    }

    setSending(true);
    setError(null);

    try {
      const idToken = await firebaseUser.getIdToken();
      const res = await fetch(`/api/fukusha-ask/${question.id}/reply`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          replyContent: replyContent.trim(),
          replyNote: replyNote.trim() || undefined,
          saveToDecisionLog,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '返信に失敗しました');
      }

      onReplySuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : '返信に失敗しました');
    } finally {
      setSending(false);
    }
  };

  const statusConfig = STATUS_CONFIG[question.status];

  return (
    <Card className="sticky top-4">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5" />
            質問詳細
          </span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto">
        {/* ステータス */}
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={statusConfig.color}>
            {statusConfig.label}
          </Badge>
          <Badge className="bg-gray-100 text-gray-700">
            {FUKUSHA_CATEGORY_LABELS[question.category]}
          </Badge>
          {question.isAnonymous && (
            <Badge className="bg-purple-100 text-purple-700">
              <EyeOff className="w-3 h-3 mr-1" />
              匿名
            </Badge>
          )}
        </div>

        {/* 質問者情報 */}
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <User className="w-4 h-4" />
          <span>{question.isAnonymous ? '匿名' : question.userName}</span>
          {question.userBaseName && <span>({question.userBaseName})</span>}
        </div>

        {/* 質問内容 */}
        <div>
          <h4 className="text-sm font-medium text-gray-500 mb-2">質問内容</h4>
          {question.title && (
            <p className="font-medium text-gray-900 mb-2">{question.title}</p>
          )}
          <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-800 whitespace-pre-wrap">
            {question.content}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {new Date(question.createdAt).toLocaleString('ja-JP')}
          </p>
        </div>

        {/* AI分析結果 */}
        {question.status !== 'pending' && question.aiSummary && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-center gap-2 text-blue-700 font-medium mb-2">
              <Brain className="w-4 h-4" />
              AI分析
            </div>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-blue-600 font-medium">要約:</span>
                <span className="text-gray-700 ml-1">{question.aiSummary}</span>
              </div>
              {question.aiKeyPoints && question.aiKeyPoints.length > 0 && (
                <div>
                  <span className="text-blue-600 font-medium">論点:</span>
                  <ul className="list-disc list-inside text-gray-700 mt-1">
                    {question.aiKeyPoints.map((point, i) => (
                      <li key={i}>{point}</li>
                    ))}
                  </ul>
                </div>
              )}
              {question.aiSuggestedTone && (
                <div>
                  <span className="text-blue-600 font-medium">推奨トーン:</span>
                  <span className="ml-1 px-2 py-0.5 bg-blue-100 rounded text-blue-700">
                    {question.aiSuggestedTone}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 返信済みの場合 */}
        {question.status === 'replied' && question.replyContent && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="flex items-center gap-2 text-green-700 font-medium mb-2">
              <CheckCircle className="w-4 h-4" />
              返信済み
            </div>
            <div className="text-sm text-gray-700 whitespace-pre-wrap">
              {question.replyContent}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {question.repliedByName || '副社長'}より •{' '}
              {question.repliedAt
                ? new Date(question.repliedAt).toLocaleString('ja-JP')
                : '-'}
            </p>
          </div>
        )}

        {/* 返信フォーム（未返信の場合） */}
        {question.status !== 'replied' && question.status !== 'archived' && (
          <div className="border-t pt-4">
            <h4 className="text-sm font-medium text-gray-500 mb-2 flex items-center gap-2">
              <Send className="w-4 h-4" />
              返信を作成
            </h4>

            {question.aiDraftReply && (
              <div className="mb-2 flex items-center gap-2 text-xs text-blue-600">
                <Lightbulb className="w-3 h-3" />
                AIの下書きを編集できます
              </div>
            )}

            <textarea
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              placeholder="返信内容を入力..."
              className="w-full p-3 border rounded-lg text-sm resize-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              rows={6}
            />

            <div className="mt-2">
              <label className="text-xs text-gray-500">内部メモ（質問者には表示されません）</label>
              <input
                type="text"
                value={replyNote}
                onChange={(e) => setReplyNote(e.target.value)}
                placeholder="対応メモなど..."
                className="w-full mt-1 p-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>

            {/* 判断ログ連携チェックボックス */}
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveToDecisionLog}
                  onChange={(e) => setSaveToDecisionLog(e.target.checked)}
                  className="mt-1 w-4 h-4 text-amber-600 border-amber-300 rounded focus:ring-amber-500"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-amber-800 font-medium">
                    <BookOpen className="w-4 h-4" />
                    この判断を「判断ログ」に記録する
                  </div>
                  <p className="text-xs text-amber-700 mt-1">
                    判断ログは「正解の記録」ではありません。
                    判断がどのように行われたかを残し、次の判断を楽にするためのOS資産です。
                  </p>
                </div>
              </label>
            </div>

            {error && (
              <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}

            <Button
              onClick={handleSendReply}
              disabled={sending || !replyContent.trim()}
              className="w-full mt-3 bg-purple-600 hover:bg-purple-700"
            >
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  送信中...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  返信を送信
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
