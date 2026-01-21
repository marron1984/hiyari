'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardHeader, CardTitle, CardContent, Button } from '@/components/ui';
import { isAiVpOwner } from '@/lib/auth';
import { getAuth } from 'firebase/auth';
import {
  Brain,
  ArrowLeft,
  Send,
  Loader2,
  AlertCircle,
  FileText,
} from 'lucide-react';

export default function AiVpNewPage() {
  return (
    <AuthGuard>
      <AiVpNewContent />
    </AuthGuard>
  );
}

function AiVpNewContent() {
  const { user } = useAuth();
  const router = useRouter();
  const [rawText, setRawText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 権限チェック
  useEffect(() => {
    if (user && !isAiVpOwner(user.email)) {
      router.push('/dashboard');
    }
  }, [user, router]);

  const handleSubmit = async () => {
    if (!rawText.trim()) {
      setError('テキストを入力してください');
      return;
    }

    if (rawText.length > 100000) {
      setError('テキストが長すぎます（最大100,000文字）');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Firebase IDトークン取得
      const auth = getAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('認証が必要です');
      }
      const idToken = await currentUser.getIdToken();

      const response = await fetch('/api/ai-vp/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          sourceType: 'text',
          rawText,
          sourceMeta: {
            inputMethod: 'manual',
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '抽出に失敗しました');
      }

      // 抽出結果ページへ遷移
      router.push(`/admin/ai-vp/extraction/${data.extractionId}`);
    } catch (err) {
      console.error('Extraction error:', err);
      setError(err instanceof Error ? err.message : '抽出に失敗しました');
    } finally {
      setLoading(false);
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
            <p className="text-gray-500">この機能はAI副社長オーナーのみ利用可能です。</p>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="pb-20 md:pb-8">
        <div className="max-w-4xl mx-auto px-4 py-6">
          {/* ヘッダー */}
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => router.back()}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">新規抽出</h1>
                <p className="text-sm text-gray-500">テキストから情報を抽出</p>
              </div>
            </div>
          </div>

          {/* 入力フォーム */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                テキスト入力
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    抽出元テキスト
                    <span className="text-gray-400 ml-2">
                      （会議議事録、電話メモ、文字起こしなど）
                    </span>
                  </label>
                  <textarea
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder="抽出したいテキストを入力してください...

例:
「本日の会議では、N様（90代女性、要介護3）の入居相談について話し合いました。
A社の田中さんから紹介で、来週月曜に見学希望とのこと。
ミヤビの空室があれば案内予定。
また、先日の転倒事故について再発防止策を検討...」"
                    className="w-full h-80 p-4 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none font-mono text-sm"
                    disabled={loading}
                  />
                  <div className="flex justify-between text-sm text-gray-500 mt-1">
                    <span>
                      {rawText.length.toLocaleString()} / 100,000 文字
                    </span>
                    {rawText.length > 80000 && (
                      <span className="text-orange-500">
                        文字数が多いと処理に時間がかかります
                      </span>
                    )}
                  </div>
                </div>

                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="flex justify-end gap-3">
                  <Button
                    variant="secondary"
                    onClick={() => router.back()}
                    disabled={loading}
                  >
                    キャンセル
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={loading || !rawText.trim()}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        抽出中...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        抽出を開始
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ヒント */}
          <Card className="mt-6 bg-purple-50 border-purple-200">
            <CardContent className="py-4">
              <h3 className="font-medium text-purple-900 mb-2">抽出のヒント</h3>
              <ul className="text-sm text-purple-700 space-y-1">
                <li>• 会議の議事録や電話メモ、文字起こしテキストを入力できます</li>
                <li>• 人名、日付、施設名などは具体的に記載すると精度が上がります</li>
                <li>• 抽出結果は確認・編集後に各機能へ反映できます</li>
                <li>• 個人情報を含むテキストは適切に管理されます</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
