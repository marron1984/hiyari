'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button, Input } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { PreviewBadge } from '@/components/PreviewBadge';
import { isAiVpOwner } from '@/lib/auth';
import {
  LwMessage,
  AiReply,
  AiTemplate,
  AiApproval,
  AI_REPLY_RISK_COLORS,
  AI_REPLY_CATEGORY_LABELS,
  AI_REPLY_STATUS_LABELS,
  AI_REPLY_STATUS_COLORS,
} from '@/types/ai-vp';
import {
  Bot,
  ArrowLeft,
  Send,
  CheckCircle,
  XCircle,
  Edit2,
  AlertTriangle,
  Shield,
  MessageSquare,
  Clock,
  FileText,
  User,
  Info,
} from 'lucide-react';

export default function AiReplyDetailPage() {
  const { user } = useAuth();
  const params = useParams();
  const router = useRouter();
  const replyId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<LwMessage | null>(null);
  const [reply, setReply] = useState<AiReply | null>(null);
  const [template, setTemplate] = useState<AiTemplate | null>(null);
  const [approvals, setApprovals] = useState<AiApproval[]>([]);
  const [editedText, setEditedText] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [approvalNote, setApprovalNote] = useState('');

  const canAccess = user && isAiVpOwner(user.email);
  const isPreview = process.env.NEXT_PUBLIC_APP_ENV === 'preview';

  useEffect(() => {
    const fetchData = async () => {
      if (!canAccess) {
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/ai-vp/replies/${replyId}`, {
          headers: { 'X-User-Email': user?.email || '' },
        });

        if (!res.ok) {
          console.error('Failed to fetch reply:', res.status);
          setLoading(false);
          return;
        }

        const data = await res.json();

        if (data.message) {
          setMessage({
            ...data.message,
            receivedAt: new Date(data.message.receivedAt),
            createdAt: new Date(data.message.createdAt),
          });
        }

        if (data.reply) {
          const replyData: AiReply = {
            ...data.reply,
            createdAt: new Date(data.reply.createdAt),
            sentAt: data.reply.sentAt ? new Date(data.reply.sentAt) : undefined,
          };
          setReply(replyData);
          setEditedText(replyData.draftText);
        }

        if (data.template) {
          setTemplate({ ...data.template, createdAt: new Date() });
        }

        if (data.approvals) {
          setApprovals(data.approvals.map((a: Record<string, unknown>) => ({
            ...a,
            decidedAt: new Date(a.decidedAt as string),
            createdAt: new Date(a.createdAt as string),
          })));
        }
      } catch (error) {
        console.error('Failed to fetch reply data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [canAccess, replyId, user?.email]);

  const callApproveApi = async (decision: 'approve' | 'revise' | 'reject', revisedText?: string) => {
    const res = await fetch(`/api/ai-vp/replies/${reply!.id}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Email': user?.email || '',
      },
      body: JSON.stringify({
        decision,
        note: approvalNote || undefined,
        revisedText,
        approverId: user!.id,
        approverName: user!.name || 'Unknown',
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `API error: ${res.status}`);
    }

    return res.json();
  };

  const handleApprove = async () => {
    if (!reply) return;

    setSaving(true);
    try {
      const result = await callApproveApi('approve');

      const approval: AiApproval = {
        id: result.approvalId,
        replyId: reply.id,
        approverId: user!.id,
        approverName: user!.name || 'Unknown',
        decision: 'approve',
        note: approvalNote || undefined,
        decidedAt: new Date(),
        createdAt: new Date(),
      };

      setApprovals([...approvals, approval]);
      setReply({
        ...reply,
        status: result.status,
        finalText: isEditing ? editedText : reply.draftText,
        sentAt: result.sent ? new Date() : undefined,
      });

      alert(result.preview
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
      const result = await callApproveApi('revise', editedText);

      const approval: AiApproval = {
        id: result.approvalId,
        replyId: reply.id,
        approverId: user!.id,
        approverName: user!.name || 'Unknown',
        decision: 'revise',
        note: approvalNote || undefined,
        revisedText: editedText,
        decidedAt: new Date(),
        createdAt: new Date(),
      };

      setApprovals([...approvals, approval]);
      setReply({
        ...reply,
        status: result.status,
        finalText: editedText,
        sentAt: result.sent ? new Date() : undefined,
      });
      setIsEditing(false);

      alert(result.preview
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
      const result = await callApproveApi('reject');

      const approval: AiApproval = {
        id: result.approvalId,
        replyId: reply.id,
        approverId: user!.id,
        approverName: user!.name || 'Unknown',
        decision: 'reject',
        note: approvalNote || '却下',
        decidedAt: new Date(),
        createdAt: new Date(),
      };

      setApprovals([...approvals, approval]);
      setReply({ ...reply, status: 'rejected' });

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
                AI返信詳細
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
                    {message.receivedAt.toLocaleString('ja-JP')}
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
                  AI下書き
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
                          {approval.decidedAt.toLocaleString('ja-JP')}
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
                      {reply.sentAt?.toLocaleString('ja-JP')}
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
