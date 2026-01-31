'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import {
  AlertCircle,
  Brain,
  Send,
  FileText,
  CheckCircle,
  Loader2,
  AlertTriangle,
  ThumbsUp,
  ThumbsDown,
  Scale,
  Lightbulb,
  History,
  Bell,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type {
  ConsultationSession,
  AIAnalysis,
  YoshidaJudgmentLog,
  ConsultationCategory,
  UrgencyLevel,
} from '@/types/executive-ai';

// カテゴリ選択肢
const CATEGORY_OPTIONS = [
  { value: 'hr', label: '人事・労務' },
  { value: 'finance', label: '財務・予算' },
  { value: 'operation', label: '業務・運営' },
  { value: 'compliance', label: 'コンプライアンス' },
  { value: 'strategy', label: '経営戦略' },
  { value: 'customer', label: '顧客対応' },
  { value: 'other', label: 'その他' },
];

// 緊急度選択肢
const URGENCY_OPTIONS = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
  { value: 'critical', label: '緊急' },
];

// カテゴリラベル
const CATEGORY_LABELS: Record<ConsultationCategory, string> = {
  hr: '人事・労務',
  finance: '財務・予算',
  operation: '業務・運営',
  compliance: 'コンプライアンス',
  strategy: '経営戦略',
  customer: '顧客対応',
  other: 'その他',
};

// 緊急度スタイル
const URGENCY_STYLES: Record<UrgencyLevel, string> = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

// リスクレベルバッジ
function RiskBadge({ level }: { level: 'low' | 'medium' | 'high' }) {
  const colors = {
    low: 'bg-green-100 text-green-800',
    medium: 'bg-yellow-100 text-yellow-800',
    high: 'bg-red-100 text-red-800',
  };
  const labels = { low: '低リスク', medium: '中リスク', high: '高リスク' };
  return (
    <span className={`px-2 py-1 rounded text-xs ${colors[level]}`}>
      {labels[level]}
    </span>
  );
}

export default function ExecutiveAIPage() {
  // 状態
  const [activeTab, setActiveTab] = useState<'consultation' | 'history' | 'logs'>('consultation');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 相談入力
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<ConsultationCategory>('other');
  const [urgency, setUrgency] = useState<UrgencyLevel>('medium');
  const [ifScenarios, setIfScenarios] = useState('');

  // セッション
  const [currentSession, setCurrentSession] = useState<ConsultationSession | null>(null);
  const [sessions, setSessions] = useState<ConsultationSession[]>([]);

  // 判断ログ
  const [judgmentLogs, setJudgmentLogs] = useState<YoshidaJudgmentLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // エスカレーション
  const [escalating, setEscalating] = useState(false);
  const [escalationSent, setEscalationSent] = useState(false);

  // ダミーユーザー情報（実際の実装ではセッションから取得）
  const dummyUser = {
    id: 'manager-001',
    name: '拔屋 壮勇',
    role: 'manager' as const,
    branchId: 'branch-001',
  };

  // セッション一覧取得
  const fetchSessions = async () => {
    try {
      const res = await fetch(
        `/api/executive-ai/consultation?consultantId=${dummyUser.id}&limit=10`
      );
      const data = await res.json();
      if (data.success) {
        setSessions(data.sessions);
      }
    } catch (e) {
      console.error('セッション取得エラー:', e);
    }
  };

  // 判断ログ取得
  const fetchJudgmentLogs = async () => {
    setLogsLoading(true);
    try {
      const res = await fetch(
        `/api/executive-ai/judgment-logs?branchId=${dummyUser.branchId}&limit=20`
      );
      const data = await res.json();
      if (data.success) {
        setJudgmentLogs(data.logs);
      }
    } catch (e) {
      console.error('判断ログ取得エラー:', e);
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
    fetchJudgmentLogs();
  }, []);

  // 相談開始
  const handleStartConsultation = async () => {
    if (!content.trim()) {
      setError('相談内容を入力してください');
      return;
    }

    setLoading(true);
    setError(null);
    setEscalationSent(false);

    try {
      const res = await fetch('/api/executive-ai/consultation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          category,
          urgency,
          ifScenarios: ifScenarios
            .split('\n')
            .filter((s) => s.trim())
            .map((s) => s.trim()),
          consultantId: dummyUser.id,
          consultantName: dummyUser.name,
          consultantRole: dummyUser.role,
          branchId: dummyUser.branchId,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setCurrentSession(data.session);
        fetchSessions();
      } else {
        setError(data.error || '相談の開始に失敗しました');
      }
    } catch (e) {
      setError('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  // エスカレーション送信
  const handleEscalation = async () => {
    if (!currentSession) return;

    setEscalating(true);
    try {
      const res = await fetch('/api/executive-ai/escalation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSession.id,
          priority: urgency,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setEscalationSent(true);
        fetchSessions();
      } else {
        setError(data.error || 'エスカレーションに失敗しました');
      }
    } catch (e) {
      setError('通信エラーが発生しました');
    } finally {
      setEscalating(false);
    }
  };

  // 新規相談
  const handleNewConsultation = () => {
    setCurrentSession(null);
    setContent('');
    setIfScenarios('');
    setEscalationSent(false);
    setError(null);
  };

  // 過去セッション選択
  const handleSelectSession = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/executive-ai/consultation/${sessionId}`);
      const data = await res.json();
      if (data.success) {
        setCurrentSession(data.session);
        setContent(data.session.request.content);
        setCategory(data.session.request.category || 'other');
        setUrgency(data.session.request.urgency || 'medium');
        setIfScenarios(data.session.request.ifScenarios?.join('\n') || '');
        setActiveTab('consultation');
      }
    } catch (e) {
      console.error('セッション取得エラー:', e);
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6 text-purple-600" />
            幹部AI（AI副社長）
          </h1>
          <p className="text-gray-600 mt-1">
            相談を整理し、吉田に届く前に考えを整えます
          </p>
        </div>
        <Badge variant="info">
          {dummyUser.name}（{dummyUser.role === 'manager' ? 'マネージャー' : '幹部'}）
        </Badge>
      </div>

      {/* 注意事項 */}
      <Card className="bg-amber-50 border-amber-200">
        <CardContent className="py-3">
          <div className="flex items-start gap-2 text-amber-800 text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              <strong>AIは決断・承認・指示を行いません。</strong>
              分析結果は参考情報であり、最終判断は吉田が行います。
            </div>
          </div>
        </CardContent>
      </Card>

      {/* タブ切り替え */}
      <div className="flex gap-2 border-b pb-2">
        <button
          onClick={() => setActiveTab('consultation')}
          className={`px-4 py-2 rounded-t-lg flex items-center gap-1 ${
            activeTab === 'consultation'
              ? 'bg-purple-100 text-purple-700 font-medium'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Brain className="h-4 w-4" />
          相談
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 rounded-t-lg flex items-center gap-1 ${
            activeTab === 'history'
              ? 'bg-purple-100 text-purple-700 font-medium'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <History className="h-4 w-4" />
          履歴
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`px-4 py-2 rounded-t-lg flex items-center gap-1 ${
            activeTab === 'logs'
              ? 'bg-purple-100 text-purple-700 font-medium'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <FileText className="h-4 w-4" />
          判断ログ
        </button>
      </div>

      {/* 相談タブ */}
      {activeTab === 'consultation' && (
        <div className="grid md:grid-cols-2 gap-6">
          {/* 左：入力エリア */}
          <Card>
            <CardHeader>
              <CardTitle>相談内容</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* カテゴリ・緊急度 */}
              <div className="grid grid-cols-2 gap-4">
                <Select
                  label="カテゴリ"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ConsultationCategory)}
                  options={CATEGORY_OPTIONS}
                />
                <Select
                  label="緊急度"
                  value={urgency}
                  onChange={(e) => setUrgency(e.target.value as UrgencyLevel)}
                  options={URGENCY_OPTIONS}
                />
              </div>

              {/* 相談内容 */}
              <Textarea
                label="相談内容"
                required
                placeholder="例：来月の人員配置について相談したい。A拠点で2名退職予定だが、採用が間に合わない可能性がある。"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={5}
                disabled={loading}
              />

              {/* ifシナリオ */}
              <Textarea
                label="検討したいシナリオ（任意）"
                placeholder="例：&#10;もし採用が間に合わなかったら&#10;もし派遣を増やしたら"
                value={ifScenarios}
                onChange={(e) => setIfScenarios(e.target.value)}
                rows={3}
                disabled={loading}
                hint="1行に1つのシナリオを入力"
              />

              {/* エラー表示 */}
              {error && (
                <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-2 rounded">
                  <AlertCircle className="h-4 w-4" />
                  {error}
                </div>
              )}

              {/* ボタン */}
              <div className="flex gap-2">
                <Button
                  onClick={handleStartConsultation}
                  disabled={loading || !content.trim()}
                  className="flex-1"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      分析中...
                    </>
                  ) : (
                    <>
                      <Brain className="h-4 w-4 mr-2" />
                      AI分析を開始
                    </>
                  )}
                </Button>
                {currentSession && (
                  <Button variant="secondary" onClick={handleNewConsultation}>
                    新規相談
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 右：分析結果 */}
          <div className="space-y-4">
            {currentSession?.analysis ? (
              <AnalysisDisplay
                analysis={currentSession.analysis}
                onEscalate={handleEscalation}
                escalating={escalating}
                escalationSent={escalationSent}
                escalationStatus={currentSession.escalation.status}
              />
            ) : (
              <Card className="h-full flex items-center justify-center">
                <CardContent className="text-center text-gray-500 py-12">
                  <Brain className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p>相談内容を入力してAI分析を開始してください</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* 履歴タブ */}
      {activeTab === 'history' && (
        <Card>
          <CardHeader>
            <CardTitle>相談履歴</CardTitle>
          </CardHeader>
          <CardContent>
            {sessions.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                相談履歴がありません
              </div>
            ) : (
              <div className="space-y-3">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className="p-4 border rounded-lg hover:bg-gray-50 cursor-pointer"
                    onClick={() => handleSelectSession(session.id)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="default">
                          {CATEGORY_LABELS[session.request.category || 'other']}
                        </Badge>
                        {session.request.urgency && (
                          <span
                            className={`px-2 py-0.5 rounded text-xs ${
                              URGENCY_STYLES[session.request.urgency]
                            }`}
                          >
                            {URGENCY_OPTIONS.find((o) => o.value === session.request.urgency)?.label}
                          </span>
                        )}
                        {session.escalation.status === 'sent' && (
                          <Badge variant="info" className="flex items-center gap-1">
                            <Bell className="h-3 w-3" />
                            エスカレーション済
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">
                        {new Date(session.createdAt).toLocaleString('ja-JP')}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 line-clamp-2">
                      {session.request.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 判断ログタブ */}
      {activeTab === 'logs' && (
        <Card>
          <CardHeader>
            <CardTitle>吉田判断ログ</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500 mb-4">
              過去の判断事例（読み取り専用、自拠点のみ）
            </p>
            {logsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : judgmentLogs.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                判断ログがありません
              </div>
            ) : (
              <div className="space-y-4">
                {judgmentLogs.map((log) => (
                  <div key={log.id} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium">{log.title}</h4>
                      <span className="text-xs text-gray-500">
                        {new Date(log.decidedAt).toLocaleDateString('ja-JP')}
                      </span>
                    </div>
                    <Badge variant="default" className="mb-2">
                      {CATEGORY_LABELS[log.category]}
                    </Badge>
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="text-gray-500">状況：</span>
                        <span>{log.situation}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">判断：</span>
                        <span className="font-medium">{log.decision}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">理由：</span>
                        <span>{log.reasoning}</span>
                      </div>
                      {log.outcome && (
                        <div>
                          <span className="text-gray-500">結果：</span>
                          <span>{log.outcome}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// 分析結果表示コンポーネント
function AnalysisDisplay({
  analysis,
  onEscalate,
  escalating,
  escalationSent,
  escalationStatus,
}: {
  analysis: AIAnalysis;
  onEscalate: () => void;
  escalating: boolean;
  escalationSent: boolean;
  escalationStatus: string;
}) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    summary: true,
    issues: true,
    options: true,
    similarity: false,
    escalation: true,
  });

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <div className="space-y-4">
      {/* 要約 */}
      <Card>
        <CardHeader
          className="cursor-pointer"
          onClick={() => toggleSection('summary')}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-blue-600" />
              要約（事実）
            </CardTitle>
            {expandedSections.summary ? (
              <ChevronUp className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            )}
          </div>
        </CardHeader>
        {expandedSections.summary && (
          <CardContent>
            <ul className="list-disc list-inside space-y-1 text-sm">
              {analysis.summary.facts.map((fact, i) => (
                <li key={i}>{fact}</li>
              ))}
            </ul>
            {analysis.summary.context && (
              <p className="text-sm text-gray-600 mt-2">{analysis.summary.context}</p>
            )}
          </CardContent>
        )}
      </Card>

      {/* 論点 */}
      <Card>
        <CardHeader
          className="cursor-pointer"
          onClick={() => toggleSection('issues')}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Scale className="h-4 w-4 text-orange-600" />
              論点（最大3）
            </CardTitle>
            {expandedSections.issues ? (
              <ChevronUp className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            )}
          </div>
        </CardHeader>
        {expandedSections.issues && (
          <CardContent>
            <div className="space-y-3">
              {analysis.issues.map((issue) => (
                <div key={issue.id} className="p-3 bg-orange-50 rounded">
                  <div className="font-medium text-sm">{issue.title}</div>
                  <div className="text-xs text-gray-600 mt-1">{issue.description}</div>
                  <Badge variant="default" className="mt-2">
                    視点：{issue.perspective}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* 選択肢 */}
      <Card>
        <CardHeader
          className="cursor-pointer"
          onClick={() => toggleSection('options')}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Lightbulb className="h-4 w-4 text-green-600" />
              選択肢（最大3）
            </CardTitle>
            {expandedSections.options ? (
              <ChevronUp className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            )}
          </div>
        </CardHeader>
        {expandedSections.options && (
          <CardContent>
            <div className="space-y-3">
              {analysis.options.map((option) => (
                <div key={option.id} className="p-3 border rounded">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">{option.title}</span>
                    <RiskBadge level={option.riskLevel} />
                  </div>
                  <p className="text-xs text-gray-600 mb-2">{option.description}</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <div className="flex items-center gap-1 text-green-700 mb-1">
                        <ThumbsUp className="h-3 w-3" />
                        メリット
                      </div>
                      <ul className="list-disc list-inside text-gray-600">
                        {option.pros.map((pro, i) => (
                          <li key={i}>{pro}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 text-red-700 mb-1">
                        <ThumbsDown className="h-3 w-3" />
                        デメリット
                      </div>
                      <ul className="list-disc list-inside text-gray-600">
                        {option.cons.map((con, i) => (
                          <li key={i}>{con}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* 判断類似度 */}
      <Card>
        <CardHeader
          className="cursor-pointer"
          onClick={() => toggleSection('similarity')}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4 text-purple-600" />
              判断類似度
              <span className="text-2xl font-bold text-purple-600 ml-2">
                {analysis.judgmentSimilarity.percentage}%
              </span>
            </CardTitle>
            {expandedSections.similarity ? (
              <ChevronUp className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            )}
          </div>
        </CardHeader>
        {expandedSections.similarity && (
          <CardContent>
            <p className="text-sm text-gray-600 mb-3">
              {analysis.judgmentSimilarity.note}
            </p>
            {analysis.judgmentSimilarity.similarCases.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs text-gray-500">類似事例：</div>
                {analysis.judgmentSimilarity.similarCases.slice(0, 3).map((c) => (
                  <div key={c.id} className="text-xs p-2 bg-gray-50 rounded">
                    <div className="flex justify-between">
                      <span className="font-medium">{c.title}</span>
                      <span className="text-purple-600">{c.similarity}%</span>
                    </div>
                    <div className="text-gray-600 mt-1">{c.decision}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* エスカレーション下書き */}
      <Card className="border-purple-200 bg-purple-50">
        <CardHeader
          className="cursor-pointer"
          onClick={() => toggleSection('escalation')}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4 text-purple-600" />
              エスカレーション下書き
            </CardTitle>
            {expandedSections.escalation ? (
              <ChevronUp className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            )}
          </div>
        </CardHeader>
        {expandedSections.escalation && (
          <CardContent>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-gray-500">件名：</span>
                <span className="font-medium">{analysis.escalationDraft.subject}</span>
              </div>
              <div>
                <span className="text-gray-500">要点：</span>
                <ul className="list-disc list-inside mt-1">
                  {analysis.escalationDraft.keyPoints.map((point, i) => (
                    <li key={i}>{point}</li>
                  ))}
                </ul>
              </div>
              <div className="p-2 bg-white rounded text-gray-700">
                {analysis.escalationDraft.body}
              </div>
              <div className="text-xs text-gray-500 italic">
                提案アクション：{analysis.escalationDraft.suggestedAction}
              </div>
            </div>

            {/* エスカレーションボタン */}
            <div className="mt-4">
              {escalationStatus === 'sent' || escalationSent ? (
                <div className="flex items-center gap-2 text-green-600 bg-green-50 p-2 rounded">
                  <CheckCircle className="h-4 w-4" />
                  吉田にエスカレーション済み
                </div>
              ) : (
                <Button
                  onClick={onEscalate}
                  disabled={escalating}
                  className="w-full bg-purple-600 hover:bg-purple-700"
                >
                  {escalating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      送信中...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      吉田にエスカレーション
                    </>
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* 免責事項 */}
      <div className="text-xs text-gray-500 text-center p-2 bg-gray-100 rounded">
        {analysis.disclaimer}
      </div>
    </div>
  );
}
