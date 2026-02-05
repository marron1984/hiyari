'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@/components/ui';
import {
  ArrowLeft,
  User,
  Clock,
  Calendar,
  Tag,
  MapPin,
  MessageSquare,
  History,
  Send,
  AlertTriangle,
  CheckCircle,
  Play,
  Pause,
  RotateCcw,
  XCircle,
  Archive,
  UserPlus,
  ChevronDown,
  ChevronUp,
  FileText,
  X,
  Copy,
  Check,
  ClipboardCheck,
} from 'lucide-react';
import type {
  Ticket,
  TicketComment,
  TicketEvent,
  TicketStatus,
  VacancyInquiryStage,
  ApplicationChannel,
} from '@/lib/tickets/types';
import {
  TICKET_STATUS_CONFIG,
  TICKET_PRIORITY_CONFIG,
  TICKET_CATEGORY_CONFIG,
  TICKET_EVENT_ACTION_LABELS,
  VACANCY_INQUIRY_STAGE_CONFIG,
} from '@/lib/tickets/types';
import type { ReplyTemplate, TemplateVariable } from '@/lib/replyTemplates/types';

// デモユーザー一覧（本番ではAPIから取得）
const DEMO_USERS = [
  { id: 'user_001', name: '山田太郎' },
  { id: 'user_002', name: '佐藤次郎' },
  { id: 'user_003', name: '鈴木花子' },
  { id: 'user_004', name: '高橋三郎' },
  { id: 'user_005', name: '田中美咲' },
];

export default function TicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [events, setEvents] = useState<TicketEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showEvents, setShowEvents] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);

  // Ticket 081: 返信テンプレート
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templates, setTemplates] = useState<ReplyTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<ReplyTemplate | null>(null);
  const [templateVariables, setTemplateVariables] = useState<Record<string, string>>({});
  const [expandedContent, setExpandedContent] = useState<string | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Ticket 084: 申込記録
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyForm, setApplyForm] = useState<{
    desiredMoveInDate: string;
    applicationNote: string;
    applicationChannel: ApplicationChannel | '';
    requiredDocsStatus: {
      id: boolean;
      insurance: boolean;
      guarantor: boolean;
      incomeProof: boolean;
      other: string;
    };
  }>({
    desiredMoveInDate: '',
    applicationNote: '',
    applicationChannel: '',
    requiredDocsStatus: {
      id: false,
      insurance: false,
      guarantor: false,
      incomeProof: false,
      other: '',
    },
  });

  const fetchTicket = useCallback(async () => {
    try {
      const res = await fetch(`/api/tickets/${id}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'チケットの取得に失敗しました');
        return;
      }

      setTicket(data.ticket);
    } catch (err) {
      setError('チケットの取得に失敗しました');
    }
  }, [id]);

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/tickets/${id}/comments`);
      const data = await res.json();
      setComments(data.comments || []);
    } catch (err) {
      console.error('Failed to fetch comments:', err);
    }
  }, [id]);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(`/api/tickets/${id}/events`);
      const data = await res.json();
      setEvents(data.events || []);
    } catch (err) {
      console.error('Failed to fetch events:', err);
    }
  }, [id]);

  // Ticket 081: テンプレート一覧取得
  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/reply-templates?category=vacancy_reply&activeOnly=true');
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch (err) {
      console.error('Failed to fetch templates:', err);
    }
  }, []);

  // Ticket 081: テンプレート選択時の処理
  const handleSelectTemplate = (template: ReplyTemplate) => {
    setSelectedTemplate(template);
    // チケットから自動補完できる変数を初期化
    const vars: Record<string, string> = {};
    if (ticket) {
      // metaからデータを取得
      const meta = ticket.metaJson as Record<string, unknown> | undefined;
      // name: contactNameがあれば使う
      const descMatch = ticket.description.match(/お名前:\s*(.+)/);
      if (descMatch) {
        vars.name = descMatch[1].trim();
      }
      // buildingName: metaから
      if (meta?.vacancyUnitId) {
        const buildingMatch = ticket.description.match(/希望施設:\s*(.+)/);
        if (buildingMatch) {
          vars.buildingName = buildingMatch[1].trim();
        }
      }
      // businessUnitName
      if (ticket.businessUnitId) {
        vars.businessUnitName = ticket.businessUnitId;
      }
    }
    setTemplateVariables(vars);
    setExpandedContent(null);
  };

  // Ticket 081: テンプレート展開
  const handleExpandTemplate = async () => {
    if (!selectedTemplate) return;
    setTemplateLoading(true);
    try {
      const res = await fetch(`/api/reply-templates/${selectedTemplate.id}/expand`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variables: templateVariables }),
      });
      const data = await res.json();
      if (res.ok) {
        setExpandedContent(data.content);
      }
    } catch (err) {
      console.error('Failed to expand template:', err);
    } finally {
      setTemplateLoading(false);
    }
  };

  // Ticket 081: コメントに挿入
  const handleInsertToComment = () => {
    if (expandedContent) {
      setNewComment((prev) => (prev ? prev + '\n\n' : '') + expandedContent);
      setShowTemplateModal(false);
      setSelectedTemplate(null);
      setTemplateVariables({});
      setExpandedContent(null);
    }
  };

  // Ticket 081: クリップボードにコピー
  const handleCopyContent = async () => {
    if (expandedContent) {
      await navigator.clipboard.writeText(expandedContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Ticket 084: 申込記録の送信
  const handleApplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (applyLoading) return;

    setApplyLoading(true);
    try {
      const body: Record<string, unknown> = {};

      if (applyForm.desiredMoveInDate) {
        body.desiredMoveInDate = applyForm.desiredMoveInDate;
      }
      if (applyForm.applicationNote) {
        body.applicationNote = applyForm.applicationNote;
      }
      if (applyForm.applicationChannel) {
        body.applicationChannel = applyForm.applicationChannel;
      }

      // requiredDocsStatus に何か入力があれば追加
      const docs = applyForm.requiredDocsStatus;
      if (docs.id || docs.insurance || docs.guarantor || docs.incomeProof || docs.other) {
        body.requiredDocsStatus = {
          id: docs.id || undefined,
          insurance: docs.insurance || undefined,
          guarantor: docs.guarantor || undefined,
          incomeProof: docs.incomeProof || undefined,
          other: docs.other || undefined,
        };
      }

      const res = await fetch(`/api/vacancy-inquiries/${id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setShowApplyModal(false);
        // フォームをリセット
        setApplyForm({
          desiredMoveInDate: '',
          applicationNote: '',
          applicationChannel: '',
          requiredDocsStatus: {
            id: false,
            insurance: false,
            guarantor: false,
            incomeProof: false,
            other: '',
          },
        });
        // データを再取得
        fetchTicket();
        fetchEvents();
      } else {
        const data = await res.json();
        alert(data.error || '申込記録に失敗しました');
      }
    } catch (err) {
      console.error('Failed to apply:', err);
      alert('申込記録に失敗しました');
    } finally {
      setApplyLoading(false);
    }
  };

  // Ticket 084: 申込可能かどうかを判定
  const canApply = (t: Ticket): boolean => {
    if (t.pipeline !== 'vacancy_inquiry') return false;
    if (t.relatedType !== 'vacancy_inquiry') return false;
    // 既に applied 以降のステージなら不可
    const notApplyableStages: VacancyInquiryStage[] = ['applied', 'accepted', 'rejected', 'closed'];
    if (t.stage && notApplyableStages.includes(t.stage)) return false;
    return true;
  };

  // Ticket 081: モーダルを開く
  const openTemplateModal = () => {
    fetchTemplates();
    setShowTemplateModal(true);
    setSelectedTemplate(null);
    setTemplateVariables({});
    setExpandedContent(null);
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchTicket(), fetchComments(), fetchEvents()]);
      setLoading(false);
    };
    loadData();
  }, [fetchTicket, fetchComments, fetchEvents]);

  const handleStatusChange = async (newStatus: TicketStatus) => {
    try {
      const res = await fetch(`/api/tickets/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        fetchTicket();
        fetchEvents();
      }
    } catch (err) {
      console.error('Failed to change status:', err);
    }
  };

  const handleAssign = async (assigneeUserId: string) => {
    try {
      const res = await fetch(`/api/tickets/${id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigneeUserId }),
      });

      if (res.ok) {
        fetchTicket();
        fetchEvents();
        setShowAssignModal(false);
      }
    } catch (err) {
      console.error('Failed to assign:', err);
    }
  };

  const handleUnassign = async () => {
    try {
      const res = await fetch(`/api/tickets/${id}/unassign`, {
        method: 'POST',
      });

      if (res.ok) {
        fetchTicket();
        fetchEvents();
      }
    } catch (err) {
      console.error('Failed to unassign:', err);
    }
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/tickets/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: newComment }),
      });

      if (res.ok) {
        setNewComment('');
        fetchComments();
        fetchEvents();
      }
    } catch (err) {
      console.error('Failed to add comment:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isOverdue = (t: Ticket) => {
    if (!t.dueAt) return false;
    if (['resolved', 'closed', 'archived'].includes(t.status)) return false;
    return new Date(t.dueAt) < new Date();
  };

  if (loading) {
    return (
      <main className="pb-8">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="text-center py-12 text-zinc-500">読み込み中...</div>
        </div>
      </main>
    );
  }

  if (error || !ticket) {
    return (
      <main className="pb-8">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="text-center py-12">
            <p className="text-red-600 mb-4">{error || 'チケットが見つかりません'}</p>
            <Link
              href="/dashboard/tickets"
              className="text-blue-600 hover:underline"
            >
              チケット一覧に戻る
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="pb-8">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* ヘッダー */}
        <div className="flex items-center gap-4 mb-6">
          <Link
            href="/dashboard/tickets"
            className="p-2 hover:bg-zinc-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge className={`${TICKET_PRIORITY_CONFIG[ticket.priority].bg} ${TICKET_PRIORITY_CONFIG[ticket.priority].color}`}>
                {TICKET_PRIORITY_CONFIG[ticket.priority].emoji} {TICKET_PRIORITY_CONFIG[ticket.priority].label}
              </Badge>
              <Badge className={`${TICKET_STATUS_CONFIG[ticket.status].bg} ${TICKET_STATUS_CONFIG[ticket.status].color}`}>
                {TICKET_STATUS_CONFIG[ticket.status].label}
              </Badge>
              <Badge className="bg-zinc-100 text-zinc-600">
                {TICKET_CATEGORY_CONFIG[ticket.category].icon} {TICKET_CATEGORY_CONFIG[ticket.category].label}
              </Badge>
              {isOverdue(ticket) && (
                <Badge className="bg-red-100 text-red-700 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  期限超過
                </Badge>
              )}
            </div>
            <h1 className="text-xl font-bold text-zinc-900">{ticket.title}</h1>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* メインコンテンツ */}
          <div className="lg:col-span-2 space-y-6">
            {/* 説明 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">説明</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-zinc-700 whitespace-pre-wrap">{ticket.description}</p>
              </CardContent>
            </Card>

            {/* コメント */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  コメント ({comments.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {comments.length === 0 ? (
                  <p className="text-zinc-500 text-sm">コメントはまだありません</p>
                ) : (
                  <div className="space-y-4">
                    {comments.map((comment) => (
                      <div key={comment.id} className="flex gap-3">
                        <div className="w-8 h-8 bg-zinc-200 rounded-full flex items-center justify-center flex-shrink-0">
                          <User className="w-4 h-4 text-zinc-600" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm">{comment.userName}</span>
                            <span className="text-xs text-zinc-400">{formatDate(comment.createdAt)}</span>
                          </div>
                          <p className="text-sm text-zinc-700 whitespace-pre-wrap">{comment.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* コメント投稿フォーム */}
                <form onSubmit={handleSubmitComment} className="mt-4 pt-4 border-t">
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="コメントを入力..."
                    rows={3}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm resize-none"
                  />
                  <div className="flex justify-end mt-2">
                    <button
                      type="submit"
                      disabled={!newComment.trim() || submitting}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                    >
                      <Send className="w-4 h-4" />
                      {submitting ? '送信中...' : 'コメント'}
                    </button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* 履歴 */}
            <Card>
              <CardHeader>
                <button
                  onClick={() => setShowEvents(!showEvents)}
                  className="w-full flex items-center justify-between"
                >
                  <CardTitle className="text-base flex items-center gap-2">
                    <History className="w-4 h-4" />
                    履歴 ({events.length})
                  </CardTitle>
                  {showEvents ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>
              </CardHeader>
              {showEvents && (
                <CardContent>
                  {events.length === 0 ? (
                    <p className="text-zinc-500 text-sm">履歴はありません</p>
                  ) : (
                    <div className="space-y-3">
                      {events.map((event) => (
                        <div key={event.id} className="flex gap-3 text-sm">
                          <div className="w-2 h-2 bg-zinc-300 rounded-full mt-1.5 flex-shrink-0" />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">
                                {event.actorUserName || 'システム'}
                              </span>
                              <span className="text-zinc-600">
                                {TICKET_EVENT_ACTION_LABELS[event.action]}
                              </span>
                            </div>
                            <span className="text-xs text-zinc-400">
                              {formatDate(event.createdAt)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          </div>

          {/* サイドバー */}
          <div className="space-y-4">
            {/* ステータス操作 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">ステータス操作</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {ticket.status === 'open' && (
                  <button
                    onClick={() => handleStatusChange('in_progress')}
                    className="w-full flex items-center gap-2 px-3 py-2 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 transition-colors text-sm"
                  >
                    <Play className="w-4 h-4" />
                    対応開始
                  </button>
                )}
                {ticket.status === 'in_progress' && (
                  <>
                    <button
                      onClick={() => handleStatusChange('waiting')}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors text-sm"
                    >
                      <Pause className="w-4 h-4" />
                      待機中へ
                    </button>
                    <button
                      onClick={() => handleStatusChange('resolved')}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors text-sm"
                    >
                      <CheckCircle className="w-4 h-4" />
                      解決済へ
                    </button>
                  </>
                )}
                {ticket.status === 'waiting' && (
                  <>
                    <button
                      onClick={() => handleStatusChange('in_progress')}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 transition-colors text-sm"
                    >
                      <Play className="w-4 h-4" />
                      対応再開
                    </button>
                    <button
                      onClick={() => handleStatusChange('resolved')}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors text-sm"
                    >
                      <CheckCircle className="w-4 h-4" />
                      解決済へ
                    </button>
                  </>
                )}
                {ticket.status === 'resolved' && (
                  <>
                    <button
                      onClick={() => handleStatusChange('closed')}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-zinc-100 text-zinc-700 rounded-lg hover:bg-zinc-200 transition-colors text-sm"
                    >
                      <XCircle className="w-4 h-4" />
                      クローズ
                    </button>
                    <button
                      onClick={() => handleStatusChange('open')}
                      className="w-full flex items-center gap-2 px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm"
                    >
                      <RotateCcw className="w-4 h-4" />
                      再オープン
                    </button>
                  </>
                )}
                {ticket.status === 'closed' && (
                  <button
                    onClick={() => handleStatusChange('open')}
                    className="w-full flex items-center gap-2 px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm"
                  >
                    <RotateCcw className="w-4 h-4" />
                    再オープン
                  </button>
                )}
              </CardContent>
            </Card>

            {/* 担当者 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">担当者</CardTitle>
              </CardHeader>
              <CardContent>
                {ticket.assigneeUserId ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                        <User className="w-4 h-4 text-blue-600" />
                      </div>
                      <span className="font-medium">{ticket.assigneeUserName}</span>
                    </div>
                    <button
                      onClick={handleUnassign}
                      className="text-xs text-zinc-500 hover:text-zinc-700"
                    >
                      解除
                    </button>
                  </div>
                ) : (
                  <p className="text-zinc-500 text-sm">未割当</p>
                )}
                <button
                  onClick={() => setShowAssignModal(true)}
                  className="w-full mt-3 flex items-center justify-center gap-2 px-3 py-2 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors text-sm"
                >
                  <UserPlus className="w-4 h-4" />
                  担当を割り当て
                </button>
              </CardContent>
            </Card>

            {/* Ticket 081: 返信テンプレート（空室問い合わせの場合のみ） */}
            {ticket.relatedType === 'vacancy_inquiry' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">返信テンプレート</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-zinc-500 text-sm mb-3">
                    定型文を使って返信メモを作成できます
                  </p>
                  <button
                    onClick={openTemplateModal}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors text-sm"
                  >
                    <FileText className="w-4 h-4" />
                    テンプレを挿入
                  </button>
                </CardContent>
              </Card>
            )}

            {/* Ticket 084: 申込記録（空室問い合わせの場合のみ） */}
            {ticket.relatedType === 'vacancy_inquiry' && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ClipboardCheck className="w-4 h-4" />
                    申込管理
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {/* 現在のステージ表示 */}
                  {ticket.stage && (
                    <div className="mb-3">
                      <span className="text-xs text-zinc-500">現在のステージ</span>
                      <div className={`mt-1 inline-flex px-2 py-1 rounded text-sm font-medium ${VACANCY_INQUIRY_STAGE_CONFIG[ticket.stage].bg} ${VACANCY_INQUIRY_STAGE_CONFIG[ticket.stage].color}`}>
                        {VACANCY_INQUIRY_STAGE_CONFIG[ticket.stage].label}
                      </div>
                    </div>
                  )}

                  {/* 申込済みの場合は情報表示 */}
                  {ticket.metaJson?.appliedAt && (
                    <div className="space-y-2 text-sm mb-3">
                      <div className="flex items-center gap-2 text-green-600">
                        <CheckCircle className="w-4 h-4" />
                        <span className="font-medium">申込済み</span>
                      </div>
                      <div className="text-zinc-600">
                        <span className="text-xs text-zinc-400">申込日時:</span>{' '}
                        {new Date(ticket.metaJson.appliedAt as string).toLocaleDateString('ja-JP', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                      {ticket.metaJson.desiredMoveInDate && (
                        <div className="text-zinc-600">
                          <span className="text-xs text-zinc-400">希望入居日:</span>{' '}
                          {ticket.metaJson.desiredMoveInDate as string}
                        </div>
                      )}
                      {ticket.metaJson.applicationChannel && (
                        <div className="text-zinc-600">
                          <span className="text-xs text-zinc-400">申込チャネル:</span>{' '}
                          {ticket.metaJson.applicationChannel === 'in_person' && '来店'}
                          {ticket.metaJson.applicationChannel === 'online' && 'オンライン'}
                          {ticket.metaJson.applicationChannel === 'other' && 'その他'}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 申込ボタン */}
                  {canApply(ticket) ? (
                    <>
                      <p className="text-zinc-500 text-sm mb-3">
                        申込を受け付けたら記録してください
                      </p>
                      <button
                        onClick={() => setShowApplyModal(true)}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors text-sm"
                      >
                        <ClipboardCheck className="w-4 h-4" />
                        申込を記録
                      </button>
                    </>
                  ) : ticket.stage === 'applied' ? (
                    <p className="text-zinc-500 text-sm">
                      成約または不成約のステージへ進めてください
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            )}

            {/* 詳細情報 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">詳細情報</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-zinc-400" />
                  <span className="text-zinc-500">起票者:</span>
                  <span className="font-medium">{ticket.requesterUserName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-zinc-400" />
                  <span className="text-zinc-500">作成日:</span>
                  <span>{formatDate(ticket.createdAt)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-zinc-400" />
                  <span className="text-zinc-500">更新日:</span>
                  <span>{formatDate(ticket.updatedAt)}</span>
                </div>
                {ticket.dueAt && (
                  <div className={`flex items-center gap-2 ${isOverdue(ticket) ? 'text-red-600' : ''}`}>
                    <Calendar className="w-4 h-4 text-zinc-400" />
                    <span className="text-zinc-500">期限:</span>
                    <span className={isOverdue(ticket) ? 'font-medium' : ''}>
                      {formatDate(ticket.dueAt)}
                    </span>
                  </div>
                )}
                {ticket.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-zinc-400" />
                    <span className="text-zinc-500">場所:</span>
                    <span>{ticket.location}</span>
                  </div>
                )}
                {ticket.tagsJson && ticket.tagsJson.length > 0 && (
                  <div className="flex items-start gap-2">
                    <Tag className="w-4 h-4 text-zinc-400 mt-0.5" />
                    <span className="text-zinc-500">タグ:</span>
                    <div className="flex flex-wrap gap-1">
                      {ticket.tagsJson.map((tag, i) => (
                        <Badge key={i} className="bg-zinc-100 text-zinc-600 text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* 担当割り当てモーダル */}
        {showAssignModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl w-full max-w-md mx-4 p-6">
              <h3 className="text-lg font-bold mb-4">担当者を選択</h3>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {DEMO_USERS.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => handleAssign(user.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 rounded-lg transition-colors text-left"
                  >
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <User className="w-4 h-4 text-blue-600" />
                    </div>
                    <span>{user.name}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowAssignModal(false)}
                className="w-full mt-4 px-4 py-2 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        )}

        {/* Ticket 081: 返信テンプレートモーダル */}
        {showTemplateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl w-full max-w-2xl mx-4 p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">返信テンプレートを挿入</h3>
                <button
                  onClick={() => setShowTemplateModal(false)}
                  className="p-1 hover:bg-zinc-100 rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {!selectedTemplate ? (
                /* テンプレート選択 */
                <div className="space-y-2">
                  <p className="text-sm text-zinc-600 mb-3">
                    使用するテンプレートを選択してください
                  </p>
                  {templates.length === 0 ? (
                    <p className="text-zinc-500 text-sm py-4 text-center">
                      利用可能なテンプレートがありません
                    </p>
                  ) : (
                    templates.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => handleSelectTemplate(t)}
                        className="w-full text-left px-4 py-3 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors"
                      >
                        <div className="font-medium text-sm">{t.name}</div>
                        {t.description && (
                          <div className="text-xs text-zinc-500 mt-1">
                            {t.description}
                          </div>
                        )}
                      </button>
                    ))
                  )}
                </div>
              ) : !expandedContent ? (
                /* 変数入力 */
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <button
                      onClick={() => setSelectedTemplate(null)}
                      className="text-sm text-zinc-500 hover:text-zinc-700"
                    >
                      ← テンプレート選択に戻る
                    </button>
                  </div>
                  <div className="bg-zinc-50 px-3 py-2 rounded-lg">
                    <span className="font-medium text-sm">{selectedTemplate.name}</span>
                  </div>

                  <div className="space-y-3">
                    <p className="text-sm text-zinc-600">変数を入力してください</p>
                    {selectedTemplate.variablesJson.map((v: TemplateVariable) => (
                      <div key={v.key}>
                        <label className="block text-sm font-medium text-zinc-700 mb-1">
                          {v.label}
                          {v.required && <span className="text-red-500 ml-1">*</span>}
                        </label>
                        <input
                          type="text"
                          value={templateVariables[v.key] || ''}
                          onChange={(e) =>
                            setTemplateVariables((prev) => ({
                              ...prev,
                              [v.key]: e.target.value,
                            }))
                          }
                          placeholder={v.defaultValue || `${v.label}を入力`}
                          className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm"
                        />
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={handleExpandTemplate}
                    disabled={templateLoading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors text-sm"
                  >
                    {templateLoading ? '生成中...' : 'プレビューを生成'}
                  </button>
                </div>
              ) : (
                /* プレビュー */
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <button
                      onClick={() => setExpandedContent(null)}
                      className="text-sm text-zinc-500 hover:text-zinc-700"
                    >
                      ← 変数入力に戻る
                    </button>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-zinc-700">プレビュー</span>
                      <button
                        onClick={handleCopyContent}
                        className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700"
                      >
                        {copied ? (
                          <>
                            <Check className="w-3 h-3" />
                            コピーしました
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            コピー
                          </>
                        )}
                      </button>
                    </div>
                    <div className="bg-zinc-50 p-4 rounded-lg text-sm whitespace-pre-wrap border border-zinc-200">
                      {expandedContent}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={handleInsertToComment}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm"
                    >
                      <MessageSquare className="w-4 h-4" />
                      コメントに挿入
                    </button>
                    <button
                      onClick={() => setShowTemplateModal(false)}
                      className="px-4 py-2 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors text-sm"
                    >
                      閉じる
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Ticket 084: 申込記録モーダル */}
        {showApplyModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">申込を記録</h3>
                <button
                  onClick={() => setShowApplyModal(false)}
                  className="p-1 hover:bg-zinc-100 rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleApplySubmit} className="space-y-4">
                {/* 希望入居日 */}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    希望入居日
                  </label>
                  <input
                    type="date"
                    value={applyForm.desiredMoveInDate}
                    onChange={(e) =>
                      setApplyForm((prev) => ({
                        ...prev,
                        desiredMoveInDate: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm"
                  />
                </div>

                {/* 申込チャネル */}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    申込方法
                  </label>
                  <select
                    value={applyForm.applicationChannel}
                    onChange={(e) =>
                      setApplyForm((prev) => ({
                        ...prev,
                        applicationChannel: e.target.value as ApplicationChannel | '',
                      }))
                    }
                    className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm"
                  >
                    <option value="">選択してください</option>
                    <option value="in_person">来店</option>
                    <option value="online">オンライン</option>
                    <option value="other">その他</option>
                  </select>
                </div>

                {/* 必要書類チェックリスト */}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">
                    必要書類の受領状況
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={applyForm.requiredDocsStatus.id}
                        onChange={(e) =>
                          setApplyForm((prev) => ({
                            ...prev,
                            requiredDocsStatus: {
                              ...prev.requiredDocsStatus,
                              id: e.target.checked,
                            },
                          }))
                        }
                        className="w-4 h-4 rounded border-zinc-300"
                      />
                      身分証明書
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={applyForm.requiredDocsStatus.insurance}
                        onChange={(e) =>
                          setApplyForm((prev) => ({
                            ...prev,
                            requiredDocsStatus: {
                              ...prev.requiredDocsStatus,
                              insurance: e.target.checked,
                            },
                          }))
                        }
                        className="w-4 h-4 rounded border-zinc-300"
                      />
                      保険証
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={applyForm.requiredDocsStatus.guarantor}
                        onChange={(e) =>
                          setApplyForm((prev) => ({
                            ...prev,
                            requiredDocsStatus: {
                              ...prev.requiredDocsStatus,
                              guarantor: e.target.checked,
                            },
                          }))
                        }
                        className="w-4 h-4 rounded border-zinc-300"
                      />
                      保証人書類
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={applyForm.requiredDocsStatus.incomeProof}
                        onChange={(e) =>
                          setApplyForm((prev) => ({
                            ...prev,
                            requiredDocsStatus: {
                              ...prev.requiredDocsStatus,
                              incomeProof: e.target.checked,
                            },
                          }))
                        }
                        className="w-4 h-4 rounded border-zinc-300"
                      />
                      収入証明
                    </label>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">
                        その他の書類
                      </label>
                      <input
                        type="text"
                        value={applyForm.requiredDocsStatus.other}
                        onChange={(e) =>
                          setApplyForm((prev) => ({
                            ...prev,
                            requiredDocsStatus: {
                              ...prev.requiredDocsStatus,
                              other: e.target.value,
                            },
                          }))
                        }
                        placeholder="その他必要書類があれば入力"
                        className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* 申込メモ */}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    メモ
                  </label>
                  <textarea
                    value={applyForm.applicationNote}
                    onChange={(e) =>
                      setApplyForm((prev) => ({
                        ...prev,
                        applicationNote: e.target.value,
                      }))
                    }
                    placeholder="特記事項があれば入力"
                    rows={3}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-sm resize-none"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={applyLoading}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors text-sm"
                  >
                    <ClipboardCheck className="w-4 h-4" />
                    {applyLoading ? '記録中...' : '申込を記録'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowApplyModal(false)}
                    className="px-4 py-2 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors text-sm"
                  >
                    キャンセル
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
