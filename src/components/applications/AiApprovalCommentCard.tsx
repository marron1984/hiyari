'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, Button } from '@/components/ui';
import { Brain, RefreshCw, AlertCircle, CheckCircle, XCircle, Info, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AiComment {
  id: string;
  applicationId: string;
  applicationType: 'EXPENSE' | 'OVERTIME';
  promptVersion: string;
  similarApprovalRate: number;
  similarRejectionRate: number;
  referenceCaseIds: string[];
  missingInfo: string[];
  cautions: string[];
  createdAt: string;
  createdBy: string;
  isRegenerated?: boolean;
}

interface Props {
  applicationId: string;
  getToken: () => Promise<string>;
}

export function AiApprovalCommentCard({ applicationId, getToken }: Props) {
  const [comment, setComment] = useState<AiComment | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadComment = async () => {
    try {
      setLoading(true);
      setError(null);

      const token = await getToken();
      const res = await fetch(`/api/applications/${applicationId}/ai-comment`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'コメントの取得に失敗しました');
      }

      const data = await res.json();
      setComment(data.comment);
    } catch (err) {
      console.error('Failed to load AI comment:', err);
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async () => {
    try {
      setRegenerating(true);
      setError(null);

      const token = await getToken();
      const res = await fetch(`/api/applications/${applicationId}/ai-comment`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '再生成に失敗しました');
      }

      const data = await res.json();
      setComment(data.comment);
    } catch (err) {
      console.error('Failed to regenerate AI comment:', err);
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setRegenerating(false);
    }
  };

  useEffect(() => {
    loadComment();
  }, [applicationId]);

  if (loading) {
    return (
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Brain className="w-5 h-5 text-indigo-600" />
            <h3 className="font-semibold text-zinc-900">AI副社長コメント</h3>
          </div>
          <div className="flex items-center justify-center py-8">
            <div className="flex items-center gap-2 text-zinc-500">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600" />
              <span className="text-sm">分析中...</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="mb-6 border-red-200">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Brain className="w-5 h-5 text-indigo-600" />
            <h3 className="font-semibold text-zinc-900">AI副社長コメント</h3>
          </div>
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadComment}
            className="mt-3"
          >
            再読み込み
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!comment) return null;

  return (
    <Card className="mb-6 border-indigo-200 bg-indigo-50/30">
      <CardContent className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-indigo-600" />
            <h3 className="font-semibold text-zinc-900">AI副社長コメント</h3>
            {comment.isRegenerated && (
              <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">
                再生成
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRegenerate}
            disabled={regenerating}
            className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-100"
          >
            <RefreshCw className={cn('w-4 h-4 mr-1', regenerating && 'animate-spin')} />
            再生成
          </Button>
        </div>

        {/* Approval Rate */}
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div className="bg-white rounded-xl p-4 border border-emerald-200">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              <span className="text-xs text-zinc-500">類似承認</span>
            </div>
            <p className="text-2xl font-bold text-emerald-600">
              {comment.similarApprovalRate}%
            </p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-red-200">
            <div className="flex items-center gap-2 mb-1">
              <XCircle className="w-4 h-4 text-red-600" />
              <span className="text-xs text-zinc-500">類似否認</span>
            </div>
            <p className="text-2xl font-bold text-red-600">
              {comment.similarRejectionRate}%
            </p>
          </div>
        </div>

        {/* Reference Cases */}
        {comment.referenceCaseIds.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-zinc-500 mb-2">参考ケース</p>
            <div className="flex flex-wrap gap-2">
              {comment.referenceCaseIds.map((id) => (
                <a
                  key={id}
                  href={`/dashboard/applications/${id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs bg-white border border-zinc-200 rounded-lg px-2 py-1 text-indigo-600 hover:bg-indigo-50"
                >
                  <ExternalLink className="w-3 h-3" />
                  {id.slice(-6)}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Missing Info */}
        {comment.missingInfo.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-zinc-500 mb-2">不足情報</p>
            <ul className="space-y-1">
              {comment.missingInfo.map((info, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-zinc-700">
                  <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  {info}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Cautions */}
        {comment.cautions.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-zinc-500 mb-2">注意点</p>
            <ul className="space-y-1">
              {comment.cautions.map((caution, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-zinc-700">
                  <AlertCircle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                  {caution}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* No issues */}
        {comment.missingInfo.length === 0 && comment.cautions.length === 0 && (
          <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 rounded-lg p-3">
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm">特に気になる点は検出されませんでした</span>
          </div>
        )}

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-indigo-200">
          <p className="text-xs text-zinc-400">
            生成: {new Date(comment.createdAt).toLocaleString('ja-JP')}
            {' / '}
            v{comment.promptVersion}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
