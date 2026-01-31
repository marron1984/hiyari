'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from '@/components/ui';
import { Loading } from '@/components/Loading';
import {
  MessageCircle,
  ArrowLeft,
  Clock,
  CheckCircle,
  AlertCircle,
  EyeOff,
  User,
  Reply,
} from 'lucide-react';
import type { FukushaQuestion } from '@/types/fukusha-ask';
import { FUKUSHA_CATEGORY_LABELS } from '@/types/fukusha-ask';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: '確認中', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  processed: { label: '返信準備中', color: 'bg-blue-100 text-blue-700', icon: Clock },
  replied: { label: '返信済み', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  archived: { label: 'アーカイブ', color: 'bg-gray-100 text-gray-700', icon: Clock },
};

export default function FukushaAskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { firebaseUser } = useAuth();
  const [question, setQuestion] = useState<FukushaQuestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchQuestion = useCallback(async () => {
    if (!firebaseUser) return;

    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch(`/api/fukusha-ask/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '取得に失敗しました');
      }

      setQuestion(data.question);
    } catch (err) {
      setError(err instanceof Error ? err.message : '取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, id]);

  useEffect(() => {
    fetchQuestion();
  }, [fetchQuestion]);

  if (loading) {
    return <Loading text="読み込み中..." />;
  }

  if (error || !question) {
    return (
      <main className="pb-8">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <Card className="bg-red-50 border-red-200">
            <CardContent className="p-6 text-center">
              <AlertCircle className="w-12 h-12 mx-auto mb-3 text-red-400" />
              <p className="text-red-800 font-medium">{error || '質問が見つかりません'}</p>
              <Link href="/dashboard/ai-vp/ask">
                <Button variant="secondary" className="mt-4">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  戻る
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  const statusConfig = STATUS_CONFIG[question.status];
  const StatusIcon = statusConfig.icon;

  return (
    <main className="pb-8">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* ヘッダー */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/dashboard/ai-vp/ask">
            <Button variant="secondary" size="sm">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold">質問詳細</h1>
            <p className="text-sm text-gray-500">ふくしゃに聞く</p>
          </div>
        </div>

        {/* ステータス */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Badge className={`${statusConfig.color} text-sm px-3 py-1`}>
                <StatusIcon className="w-4 h-4 mr-1" />
                {statusConfig.label}
              </Badge>
              <Badge className="bg-gray-100 text-gray-700">
                {FUKUSHA_CATEGORY_LABELS[question.category]}
              </Badge>
              {question.isAnonymous && (
                <Badge className="bg-purple-100 text-purple-700">
                  <EyeOff className="w-3 h-3 mr-1" />
                  匿名投稿
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 質問内容 */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-purple-600" />
              あなたの質問
            </CardTitle>
          </CardHeader>
          <CardContent>
            {question.title && (
              <h3 className="font-medium text-gray-900 mb-2">{question.title}</h3>
            )}
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-gray-800 whitespace-pre-wrap">{question.content}</p>
            </div>
            <div className="flex items-center gap-2 mt-3 text-sm text-gray-500">
              <User className="w-4 h-4" />
              <span>
                {question.isAnonymous ? '匿名' : question.userName}
                {question.userBaseName && ` (${question.userBaseName})`}
              </span>
              <span>•</span>
              <span>{new Date(question.createdAt).toLocaleString('ja-JP')}</span>
            </div>
          </CardContent>
        </Card>

        {/* 返信（あれば） */}
        {question.status === 'replied' && question.replyContent && (
          <Card className="mb-6 border-green-200 bg-green-50/30">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2 text-green-700">
                <Reply className="w-5 h-5" />
                ふくしゃからの返信
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-white rounded-lg p-4 border border-green-200">
                <p className="text-gray-800 whitespace-pre-wrap">{question.replyContent}</p>
              </div>
              <div className="flex items-center gap-2 mt-3 text-sm text-gray-500">
                <span>
                  {question.repliedByName || '副社長'}より
                </span>
                <span>•</span>
                <span>
                  {question.repliedAt
                    ? new Date(question.repliedAt).toLocaleString('ja-JP')
                    : '-'}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 返信待ちメッセージ */}
        {(question.status === 'pending' || question.status === 'processed') && (
          <Card className="mb-6 bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="font-medium text-blue-800">返信をお待ちください</p>
                  <p className="text-sm text-blue-700 mt-1">
                    {question.status === 'pending'
                      ? '質問を確認しています。しばらくお待ちください。'
                      : '返信を準備中です。もう少々お待ちください。'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 戻るボタン */}
        <div className="text-center">
          <Link href="/dashboard/ai-vp/ask">
            <Button variant="secondary">
              <ArrowLeft className="w-4 h-4 mr-2" />
              質問一覧に戻る
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
