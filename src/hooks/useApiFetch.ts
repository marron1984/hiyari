'use client';

import { useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';

/**
 * 認証付きfetchフック
 *
 * useAuth()からFirebaseユーザーのIDトークンを取得し、
 * Authorization: Bearer ヘッダーを自動付与する。
 *
 * 使い方:
 *   const apiFetch = useApiFetch();
 *   const res = await apiFetch('/api/tickets');
 *   const data = await apiFetch('/api/tickets', { method: 'POST', body: JSON.stringify({...}) });
 */
export function useApiFetch() {
  const { firebaseUser } = useAuth();

  const apiFetch = useCallback(
    async (url: string, init?: RequestInit): Promise<Response> => {
      const headers = new Headers(init?.headers);

      if (firebaseUser) {
        const token = await firebaseUser.getIdToken();
        headers.set('Authorization', `Bearer ${token}`);
      }

      if (!headers.has('Content-Type') && init?.body && typeof init.body === 'string') {
        headers.set('Content-Type', 'application/json');
      }

      return fetch(url, { ...init, headers });
    },
    [firebaseUser]
  );

  return apiFetch;
}
