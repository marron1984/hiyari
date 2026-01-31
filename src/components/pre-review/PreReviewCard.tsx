'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  AlertTriangle,
  CheckCircle,
  Info,
  Loader2,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  ThumbsUp,
  Sparkles,
} from 'lucide-react';
import type {
  ApplicationType,
  ExpenseApplication,
  OvertimeApplication,
  PreReviewResult,
  ReviewFlag,
  AIReviewPoint,
} from '@/types/pre-review';

interface PreReviewCardProps {
  applicationType: ApplicationType;
  application: ExpenseApplication | OvertimeApplication;
  onReviewComplete: (canSubmit: boolean, flags: ReviewFlag[]) => void;
  onCancel?: () => void;
  disabled?: boolean;
}

// フラグアイコン
function FlagIcon({ severity }: { severity: 'info' | 'warning' | 'attention' }) {
  switch (severity) {
    case 'attention':
      return <AlertTriangle className="h-4 w-4 text-orange-500" />;
    case 'warning':
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    default:
      return <Info className="h-4 w-4 text-blue-500" />;
  }
}

// フラグバッジスタイル
function getFlagBadgeVariant(
  severity: 'info' | 'warning' | 'attention'
): 'info' | 'warning' | 'danger' {
  switch (severity) {
    case 'attention':
      return 'danger';
    case 'warning':
      return 'warning';
    default:
      return 'info';
  }
}

export function PreReviewCard({
  applicationType,
  application,
  onReviewComplete,
  onCancel,
  disabled = false,
}: PreReviewCardProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PreReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [checkedPoints, setCheckedPoints] = useState<Record<string, boolean>>({});

  // 初回レンダリング時にレビュー実行
  useEffect(() => {
    runReview();
  }, []);

  // レビュー実行
  const runReview = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/pre-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationType,
          application,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setResult(data.result);

        // フラグなしの場合は自動的に確認完了
        if (!data.result.hasFlags) {
          onReviewComplete(true, []);
        }
      } else {
        setError(data.error || 'レビューに失敗しました');
      }
    } catch (e) {
      setError('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  // 確認ポイントのチェック
  const handleCheckPoint = (pointId: string) => {
    setCheckedPoints((prev) => ({
      ...prev,
      [pointId]: !prev[pointId],
    }));
  };

  // 全ての確認ポイントがチェックされているか
  const allPointsChecked =
    result?.aiReview?.points.every((p) => checkedPoints[p.id]) ?? false;

  // 確認完了
  const handleConfirmReview = () => {
    if (result) {
      onReviewComplete(true, result.flags);
    }
  };

  // ローディング中
  if (loading) {
    return (
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="py-6">
          <div className="flex items-center justify-center gap-3 text-blue-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>申請内容を確認しています...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // エラー
  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="py-4">
          <div className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-4 w-4" />
            <span>{error}</span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={runReview}
            className="mt-3"
          >
            再試行
          </Button>
        </CardContent>
      </Card>
    );
  }

  // 結果なし
  if (!result) {
    return null;
  }

  // フラグなし（問題なし）
  if (!result.hasFlags) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="py-4">
          <div className="flex items-center gap-2 text-green-700">
            <CheckCircle className="h-5 w-5" />
            <span className="font-medium">確認が完了しました</span>
          </div>
          <p className="text-sm text-green-600 mt-1">
            申請を送信できます
          </p>
        </CardContent>
      </Card>
    );
  }

  // フラグあり - レビューカード
  return (
    <Card className="border-purple-200 bg-purple-50">
      <CardHeader
        className="py-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            <CardTitle className="text-base text-purple-800">
              申請前の確認
            </CardTitle>
            <Badge variant="info" size="sm">
              {result.flags.length}件
            </Badge>
          </div>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-purple-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-purple-400" />
          )}
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-4">
          {/* 注意書き */}
          <div className="bg-white rounded-lg p-3 border border-purple-100">
            <div className="flex items-start gap-2">
              <MessageSquare className="h-4 w-4 text-purple-500 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="text-purple-800 font-medium">
                  これは却下ではありません
                </p>
                <p className="text-purple-600 mt-1">
                  申請をスムーズに進めるため、いくつか確認をお願いしています。
                  内容を確認したらチェックを入れてください。
                </p>
              </div>
            </div>
          </div>

          {/* フラグ一覧 */}
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-purple-700 uppercase">
              確認ポイント
            </h4>
            {result.flags.map((flag) => (
              <div
                key={flag.type}
                className="flex items-start gap-2 bg-white rounded p-2 border border-purple-100"
              >
                <FlagIcon severity={flag.severity} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-800">
                      {flag.title}
                    </span>
                    <Badge variant={getFlagBadgeVariant(flag.severity)} size="sm">
                      {flag.severity === 'attention'
                        ? '要確認'
                        : flag.severity === 'warning'
                        ? '注意'
                        : '参考'}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {flag.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* AIレビューポイント */}
          {result.aiReview && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-purple-700 uppercase">
                確認事項
              </h4>
              {result.aiReview.points.map((point) => (
                <div
                  key={point.id}
                  className={`p-3 rounded-lg border transition-colors cursor-pointer ${
                    checkedPoints[point.id]
                      ? 'bg-green-50 border-green-200'
                      : 'bg-white border-purple-100 hover:bg-purple-50'
                  }`}
                  onClick={() => handleCheckPoint(point.id)}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        checkedPoints[point.id]
                          ? 'border-green-500 bg-green-500'
                          : 'border-purple-300'
                      }`}
                    >
                      {checkedPoints[point.id] && (
                        <CheckCircle className="h-3 w-3 text-white" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-gray-800">{point.point}</p>
                      {point.suggestion && (
                        <p className="text-xs text-gray-500 mt-1">
                          {point.suggestion}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* 励ましメッセージ */}
              <div className="flex items-center gap-2 text-sm text-purple-600 bg-purple-100 rounded p-2">
                <ThumbsUp className="h-4 w-4" />
                <span>{result.aiReview.encouragement}</span>
              </div>
            </div>
          )}

          {/* アクションボタン */}
          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleConfirmReview}
              disabled={!allPointsChecked || disabled}
              className="flex-1"
            >
              {allPointsChecked ? (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  確認完了して申請へ
                </>
              ) : (
                '全ての項目を確認してください'
              )}
            </Button>
            {onCancel && (
              <Button variant="secondary" onClick={onCancel} disabled={disabled}>
                キャンセル
              </Button>
            )}
          </div>

          {/* 進捗表示 */}
          {result.aiReview && (
            <div className="text-xs text-center text-purple-500">
              {Object.values(checkedPoints).filter(Boolean).length} /{' '}
              {result.aiReview.points.length} 確認済み
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
