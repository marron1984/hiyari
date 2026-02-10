'use client';

import { useState, useCallback, useEffect } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';

// VAPID公開鍵（環境変数から取得）
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    view[i] = rawData.charCodeAt(i);
  }
  return buffer;
}

type PushState = 'unsupported' | 'denied' | 'prompt' | 'subscribed' | 'unsubscribed';

export function PushNotificationManager() {
  const [state, setState] = useState<PushState>('unsupported');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported');
      return;
    }

    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }

    // 既存のサブスクリプションを確認
    navigator.serviceWorker.ready.then((registration) => {
      registration.pushManager.getSubscription().then((sub) => {
        setState(sub ? 'subscribed' : 'unsubscribed');
      });
    });
  }, []);

  const subscribe = useCallback(async () => {
    if (!VAPID_PUBLIC_KEY) {
      console.warn('VAPID public key not configured');
      return;
    }

    setLoading(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState('denied');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      // サーバーにサブスクリプション登録
      const token = await getAuthToken();
      await fetch('/api/notifications/push-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });

      setState('subscribed');
    } catch (error) {
      console.error('Push subscription failed:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();

        // サーバーからも削除
        const token = await getAuthToken();
        await fetch('/api/notifications/push-subscription', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
      }
      setState('unsubscribed');
    } catch (error) {
      console.error('Push unsubscribe failed:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  if (state === 'unsupported') return null;

  return (
    <div className="flex items-center justify-between p-4 bg-white rounded-lg border">
      <div className="flex items-center gap-3">
        {state === 'subscribed' ? (
          <Bell className="w-5 h-5 text-green-600" />
        ) : (
          <BellOff className="w-5 h-5 text-zinc-400" />
        )}
        <div>
          <p className="text-sm font-medium text-zinc-900">プッシュ通知</p>
          <p className="text-xs text-zinc-500">
            {state === 'subscribed' && '通知が有効です'}
            {state === 'unsubscribed' && '通知を有効にすると重要な情報を受け取れます'}
            {state === 'denied' && 'ブラウザの設定から通知を許可してください'}
            {state === 'prompt' && '通知を有効にしますか？'}
          </p>
        </div>
      </div>

      {state === 'denied' ? (
        <span className="text-xs text-zinc-400 px-3 py-1.5 bg-zinc-100 rounded">ブロック中</span>
      ) : (
        <button
          onClick={state === 'subscribed' ? unsubscribe : subscribe}
          disabled={loading}
          className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
            state === 'subscribed'
              ? 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
              : 'bg-zinc-900 text-white hover:bg-zinc-800'
          } disabled:opacity-50`}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : state === 'subscribed' ? (
            '無効にする'
          ) : (
            '有効にする'
          )}
        </button>
      )}
    </div>
  );
}

// Firebase Auth トークン取得ヘルパー
async function getAuthToken(): Promise<string | null> {
  try {
    const { getAuth } = await import('firebase/auth');
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) return null;
    return user.getIdToken();
  } catch {
    return null;
  }
}
