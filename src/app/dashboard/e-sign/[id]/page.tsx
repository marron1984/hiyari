'use client';

import { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, Badge, Button } from '@/components/ui';
import {
  FileSignature,
  ArrowLeft,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  FileText,
  User,
  Calendar,
  History,
  Edit,
  MoreVertical,
} from 'lucide-react';
import type { ESignRecord, ESignEvent } from '@/lib/esign/types';
import {
  SIGN_STATUS_CONFIG,
  SUBJECT_TYPE_CONFIG,
  SIGN_METHOD_CONFIG,
  SIGN_EVENT_ACTION_CONFIG,
} from '@/lib/esign/types';

export default function ESignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [record, setRecord] = useState<ESignRecord | null>(null);
  const [events, setEvents] = useState<ESignEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showActions, setShowActions] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/e-sign/${id}`);
      const data = await res.json();
      if (data.success) {
        setRecord(data.record);
        setEvents(data.events);
      } else {
        console.error('[E-Sign Detail] Error:', data.error);
      }
    } catch (error) {
      console.error('[E-Sign Detail] Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAction = async (action: string, note?: string) => {
    if (!confirm(`この操作を実行しますか？`)) return;

    setActionLoading(true);
    try {
      const res = await fetch(`/api/e-sign/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note }),
      });
      const data = await res.json();
      if (data.success) {
        setRecord(data.record);
        fetchData(); // イベントも更新
      } else {
        alert(`エラー: ${data.error}`);
      }
    } catch (error) {
      console.error('[E-Sign Detail] Action error:', error);
      alert('操作に失敗しました');
    } finally {
      setActionLoading(false);
      setShowActions(false);
    }
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusIcon = (status: ESignRecord['status']) => {
    switch (status) {
      case 'signed':
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case 'requested':
        return <Clock className="w-5 h-5 text-amber-600" />;
      case 'declined':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'expired':
        return <AlertTriangle className="w-5 h-5 text-rose-600" />;
      case 'voided':
        return <XCircle className="w-5 h-5 text-zinc-500" />;
      default:
        return null;
    }
  };

  const isOverdue = () => {
    if (!record) return false;
    if (record.status !== 'requested') return false;
    if (!record.expiresAt) return false;
    return new Date(record.expiresAt) < new Date();
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-8 h-8 animate-spin text-zinc-400" />
        </div>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="text-center py-20 text-zinc-500">
          署名ログが見つかりません
        </div>
      </div>
    );
  }

  const statusConfig = SIGN_STATUS_CONFIG[record.status];
  const subjectConfig = SUBJECT_TYPE_CONFIG[record.subjectType];
  const methodConfig = SIGN_METHOD_CONFIG[record.method];
  const overdue = isOverdue();

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/e-sign"
            className="p-2 hover:bg-zinc-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-zinc-600" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <FileSignature className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-900">署名ログ詳細</h1>
              <p className="text-sm text-zinc-500 font-mono">{record.id}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 relative">
          <Button variant="secondary" size="sm" onClick={fetchData} className="gap-1.5">
            <RefreshCw className="w-4 h-4" />
            更新
          </Button>
          {record.status === 'requested' && (
            <div className="relative">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowActions(!showActions)}
                disabled={actionLoading}
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
              {showActions && (
                <div className="absolute right-0 mt-1 w-48 bg-white border border-zinc-200 rounded-lg shadow-lg z-10">
                  <div className="py-1">
                    <button
                      onClick={() => handleAction('sign')}
                      className="w-full text-left px-4 py-2 text-sm text-green-700 hover:bg-green-50"
                    >
                      署名済みにする
                    </button>
                    <button
                      onClick={() => handleAction('decline')}
                      className="w-full text-left px-4 py-2 text-sm text-red-700 hover:bg-red-50"
                    >
                      辞退にする
                    </button>
                    <button
                      onClick={() => handleAction('void')}
                      className="w-full text-left px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                    >
                      無効にする
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 期限超過警告 */}
      {overdue && (
        <Card className="bg-rose-50 border-rose-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-600" />
              <p className="text-sm font-medium text-rose-800">
                署名期限を超過しています（{formatDate(record.expiresAt)}）
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* メイン情報 */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* 署名者情報 */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <User className="w-4 h-4 text-zinc-500" />
              <h2 className="text-sm font-semibold text-zinc-700">署名者情報</h2>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-xs text-zinc-500">署名者名</div>
                <div className="text-base font-medium text-zinc-900">{record.subjectName}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">対象タイプ</div>
                <Badge className={`${subjectConfig.bgColor} ${subjectConfig.color} text-xs mt-1`}>
                  {subjectConfig.label}
                </Badge>
              </div>
              {record.subjectId && (
                <div>
                  <div className="text-xs text-zinc-500">対象ID</div>
                  <div className="text-sm font-mono text-zinc-600">{record.subjectId}</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ステータス情報 */}
        <Card className={`${statusConfig.bgColor} ${statusConfig.borderColor}`}>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-4">
              {getStatusIcon(record.status)}
              <h2 className="text-sm font-semibold text-zinc-700">ステータス</h2>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-xs text-zinc-500">現在のステータス</div>
                <div className={`text-lg font-bold ${statusConfig.color}`}>
                  {overdue ? '期限超過' : statusConfig.label}
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">署名方法</div>
                <div className="text-sm text-zinc-700">{methodConfig.label}</div>
                <div className="text-xs text-zinc-500">{methodConfig.description}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 日時情報 */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-4 h-4 text-zinc-500" />
            <h2 className="text-sm font-semibold text-zinc-700">日時情報</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-zinc-500">作成日時</div>
              <div className="text-sm text-zinc-700">{formatDateTime(record.createdAt)}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">依頼日時</div>
              <div className="text-sm text-zinc-700">{formatDateTime(record.requestedAt)}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">署名日時</div>
              <div className={`text-sm ${record.signedAt ? 'text-green-700 font-medium' : 'text-zinc-400'}`}>
                {formatDateTime(record.signedAt)}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">署名期限</div>
              <div className={`text-sm ${overdue ? 'text-rose-700 font-medium' : 'text-zinc-700'}`}>
                {formatDate(record.expiresAt)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 関連文書 */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-4 h-4 text-zinc-500" />
            <h2 className="text-sm font-semibold text-zinc-700">関連文書</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-zinc-500">文書ID</div>
              {record.documentId ? (
                <Link
                  href={`/dashboard/documents/${record.documentId}`}
                  className="text-sm text-indigo-600 hover:text-indigo-700"
                >
                  {record.documentId}
                </Link>
              ) : (
                <span className="text-sm text-zinc-400">-</span>
              )}
            </div>
            <div>
              <div className="text-xs text-zinc-500">同意ID</div>
              {record.agreementConsentId ? (
                <Link
                  href={`/dashboard/agreements`}
                  className="text-sm text-indigo-600 hover:text-indigo-700"
                >
                  {record.agreementConsentId}
                </Link>
              ) : (
                <span className="text-sm text-zinc-400">-</span>
              )}
            </div>
            <div>
              <div className="text-xs text-zinc-500">契約ID</div>
              {record.contractId ? (
                <Link
                  href={`/dashboard/contracts/${record.contractId}`}
                  className="text-sm text-indigo-600 hover:text-indigo-700"
                >
                  {record.contractId}
                </Link>
              ) : (
                <span className="text-sm text-zinc-400">-</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 備考 */}
      {record.note && (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Edit className="w-4 h-4 text-zinc-500" />
              <h2 className="text-sm font-semibold text-zinc-700">備考</h2>
            </div>
            <p className="text-sm text-zinc-700 whitespace-pre-wrap">{record.note}</p>
          </CardContent>
        </Card>
      )}

      {/* 監査ログ */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <History className="w-4 h-4 text-zinc-500" />
            <h2 className="text-sm font-semibold text-zinc-700">監査ログ</h2>
          </div>
          {events.length === 0 ? (
            <p className="text-sm text-zinc-400">イベントがありません</p>
          ) : (
            <div className="space-y-3">
              {events.map((event) => {
                const actionConfig = SIGN_EVENT_ACTION_CONFIG[event.action];
                return (
                  <div
                    key={event.id}
                    className="flex items-start gap-3 p-3 bg-zinc-50 rounded-lg"
                  >
                    <div className={`w-2 h-2 mt-1.5 rounded-full ${actionConfig.color.replace('text-', 'bg-')}`} />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium ${actionConfig.color}`}>
                          {actionConfig.label}
                        </span>
                        <span className="text-xs text-zinc-500">
                          {formatDateTime(event.createdAt)}
                        </span>
                      </div>
                      {event.note && (
                        <p className="text-xs text-zinc-600 mt-1">{event.note}</p>
                      )}
                      {event.actorUserId && (
                        <p className="text-xs text-zinc-400 mt-1">
                          実行者: {event.actorUserId}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
