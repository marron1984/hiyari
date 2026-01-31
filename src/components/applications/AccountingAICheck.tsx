'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, Button, Badge } from '@/components/ui';
import {
  Brain,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  BookOpen,
  Lightbulb,
} from 'lucide-react';

interface AICheckResult {
  success: boolean;
  skipped?: boolean;
  templateName?: string;
  matchedAccountItem?: {
    accountItemId: number;
    accountItemName: string;
  };
  anomalyFlags?: {
    accountItemChanged: boolean;
    accountItemChangedReason?: string;
    amountOutlier: boolean;
    amountOutlierReason?: string;
    taxCodeMismatch: boolean;
    taxCodeMismatchReason?: string;
    paymentMethodMismatch: boolean;
    paymentMethodMismatchReason?: string;
  };
  hasAnomaly?: boolean;
  aiAnalysis?: {
    reason: string;
    alternatives: Array<{
      accountItem: { accountItemId: number; accountItemName: string };
      reason: string;
      confidence: number;
    }>;
    suggestedAction: 'proceed' | 'review' | 'change';
  };
  error?: string;
}

interface AccountingAICheckProps {
  applicationId: string;
  applicationType: string;
  getToken: () => Promise<string>;
}

export function AccountingAICheck({
  applicationId,
  applicationType,
  getToken,
}: AccountingAICheckProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AICheckResult | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [checked, setChecked] = useState(false);

  // 支払い依頼以外は非表示
  if (applicationType !== 'PAYMENT_REQUEST') {
    return null;
  }

  const runCheck = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const response = await fetch(`/api/applications/${applicationId}/ai-check`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      setResult(data);
      setChecked(true);

      // 異常がある場合は自動展開
      if (data.hasAnomaly) {
        setExpanded(true);
      }
    } catch (error) {
      console.error('AIチェックエラー:', error);
      setResult({
        success: false,
        error: error instanceof Error ? error.message : 'チェックに失敗しました',
      });
    } finally {
      setLoading(false);
    }
  };

  // 初回表示時に既存結果を取得
  useEffect(() => {
    const fetchExisting = async () => {
      try {
        const token = await getToken();
        const response = await fetch(`/api/applications/${applicationId}/ai-check`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        if (data.hasReview) {
          setResult({
            success: true,
            templateName: data.review.templateName,
            matchedAccountItem: data.review.matchedAccountItem,
            anomalyFlags: data.review.anomalyFlags,
            hasAnomaly: data.review.hasAnomaly,
            aiAnalysis: data.review.aiAnalysis,
          });
          setChecked(true);
          if (data.review.hasAnomaly) {
            setExpanded(true);
          }
        }
      } catch (error) {
        console.error('既存チェック取得エラー:', error);
      }
    };

    fetchExisting();
  }, [applicationId, getToken]);

  return (
    <Card className="mb-6">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-600" />
            <span className="font-medium text-zinc-900">勘定科目AIチェック</span>
            {checked && result?.success && (
              result.hasAnomaly ? (
                <Badge className="bg-amber-100 text-amber-700">要確認</Badge>
              ) : (
                <Badge className="bg-green-100 text-green-700">問題なし</Badge>
              )
            )}
          </div>
          <div className="flex items-center gap-2">
            {!checked && (
              <Button
                variant="outline"
                size="sm"
                onClick={runCheck}
                loading={loading}
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                チェック実行
              </Button>
            )}
            {checked && result?.hasAnomaly && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-zinc-500 hover:text-zinc-700"
              >
                {expanded ? (
                  <ChevronUp className="w-5 h-5" />
                ) : (
                  <ChevronDown className="w-5 h-5" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* チェック結果サマリー */}
        {checked && result?.success && (
          <div className="mt-3 p-3 bg-zinc-50 rounded-lg">
            <div className="flex items-center gap-2 text-sm">
              <BookOpen className="w-4 h-4 text-zinc-500" />
              <span className="text-zinc-600">適用テンプレート:</span>
              <span className="font-medium text-zinc-900">{result.templateName}</span>
            </div>
            {result.matchedAccountItem && (
              <div className="flex items-center gap-2 text-sm mt-1">
                <span className="text-zinc-600 ml-6">勘定科目:</span>
                <span className="font-medium text-zinc-900">
                  {result.matchedAccountItem.accountItemName}
                </span>
              </div>
            )}
          </div>
        )}

        {/* エラー表示 */}
        {result?.error && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{result.error}</p>
          </div>
        )}

        {/* 展開時の詳細 */}
        {expanded && result?.hasAnomaly && (
          <div className="mt-4 space-y-4">
            {/* 検出された異常 */}
            <div>
              <h4 className="text-sm font-medium text-zinc-700 mb-2 flex items-center gap-1">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                検出された違和感
              </h4>
              <ul className="space-y-2">
                {result.anomalyFlags?.accountItemChanged && (
                  <li className="text-sm p-2 bg-amber-50 border border-amber-200 rounded">
                    {result.anomalyFlags.accountItemChangedReason || '過去と異なる勘定科目'}
                  </li>
                )}
                {result.anomalyFlags?.amountOutlier && (
                  <li className="text-sm p-2 bg-amber-50 border border-amber-200 rounded">
                    {result.anomalyFlags.amountOutlierReason || '金額が通常と異なる'}
                  </li>
                )}
                {result.anomalyFlags?.taxCodeMismatch && (
                  <li className="text-sm p-2 bg-amber-50 border border-amber-200 rounded">
                    {result.anomalyFlags.taxCodeMismatchReason || '税区分の不整合'}
                  </li>
                )}
                {result.anomalyFlags?.paymentMethodMismatch && (
                  <li className="text-sm p-2 bg-amber-50 border border-amber-200 rounded">
                    {result.anomalyFlags.paymentMethodMismatchReason || '支払方法の不整合'}
                  </li>
                )}
              </ul>
            </div>

            {/* AI分析結果 */}
            {result.aiAnalysis && (
              <div>
                <h4 className="text-sm font-medium text-zinc-700 mb-2 flex items-center gap-1">
                  <Lightbulb className="w-4 h-4 text-purple-500" />
                  AI分析
                </h4>
                <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                  <p className="text-sm text-zinc-700">{result.aiAnalysis.reason}</p>

                  {/* 推奨アクション */}
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-zinc-500">推奨:</span>
                    {result.aiAnalysis.suggestedAction === 'proceed' && (
                      <Badge className="bg-green-100 text-green-700">このまま進める</Badge>
                    )}
                    {result.aiAnalysis.suggestedAction === 'review' && (
                      <Badge className="bg-amber-100 text-amber-700">確認を推奨</Badge>
                    )}
                    {result.aiAnalysis.suggestedAction === 'change' && (
                      <Badge className="bg-red-100 text-red-700">変更を推奨</Badge>
                    )}
                  </div>

                  {/* 代替案 */}
                  {result.aiAnalysis.alternatives.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs text-zinc-500 mb-2">代替案:</p>
                      <div className="space-y-2">
                        {result.aiAnalysis.alternatives.map((alt, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-2 bg-white rounded border border-purple-100"
                          >
                            <div>
                              <span className="text-sm font-medium text-zinc-900">
                                {alt.accountItem.accountItemName}
                              </span>
                              <p className="text-xs text-zinc-500 mt-0.5">{alt.reason}</p>
                            </div>
                            <span className="text-xs text-zinc-400">
                              確信度: {alt.confidence}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 注意書き */}
                <p className="text-xs text-zinc-400 mt-2">
                  ※ AIは提案のみ行います。最終判断は承認者が行ってください。
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
