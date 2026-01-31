'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Minus,
  Users,
  Activity,
  Heart,
  Settings,
  Bell,
  ChevronDown,
  ChevronUp,
  Loader2,
  Info,
  CheckCircle,
  RefreshCw,
} from 'lucide-react';
import type {
  BranchRiskSummary,
  HumanRiskAssessment,
  HumanRiskAlert,
  RiskLevel,
  ScoreCategory,
} from '@/types/human-risk';

// リスクレベル表示
const RISK_LEVEL_CONFIG: Record<
  RiskLevel,
  { label: string; color: string; bgColor: string; variant: 'success' | 'warning' | 'danger' | 'info' }
> = {
  stable: { label: '安定', color: 'text-green-700', bgColor: 'bg-green-100', variant: 'success' },
  caution: { label: '注意', color: 'text-yellow-700', bgColor: 'bg-yellow-100', variant: 'warning' },
  warning: { label: '警戒', color: 'text-orange-700', bgColor: 'bg-orange-100', variant: 'warning' },
  critical: { label: '要介入検討', color: 'text-red-700', bgColor: 'bg-red-100', variant: 'danger' },
};

// スコアカテゴリアイコン
const SCORE_CATEGORY_ICONS: Record<ScoreCategory, typeof Users> = {
  operational_load: Activity,
  behavioral_change: TrendingUp,
  emotional_temperature: Heart,
  operational_distortion: Settings,
};

// スコアカテゴリ表示
const SCORE_CATEGORY_LABELS: Record<ScoreCategory, string> = {
  operational_load: '稼働負荷',
  behavioral_change: '行動変化',
  emotional_temperature: '感情温度',
  operational_distortion: '運営歪み',
};

// トレンドアイコン
function TrendIcon({ trend }: { trend: 'improving' | 'stable' | 'worsening' }) {
  switch (trend) {
    case 'improving':
      return <TrendingDown className="h-4 w-4 text-green-500" />;
    case 'worsening':
      return <TrendingUp className="h-4 w-4 text-red-500" />;
    default:
      return <Minus className="h-4 w-4 text-gray-400" />;
  }
}

// スコアバー
function ScoreBar({ score, max = 25 }: { score: number; max?: number }) {
  const percentage = (score / max) * 100;
  const color =
    percentage > 60 ? 'bg-red-500' : percentage > 40 ? 'bg-orange-500' : percentage > 20 ? 'bg-yellow-500' : 'bg-green-500';

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${percentage}%` }} />
      </div>
      <span className="text-sm font-medium w-8">{score}</span>
    </div>
  );
}

export default function HumanRiskPage() {
  const [loading, setLoading] = useState(true);
  const [summaries, setSummaries] = useState<BranchRiskSummary[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<HumanRiskAssessment | null>(null);
  const [assessmentLoading, setAssessmentLoading] = useState(false);
  const [alerts, setAlerts] = useState<HumanRiskAlert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showAlerts, setShowAlerts] = useState(false);

  // 一覧取得
  const fetchSummaries = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/human-risk');
      const data = await res.json();
      if (data.success) {
        setSummaries(data.summaries || []);
      }
    } catch (e) {
      console.error('サマリ取得エラー:', e);
    } finally {
      setLoading(false);
    }
  };

  // アラート取得
  const fetchAlerts = async () => {
    try {
      const res = await fetch('/api/human-risk/alerts?limit=10');
      const data = await res.json();
      if (data.success) {
        setAlerts(data.alerts || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (e) {
      console.error('アラート取得エラー:', e);
    }
  };

  // 評価詳細取得
  const fetchAssessment = async (branchId: string) => {
    setAssessmentLoading(true);
    try {
      const res = await fetch(`/api/human-risk?branchId=${branchId}`);
      const data = await res.json();
      if (data.success && data.assessment) {
        setAssessment(data.assessment);
      } else {
        setAssessment(null);
      }
    } catch (e) {
      console.error('評価取得エラー:', e);
    } finally {
      setAssessmentLoading(false);
    }
  };

  useEffect(() => {
    fetchSummaries();
    fetchAlerts();
  }, []);

  // 拠点選択
  const handleSelectBranch = (branchId: string) => {
    setSelectedBranchId(branchId);
    fetchAssessment(branchId);
  };

  // アラート確認
  const handleAcknowledgeAlert = async (alertId: string) => {
    try {
      await fetch('/api/human-risk/alerts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId, acknowledgedBy: 'yoshida' }),
      });
      fetchAlerts();
    } catch (e) {
      console.error('アラート確認エラー:', e);
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-blue-600" />
            人材リスク予測
          </h1>
          <p className="text-gray-600 mt-1">
            組織の不安定化リスクを早期に検知します（個人の評価ではありません）
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => setShowAlerts(!showAlerts)}
            className="relative"
          >
            <Bell className="h-4 w-4 mr-1" />
            アラート
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </Button>
          <Button variant="secondary" onClick={fetchSummaries}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 注意事項 */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="py-3">
          <div className="flex items-start gap-2 text-blue-800 text-sm">
            <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              <strong>この分析は拠点・チーム単位の傾向を示すものです。</strong>
              個人の離職予測や評価は含まれていません。参考情報としてご活用ください。
            </div>
          </div>
        </CardContent>
      </Card>

      {/* アラートパネル */}
      {showAlerts && (
        <Card className="border-orange-200">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              アラート（警戒以上）
            </CardTitle>
          </CardHeader>
          <CardContent>
            {alerts.length === 0 ? (
              <div className="text-center text-gray-500 py-4">
                アラートはありません
              </div>
            ) : (
              <div className="space-y-3">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`p-3 rounded-lg border ${
                      alert.status === 'unread'
                        ? 'bg-orange-50 border-orange-200'
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{alert.branchName}</span>
                        <Badge
                          variant={
                            alert.riskLevel === 'critical' ? 'danger' : 'warning'
                          }
                        >
                          {alert.riskLevel === 'critical' ? '要介入検討' : '警戒'}
                        </Badge>
                        {alert.status === 'unread' && (
                          <span className="text-xs bg-red-500 text-white px-1.5 py-0.5 rounded">
                            未読
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">
                        {new Date(alert.createdAt).toLocaleDateString('ja-JP')}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 mb-2">{alert.summary}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex flex-wrap gap-1">
                        {alert.mainFactors.map((f, i) => (
                          <span
                            key={i}
                            className="text-xs bg-gray-200 px-2 py-0.5 rounded"
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                      {alert.status !== 'acknowledged' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleAcknowledgeAlert(alert.id)}
                        >
                          <CheckCircle className="h-3 w-3 mr-1" />
                          確認
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        {/* 左: 拠点一覧 */}
        <div className="md:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">拠点一覧</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : summaries.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  評価データがありません
                </div>
              ) : (
                <div className="space-y-2">
                  {summaries
                    .sort((a, b) => b.totalScore - a.totalScore)
                    .map((summary) => {
                      const config = RISK_LEVEL_CONFIG[summary.riskLevel];
                      return (
                        <div
                          key={summary.branchId}
                          className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                            selectedBranchId === summary.branchId
                              ? 'bg-blue-50 border-blue-300'
                              : 'hover:bg-gray-50'
                          }`}
                          onClick={() => handleSelectBranch(summary.branchId)}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-sm">
                              {summary.branchName}
                            </span>
                            <Badge variant={config.variant} size="sm">
                              {config.label}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1">
                              <span className="text-lg font-bold">
                                {summary.totalScore}
                              </span>
                              <span className="text-xs text-gray-500">/100</span>
                            </div>
                            <TrendIcon trend={summary.trend} />
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 右: 評価詳細 */}
        <div className="md:col-span-2">
          {assessmentLoading ? (
            <Card className="h-full flex items-center justify-center">
              <CardContent className="py-12">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400 mx-auto" />
              </CardContent>
            </Card>
          ) : assessment ? (
            <AssessmentDetail assessment={assessment} />
          ) : (
            <Card className="h-full flex items-center justify-center">
              <CardContent className="text-center text-gray-500 py-12">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>拠点を選択して詳細を表示</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// 評価詳細コンポーネント
function AssessmentDetail({ assessment }: { assessment: HumanRiskAssessment }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    scores: true,
    factors: true,
    actions: true,
    comment: false,
  });

  const toggleSection = (section: string) => {
    setExpanded((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const config = RISK_LEVEL_CONFIG[assessment.riskLevel];

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <Card className={config.bgColor}>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">{assessment.branchName}</h2>
              <p className="text-sm text-gray-600">
                評価期間: {assessment.period.from} 〜 {assessment.period.to}
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold">{assessment.totalScore}</div>
              <Badge variant={config.variant} size="md">
                {config.label}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* スコア詳細 */}
      <Card>
        <CardHeader
          className="cursor-pointer"
          onClick={() => toggleSection('scores')}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">カテゴリ別スコア</CardTitle>
            {expanded.scores ? (
              <ChevronUp className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            )}
          </div>
        </CardHeader>
        {expanded.scores && (
          <CardContent>
            <div className="space-y-4">
              {assessment.scores.map((score) => {
                const Icon = SCORE_CATEGORY_ICONS[score.category];
                return (
                  <div key={score.category}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-gray-500" />
                        <span className="text-sm font-medium">
                          {SCORE_CATEGORY_LABELS[score.category]}
                        </span>
                      </div>
                      <TrendIcon trend={score.trend} />
                    </div>
                    <ScoreBar score={score.score} />
                    {score.factors.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {score.factors.map((f, i) => (
                          <span
                            key={i}
                            className="text-xs bg-gray-100 px-2 py-0.5 rounded"
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        )}
      </Card>

      {/* 主因 */}
      <Card>
        <CardHeader
          className="cursor-pointer"
          onClick={() => toggleSection('factors')}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">リスク主因（最大3）</CardTitle>
            {expanded.factors ? (
              <ChevronUp className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            )}
          </div>
        </CardHeader>
        {expanded.factors && (
          <CardContent>
            {assessment.mainFactors.length === 0 ? (
              <div className="text-center text-gray-500 py-4">
                特筆すべきリスク要因は見られません
              </div>
            ) : (
              <div className="space-y-3">
                {assessment.mainFactors.map((factor) => (
                  <div
                    key={factor.id}
                    className="p-3 border rounded-lg"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">{factor.title}</span>
                      <Badge
                        variant={
                          factor.impact === 'high'
                            ? 'danger'
                            : factor.impact === 'medium'
                            ? 'warning'
                            : 'info'
                        }
                        size="sm"
                      >
                        {factor.impact === 'high'
                          ? '高'
                          : factor.impact === 'medium'
                          ? '中'
                          : '低'}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600">{factor.description}</p>
                    {factor.dataPoints.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {factor.dataPoints.map((d, i) => (
                          <span
                            key={i}
                            className="text-xs bg-gray-100 px-2 py-0.5 rounded"
                          >
                            {d}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* 参考アクション */}
      <Card>
        <CardHeader
          className="cursor-pointer"
          onClick={() => toggleSection('actions')}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">参考アクション（最大3）</CardTitle>
            {expanded.actions ? (
              <ChevronUp className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            )}
          </div>
        </CardHeader>
        {expanded.actions && (
          <CardContent>
            <div className="space-y-3">
              {assessment.suggestedActions.map((action) => (
                <div key={action.id} className="p-3 bg-blue-50 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-blue-800">
                      {action.title}
                    </span>
                    <Badge variant="info" size="sm">
                      {action.priority === 'high'
                        ? '優先度高'
                        : action.priority === 'medium'
                        ? '優先度中'
                        : '優先度低'}
                    </Badge>
                  </div>
                  <p className="text-sm text-blue-700">{action.description}</p>
                  {action.note && (
                    <p className="text-xs text-blue-600 mt-1 italic">
                      {action.note}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* AIコメント */}
      <Card>
        <CardHeader
          className="cursor-pointer"
          onClick={() => toggleSection('comment')}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">AI分析コメント</CardTitle>
            {expanded.comment ? (
              <ChevronUp className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            )}
          </div>
        </CardHeader>
        {expanded.comment && (
          <CardContent>
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-gray-500">概要：</span>
                <p>{assessment.aiComment.summary}</p>
              </div>
              {assessment.aiComment.observation && (
                <div>
                  <span className="text-gray-500">観察事項：</span>
                  <p>{assessment.aiComment.observation}</p>
                </div>
              )}
              {assessment.aiComment.consideration && (
                <div>
                  <span className="text-gray-500">検討事項：</span>
                  <p>{assessment.aiComment.consideration}</p>
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* 免責事項 */}
      <div className="text-xs text-gray-500 text-center p-2 bg-gray-100 rounded">
        {assessment.disclaimer}
      </div>
    </div>
  );
}
