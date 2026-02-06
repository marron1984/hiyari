'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle, XCircle, RefreshCw, ExternalLink } from 'lucide-react';

function VerifyContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [ticketId, setTicketId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('確認トークンがありません。');
      return;
    }

    const verify = async () => {
      try {
        const res = await fetch('/api/vacancies/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        const data = await res.json();

        if (res.ok && data.success) {
          setStatus('success');
          setMessage(data.message || 'お問い合わせを受け付けました。');
          setTicketId(data.ticketId);

          // Ticket 078: 自動返信データをsessionStorageに保存
          if (data.autoReply) {
            try {
              sessionStorage.setItem('vacancyAutoReply', JSON.stringify(data.autoReply));
            } catch {
              // sessionStorage unavailable
            }
          }

          // 3秒後に thanks ページへ遷移
          setTimeout(() => {
            router.push('/vacancies/thanks');
          }, 3000);
        } else {
          setStatus('error');
          setMessage(data.error || '確認に失敗しました。');
        }
      } catch (error) {
        console.error('Verify error:', error);
        setStatus('error');
        setMessage('通信エラーが発生しました。');
      }
    };

    verify();
  }, [token, router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        {status === 'loading' && (
          <>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-100 flex items-center justify-center">
              <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
            <h1 className="text-xl font-bold text-gray-800 mb-2">
              確認中...
            </h1>
            <p className="text-gray-600">
              お問い合わせを確認しています。しばらくお待ちください。
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-xl font-bold text-gray-800 mb-2">
              確認完了
            </h1>
            <p className="text-gray-600 mb-4">{message}</p>
            <p className="text-sm text-gray-500 mb-4">
              担当者より順次ご連絡いたします。
            </p>
            <p className="text-xs text-gray-400">
              自動的にページを移動します...
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-xl font-bold text-gray-800 mb-2">
              確認できませんでした
            </h1>
            <p className="text-gray-600 mb-4">{message}</p>
            <div className="space-y-3">
              <p className="text-sm text-gray-500">
                リンクが無効または期限切れの可能性があります。
              </p>
              <a
                href="/vacancies/inquiry"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                もう一度問い合わせる
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ローディングフォールバック
function LoadingFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-100 flex items-center justify-center">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">
          読み込み中...
        </h1>
      </div>
    </div>
  );
}

export default function VacancyVerifyPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <VerifyContent />
    </Suspense>
  );
}
