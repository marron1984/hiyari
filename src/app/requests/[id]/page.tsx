'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { getRequest, getApprovalLogs, approveRequest, rejectRequest, returnRequest } from '@/lib/request-engine';
import { isAiVpOwner } from '@/lib/auth';
import type { Request, ApprovalLog, AiVpReviewResult } from '@/types/request-engine';
import {
  REQUEST_TYPE_LABELS,
  APPROVAL_STATUS_LABELS,
  APPROVAL_STATUS_COLORS,
  TAX_TYPE_LABELS,
  URGENCY_LEVEL_LABELS,
  APPROVAL_ACTION_LABELS,
} from '@/types/request-engine';
import {
  ArrowLeft,
  FileText,
  Clock,
  User,
  Building,
  Banknote,
  CheckCircle,
  XCircle,
  RotateCcw,
  Brain,
  AlertTriangle,
  ThumbsUp,
  ThumbsDown,
  HelpCircle,
  ArrowUpRight,
  Loader2,
  RefreshCw,
  History,
  MessageSquare,
} from 'lucide-react';

export default function RequestDetailPage() {
  return (
    <AuthGuard>
      <RequestDetailContent />
    </AuthGuard>
  );
}

function RequestDetailContent() {
  const { user, firebaseUser } = useAuth();
  const params = useParams();
  const router = useRouter();
  const requestId = params.id as string;

  const [request, setRequest] = useState<Request | null>(null);
  const [approvalLogs, setApprovalLogs] = useState<ApprovalLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [aiReviewLoading, setAiReviewLoading] = useState(false);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user || !requestId) return;
    setLoading(true);
    try {
      const [requestData, logsData] = await Promise.all([
        getRequest(requestId),
        getApprovalLogs(requestId),
      ]);
      setRequest(requestData);
      setApprovalLogs(logsData);
    } catch (err) {
      console.error('Failed to fetch request:', err);
      setError('申請データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [user, requestId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleApprove = async () => {
    if (!user || !request) return;
    setActionLoading('approve');
    try {
      await approveRequest(requestId, user.id, user.name, user.role, comment || undefined);
      setComment('');
      await fetchData();
    } catch (err) {
      console.error('Approve failed:', err);
      setError('承認に失敗しました');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!user || !request || !comment.trim()) {
      setError('却下理由を入力してください');
      return;
    }
    setActionLoading('reject');
    try {
      await rejectRequest(requestId, user.id, user.name, user.role, comment);
      setComment('');
      await fetchData();
    } catch (err) {
      console.error('Reject failed:', err);
      setError('却下に失敗しました');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReturn = async () => {
    if (!user || !request || !comment.trim()) {
      setError('差し戻し理由を入力してください');
      return;
    }
    setActionLoading('return');
    try {
      await returnRequest(requestId, user.id, user.name, user.role, comment);
      setComment('');
      await fetchData();
    } catch (err) {
      console.error('Return failed:', err);
      setError('差し戻しに失敗しました');
    } finally {
      setActionLoading(null);
    }
  };

  const handleAiReview = async () => {
    if (!user || !firebaseUser || !request) return;
    setAiReviewLoading(true);
    setError(null);
    try {
      const idToken = await firebaseUser.getIdToken();
      const response = await fetch('/api/ai-vp/review', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ requestId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'AI副社長レビューに失敗しました');
      }

      await fetchData();
    } catch (err) {
      console.error('AI Review failed:', err);
      setError(err instanceof Error ? err.message : 'AI副社長レビューに失敗しました');
    } finally {
      setAiReviewLoading(false);
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

  if (!request) {
    return (
      <>
        <Header />
        <main className="pb-20 md:pb-8">
          <div className="max-w-4xl mx-auto px-4 py-16 text-center">
            <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">申請が見つかりません</h1>
            <p className="text-gray-500 mb-6">指定された申請は存在しないか、アクセス権限がありません。</p>
            <Link href="/requests">
              <Button>申請一覧に戻る</Button>
            </Link>
          </div>
        </main>
      </>
    );
  }

  const canApprove = request.status === 'submitted' ||
                     request.status === 'manager_approved' ||
                     request.status === 'admin_approved' ||
                     request.status === 'ai_vp_reviewed';
  const canRequestAiReview = (request.status === 'admin_approved' || request.status === 'submitted' || request.status === 'manager_approved') &&
                              isAiVpOwner(user?.email);
  const isYoshidaApproval = request.status === 'ai_vp_reviewed' && isAiVpOwner(user?.email);

  return (
    <>
      <Header />
      <main className="pb-20 md:pb-8">
        <div className="max-w-4xl mx-auto px-4 py-6">
          {/* ヘッダー */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/requests')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm text-gray-500">{request.requestNumber}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${APPROVAL_STATUS_COLORS[request.status]}`}>
                    {APPROVAL_STATUS_LABELS[request.status]}
                  </span>
                </div>
                <h1 className="text-2xl font-bold">{request.title}</h1>
              </div>
            </div>
            <Button variant="secondary" onClick={fetchData}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>

          {/* エラー表示 */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-5 h-5" />
              <span>{error}</span>
              <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* メインコンテンツ */}
            <div className="lg:col-span-2 space-y-6">
              {/* 申請内容 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    申請内容
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-gray-500">申請種別</label>
                      <p className="font-medium">{REQUEST_TYPE_LABELS[request.requestType]}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-500">カテゴリ</label>
                      <p className="font-medium">{request.category}</p>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm text-gray-500">説明</label>
                    <p className="whitespace-pre-wrap">{request.description || '-'}</p>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="text-sm text-gray-500">金額</label>
                      <p className="font-medium text-lg">
                        ¥{request.amount.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-500">税区分</label>
                      <p className="font-medium">{TAX_TYPE_LABELS[request.taxType]}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-500">合計金額</label>
                      <p className="font-bold text-lg text-blue-600">
                        ¥{request.totalAmount.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-gray-500">緊急度</label>
                      <p className="font-medium">{URGENCY_LEVEL_LABELS[request.urgency]}</p>
                    </div>
                    {request.isEmergency && (
                      <div className="flex items-center gap-2 text-red-600">
                        <AlertTriangle className="w-4 h-4" />
                        <span className="font-medium">緊急申請</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* AI副社長レビュー結果 */}
              {request.aiVpReview && (
                <AiVpReviewCard review={request.aiVpReview} />
              )}

              {/* 承認履歴 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <History className="w-5 h-5" />
                    承認履歴
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {approvalLogs.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">履歴がありません</p>
                  ) : (
                    <div className="space-y-3">
                      {approvalLogs.map((log) => (
                        <div key={log.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                          <div className={`p-1.5 rounded-full ${
                            log.action === 'approve' || log.action === 'auto_approve' ? 'bg-green-100' :
                            log.action === 'reject' ? 'bg-red-100' :
                            log.action === 'return' ? 'bg-orange-100' :
                            log.action === 'ai_review' ? 'bg-purple-100' :
                            'bg-blue-100'
                          }`}>
                            {log.action === 'approve' || log.action === 'auto_approve' ? (
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            ) : log.action === 'reject' ? (
                              <XCircle className="w-4 h-4 text-red-600" />
                            ) : log.action === 'return' ? (
                              <RotateCcw className="w-4 h-4 text-orange-600" />
                            ) : log.action === 'ai_review' ? (
                              <Brain className="w-4 h-4 text-purple-600" />
                            ) : (
                              <FileText className="w-4 h-4 text-blue-600" />
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{log.actorName}</span>
                              {log.isAiVp && (
                                <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">AI</span>
                              )}
                              <span className="text-gray-500">-</span>
                              <span className="text-sm">{APPROVAL_ACTION_LABELS[log.action]}</span>
                            </div>
                            {log.comment && (
                              <p className="text-sm text-gray-600 mt-1">{log.comment}</p>
                            )}
                            <p className="text-xs text-gray-400 mt-1">
                              {log.createdAt.toLocaleString('ja-JP')}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* サイドバー */}
            <div className="space-y-6">
              {/* 申請者情報 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="w-5 h-5" />
                    申請者
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <label className="text-sm text-gray-500">氏名</label>
                    <p className="font-medium">{request.applicantName}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">部署</label>
                    <p className="font-medium">{request.applicantDepartment}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">申請日時</label>
                    <p className="font-medium">
                      {request.createdAt.toLocaleString('ja-JP')}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* アクションパネル */}
              {(canApprove || canRequestAiReview) && (
                <Card className="border-2 border-blue-200">
                  <CardHeader className="bg-blue-50">
                    <CardTitle className="flex items-center gap-2 text-blue-700">
                      <CheckCircle className="w-5 h-5" />
                      承認アクション
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-4">
                    {/* AI副社長レビューボタン */}
                    {canRequestAiReview && !request.aiVpReview && (
                      <Button
                        onClick={handleAiReview}
                        disabled={aiReviewLoading}
                        className="w-full bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700"
                      >
                        {aiReviewLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : (
                          <Brain className="w-4 h-4 mr-2" />
                        )}
                        AI副社長にレビューを依頼
                      </Button>
                    )}

                    {/* 吉田最終決裁表示 */}
                    {isYoshidaApproval && (
                      <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                        <div className="flex items-center gap-2 text-purple-700 mb-2">
                          <Brain className="w-4 h-4" />
                          <span className="font-medium">最終決裁</span>
                        </div>
                        <p className="text-sm text-gray-600">
                          AI副社長のレビューが完了しています。最終決裁を行ってください。
                        </p>
                      </div>
                    )}

                    {/* コメント入力 */}
                    <div>
                      <label className="text-sm text-gray-500 mb-1 block">コメント（任意）</label>
                      <textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        rows={3}
                        placeholder="承認・却下・差し戻しの理由を入力..."
                      />
                    </div>

                    {/* 承認ボタン */}
                    <Button
                      onClick={handleApprove}
                      disabled={actionLoading !== null}
                      className="w-full bg-green-600 hover:bg-green-700"
                    >
                      {actionLoading === 'approve' ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <CheckCircle className="w-4 h-4 mr-2" />
                      )}
                      承認する
                    </Button>

                    {/* 差し戻しボタン */}
                    <Button
                      onClick={handleReturn}
                      disabled={actionLoading !== null}
                      variant="secondary"
                      className="w-full"
                    >
                      {actionLoading === 'return' ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <RotateCcw className="w-4 h-4 mr-2" />
                      )}
                      差し戻す
                    </Button>

                    {/* 却下ボタン */}
                    <Button
                      onClick={handleReject}
                      disabled={actionLoading !== null}
                      variant="secondary"
                      className="w-full text-red-600 hover:bg-red-50"
                    >
                      {actionLoading === 'reject' ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <XCircle className="w-4 h-4 mr-2" />
                      )}
                      却下する
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* ステータス表示（アクション不可の場合） */}
              {!canApprove && !canRequestAiReview && (
                <Card>
                  <CardContent className="py-4">
                    <div className="text-center">
                      <div className={`inline-flex px-4 py-2 rounded-lg ${APPROVAL_STATUS_COLORS[request.status]}`}>
                        {APPROVAL_STATUS_LABELS[request.status]}
                      </div>
                      {request.status === 'executed' && (
                        <p className="text-sm text-gray-500 mt-2">
                          この申請は実行済みです
                        </p>
                      )}
                      {request.status === 'rejected' && (
                        <p className="text-sm text-red-500 mt-2">
                          この申請は却下されました
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

/**
 * AI副社長レビュー結果カード
 */
function AiVpReviewCard({ review }: { review: AiVpReviewResult }) {
  const recommendationConfig = {
    approve: { icon: ThumbsUp, color: 'text-green-600', bg: 'bg-green-50', label: '承認推奨' },
    reject: { icon: ThumbsDown, color: 'text-red-600', bg: 'bg-red-50', label: '却下推奨' },
    return: { icon: RotateCcw, color: 'text-orange-600', bg: 'bg-orange-50', label: '差し戻し推奨' },
    escalate: { icon: ArrowUpRight, color: 'text-purple-600', bg: 'bg-purple-50', label: 'エスカレーション推奨' },
  };

  const config = recommendationConfig[review.recommendation];
  const Icon = config.icon;

  return (
    <Card className="border-2 border-purple-200">
      <CardHeader className="bg-gradient-to-r from-purple-50 to-indigo-50">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-purple-700">
            <Brain className="w-5 h-5" />
            AI副社長レビュー
          </div>
          <div className={`flex items-center gap-2 px-3 py-1 rounded-lg ${config.bg}`}>
            <Icon className={`w-4 h-4 ${config.color}`} />
            <span className={`font-medium ${config.color}`}>{config.label}</span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {/* 信頼度 */}
        <div>
          <label className="text-sm text-gray-500 mb-1 block">判断信頼度</label>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  review.confidence >= 0.8 ? 'bg-green-500' :
                  review.confidence >= 0.6 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ width: `${review.confidence * 100}%` }}
              />
            </div>
            <span className="font-medium">{Math.round(review.confidence * 100)}%</span>
          </div>
        </div>

        {/* サマリー */}
        <div>
          <label className="text-sm text-gray-500 mb-1 block">要約</label>
          <p className="p-3 bg-gray-50 rounded-lg">{review.formattedSummary}</p>
        </div>

        {/* キーポイント */}
        {review.extractedKeyPoints.length > 0 && (
          <div>
            <label className="text-sm text-gray-500 mb-1 block">キーポイント</label>
            <ul className="space-y-1">
              {review.extractedKeyPoints.map((point, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-purple-500 mt-1">•</span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 判断理由 */}
        <div>
          <label className="text-sm text-gray-500 mb-1 block">判断理由</label>
          <p className="text-sm whitespace-pre-wrap">{review.reasoning}</p>
        </div>

        {/* 注意点 */}
        {review.attentionPoints.length > 0 && (
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center gap-2 text-yellow-700 mb-2">
              <AlertTriangle className="w-4 h-4" />
              <span className="font-medium">注意点</span>
            </div>
            <ul className="space-y-1">
              {review.attentionPoints.map((point, i) => (
                <li key={i} className="text-sm text-yellow-800">• {point}</li>
              ))}
            </ul>
          </div>
        )}

        {/* 承認条件 */}
        {review.suggestedConditions.length > 0 && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2 text-blue-700 mb-2">
              <CheckCircle className="w-4 h-4" />
              <span className="font-medium">承認時の条件提案</span>
            </div>
            <ul className="space-y-1">
              {review.suggestedConditions.map((condition, i) => (
                <li key={i} className="text-sm text-blue-800">• {condition}</li>
              ))}
            </ul>
          </div>
        )}

        {/* 不足情報 */}
        {review.missingFields.length > 0 && (
          <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
            <div className="flex items-center gap-2 text-orange-700 mb-2">
              <HelpCircle className="w-4 h-4" />
              <span className="font-medium">不足情報</span>
            </div>
            <ul className="space-y-1">
              {review.missingFields.map((field, i) => (
                <li key={i} className="text-sm text-orange-800">• {field}</li>
              ))}
            </ul>
          </div>
        )}

        {/* 類似案件 */}
        {review.similarCases && review.similarCases.length > 0 && (
          <div>
            <label className="text-sm text-gray-500 mb-2 block">類似案件</label>
            <div className="space-y-2">
              {review.similarCases.map((c, i) => (
                <div key={i} className="p-2 bg-gray-50 rounded flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{c.title}</p>
                    <p className="text-xs text-gray-500">
                      ¥{c.amount?.toLocaleString()} - {APPROVAL_STATUS_LABELS[c.status]}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400">
                    類似度 {Math.round((c.similarity || 0) * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* メタ情報 */}
        <div className="flex items-center gap-4 text-xs text-gray-400 pt-2 border-t">
          <span>モデル: {review.modelVersion}</span>
          <span>処理時間: {review.processingTimeMs}ms</span>
          <span>
            トークン: {review.tokenUsage.input + review.tokenUsage.output}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
