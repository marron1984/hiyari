'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, Input } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { PreviewBadge } from '@/components/PreviewBadge';
import { isAiVpOwner } from '@/lib/auth';
import {
  AiReplyRiskLevel,
  AiReplyCategory,
  AiReplyStatus,
  AI_REPLY_RISK_COLORS,
  AI_REPLY_CATEGORY_LABELS,
  AI_REPLY_STATUS_LABELS,
  AI_REPLY_STATUS_COLORS,
} from '@/types/ai-vp';
import {
  Bot,
  ArrowLeft,
  CheckCircle,
  XCircle,
  Edit2,
  AlertTriangle,
  Shield,
  MessageSquare,
  Clock,
  FileText,
  User,
} from 'lucide-react';

interface ReplyDetail {
  id: string;
  messageId: string;
  riskLevel: AiReplyRiskLevel;
  category: AiReplyCategory;
  draftText: string;
  finalText?: string;
  status: AiReplyStatus;
  templateId?: string;
  escalationReason?: string;
  createdAt?: string;
  updatedAt?: string;
  sentAt?: string;
}

interface MessageDetail {
  id: string;
  messageId: string;
  roomId: string;
  senderId: string;
  senderName: string;
  senderRole?: string;
  text: string;
  receivedAt?: string;
  createdAt?: string;
}

interface TemplateDetail {
  id: string;
  key: string;
  title: string;
  category: AiReplyCategory;
  riskLevel?: AiReplyRiskLevel;
}

interface ApprovalDetail {
  id: string;
  approverId: string;
  approverName: string;
  decision: 'approve' | 'revise' | 'reject';
  note?: string;
  revisedText?: string;
  decidedAt?: string;
  createdAt?: string;
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('ja-JP');
}

export default function AiReplyDetailPage() {
  const { user, firebaseUser } = useAuth();
  const params = useParams();
  const router = useRouter();
  const replyId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [message, setMessage] = useState<MessageDetail | null>(null);
  const [reply, setReply] = useState<ReplyDetail | null>(null);
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [approvals, setApprovals] = useState<ApprovalDetail[]>([]);
  const [editedText, setEditedText] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [approvalNote, setApprovalNote] = useState('');

  const canAccess = user && isAiVpOwner(user.email);
  const isPreview = process.env.NEXT_PUBLIC_APP_ENV === 'preview';

  const fetchData = useCallback(async () => {
    if (!canAccess || !firebaseUser) {
      setLoading(false);
      return;
    }

    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch(`/api/ai-vp/replies/${replyId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      setReply(data.reply);
      setMessage(data.message);
      setTemplate(data.template);
      setApprovals(data.approvals || []);
      setEditedText(data.reply?.draftText || '');
      setFetchError(null);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : 'データ取得エラー');
    } finally {
      setLoading(false);
    }
  }, [canAccess, firebaseUser, replyId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const callApproveApi = async (decision: 'approve' | 'revise' | 'reject', extra?: { revisedText?: string }) => {
    if (!firebaseUser) return;

    const token = await firebaseUser.getIdToken();
    const res = await fetch(`/api/ai-vp/replies/${replyId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        decision,
        note: approvalNote || undefined,
        ...extra,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${res.status}`);
    }

    return res.json();
  };

  const handleApprove = async () => {
    if (!reply) return;

    setSaving(true);
    try {
      const result = await callApproveApi('approve');

      await fetchData();

      alert(result?.preview
        ? '承認しました（Preview環境のため送信はスキップ）'
        : '承認・送信しました');
    } catch (error) {
      console.error('Failed to approve:', error);
      alert('承認に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleRevise = async () => {
    if (!reply || !isEditing) return;

    setSaving(true);
    try {
      const result = await callApproveApi('revise', { revisedText: editedText });

      setIsEditing(false);
      await fetchData();

      alert(result?.preview
        ? '修正して承認しました（Preview環境のため送信はスキップ）'
        : '修正して送信しました');
    } catch (error) {
      console.error('Failed to revise:', error);
      alert('修正承認に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    if (!reply) return;

    if (!confirm('この返信を却下しますか？')) return;

    setSaving(true);
    try {
      await callApproveApi('reject');
      await fetchData();
      alert('却下しました');
    } catch (error) {
      console.error('Failed to reject:', error);
      alert('却下に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Loading text="返信データを読み込み中..." />;
  }

  if (!canAccess) {
    return (
      <main className="pb-8">
        <div className="max-w-4xl mx-auto px-4 py-12 text-center">
          <Shield className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">アクセス権限がありません</h1>
          <p className="text-gray-500">この機能は吉田のみアクセス可能です。</p>
        </div>
      </main>
    );
  }

  if (fetchError) {
    return (
      <main className="pb-8">
        <div className="max-w-4xl mx-auto px-4 py-12 text-center">
          <AlertTriangle className="w-16 h-16 mx-auto text-red-300 mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">データ取得エラー</h1>
          <p className="text-gray-500 mb-4">{fetchError}</p>
          <Link href="/dashboard/ai/inbox">
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-1" />
              インボックスに戻る
            </Button>
          </Link>
        </div>
      </main>
    );
  }

  if (!message || !reply) {
    return (
      <main className="pb-8">
        <div className="max-w-4xl mx-auto px-4 py-12 text-center">
          <MessageSquare className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">返信が見つかりません</h1>
          <Link href="/dashboard/ai/inbox">
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-1" />
              インボックスに戻る
            </Button>
          </Link>
        </div>
      </main>
    );
  }

  const isPending = reply.status === 'pending_approval' || reply.status === 'draft';
  const isSent = reply.status === 'sent';
  const isRejected = reply.status === 'rejected';

  return (
    <>
      <PreviewBadge />
      <main className="pb-8">
        <div className="max-w-4xl mx-auto px-4 py-6">
          {/* ヘッダー */}
          <div className="flex items-center mb-6">
            <Link href="/dashboard/ai/inbox" className="p-2 -ml-2 rounded-lg hover:bg-gray-100">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <div className="ml-2 flex-1">
              <h1 className="text-xl font-bold text-gray-900 flex items-center">
                <Bot className="w-5 h-5 mr-2 text-indigo-600" />
                返信詳細
              </h1>
            </div>
            <div className="flex gap-2">
              <Badge className={`${AI_REPLY_RISK_COLORS[reply.riskLevel].bg} ${AI_REPLY_RISK_COLORS[reply.riskLevel].text}`}>
                {reply.riskLevel}
              </Badge>
              <Badge className={`${AI_REPLY_STATUS_COLORS[reply.status].bg} ${AI_REPLY_STATUS_COLORS[reply.status].text}`}>
                {AI_REPLY_STATUS_LABELS[reply.status]}
              </Badge>
            </div>
          </div>

          {/* Preview警告 */}
          {isPreview && isPending && (
            <Card className="mb-6 bg-orange-50 border-orange-200">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-orange-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-orange-800">
                      Preview環境です
                    </p>
                    <p className="text-xs text-orange-600 mt-1">
                      承認しても実際のLINE WORKS送信は行われません（dry-run）。
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 元のメッセージ */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base flex items-center">
                <MessageSquare className="w-4 h-4 mr-2 text-gray-600" />
                質問（LINE WORKS）
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                  <User className="w-5 h-5 text-gray-500" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">{message.senderName}</p>
                  <p className="text-xs text-gray-500">
                    {formatDate(message.receivedAt)}
                  </p>
                </div>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-gray-800 whitespace-pre-wrap">{message.text}</p>
              </div>
            </CardContent>
          </Card>

          {/* エスカレーション理由 */}
          {reply.escalationReason && (
            <Card className="mb-6 bg-yellow-50 border-yellow-200">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-yellow-800">
                      承認が必要な理由
                    </p>
                    <p className="text-sm text-yellow-700 mt-1">
                      {reply.escalationReason}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* AI下書き */}
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center">
                  <Bot className="w-4 h-4 mr-2 text-indigo-600" />
                  下書き
                </CardTitle>
                {isPending && !isEditing && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditing(true)}
                  >
                    <Edit2 className="w-4 h-4 mr-1" />
                    編集
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <textarea
                  className="w-full h-64 p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm"
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                />
              ) : (
                <div className="bg-indigo-50 p-4 rounded-lg">
                  <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans">
                    {reply.finalText || reply.draftText}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 参照テンプレート */}
          {template && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-base flex items-center">
                  <FileText className="w-4 h-4 mr-2 text-gray-600" />
                  参照テンプレート
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-sm">
                  <Badge className="bg-gray-100 text-gray-700">{template.title}</Badge>
                  <span className="text-gray-500">
                    カテゴリ: {AI_REPLY_CATEGORY_LABELS[template.category]}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 承認履歴 */}
          {approvals.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-base flex items-center">
                  <Clock className="w-4 h-4 mr-2 text-gray-600" />
                  承認履歴
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {approvals.map((approval) => (
                    <div
                      key={approval.id}
                      className={`p-3 rounded-lg border ${
                        approval.decision === 'approve' ? 'bg-green-50 border-green-200' :
                        approval.decision === 'revise' ? 'bg-blue-50 border-blue-200' :
                        'bg-red-50 border-red-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {approval.decision === 'approve' && <CheckCircle className="w-4 h-4 text-green-600" />}
                        {approval.decision === 'revise' && <Edit2 className="w-4 h-4 text-blue-600" />}
                        {approval.decision === 'reject' && <XCircle className="w-4 h-4 text-red-600" />}
                        <span className="font-medium text-sm">{approval.approverName}</span>
                        <span className="text-xs text-gray-500">
                          {formatDate(approval.decidedAt)}
                        </span>
                      </div>
                      {approval.note && (
                        <p className="text-sm text-gray-600 ml-6">{approval.note}</p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 承認アクション */}
          {isPending && (
            <Card className="border-indigo-200">
              <CardHeader>
                <CardTitle className="text-base">承認アクション</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    コメント（任意）
                  </label>
                  <Input
                    placeholder="承認時のコメントを入力..."
                    value={approvalNote}
                    onChange={(e) => setApprovalNote(e.target.value)}
                  />
                </div>
                <div className="flex gap-3">
                  {isEditing ? (
                    <>
                      <Button
                        onClick={handleRevise}
                        disabled={saving}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        <Edit2 className="w-4 h-4 mr-1" />
                        {saving ? '処理中...' : '修正して承認'}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setIsEditing(false);
                          setEditedText(reply.draftText);
                        }}
                      >
                        キャンセル
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        onClick={handleApprove}
                        disabled={saving}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <CheckCircle className="w-4 h-4 mr-1" />
                        {saving ? '処理中...' : '承認して送信'}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleReject}
                        disabled={saving}
                        className="text-red-600 border-red-200 hover:bg-red-50"
                      >
                        <XCircle className="w-4 h-4 mr-1" />
                        却下
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 送信済み表示 */}
          {isSent && (
            <Card className="bg-green-50 border-green-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                  <div>
                    <p className="font-medium text-green-800">送信済み</p>
                    <p className="text-sm text-green-600">
                      {formatDate(reply.sentAt)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 却下表示 */}
          {isRejected && (
            <Card className="bg-red-50 border-red-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <XCircle className="w-6 h-6 text-red-600" />
                  <div>
                    <p className="font-medium text-red-800">却下済み</p>
                    <p className="text-sm text-red-600">
                      この返信は送信されませんでした
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </>
  );
}
