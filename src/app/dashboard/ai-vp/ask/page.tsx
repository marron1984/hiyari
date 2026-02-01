'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { getChaosViewLevel } from '@/lib/auth';
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
  Shield,
  Heart,
  FileText,
} from 'lucide-react';
import type { FukushaQuestion, FukushaQuestionCategory } from '@/types/fukusha-ask';
import { FUKUSHA_CATEGORY_LABELS } from '@/types/fukusha-ask';

/**
 * ロール別メッセージ設定
 *
 * 思想：
 * - 新人は「安心して聞ける」ことが最優先
 * - 管理者は「一人で抱えない」ことが最優先
 * - 経営は「判断が組織に残る」ことが最優先
 */
type UserRole = 'staff' | 'manager' | 'exec';

interface RoleConfig {
  headerTitle: string;
  headerSubtitle: string;
  descriptionTitle: string;
  descriptionBody: string;
  tips: string[];
  placeholderText: string;
  submitLabel: string;
  bgGradient: string;
  accentColor: string;
  textColor: string;
}

const ROLE_CONFIG: Record<UserRole, RoleConfig> = {
  staff: {
    headerTitle: 'ふくしゃに聞く',
    headerSubtitle: '安心して相談できる場所',
    descriptionTitle: 'わからないことは、聞いて大丈夫。',
    descriptionBody: '仕事のこと、職場のこと、迷ったらまずここで聞いてください。\nAIが質問を整理し、吉田さんが確認して返信します。',
    tips: [
      '質問は誰にも見られません（匿名も可能）',
      '聞くことは正しい行動です。評価は下がりません',
      'どんな小さな疑問でも大丈夫です',
    ],
    placeholderText: '気軽に質問を書いてください。どんな小さなことでも大丈夫です...',
    submitLabel: '聞いてみる',
    bgGradient: 'from-green-500 to-emerald-600',
    accentColor: 'green',
    textColor: 'text-green-800',
  },
  manager: {
    headerTitle: 'ふくしゃに相談する',
    headerSubtitle: '判断を一人で抱えない',
    descriptionTitle: '迷ったら止めて、ここで相談。',
    descriptionBody: '管理者でも判断に迷うことはあります。\n抱え込まず上位に返すことが、正しい責任の取り方です。',
    tips: [
      '相談した事実は評価を下げません',
      '判断を抱え込むより、返すことが正解',
      '経営と現場をつなぐ役割として',
    ],
    placeholderText: '判断に迷っていること、確認したいことを書いてください...',
    submitLabel: '相談する',
    bgGradient: 'from-blue-500 to-indigo-600',
    accentColor: 'blue',
    textColor: 'text-blue-800',
  },
  exec: {
    headerTitle: '判断相談',
    headerSubtitle: '判断を組織の資産にする',
    descriptionTitle: '経営判断は、記録して残す。',
    descriptionBody: '最終判断は経営の責任です。その判断プロセスを記録し、\n組織の知恵として残すことで、次の判断を助けます。',
    tips: [
      '判断ログは組織のOS資産になります',
      '評価ではなく、知恵の蓄積です',
      '現場からの相談はInboxで確認',
    ],
    placeholderText: '判断が必要な事項、検討中の内容を記録してください...',
    submitLabel: '記録する',
    bgGradient: 'from-purple-500 to-violet-600',
    accentColor: 'purple',
    textColor: 'text-purple-800',
  },
};

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

  // ロール判定
  const viewLevel = user ? getChaosViewLevel(user.role, user.email) : 'self';
  const userRole: UserRole = viewLevel === 'all' ? 'exec' : viewLevel === 'team' ? 'manager' : 'staff';
  const roleConfig = ROLE_CONFIG[userRole];

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

  // アクセントカラー設定
  const accentBg = userRole === 'staff' ? 'bg-green-50' : userRole === 'manager' ? 'bg-blue-50' : 'bg-purple-50';
  const accentBorder = userRole === 'staff' ? 'border-green-200' : userRole === 'manager' ? 'border-blue-200' : 'border-purple-200';
  const accentIcon = userRole === 'staff' ? 'text-green-600' : userRole === 'manager' ? 'text-blue-600' : 'text-purple-600';
  const accentText = userRole === 'staff' ? 'text-green-700' : userRole === 'manager' ? 'text-blue-700' : 'text-purple-700';
  const buttonBg = userRole === 'staff' ? 'bg-green-600 hover:bg-green-700' : userRole === 'manager' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-purple-600 hover:bg-purple-700';
  const focusRing = userRole === 'staff' ? 'focus:ring-green-500' : userRole === 'manager' ? 'focus:ring-blue-500' : 'focus:ring-purple-500';

  return (
    <main className="pb-8">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* ヘッダー */}
        <div className="flex items-center gap-3 mb-6">
          <div className={`p-2 bg-gradient-to-br ${roleConfig.bgGradient} rounded-lg`}>
            <MessageCircle className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{roleConfig.headerTitle}</h1>
            <p className="text-sm text-gray-500">{roleConfig.headerSubtitle}</p>
          </div>
        </div>

        {/* 説明 */}
        <Card className={`mb-6 ${accentBg} ${accentBorder}`}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <MessageCircle className={`w-5 h-5 ${accentIcon} mt-0.5 flex-shrink-0`} />
              <div className={`text-sm ${roleConfig.textColor}`}>
                <p className="font-medium mb-2">{roleConfig.descriptionTitle}</p>
                <p className={`${accentText} mb-2 whitespace-pre-line`}>
                  {roleConfig.descriptionBody}
                </p>
                <ul className={`${accentText} space-y-1 text-xs`}>
                  {roleConfig.tips.map((tip, i) => (
                    <li key={i}>・ {tip}</li>
                  ))}
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
                  {userRole === 'exec' ? '内容' : '質問内容'} <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={roleConfig.placeholderText}
                  rows={6}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 ${focusRing} focus:border-transparent resize-none`}
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
              <button
                type="submit"
                disabled={submitting || content.trim().length < 10}
                className={`w-full py-3 px-4 ${buttonBg} text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
              >
                {submitting ? (
                  '送信中...'
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    {roleConfig.submitLabel}
                  </>
                )}
              </button>
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
