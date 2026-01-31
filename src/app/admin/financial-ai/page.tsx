'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from '@/components/ui';
import { Loading } from '@/components/Loading';
import {
  BarChart3,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Clock,
  Calendar,
  DollarSign,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  FileText,
  Wallet,
  ArrowLeft,
  AlertCircle,
  Info,
} from 'lucide-react';
import type { MonthlyAIReview } from '@/types/monthly-closing';
import type { CashflowAIReview, ForecastPeriod } from '@/types/cashflow-forecast';

export default function FinancialAIPage() {
  return (
    <AuthGuard requireAdmin>
      <FinancialAIContent />
    </AuthGuard>
  );
}

function FinancialAIContent() {
  const { firebaseUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'monthly' | 'cashflow'>('monthly');

  // 月次決算
  const [monthlyReviews, setMonthlyReviews] = useState<MonthlyAIReview[]>([]);
  const [monthlyLoading, setMonthlyLoading] = useState(true);
  const [expandedMonthlyId, setExpandedMonthlyId] = useState<string | null>(null);
  const [generatingMonthly, setGeneratingMonthly] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);

  // キャッシュフロー
  const [cashflowReview, setCashflowReview] = useState<CashflowAIReview | null>(null);
  const [cashflowHistory, setCashflowHistory] = useState<CashflowAIReview[]>([]);
  const [cashflowLoading, setCashflowLoading] = useState(true);
  const [expandedCashflowId, setExpandedCashflowId] = useState<string | null>(null);
  const [generatingCashflow, setGeneratingCashflow] = useState(false);
  const [forecastPeriod, setForecastPeriod] = useState<ForecastPeriod>('1month');

  // 月次決算レビュー一覧取得
  const fetchMonthlyReviews = async () => {
    setMonthlyLoading(true);
    try {
      const response = await fetch('/api/admin/monthly-closing?limit=12');
      const data = await response.json();
      if (data.success) {
        setMonthlyReviews(data.reviews);
      }
    } catch (error) {
      console.error('月次決算レビュー取得エラー:', error);
    } finally {
      setMonthlyLoading(false);
    }
  };

  // キャッシュフロー予測取得
  const fetchCashflowReview = async () => {
    setCashflowLoading(true);
    try {
      const [latestRes, historyRes] = await Promise.all([
        fetch('/api/admin/cashflow-forecast?latest=true'),
        fetch('/api/admin/cashflow-forecast?limit=5'),
      ]);
      const latestData = await latestRes.json();
      const historyData = await historyRes.json();

      if (latestData.success && latestData.review) {
        setCashflowReview(latestData.review);
      }
      if (historyData.success) {
        setCashflowHistory(historyData.reviews);
      }
    } catch (error) {
      console.error('キャッシュフロー予測取得エラー:', error);
    } finally {
      setCashflowLoading(false);
    }
  };

  useEffect(() => {
    fetchMonthlyReviews();
    fetchCashflowReview();
  }, []);

  // 月次決算レビュー生成
  const generateMonthlyReview = async () => {
    setGeneratingMonthly(true);
    try {
      const response = await fetch('/api/admin/monthly-closing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: selectedYear,
          month: selectedMonth,
        }),
      });
      const data = await response.json();
      if (data.success) {
        await fetchMonthlyReviews();
        alert('月次決算AIレビューを生成しました');
      } else {
        alert(data.error || '生成に失敗しました');
      }
    } catch (error) {
      console.error('月次決算レビュー生成エラー:', error);
      alert('生成に失敗しました');
    } finally {
      setGeneratingMonthly(false);
    }
  };

  // キャッシュフロー予測生成
  const generateCashflowReview = async () => {
    setGeneratingCashflow(true);
    try {
      const response = await fetch('/api/admin/cashflow-forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period: forecastPeriod,
        }),
      });
      const data = await response.json();
      if (data.success) {
        await fetchCashflowReview();
        alert('キャッシュフロー予測を生成しました');
      } else {
        alert(data.error || '生成に失敗しました');
      }
    } catch (error) {
      console.error('キャッシュフロー予測生成エラー:', error);
      alert('生成に失敗しました');
    } finally {
      setGeneratingCashflow(false);
    }
  };

  // レビュー確認済みにする
  const acknowledgeMonthlyReview = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/monthly-closing/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (data.success) {
        await fetchMonthlyReviews();
      }
    } catch (error) {
      console.error('確認エラー:', error);
    }
  };

  const acknowledgeCashflowReview = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/cashflow-forecast/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (data.success) {
        await fetchCashflowReview();
      }
    } catch (error) {
      console.error('確認エラー:', error);
    }
  };

  // 異常深刻度のバッジ
  const getSeverityBadge = (severity: 'critical' | 'warning' | 'info') => {
    switch (severity) {
      case 'critical':
        return (
          <Badge className="bg-red-100 text-red-700">
            <AlertTriangle className="w-3 h-3 mr-1" />
            重大
          </Badge>
        );
      case 'warning':
        return (
          <Badge className="bg-amber-100 text-amber-700">
            <AlertCircle className="w-3 h-3 mr-1" />
            警告
          </Badge>
        );
      case 'info':
        return (
          <Badge className="bg-blue-100 text-blue-700">
            <Info className="w-3 h-3 mr-1" />
            情報
          </Badge>
        );
    }
  };

  // 期間表示
  const getPeriodLabel = (period: ForecastPeriod) => {
    switch (period) {
      case '1week':
        return '1週間';
      case '2weeks':
        return '2週間';
      case '1month':
        return '1ヶ月';
      case '3months':
        return '3ヶ月';
    }
  };

  return (
    <>
      <Header />
      <main className="pb-8">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-bold text-gray-900 flex items-center">
              <BarChart3 className="w-6 h-6 text-blue-600 mr-2" />
              財務AIチェック
            </h1>
            <a
              href="/admin/settings"
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              設定に戻る
            </a>
          </div>

          {/* タブ */}
          <div className="mb-6 flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('monthly')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                activeTab === 'monthly'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <FileText className="w-4 h-4 inline mr-1" />
              月次決算AIチェック
            </button>
            <button
              onClick={() => setActiveTab('cashflow')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                activeTab === 'cashflow'
                  ? 'border-green-600 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Wallet className="w-4 h-4 inline mr-1" />
              キャッシュフロー予測
            </button>
          </div>

          {/* ===== 月次決算タブ ===== */}
          {activeTab === 'monthly' && (
            <>
              {/* 説明 */}
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
                <p>
                  月次決算データをルールベースで異常検知し、AIが要約・注意点を提示します。
                </p>
                <p className="mt-1">
                  AIは提案のみを行い、数値や仕訳の変更は行いません。
                </p>
              </div>

              {/* 生成フォーム */}
              <Card className="mb-6">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div>
                        <label className="text-sm text-gray-500">年</label>
                        <select
                          value={selectedYear}
                          onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                          className="ml-2 px-3 py-1 border border-gray-300 rounded text-gray-900"
                        >
                          {[2024, 2025, 2026].map((y) => (
                            <option key={y} value={y}>
                              {y}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-sm text-gray-500">月</label>
                        <select
                          value={selectedMonth}
                          onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                          className="ml-2 px-3 py-1 border border-gray-300 rounded text-gray-900"
                        >
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                            <option key={m} value={m}>
                              {m}月
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <Button onClick={generateMonthlyReview} loading={generatingMonthly}>
                      <RefreshCw className="w-4 h-4 mr-1" />
                      AIレビュー生成
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* レビュー一覧 */}
              {monthlyLoading ? (
                <Loading text="読み込み中..." />
              ) : monthlyReviews.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">月次決算AIレビューがありません</p>
                    <p className="text-sm text-gray-400 mt-1">
                      上記のフォームからレビューを生成してください
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {monthlyReviews.map((review) => {
                    const isExpanded = expandedMonthlyId === review.id;
                    const hasAnomalies = review.hasAnomalies;
                    const [year, month] = review.yearMonth.split('-').map(Number);

                    return (
                      <Card
                        key={review.id}
                        className={hasAnomalies ? 'border-amber-200' : ''}
                      >
                        <div
                          className="p-4 cursor-pointer hover:bg-gray-50"
                          onClick={() =>
                            setExpandedMonthlyId(isExpanded ? null : review.id)
                          }
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center">
                              <Calendar className="w-5 h-5 text-blue-500 mr-3" />
                              <div>
                                <p className="font-medium text-gray-900">
                                  {year}年{month}月 月次決算
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                  {hasAnomalies ? (
                                    <Badge className="bg-amber-100 text-amber-700">
                                      <AlertTriangle className="w-3 h-3 mr-1" />
                                      異常 {review.anomalySummary.critical + review.anomalySummary.warning} 件
                                    </Badge>
                                  ) : (
                                    <Badge className="bg-green-100 text-green-700">
                                      <CheckCircle className="w-3 h-3 mr-1" />
                                      正常
                                    </Badge>
                                  )}
                                  {review.status === 'acknowledged' && (
                                    <Badge className="bg-gray-100 text-gray-600">
                                      確認済み
                                    </Badge>
                                  )}
                                  <span className="text-xs text-gray-400 flex items-center">
                                    <Clock className="w-3 h-3 mr-1" />
                                    {new Date(review.createdAt).toLocaleDateString('ja-JP')}
                                  </span>
                                </div>
                              </div>
                            </div>
                            {isExpanded ? (
                              <ChevronUp className="w-5 h-5 text-gray-400" />
                            ) : (
                              <ChevronDown className="w-5 h-5 text-gray-400" />
                            )}
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="px-4 pb-4 border-t">
                            {/* サマリー */}
                            <div className="mt-4 grid grid-cols-4 gap-3">
                              <div className="bg-gray-50 p-3 rounded">
                                <p className="text-xs text-gray-500">支出合計</p>
                                <p className="text-lg font-semibold text-gray-900">
                                  {review.closingData.expenses.total.toLocaleString()}円
                                </p>
                              </div>
                              <div className="bg-gray-50 p-3 rounded">
                                <p className="text-xs text-gray-500">申請数</p>
                                <p className="text-lg font-semibold text-blue-600">
                                  {review.closingData.applications.submitted}
                                </p>
                              </div>
                              <div className="bg-gray-50 p-3 rounded">
                                <p className="text-xs text-gray-500">支払い数</p>
                                <p className="text-lg font-semibold text-green-600">
                                  {review.closingData.payments.count.completed}
                                </p>
                              </div>
                              <div className="bg-gray-50 p-3 rounded">
                                <p className="text-xs text-gray-500">未払い</p>
                                <p className="text-lg font-semibold text-amber-600">
                                  {review.closingData.payments.count.pending}
                                </p>
                              </div>
                            </div>

                            {/* 異常検知結果 */}
                            {review.anomalies.length > 0 && (
                              <div className="mt-4">
                                <h4 className="text-sm font-medium text-gray-700 mb-2">
                                  検知された異常
                                </h4>
                                <div className="space-y-2">
                                  {review.anomalies.map((anomaly, i) => (
                                    <div
                                      key={i}
                                      className="flex items-start gap-2 p-2 bg-gray-50 rounded"
                                    >
                                      {getSeverityBadge(anomaly.severity)}
                                      <p className="text-sm text-gray-700">
                                        {anomaly.message}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* AI分析 */}
                            {review.aiAnalysis && (
                              <div className="mt-4">
                                <h4 className="text-sm font-medium text-gray-700 mb-2">
                                  AI分析結果
                                </h4>
                                <div className="p-3 bg-blue-50 rounded">
                                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                                    {review.aiAnalysis.summary}
                                  </p>
                                  {review.aiAnalysis.concerns.length > 0 && (
                                    <div className="mt-3">
                                      <p className="text-xs font-medium text-amber-700 mb-1">
                                        注意点:
                                      </p>
                                      <ul className="text-sm text-gray-700 list-disc ml-4">
                                        {review.aiAnalysis.concerns.map((c, i) => (
                                          <li key={i}>{c}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {review.aiAnalysis.recommendations.length > 0 && (
                                    <div className="mt-3">
                                      <p className="text-xs font-medium text-blue-700 mb-1">
                                        推奨アクション:
                                      </p>
                                      <ul className="text-sm text-gray-700 list-disc ml-4">
                                        {review.aiAnalysis.recommendations.map((r, i) => (
                                          <li key={i}>{r}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* アクション */}
                            {review.status !== 'acknowledged' && (
                              <div className="mt-4 flex justify-end">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => acknowledgeMonthlyReview(review.id)}
                                >
                                  <CheckCircle className="w-4 h-4 mr-1" />
                                  確認済みにする
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ===== キャッシュフロータブ ===== */}
          {activeTab === 'cashflow' && (
            <>
              {/* 説明 */}
              <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                <p>
                  承認済み・未払いの支払い予定に基づいて、今後のキャッシュフローを予測します。
                </p>
                <p className="mt-1">
                  AIは予測に基づく注意点を提示しますが、数値の変更は行いません。
                </p>
              </div>

              {/* 生成フォーム */}
              <Card className="mb-6">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div>
                        <label className="text-sm text-gray-500">予測期間</label>
                        <select
                          value={forecastPeriod}
                          onChange={(e) =>
                            setForecastPeriod(e.target.value as ForecastPeriod)
                          }
                          className="ml-2 px-3 py-1 border border-gray-300 rounded text-gray-900"
                        >
                          <option value="1week">1週間</option>
                          <option value="2weeks">2週間</option>
                          <option value="1month">1ヶ月</option>
                          <option value="3months">3ヶ月</option>
                        </select>
                      </div>
                    </div>
                    <Button
                      onClick={generateCashflowReview}
                      loading={generatingCashflow}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <RefreshCw className="w-4 h-4 mr-1" />
                      予測を生成
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* 最新の予測 */}
              {cashflowLoading ? (
                <Loading text="読み込み中..." />
              ) : !cashflowReview ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Wallet className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">キャッシュフロー予測がありません</p>
                    <p className="text-sm text-gray-400 mt-1">
                      上記のフォームから予測を生成してください
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* 最新の予測カード */}
                  <Card className={cashflowReview.hasRisks ? 'border-amber-200' : ''}>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        <span className="flex items-center">
                          <TrendingDown className="w-5 h-5 text-green-600 mr-2" />
                          キャッシュフロー予測（{getPeriodLabel(cashflowReview.period)}）
                        </span>
                        <span className="text-sm font-normal text-gray-500">
                          {cashflowReview.startDate} 〜 {cashflowReview.endDate}
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {/* サマリー */}
                      <div className="grid grid-cols-4 gap-3 mb-4">
                        <div className="bg-gray-50 p-3 rounded">
                          <p className="text-xs text-gray-500">現在残高</p>
                          <p className="text-lg font-semibold text-gray-900">
                            {cashflowReview.forecast.currentBalance.toLocaleString()}円
                          </p>
                        </div>
                        <div className="bg-gray-50 p-3 rounded">
                          <p className="text-xs text-gray-500">予定支出合計</p>
                          <p className="text-lg font-semibold text-red-600">
                            -{cashflowReview.forecast.summary.totalOutflow.toLocaleString()}円
                          </p>
                        </div>
                        <div className="bg-gray-50 p-3 rounded">
                          <p className="text-xs text-gray-500">未払い件数</p>
                          <p className="text-lg font-semibold text-amber-600">
                            {cashflowReview.forecast.pendingPayments.count}件
                          </p>
                        </div>
                        <div className="bg-gray-50 p-3 rounded">
                          <p className="text-xs text-gray-500">最低残高予測日</p>
                          <p className="text-lg font-semibold text-blue-600">
                            {cashflowReview.forecast.summary.minimumBalanceDate || '-'}
                          </p>
                        </div>
                      </div>

                      {/* リスク検知 */}
                      {cashflowReview.risks.length > 0 && (
                        <div className="mb-4">
                          <h4 className="text-sm font-medium text-gray-700 mb-2">
                            検知されたリスク
                          </h4>
                          <div className="space-y-2">
                            {cashflowReview.risks.map((risk, i) => (
                              <div
                                key={i}
                                className="flex items-start gap-2 p-2 bg-gray-50 rounded"
                              >
                                {getSeverityBadge(risk.severity)}
                                <p className="text-sm text-gray-700">{risk.message}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* カテゴリ別内訳 */}
                      {cashflowReview.forecast.pendingPayments.byCategory.length > 0 && (
                        <div className="mb-4">
                          <h4 className="text-sm font-medium text-gray-700 mb-2">
                            カテゴリ別支出予定
                          </h4>
                          <div className="grid grid-cols-3 gap-2">
                            {cashflowReview.forecast.pendingPayments.byCategory.map(
                              (cat, i) => (
                                <div key={i} className="bg-gray-50 p-2 rounded text-sm">
                                  <p className="text-gray-500">{cat.category}</p>
                                  <p className="font-medium">
                                    {cat.amount.toLocaleString()}円（{cat.count}件）
                                  </p>
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      )}

                      {/* AI分析 */}
                      {cashflowReview.aiAnalysis && (
                        <div className="mb-4">
                          <h4 className="text-sm font-medium text-gray-700 mb-2">
                            AI分析結果
                          </h4>
                          <div className="p-3 bg-green-50 rounded">
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">
                              {cashflowReview.aiAnalysis.summary}
                            </p>
                            {cashflowReview.aiAnalysis.concerns.length > 0 && (
                              <div className="mt-3">
                                <p className="text-xs font-medium text-amber-700 mb-1">
                                  注意点:
                                </p>
                                <ul className="text-sm text-gray-700 list-disc ml-4">
                                  {cashflowReview.aiAnalysis.concerns.map((c, i) => (
                                    <li key={i}>{c}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {cashflowReview.aiAnalysis.recommendations.length > 0 && (
                              <div className="mt-3">
                                <p className="text-xs font-medium text-green-700 mb-1">
                                  推奨アクション:
                                </p>
                                <ul className="text-sm text-gray-700 list-disc ml-4">
                                  {cashflowReview.aiAnalysis.recommendations.map((r, i) => (
                                    <li key={i}>{r}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* アクション */}
                      {cashflowReview.status !== 'acknowledged' && (
                        <div className="flex justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => acknowledgeCashflowReview(cashflowReview.id)}
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            確認済みにする
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* 予測履歴 */}
                  {cashflowHistory.length > 1 && (
                    <div className="mt-6">
                      <h3 className="text-sm font-medium text-gray-700 mb-3">過去の予測</h3>
                      <div className="space-y-2">
                        {cashflowHistory.slice(1).map((review) => (
                          <Card key={review.id} className="p-3">
                            <div
                              className="flex items-center justify-between cursor-pointer"
                              onClick={() =>
                                setExpandedCashflowId(
                                  expandedCashflowId === review.id ? null : review.id
                                )
                              }
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-sm text-gray-700">
                                  {review.startDate} 〜 {review.endDate}
                                </span>
                                <Badge
                                  className={
                                    review.hasRisks
                                      ? 'bg-amber-100 text-amber-700'
                                      : 'bg-green-100 text-green-700'
                                  }
                                >
                                  {review.hasRisks ? 'リスクあり' : '正常'}
                                </Badge>
                              </div>
                              <span className="text-xs text-gray-400">
                                {new Date(review.createdAt).toLocaleDateString('ja-JP')}
                              </span>
                            </div>

                            {expandedCashflowId === review.id && review.aiAnalysis && (
                              <div className="mt-3 p-2 bg-gray-50 rounded text-sm">
                                <p className="text-gray-700">{review.aiAnalysis.summary}</p>
                              </div>
                            )}
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}
