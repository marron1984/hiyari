'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardHeader, CardTitle, CardContent, Button } from '@/components/ui';
import { Loading } from '@/components/Loading';
import {
  Link2,
  Link2Off,
  Building2,
  CheckCircle,
  XCircle,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';

interface FreeeStatus {
  connected: boolean;
  companyId?: number;
  companyName?: string;
  connectedAt?: string;
  lastSyncAt?: string;
  lastError?: string;
  tokenExpiresAt?: string;
}

export default function FreeeSettingsPage() {
  return (
    <AuthGuard requireAdmin>
      <Suspense fallback={<Loading text="読み込み中..." />}>
        <FreeeSettingsContent />
      </Suspense>
    </AuthGuard>
  );
}

function FreeeSettingsContent() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [status, setStatus] = useState<FreeeStatus | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // URLパラメータからステータスメッセージを取得
  useEffect(() => {
    const urlStatus = searchParams.get('status');
    const urlMessage = searchParams.get('message');

    if (urlStatus === 'connected') {
      setMessage({ type: 'success', text: 'freee連携が完了しました' });
    } else if (urlStatus === 'error' && urlMessage) {
      setMessage({ type: 'error', text: urlMessage });
    }
  }, [searchParams]);

  // ステータス取得
  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/admin/freee/status');
      const data = await response.json();

      if (data.success) {
        setStatus({
          connected: data.connected,
          companyId: data.companyId,
          companyName: data.companyName,
          connectedAt: data.connectedAt,
          lastSyncAt: data.lastSyncAt,
          lastError: data.lastError,
          tokenExpiresAt: data.tokenExpiresAt,
        });
      }
    } catch (error) {
      console.error('ステータス取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  // freee連携開始
  const handleConnect = async () => {
    setConnecting(true);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/freee/auth');
      const data = await response.json();

      if (data.success && data.authUrl) {
        // freee認証ページにリダイレクト
        window.location.href = data.authUrl;
      } else {
        setMessage({ type: 'error', text: data.error || '認証URL取得に失敗しました' });
        setConnecting(false);
      }
    } catch (error) {
      setMessage({ type: 'error', text: '連携処理に失敗しました' });
      setConnecting(false);
    }
  };

  // freee連携解除
  const handleDisconnect = async () => {
    if (!confirm('freee連携を解除しますか？\n支払い依頼の自動連携が停止します。')) {
      return;
    }

    setDisconnecting(true);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/freee/disconnect', {
        method: 'POST',
      });
      const data = await response.json();

      if (data.success) {
        setMessage({ type: 'success', text: 'freee連携を解除しました' });
        await fetchStatus();
      } else {
        setMessage({ type: 'error', text: data.error || '連携解除に失敗しました' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: '連携解除に失敗しました' });
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <>
        <Header />
        <Loading text="読み込み中..." />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="pb-8">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-bold text-gray-900 flex items-center">
              <Building2 className="w-6 h-6 text-blue-600 mr-2" />
              freee連携設定
            </h1>
          </div>

          {message && (
            <div
              className={`mb-6 p-4 rounded-lg ${
                message.type === 'success'
                  ? 'bg-green-50 border border-green-200 text-green-700'
                  : 'bg-red-50 border border-red-200 text-red-700'
              }`}
            >
              {message.text}
            </div>
          )}

          {/* 連携ステータス */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center">
                {status?.connected ? (
                  <>
                    <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
                    連携済み
                  </>
                ) : (
                  <>
                    <XCircle className="w-5 h-5 text-gray-400 mr-2" />
                    未連携
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {status?.connected ? (
                <div className="space-y-4">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500">事業所名</p>
                        <p className="font-medium text-gray-900">{status.companyName || '-'}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">事業所ID</p>
                        <p className="font-medium text-gray-900">{status.companyId || '-'}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">連携日時</p>
                        <p className="font-medium text-gray-900">
                          {status.connectedAt
                            ? new Date(status.connectedAt).toLocaleString('ja-JP')
                            : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">トークン有効期限</p>
                        <p className="font-medium text-gray-900">
                          {status.tokenExpiresAt
                            ? new Date(status.tokenExpiresAt).toLocaleString('ja-JP')
                            : '-'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {status.lastError && (
                    <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
                      <div className="flex items-start">
                        <AlertTriangle className="w-5 h-5 text-red-500 mr-2 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-red-800">最後のエラー</p>
                          <p className="text-sm text-red-700 mt-1">{status.lastError}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      onClick={handleDisconnect}
                      loading={disconnecting}
                      className="text-red-600 border-red-300 hover:bg-red-50"
                    >
                      <Link2Off className="w-4 h-4 mr-2" />
                      連携解除
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Link2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-600 mb-6">
                    freeeと連携すると、支払い依頼承認後に<br />
                    自動でfreeeに支払依頼が作成されます。
                  </p>
                  <Button onClick={handleConnect} loading={connecting} size="lg">
                    <ExternalLink className="w-4 h-4 mr-2" />
                    freeeと連携する
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 機能説明 */}
          <Card>
            <CardHeader>
              <CardTitle>連携機能</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 text-sm text-gray-600">
                <li className="flex items-start">
                  <CheckCircle className="w-4 h-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                  <span>支払い依頼承認後、freeeに支払依頼を自動作成</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="w-4 h-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                  <span>取引先が存在しない場合は自動登録</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="w-4 h-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                  <span>銀行振込の場合は振込依頼も作成</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="w-4 h-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                  <span>失敗時は通知+夜間バッチで自動リトライ</span>
                </li>
              </ul>
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-700">
                  <AlertTriangle className="w-4 h-4 inline mr-1" />
                  現在はダミー実装です。実際のfreee APIとは連携しません。
                </p>
              </div>
            </CardContent>
          </Card>

          {/* 戻るリンク */}
          <div className="mt-6">
            <a
              href="/admin/settings"
              className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              システム設定に戻る
            </a>
          </div>
        </div>
      </main>
    </>
  );
}
