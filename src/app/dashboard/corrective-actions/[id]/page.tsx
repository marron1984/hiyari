'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, Badge } from '@/components/ui';
import {
  ShieldAlert,
  ArrowLeft,
  User,
  Clock,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Ban,
  PlayCircle,
  History,
} from 'lucide-react';
import type {
  CorrectiveAction,
  BlockedReasonCode,
  CorrectiveActionEvent,
} from '@/lib/correctiveActions/types';
import {
  CA_STATUS_CONFIG,
  CA_SEVERITY_CONFIG,
  SOURCE_TYPE_CONFIG,
  BLOCKED_REASON_CONFIG,
  BLOCKED_REASON_CODES,
} from '@/lib/correctiveActions/types';

// ========== ブロックモーダル ==========

function BlockModal({
  isOpen,
  onClose,
  onSubmit,
  loading,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    blockedReasonCode: BlockedReasonCode;
    blockedReasonNote?: string;
    nextReviewAt?: string;
  }) => void;
  loading: boolean;
}) {
  const [reasonCode, setReasonCode] = useState<BlockedReasonCode>('waiting_customer');
  const [note, setNote] = useState('');
  const [nextReviewAt, setNextReviewAt] = useState('');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
        <h3 className="text-lg font-bold text-zinc-900 mb-4">
          ブロック理由を入力
        </h3>

        {/* 理由コード（必須） */}
        <label className="block text-sm font-medium text-zinc-700 mb-1">
          理由 <span className="text-red-500">*</span>
        </label>
        <select
          value={reasonCode}
          onChange={(e) => setReasonCode(e.target.value as BlockedReasonCode)}
          className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm mb-4"
        >
          {BLOCKED_REASON_CODES.map((code) => (
            <option key={code} value={code}>
              {BLOCKED_REASON_CONFIG[code].icon} {BLOCKED_REASON_CONFIG[code].label}
            </option>
          ))}
        </select>

        {/* メモ（任意） */}
        <label className="block text-sm font-medium text-zinc-700 mb-1">
          メモ（任意）
        </label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="補足説明があれば..."
          className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm mb-4"
        />

        {/* 次回確認日（任意） */}
        <label className="block text-sm font-medium text-zinc-700 mb-1">
          次回確認日（任意）
        </label>
        <input
          type="date"
          value={nextReviewAt}
          onChange={(e) => setNextReviewAt(e.target.value)}
          className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm mb-6"
        />

        {/* ボタン */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-600 bg-zinc-100 rounded-lg hover:bg-zinc-200"
            disabled={loading}
          >
            キャンセル
          </button>
          <button
            onClick={() =>
              onSubmit({
                blockedReasonCode: reasonCode,
                blockedReasonNote: note || undefined,
                nextReviewAt: nextReviewAt
                  ? new Date(nextReviewAt).toISOString()
                  : undefined,
              })
            }
            className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
            disabled={loading}
          >
            {loading ? '処理中...' : 'ブロックする'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ========== メインページ ==========

export default function CorrectiveActionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [item, setItem] = useState<CorrectiveAction | null>(null);
  const [events, setEvents] = useState<CorrectiveActionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchItem = useCallback(async () => {
    try {
      const res = await fetch(`/api/corrective-actions/${id}`);
      if (!res.ok) {
        router.push('/dashboard/corrective-actions');
        return;
      }
      const data = await res.json();
      setItem(data.item);
    } catch {
      console.error('Failed to fetch corrective action');
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(`/api/corrective-actions/${id}/events`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } catch {
      console.error('Failed to fetch events');
    }
  }, [id]);

  useEffect(() => {
    fetchItem();
    fetchEvents();
  }, [fetchItem, fetchEvents]);

  // ブロック実行
  const handleBlock = async (data: {
    blockedReasonCode: BlockedReasonCode;
    blockedReasonNote?: string;
    nextReviewAt?: string;
  }) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/corrective-actions/${id}/block`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setBlockModalOpen(false);
        fetchItem();
        fetchEvents();
      }
    } finally {
      setActionLoading(false);
    }
  };

  // ブロック解除
  const handleUnblock = async (status: 'open' | 'in_progress') => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/corrective-actions/${id}/unblock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        fetchItem();
        fetchEvents();
      }
    } finally {
      setActionLoading(false);
    }
  };

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isOverdue = (ca: CorrectiveAction) => {
    if (!ca.dueAt) return false;
    if (['completed', 'closed', 'cancelled'].includes(ca.status)) return false;
    return new Date(ca.dueAt) < new Date();
  };

  if (loading) {
    return (
      <main className="pb-8">
        <div className="max-w-4xl mx-auto px-4 py-6 text-center text-zinc-500">
          読み込み中...
        </div>
      </main>
    );
  }

  if (!item) return null;

  const meta = item.meta as Record<string, unknown> | null;
  const blockedReasonCode = meta?.blockedReasonCode as BlockedReasonCode | undefined;
  const blockedReasonNote = meta?.blockedReasonNote as string | undefined;
  const nextReviewAt = meta?.nextReviewAt as string | undefined;

  return (
    <main className="pb-8">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* ヘッダー */}
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/dashboard/corrective-actions"
            className="p-2 hover:bg-zinc-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5 text-zinc-600" />
          </Link>
          <div className="p-2 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg">
            <ShieldAlert className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-zinc-900">{item.title}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge
                className={`text-xs ${CA_STATUS_CONFIG[item.status].bg} ${CA_STATUS_CONFIG[item.status].color}`}
              >
                {CA_STATUS_CONFIG[item.status].label}
              </Badge>
              <Badge
                className={`text-xs ${CA_SEVERITY_CONFIG[item.severity].bg} ${CA_SEVERITY_CONFIG[item.severity].color}`}
              >
                {CA_SEVERITY_CONFIG[item.severity].emoji}{' '}
                {CA_SEVERITY_CONFIG[item.severity].label}
              </Badge>
              {isOverdue(item) && (
                <Badge className="bg-red-100 text-red-700 text-xs flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  期限超過
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* ブロック中カード */}
        {item.status === 'blocked' && blockedReasonCode && (
          <Card className="mb-6 border-red-300 bg-red-50">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Ban className="w-5 h-5 text-red-600 mt-0.5" />
                <div className="flex-1">
                  <div className="font-medium text-red-800 mb-1">ブロック中</div>
                  <div className="text-sm text-red-700">
                    <span className="font-medium">
                      {BLOCKED_REASON_CONFIG[blockedReasonCode]?.icon}{' '}
                      {BLOCKED_REASON_CONFIG[blockedReasonCode]?.label}
                    </span>
                    {blockedReasonNote && (
                      <span className="ml-2 text-red-600">- {blockedReasonNote}</span>
                    )}
                  </div>
                  {nextReviewAt && (
                    <div className="text-xs text-red-600 mt-1">
                      次回確認: {formatDate(nextReviewAt)}
                    </div>
                  )}
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => handleUnblock('in_progress')}
                      disabled={actionLoading}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      <PlayCircle className="w-3 h-3" />
                      対応再開
                    </button>
                    <button
                      onClick={() => handleUnblock('open')}
                      disabled={actionLoading}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs text-zinc-700 bg-zinc-100 rounded-lg hover:bg-zinc-200 disabled:opacity-50"
                    >
                      オープンに戻す
                    </button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* アクションバー */}
        {item.status !== 'blocked' &&
          ['open', 'in_progress', 'pending_review'].includes(item.status) && (
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setBlockModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100"
              >
                <Ban className="w-4 h-4" />
                ブロックする
              </button>
            </div>
          )}

        {/* 詳細情報 */}
        <div className="grid gap-6 md:grid-cols-2 mb-6">
          <Card>
            <CardContent className="p-4 space-y-3">
              <h3 className="font-medium text-zinc-800">基本情報</h3>
              <div className="text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-zinc-500">発生源</span>
                  <span>
                    {SOURCE_TYPE_CONFIG[item.sourceType].icon}{' '}
                    {SOURCE_TYPE_CONFIG[item.sourceType].label}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">担当者</span>
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3" />
                    {item.ownerUserName || '未割当'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">期限</span>
                  <span
                    className={`flex items-center gap-1 ${isOverdue(item) ? 'text-red-600 font-medium' : ''}`}
                  >
                    <Calendar className="w-3 h-3" />
                    {formatDate(item.dueAt)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">作成者</span>
                  <span>{item.createdByUserName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">作成日</span>
                  <span>{formatDate(item.createdAt)}</span>
                </div>
                {item.verifiedAt && (
                  <div className="flex justify-between">
                    <span className="text-zinc-500">検証</span>
                    <span className="flex items-center gap-1 text-green-600">
                      <CheckCircle className="w-3 h-3" />
                      {formatDate(item.verifiedAt)}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-3">
              <h3 className="font-medium text-zinc-800">詳細</h3>
              <div className="text-sm space-y-2">
                <div>
                  <span className="text-zinc-500 block mb-1">説明</span>
                  <p className="text-zinc-700 whitespace-pre-wrap">
                    {item.description}
                  </p>
                </div>
                {item.rootCause && (
                  <div>
                    <span className="text-zinc-500 block mb-1">根本原因</span>
                    <p className="text-zinc-700">{item.rootCause}</p>
                  </div>
                )}
                {item.actionPlan && (
                  <div>
                    <span className="text-zinc-500 block mb-1">対応計画</span>
                    <p className="text-zinc-700 whitespace-pre-wrap">
                      {item.actionPlan}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* イベントログ */}
        {events.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <h3 className="font-medium text-zinc-800 flex items-center gap-2 mb-3">
                <History className="w-4 h-4" />
                イベントログ
              </h3>
              <div className="space-y-2">
                {events.map((ev) => (
                  <div
                    key={ev.id}
                    className="flex items-start gap-3 text-sm border-l-2 border-zinc-200 pl-3 py-1"
                  >
                    <div className="flex-1">
                      <span className="font-medium text-zinc-700">
                        {ev.action}
                      </span>
                      {ev.note && (
                        <span className="text-zinc-500 ml-2">{ev.note}</span>
                      )}
                    </div>
                    <span className="text-xs text-zinc-400 whitespace-nowrap">
                      <Clock className="w-3 h-3 inline mr-1" />
                      {formatDate(ev.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ブロックモーダル */}
      <BlockModal
        isOpen={blockModalOpen}
        onClose={() => setBlockModalOpen(false)}
        onSubmit={handleBlock}
        loading={actionLoading}
      />
    </main>
  );
}
