'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardContent, Button, Badge, Textarea } from '@/components/ui';
import { Loading } from '@/components/Loading';
import {
  FileText,
  Play,
  AlertTriangle,
  Copy,
  Check,
  History,
  Building2,
  Stethoscope,
  Landmark,
  Users,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { hasMinRole } from '@/lib/auth';
import {
  AudienceType,
  AUDIENCE_LABELS,
  AUDIENCE_INTERESTS,
  AUDIENCE_COLORS,
  EXPLANATION_CHAR_LIMITS,
} from '@/types/explanation-generator';

interface GeneratedExplanation {
  id: string;
  createdAt: string;
  input: {
    theme: string;
    background: string;
    decision: string;
    risk: string;
    audience: AudienceType;
  };
  explanation: string;
  charCount: number;
}

const AUDIENCE_ICONS: Record<AudienceType, React.ReactNode> = {
  finance: <Building2 className="w-4 h-4" />,
  doctor: <Stethoscope className="w-4 h-4" />,
  government: <Landmark className="w-4 h-4" />,
  staff: <Users className="w-4 h-4" />,
  investor: <TrendingUp className="w-4 h-4" />,
};

const ALL_AUDIENCES: AudienceType[] = ['finance', 'doctor', 'government', 'staff', 'investor'];

export default function ExplanationPage() {
  return (
    <AuthGuard>
      <ExplanationContent />
    </AuthGuard>
  );
}

function ExplanationContent() {
  const { user, firebaseUser } = useAuth();
  const [explanations, setExplanations] = useState<GeneratedExplanation[]>([]);
  const [history, setHistory] = useState<GeneratedExplanation[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedAudience, setExpandedAudience] = useState<AudienceType | null>(null);

  // Form state
  const [theme, setTheme] = useState('');
  const [background, setBackground] = useState('');
  const [decision, setDecision] = useState('');
  const [risk, setRisk] = useState('');
  const [selectedAudiences, setSelectedAudiences] = useState<AudienceType[]>(['finance']);
  const [generateAll, setGenerateAll] = useState(false);

  const isLeaderOrAbove = user && hasMinRole(user.role, 'leader');

  // Load history
  const loadHistory = useCallback(async () => {
    if (!firebaseUser) return;

    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/ai/explanation?limit=10', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setHistory(data.explanations || []);
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  }, [firebaseUser]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Toggle audience selection
  const toggleAudience = (audience: AudienceType) => {
    if (generateAll) return;

    setSelectedAudiences((prev) =>
      prev.includes(audience)
        ? prev.filter((a) => a !== audience)
        : [...prev, audience]
    );
  };

  // Generate explanations
  const handleGenerate = async () => {
    if (!firebaseUser) return;

    const audiences = generateAll ? ALL_AUDIENCES : selectedAudiences;
    if (audiences.length === 0) {
      setError('少なくとも1つの対象者を選択してください');
      return;
    }

    if (!theme.trim() || !background.trim() || !decision.trim() || !risk.trim()) {
      setError('すべての項目を入力してください');
      return;
    }

    try {
      setGenerating(true);
      setError(null);
      setExplanations([]);

      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/ai/explanation', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          theme: theme.trim(),
          background: background.trim(),
          decision: decision.trim(),
          risk: risk.trim(),
          audiences,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '説明文生成に失敗しました');
      }

      const data = await res.json();
      setExplanations(data.explanations || []);
      setExpandedAudience(data.explanations?.[0]?.input?.audience || null);
      await loadHistory();
    } catch (err) {
      console.error('Failed to generate explanation:', err);
      setError(err instanceof Error ? err.message : 'エラーが発生しました');
    } finally {
      setGenerating(false);
    }
  };

  // Copy to clipboard
  const handleCopy = async (explanation: GeneratedExplanation) => {
    const text = formatExplanationAsText(explanation);
    await navigator.clipboard.writeText(text);
    setCopiedId(explanation.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Copy all explanations
  const handleCopyAll = async () => {
    if (explanations.length === 0) return;

    const text = explanations
      .map((e) => formatExplanationAsText(e))
      .join('\n\n---\n\n');
    await navigator.clipboard.writeText(text);
    setCopiedId('all');
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Export to PDF (using print)
  const handleExportPDF = () => {
    window.print();
  };

  // Load from history
  const handleLoadFromHistory = (item: GeneratedExplanation) => {
    setTheme(item.input.theme);
    setBackground(item.input.background);
    setDecision(item.input.decision);
    setRisk(item.input.risk);
    setSelectedAudiences([item.input.audience]);
    setShowHistory(false);
  };

  if (!isLeaderOrAbove) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <Header />
        <main className="max-w-4xl mx-auto px-4 py-6">
          <div className="text-center py-12">
            <p className="text-zinc-600">このページはリーダー以上のみアクセスできます</p>
          </div>
        </main>
      </div>
    );
  }

  if (loading) {
    return <Loading />;
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-6 safe-bottom print:max-w-none print:px-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 print:hidden">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-100 rounded-xl">
              <FileText className="w-6 h-6 text-violet-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-900">外部説明文ジェネレーター</h1>
              <p className="text-sm text-zinc-500">AI副社長による対象者別説明文作成</p>
            </div>
          </div>
          <div className="flex gap-2">
            {history.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowHistory(!showHistory)}
              >
                <History className="w-4 h-4 mr-1" />
                履歴
              </Button>
            )}
          </div>
        </div>

        {/* History Panel */}
        {showHistory && history.length > 0 && (
          <Card className="mb-6 print:hidden">
            <CardContent className="p-4">
              <h3 className="font-semibold text-zinc-900 mb-3">過去の説明文</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {history.map((h) => {
                  const colors = AUDIENCE_COLORS[h.input.audience];
                  return (
                    <button
                      key={h.id}
                      onClick={() => handleLoadFromHistory(h)}
                      className="w-full p-3 text-left bg-zinc-50 hover:bg-zinc-100 rounded-xl transition-colors"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-zinc-900 truncate">
                          {h.input.theme}
                        </span>
                        <Badge className={cn(colors.bg, colors.text, 'text-xs ml-2')}>
                          {AUDIENCE_LABELS[h.input.audience]}
                        </Badge>
                      </div>
                      <span className="text-xs text-zinc-400">
                        {new Date(h.createdAt).toLocaleDateString('ja-JP')}
                      </span>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {error && (
          <Card className="p-4 mb-6 bg-red-50 border-red-200 print:hidden">
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm">{error}</span>
            </div>
          </Card>
        )}

        {/* Input Form */}
        <Card className="mb-6 print:hidden">
          <CardContent className="p-6">
            <h2 className="font-semibold text-zinc-900 mb-4">入力情報</h2>

            <div className="space-y-4">
              {/* Theme */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  テーマ <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  placeholder="例: 新規施設開設について"
                  className="w-full p-2 border border-zinc-300 rounded-lg"
                />
              </div>

              {/* Background */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  背景 <span className="text-red-500">*</span>
                </label>
                <Textarea
                  value={background}
                  onChange={(e) => setBackground(e.target.value)}
                  placeholder="この決定に至った経緯や理由を記載..."
                  className="h-24"
                />
              </div>

              {/* Decision */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  決定事項 <span className="text-red-500">*</span>
                </label>
                <Textarea
                  value={decision}
                  onChange={(e) => setDecision(e.target.value)}
                  placeholder="結論・決定内容を記載..."
                  className="h-20"
                />
              </div>

              {/* Risk */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">
                  リスク・注意点 <span className="text-red-500">*</span>
                </label>
                <Textarea
                  value={risk}
                  onChange={(e) => setRisk(e.target.value)}
                  placeholder="懸念点や注意すべき事項を記載..."
                  className="h-20"
                />
              </div>

              {/* Audience Selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-zinc-700">
                    対象者 <span className="text-red-500">*</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-zinc-600">
                    <input
                      type="checkbox"
                      checked={generateAll}
                      onChange={(e) => {
                        setGenerateAll(e.target.checked);
                        if (e.target.checked) {
                          setSelectedAudiences(ALL_AUDIENCES);
                        }
                      }}
                      className="rounded"
                    />
                    全対象者に一括生成
                  </label>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  {ALL_AUDIENCES.map((audience) => {
                    const colors = AUDIENCE_COLORS[audience];
                    const isSelected = generateAll || selectedAudiences.includes(audience);
                    return (
                      <button
                        key={audience}
                        onClick={() => toggleAudience(audience)}
                        disabled={generateAll}
                        className={cn(
                          'p-3 rounded-xl border-2 transition-all text-center',
                          isSelected
                            ? cn(colors.bg, colors.border)
                            : 'bg-zinc-50 border-zinc-200 hover:border-zinc-300',
                          generateAll && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        <div className={cn(
                          'flex items-center justify-center mb-1',
                          isSelected ? colors.text : 'text-zinc-400'
                        )}>
                          {AUDIENCE_ICONS[audience]}
                        </div>
                        <span className={cn(
                          'text-xs font-medium',
                          isSelected ? colors.text : 'text-zinc-500'
                        )}>
                          {AUDIENCE_LABELS[audience]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={generating}
              className="w-full mt-6"
            >
              {generating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  説明文生成中...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  説明文を生成
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Generated Explanations */}
        {explanations.length > 0 && (
          <div>
            {/* Export Buttons */}
            <div className="flex gap-2 mb-4 print:hidden">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyAll}
              >
                {copiedId === 'all' ? (
                  <Check className="w-4 h-4 mr-1 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4 mr-1" />
                )}
                {copiedId === 'all' ? 'コピー完了' : 'すべてコピー'}
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportPDF}>
                <FileText className="w-4 h-4 mr-1" />
                PDF出力
              </Button>
            </div>

            {/* Print Header */}
            <div className="hidden print:block mb-6">
              <h1 className="text-2xl font-bold text-zinc-900">外部説明文</h1>
              <p className="text-sm text-zinc-500">テーマ: {theme}</p>
              <p className="text-xs text-zinc-400">
                生成日時: {new Date().toLocaleString('ja-JP')}
              </p>
            </div>

            {/* Explanation Cards */}
            <div className="space-y-4">
              {explanations.map((explanation) => {
                const colors = AUDIENCE_COLORS[explanation.input.audience];
                const isExpanded = expandedAudience === explanation.input.audience;

                return (
                  <Card
                    key={explanation.id}
                    className={cn(colors.border, 'overflow-hidden print:break-inside-avoid')}
                  >
                    <button
                      onClick={() => setExpandedAudience(isExpanded ? null : explanation.input.audience)}
                      className={cn(
                        'w-full p-4 flex items-center justify-between',
                        colors.bg,
                        'print:pointer-events-none'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn('p-2 rounded-lg', colors.bg, colors.text)}>
                          {AUDIENCE_ICONS[explanation.input.audience]}
                        </div>
                        <div className="text-left">
                          <p className={cn('font-semibold', colors.text)}>
                            {AUDIENCE_LABELS[explanation.input.audience]}向け
                          </p>
                          <p className="text-sm text-zinc-500">
                            {explanation.charCount}文字
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopy(explanation);
                          }}
                          className="print:hidden"
                        >
                          {copiedId === explanation.id ? (
                            <Check className="w-4 h-4 text-green-500" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                        <div className="print:hidden">
                          {isExpanded ? (
                            <ChevronUp className="w-5 h-5 text-zinc-400" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-zinc-400" />
                          )}
                        </div>
                      </div>
                    </button>

                    {(isExpanded || true) && (
                      <CardContent className={cn('p-6', !isExpanded && 'hidden print:block')}>
                        {/* Audience Interests */}
                        <div className="mb-4 p-3 bg-zinc-50 rounded-lg print:hidden">
                          <p className="text-xs font-medium text-zinc-500 mb-2">関心軸</p>
                          <div className="flex flex-wrap gap-2">
                            {AUDIENCE_INTERESTS[explanation.input.audience].map((interest, idx) => (
                              <span
                                key={idx}
                                className={cn('text-xs px-2 py-1 rounded-full', colors.bg, colors.text)}
                              >
                                {interest}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Explanation Text */}
                        <div className="prose prose-sm max-w-none">
                          <p className="text-zinc-700 whitespace-pre-wrap leading-relaxed">
                            {explanation.explanation}
                          </p>
                        </div>

                        {/* Character Count */}
                        <div className="mt-4 pt-4 border-t border-zinc-100 flex justify-between items-center text-xs text-zinc-400">
                          <span>
                            文字数: {explanation.charCount}
                            {explanation.charCount < EXPLANATION_CHAR_LIMITS.min && (
                              <span className="text-amber-500 ml-2">
                                (目標: {EXPLANATION_CHAR_LIMITS.min}〜{EXPLANATION_CHAR_LIMITS.max}文字)
                              </span>
                            )}
                          </span>
                          <span className="print:hidden">
                            {new Date(explanation.createdAt).toLocaleString('ja-JP')}
                          </span>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>

            {/* Disclaimer */}
            <div className="mt-6 p-4 bg-zinc-100 border border-zinc-200 rounded-xl print:hidden">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-zinc-500 shrink-0 mt-0.5" />
                <div className="text-sm text-zinc-600">
                  <p className="font-medium mb-1">ご確認ください</p>
                  <p>
                    AI生成の説明文は下書きとしてご利用ください。
                    外部への送付前に、内容の正確性と適切性を必ずご確認ください。
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
          .print\\:break-inside-avoid { break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}

// Helper function
function formatExplanationAsText(explanation: GeneratedExplanation): string {
  const lines: string[] = [];

  lines.push(`【${AUDIENCE_LABELS[explanation.input.audience]}向け説明文】`);
  lines.push('');
  lines.push(`テーマ: ${explanation.input.theme}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(explanation.explanation);
  lines.push('');
  lines.push('---');
  lines.push(`文字数: ${explanation.charCount}`);
  lines.push(`生成日時: ${new Date(explanation.createdAt).toLocaleString('ja-JP')}`);

  return lines.join('\n');
}
