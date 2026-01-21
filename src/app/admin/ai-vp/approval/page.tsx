'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { isAiVpOwner } from '@/lib/auth';
import { getRequests, approveRequest, rejectRequest } from '@/lib/request-engine';
import type { Request as RequestType, AiVpReviewResult } from '@/types/request-engine';
import {
  REQUEST_TYPE_LABELS,
  APPROVAL_STATUS_LABELS,
  APPROVAL_STATUS_COLORS,
  URGENCY_LEVEL_LABELS,
} from '@/types/request-engine';
import {
  Brain,
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  Banknote,
  ThumbsUp,
  ThumbsDown,
  ArrowUpRight,
  RotateCcw,
  FileText,
  Loader2,
  AlertTriangle,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

export default function AiVpApprovalPage() {
  return (
    <AuthGuard>
      <AiVpApprovalContent />
    </AuthGuard>
  );
}

function AiVpApprovalContent() {
  const { user, firebaseUser } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [pendingRequests, setPendingRequests] = useState<RequestType[]>([]);
  const [recentRequests, setRecentRequests] = useState<RequestType[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<RequestType | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  // 権限チェック
  useEffect(() => {
    if (user && !isAiVpOwner(user.email)) {
      router.push('/dashboard');
    }
  }, [user, router]);

  const fetchData = useCallback(async () => {
    if (!user?.email) return;
    setLoading(true);
    try {
      // 全申請を取得してフィルタリング
      const allRequests = await getRequests({ limitCount: 200 });

      // AI副社長レビュー済み（最終決裁待ち）
      const pending = allRequests.filter(r => r.status === 'ai_vp_reviewed');

      // 最近処理した申請
      const recent = allRequests
        .filter(r => r.status === 'final_approved_by_yoshida' || r.status === 'executed' || r.status === 'rejected')
        .slice(0, 10);

      setPendingRequests(pending);
      setRecentRequests(recent);
    } catch (err) {
      console.error('Failed to fetch requests:', err);
      setError('データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [user?.email]);

  useEffect(() => {
    if (user?.email && isAiVpOwner(user.email)) {
      fetchData();
    }
  }, [user?.email, fetchData]);

  const handleApprove = async (requestId: string) => {
    if (!user) return;
    setActionLoading(requestId);
    setError(null);
    try {
      await approveRequest(requestId, user.id, user.name, user.role, comment || '吉田最終決裁完了');
      setComment('');
      setSelectedRequest(null);
      await fetchData();
    } catch (err) {
      console.error('Approve failed:', err);
      setError('承認に失敗しました');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (requestId: string) => {
    if (!user || !comment.trim()) {
      setError('却下理由を入力してください');
      return;
    }
    setActionLoading(requestId);
    setError(null);
    try {
      await rejectRequest(requestId, user.id, user.name, user.role, comment);
      setComment('');
      setSelectedRequest(null);
      await fetchData();
    } catch (err) {
      console.error('Reject failed:', err);
      setError('却下に失敗しました');
    } finally {
      setActionLoading(null);
    }
  };

  if (!user || !isAiVpOwner(user.email)) {
    return (
      <>
        <Header />
        <main className="pb-20 md:pb-8">
          <div className="max-w-4xl mx-auto px-4 py-16 text-center">
            <AlertCircle className="w-16 h-16 mx-auto mb-4 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">アクセス権限がありません</h1>
          </div>
        </main>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <Header />
        <Loading text="読み込み中..." />
      </>
    );
  }

  // 統計
  const totalPending = pendingRequests.length;
  const totalAmount = pendingRequests.reduce((sum, r) => sum + r.totalAmount, 0);
  const highConfidence = pendingRequests.filter(r => (r.aiVpReview?.confidence || 0) >= 0.8).length;
  const recommendApprove = pendingRequests.filter(r => r.aiVpReview?.recommendation === 'approve').length;

  return (
    <>
      <Header />
      <main className="pb-20 md:pb-8">
        <div className="max-w-6xl mx-auto px-4 py-6">
          {/* ヘッダー */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/admin/ai-vp')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg">
                  <Brain className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">最終決裁</h1>
                  <p className="text-sm text-gray-500">AI副社長レビュー済みの申請を承認</p>
                </div>
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

          {/* 統計カード */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Clock className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">決裁待ち</p>
                  <p className="text-2xl font-bold">{totalPending}件</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Banknote className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">総額</p>
                  <p className="text-2xl font-bold">¥{totalAmount.toLocaleString()}</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <ThumbsUp className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">承認推奨</p>
                  <p className="text-2xl font-bold">{recommendApprove}件</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 rounded-lg">
                  <Sparkles className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">高信頼度</p>
                  <p className="text-2xl font-bold">{highConfidence}件</p>
                </div>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 申請一覧 */}
            <div className="lg:col-span-2 space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Clock className="w-5 h-5 text-purple-600" />
                決裁待ち申請
              </h2>

              {pendingRequests.length === 0 ? (
                <Card className="p-8 text-center">
                  <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
                  <p className="text-gray-600 font-medium">すべての申請が処理されました</p>
                  <p className="text-sm text-gray-400 mt-1">決裁待ちの申請はありません</p>
                </Card>
              ) : (
                <div className="space-y-3">
                  {pendingRequests.map((req) => (
                    <RequestCard
                      key={req.id}
                      request={req}
                      isSelected={selectedRequest?.id === req.id}
                      onSelect={() => setSelectedRequest(req)}
                    />
                  ))}
                </div>
              )}

              {/* 最近の処理 */}
              {recentRequests.length > 0 && (
                <div className="mt-8">
                  <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                    <FileText className="w-5 h-5 text-gray-600" />
                    最近の処理
                  </h2>
                  <div className="space-y-2">
                    {recentRequests.map((req) => (
                      <Link key={req.id} href={`/requests/${req.id}`}>
                        <Card className="p-3 hover:bg-gray-50 transition-colors cursor-pointer">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className={`px-2 py-0.5 rounded text-xs ${APPROVAL_STATUS_COLORS[req.status]}`}>
                                {APPROVAL_STATUS_LABELS[req.status]}
                              </span>
                              <span className="text-sm font-medium">{req.title}</span>
                            </div>
                            <span className="text-sm text-gray-500">
                              ¥{req.totalAmount.toLocaleString()}
                            </span>
                          </div>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 詳細パネル */}
            <div className="space-y-4">
              {selectedRequest ? (
                <ApprovalPanel
                  request={selectedRequest}
                  comment={comment}
                  setComment={setComment}
                  actionLoading={actionLoading}
                  onApprove={() => handleApprove(selectedRequest.id)}
                  onReject={() => handleReject(selectedRequest.id)}
                  onClose={() => setSelectedRequest(null)}
                />
              ) : (
                <Card className="p-6 text-center">
                  <Brain className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p className="text-gray-500">申請を選択してください</p>
                  <p className="text-sm text-gray-400 mt-1">
                    左の一覧から申請をクリックすると詳細が表示されます
                  </p>
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
 * 申請カード
 */
function RequestCard({
  request,
  isSelected,
  onSelect,
}: {
  request: RequestType;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const review = request.aiVpReview;
  const recommendationConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    approve: { color: 'text-green-600 bg-green-50', icon: <ThumbsUp className="w-4 h-4" />, label: '承認推奨' },
    reject: { color: 'text-red-600 bg-red-50', icon: <ThumbsDown className="w-4 h-4" />, label: '却下推奨' },
    return: { color: 'text-orange-600 bg-orange-50', icon: <RotateCcw className="w-4 h-4" />, label: '差し戻し推奨' },
    escalate: { color: 'text-purple-600 bg-purple-50', icon: <ArrowUpRight className="w-4 h-4" />, label: 'エスカレ' },
  };
  const config = review ? recommendationConfig[review.recommendation] : null;

  return (
    <Card
      className={`p-4 cursor-pointer transition-all ${
        isSelected ? 'ring-2 ring-purple-500 bg-purple-50' : 'hover:bg-gray-50'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-gray-500">{request.requestNumber}</span>
            <span className={`px-2 py-0.5 rounded text-xs ${
              request.isEmergency ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
            }`}>
              {REQUEST_TYPE_LABELS[request.requestType]}
            </span>
          </div>
          <h3 className="font-medium mb-1">{request.title}</h3>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <span>{request.applicantName}</span>
            <span className="font-medium text-blue-600">
              ¥{request.totalAmount.toLocaleString()}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          {config && (
            <div className={`flex items-center gap-1 px-2 py-1 rounded ${config.color}`}>
              {config.icon}
              <span className="text-xs font-medium">{config.label}</span>
            </div>
          )}
          {review && (
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <span>信頼度</span>
              <span className={`font-medium ${
                review.confidence >= 0.8 ? 'text-green-600' :
                review.confidence >= 0.6 ? 'text-yellow-600' : 'text-red-600'
              }`}>
                {Math.round(review.confidence * 100)}%
              </span>
            </div>
          )}
          <ChevronRight className="w-5 h-5 text-gray-400" />
        </div>
      </div>
    </Card>
  );
}

/**
 * 承認パネル
 */
function ApprovalPanel({
  request,
  comment,
  setComment,
  actionLoading,
  onApprove,
  onReject,
  onClose,
}: {
  request: RequestType;
  comment: string;
  setComment: (v: string) => void;
  actionLoading: string | null;
  onApprove: () => void;
  onReject: () => void;
  onClose: () => void;
}) {
  const review = request.aiVpReview;
  const isLoading = actionLoading === request.id;

  return (
    <div className="space-y-4">
      {/* 申請概要 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <span>{request.title}</span>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <XCircle className="w-5 h-5" />
            </button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-gray-500">申請者</span>
              <p className="font-medium">{request.applicantName}</p>
            </div>
            <div>
              <span className="text-gray-500">金額</span>
              <p className="font-bold text-blue-600">¥{request.totalAmount.toLocaleString()}</p>
            </div>
            <div>
              <span className="text-gray-500">種別</span>
              <p>{REQUEST_TYPE_LABELS[request.requestType]}</p>
            </div>
            <div>
              <span className="text-gray-500">緊急度</span>
              <p>{URGENCY_LEVEL_LABELS[request.urgency]}</p>
            </div>
          </div>
          {request.description && (
            <div className="pt-2 border-t">
              <span className="text-sm text-gray-500">説明</span>
              <p className="text-sm mt-1">{request.description}</p>
            </div>
          )}
          <Link
            href={`/requests/${request.id}`}
            className="text-sm text-purple-600 hover:text-purple-800 flex items-center gap-1"
          >
            詳細を見る
            <ChevronRight className="w-4 h-4" />
          </Link>
        </CardContent>
      </Card>

      {/* AI副社長レビュー */}
      {review && (
        <Card className="border-purple-200">
          <CardHeader className="pb-2 bg-purple-50">
            <CardTitle className="text-base flex items-center gap-2 text-purple-700">
              <Brain className="w-4 h-4" />
              AI副社長の判断
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-3">
            {/* 推奨と信頼度 */}
            <div className="flex items-center justify-between">
              <RecommendationBadge recommendation={review.recommendation} />
              <div className="text-sm">
                信頼度:{' '}
                <span className={`font-bold ${
                  review.confidence >= 0.8 ? 'text-green-600' :
                  review.confidence >= 0.6 ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {Math.round(review.confidence * 100)}%
                </span>
              </div>
            </div>

            {/* サマリー */}
            <div className="p-2 bg-gray-50 rounded text-sm">
              {review.formattedSummary}
            </div>

            {/* キーポイント */}
            {review.extractedKeyPoints.length > 0 && (
              <div>
                <span className="text-xs text-gray-500">キーポイント</span>
                <ul className="mt-1 space-y-1">
                  {review.extractedKeyPoints.slice(0, 3).map((point, i) => (
                    <li key={i} className="text-sm flex items-start gap-1">
                      <span className="text-purple-500">•</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 注意点 */}
            {review.attentionPoints.length > 0 && (
              <div className="p-2 bg-yellow-50 border border-yellow-200 rounded">
                <div className="flex items-center gap-1 text-yellow-700 text-xs font-medium mb-1">
                  <AlertTriangle className="w-3 h-3" />
                  注意点
                </div>
                <ul className="space-y-0.5">
                  {review.attentionPoints.map((point, i) => (
                    <li key={i} className="text-xs text-yellow-800">• {point}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* 判断理由 */}
            <div>
              <span className="text-xs text-gray-500">判断理由</span>
              <p className="text-xs mt-1 text-gray-600 leading-relaxed">
                {review.reasoning}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* アクション */}
      <Card className="border-2 border-green-200">
        <CardContent className="pt-4 space-y-3">
          <div>
            <label className="text-sm text-gray-500 mb-1 block">コメント（任意）</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg resize-none text-sm focus:ring-2 focus:ring-purple-500"
              rows={2}
              placeholder="決裁コメントを入力..."
            />
          </div>

          <Button
            onClick={onApprove}
            disabled={isLoading}
            className="w-full bg-green-600 hover:bg-green-700"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <CheckCircle className="w-4 h-4 mr-2" />
            )}
            最終承認する
          </Button>

          <Button
            onClick={onReject}
            disabled={isLoading || !comment.trim()}
            variant="secondary"
            className="w-full text-red-600 hover:bg-red-50"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <XCircle className="w-4 h-4 mr-2" />
            )}
            却下する
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * 推奨バッジ
 */
function RecommendationBadge({ recommendation }: { recommendation: string }) {
  const configs: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    approve: { color: 'bg-green-100 text-green-700', icon: <ThumbsUp className="w-4 h-4" />, label: '承認推奨' },
    reject: { color: 'bg-red-100 text-red-700', icon: <ThumbsDown className="w-4 h-4" />, label: '却下推奨' },
    return: { color: 'bg-orange-100 text-orange-700', icon: <RotateCcw className="w-4 h-4" />, label: '差し戻し推奨' },
    escalate: { color: 'bg-purple-100 text-purple-700', icon: <ArrowUpRight className="w-4 h-4" />, label: 'エスカレーション' },
  };

  const config = configs[recommendation] || configs.escalate;

  return (
    <div className={`flex items-center gap-1 px-2 py-1 rounded ${config.color}`}>
      {config.icon}
      <span className="text-sm font-medium">{config.label}</span>
    </div>
  );
}
