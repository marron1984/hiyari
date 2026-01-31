'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from '@/components/ui';
import { Loading } from '@/components/Loading';
import {
  MessageCircle,
  Send,
  Clock,
  CheckCircle,
  History,
  AlertCircle,
  Eye,
  EyeOff,
  ChevronRight,
} from 'lucide-react';
import type { FukushaQuestion, FukushaQuestionCategory } from '@/types/fukusha-ask';
import { FUKUSHA_CATEGORY_LABELS } from '@/types/fukusha-ask';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: '確認中', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  processed: { label: '返信準備中', color: 'bg-blue-100 text-blue-700', icon: Clock },
  replied: { label: '返信済み', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  archived: { label: 'アーカイブ', color: 'bg-gray-100 text-gray-700', icon: History },
};

export default function FukushaAskPage() {
  const { user, firebaseUser } = useAuth();
  const [myQuestions, setMyQuestions] = useState<FukushaQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // フォーム
  const [category, setCategory] = useState<FukushaQuestionCategory>('work');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);

  // 自分の質問を取得
  const fetchMyQuestions = useCallback(async () => {
    if (!firebaseUser) return;

    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/fukusha-ask?my=true&limit=10', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setMyQuestions(data.questions || []);
      }
    } catch (err) {
      console.error('Failed to fetch my questions:', err);
    } finally {
      setLoading(false);
    }
  }, [firebaseUser]);

  useEffect(() => {
    fetchMyQuestions();
  }, [fetchMyQuestions]);

  // 質問を投稿
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || submitting) return;

    setError(null);
    setSubmitting(true);

    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/fukusha-ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          category,
          title,
          content,
          isAnonymous,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '投稿に失敗しました');
      }

      // 成功
      setSuccess(true);
      setTitle('');
      setContent('');
      setIsAnonymous(false);
      fetchMyQuestions();

      // 3秒後に成功メッセージを消す
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '投稿に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <Loading text="読み込み中..." />;
  }

  return (
    <main className="pb-8">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* ヘッダー */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg">
            <MessageCircle className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">ふくしゃに聞く</h1>
            <p className="text-sm text-gray-500">AI副社長への質問箱</p>
          </div>
        </div>

        {/* 説明 */}
        <Card className="mb-6 bg-purple-50 border-purple-200">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <MessageCircle className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-purple-800">
                <p className="font-medium mb-1">質問や相談を気軽に送れます</p>
                <ul className="text-purple-700 space-y-1">
                  <li>・ 匿名での投稿も可能です</li>
                  <li>・ 吉田さんが確認して返信します</li>
                  <li>・ 返信までしばらくお待ちください</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 成功メッセージ */}
        {success && (
          <Card className="mb-6 bg-green-50 border-green-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="text-green-800 font-medium">
                  質問を送信しました！返信をお待ちください。
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* エラーメッセージ */}
        {error && (
          <Card className="mb-6 bg-red-50 border-red-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-red-600" />
                <span className="text-red-800">{error}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 質問フォーム */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Send className="w-5 h-5" />
              質問を送る
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* カテゴリ */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  カテゴリ
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as FukushaQuestionCategory)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  {Object.entries(FUKUSHA_CATEGORY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              {/* 件名（任意） */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  件名 <span className="text-gray-400">（任意）</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="例: 業務の進め方について"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  maxLength={100}
                />
              </div>

              {/* 質問内容 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  質問内容 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="気軽に質問や相談を書いてください..."
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                  maxLength={2000}
                  required
                />
                <div className="text-xs text-gray-400 mt-1 text-right">
                  {content.length}/2000
                </div>
              </div>

              {/* 匿名オプション */}
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <button
                  type="button"
                  onClick={() => setIsAnonymous(!isAnonymous)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                    isAnonymous
                      ? 'bg-purple-100 border-purple-300 text-purple-700'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {isAnonymous ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                  {isAnonymous ? '匿名で投稿' : '名前を表示'}
                </button>
                <span className="text-sm text-gray-500">
                  {isAnonymous
                    ? '名前は表示されません'
                    : `${user?.name || 'あなた'}として投稿されます`}
                </span>
              </div>

              {/* 送信ボタン */}
              <Button
                type="submit"
                disabled={submitting || content.trim().length < 10}
                className="w-full"
              >
                {submitting ? (
                  '送信中...'
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    送信する
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* 自分の質問履歴 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <History className="w-5 h-5" />
              あなたの質問
            </CardTitle>
          </CardHeader>
          <CardContent>
            {myQuestions.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>まだ質問がありません</p>
                <p className="text-sm mt-1">上のフォームから質問を送ってみましょう</p>
              </div>
            ) : (
              <div className="space-y-3">
                {myQuestions.map((q) => {
                  const statusConfig = STATUS_CONFIG[q.status];
                  const StatusIcon = statusConfig.icon;
                  return (
                    <Link
                      key={q.id}
                      href={`/dashboard/ai-vp/ask/${q.id}`}
                      className="block p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge className={statusConfig.color}>
                              <StatusIcon className="w-3 h-3 mr-1" />
                              {statusConfig.label}
                            </Badge>
                            <Badge className="bg-gray-100 text-gray-700">
                              {FUKUSHA_CATEGORY_LABELS[q.category]}
                            </Badge>
                            {q.isAnonymous && (
                              <Badge className="bg-purple-100 text-purple-700">
                                <EyeOff className="w-3 h-3 mr-1" />
                                匿名
                              </Badge>
                            )}
                          </div>
                          <p className="font-medium text-gray-900 truncate">
                            {q.title || q.content.slice(0, 50)}
                          </p>
                          <p className="text-sm text-gray-500 mt-1">
                            {new Date(q.createdAt).toLocaleDateString('ja-JP')}
                          </p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
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
  );
}
