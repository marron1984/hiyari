'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AuthGuard } from '@/components/AuthGuard';
import { Header } from '@/components/Header';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@/components/ui';
import { Loading } from '@/components/Loading';
import { PreviewBadge } from '@/components/PreviewBadge';
import { isAiVpOwner } from '@/lib/auth';
import { getAiTemplates, INITIAL_TEMPLATES } from '@/lib/ai-vp-messages';
import {
  AiTemplate,
  AiReplyRiskLevel,
  AiReplyCategory,
  AI_REPLY_RISK_COLORS,
  AI_REPLY_CATEGORY_LABELS,
} from '@/types/ai-vp';
import {
  Bot,
  ArrowLeft,
  Shield,
  FileText,
  AlertTriangle,
  CheckCircle,
  Clock,
  Settings,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Info,
} from 'lucide-react';

// ポリシー定義
const POLICY_DEFINITIONS = {
  autoReply: {
    title: '自動返信ルール',
    description: 'L1（低リスク）の質問は自動で返信します',
    rules: [
      '手順確認・定型案内は自動返信',
      '不足情報がある場合は聞き返し',
      '15分以内に返信を試みる',
    ],
  },
  escalation: {
    title: 'エスカレーションルール',
    description: 'L2/L3は承認フローに回します',
    rules: [
      'L2: 管理者承認（対外連絡、例外判断）',
      'L3: 吉田承認必須（金銭、人事、リスク）',
      '判断に迷う場合は必ずL3に上げる',
    ],
  },
  prohibited: {
    title: '禁止事項',
    description: 'AIは以下の判断を行いません',
    rules: [
      '支払実行・契約確定',
      '採用・解雇・懲戒決定',
      '医療判断・診断',
      '行政対応の最終回答',
    ],
  },
};

export default function AiPoliciesPage() {
  return (
    <AuthGuard>
      <AiPoliciesContent />
    </AuthGuard>
  );
}

function AiPoliciesContent() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<AiTemplate[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<AiReplyCategory>>(new Set());

  const canAccess = user && isAiVpOwner(user.email);

  useEffect(() => {
    const fetchData = async () => {
      if (!canAccess || !user?.email) {
        setLoading(false);
        return;
      }

      try {
        // Firestoreからテンプレートを取得
        const firestoreTemplates = await getAiTemplates(user.email);

        if (firestoreTemplates.length > 0) {
          setTemplates(firestoreTemplates);
        } else {
          // Firestoreにデータがない場合はデフォルトテンプレートを表示
          setTemplates(INITIAL_TEMPLATES.map((t, idx) => ({
            ...t,
            id: `default_${idx}`,
            createdAt: new Date(),
          })));
        }
      } catch (error) {
        console.error('Failed to fetch templates:', error);
        // フォールバック：デフォルトテンプレートを表示
        setTemplates(INITIAL_TEMPLATES.map((t, idx) => ({
          ...t,
          id: `default_${idx}`,
          createdAt: new Date(),
        })));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [canAccess, user?.email]);

  const toggleCategory = (category: AiReplyCategory) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  if (loading) {
    return (
      <>
        <Header />
        <Loading text="ポリシーを読み込み中..." />
      </>
    );
  }

  if (!canAccess) {
    return (
      <>
        <Header />
        <main className="pb-8">
          <div className="max-w-4xl mx-auto px-4 py-12 text-center">
            <Shield className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <h1 className="text-xl font-bold text-gray-900 mb-2">アクセス権限がありません</h1>
            <p className="text-gray-500">この機能は吉田のみアクセス可能です。</p>
          </div>
        </main>
      </>
    );
  }

  // カテゴリ別にテンプレートをグループ化
  const templatesByCategory = templates.reduce((acc, tpl) => {
    if (!acc[tpl.category]) {
      acc[tpl.category] = [];
    }
    acc[tpl.category].push(tpl);
    return acc;
  }, {} as Record<AiReplyCategory, AiTemplate[]>);

  // リスクレベル別の統計
  const riskStats = {
    L1: templates.filter(t => t.riskLevel === 'L1').length,
    L2: templates.filter(t => t.riskLevel === 'L2').length,
    L3: templates.filter(t => t.riskLevel === 'L3').length,
  };

  return (
    <>
      <Header />
      <PreviewBadge />
      <main className="pb-8">
        <div className="max-w-5xl mx-auto px-4 py-6">
          {/* ヘッダー */}
          <div className="flex items-center mb-6">
            <Link href="/dashboard/ai/inbox" className="p-2 -ml-2 rounded-lg hover:bg-gray-100">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <div className="ml-2 flex-1">
              <h1 className="text-xl font-bold text-gray-900 flex items-center">
                <Shield className="w-5 h-5 mr-2 text-indigo-600" />
                返信ポリシー
              </h1>
              <p className="text-sm text-gray-500">
                自動返信ルールとFAQテンプレート
              </p>
            </div>
          </div>

          {/* ポリシー概要 */}
          <Card className="mb-6 bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-800">
                    吉田返信の動作ポリシー
                  </p>
                  <p className="text-xs text-blue-600 mt-1">
                    スタッフには吉田本人からの返信として送信されます。
                    不可逆な判断（支払実行、契約確定、懲戒等）は必ず吉田が最終承認します。
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* リスクレベル統計 */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Card className="p-4 bg-green-50 border-green-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-green-700">L1（自動返信）</p>
                  <p className="text-2xl font-bold text-green-600">{riskStats.L1}</p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-300" />
              </div>
            </Card>
            <Card className="p-4 bg-yellow-50 border-yellow-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-yellow-700">L2（管理者承認）</p>
                  <p className="text-2xl font-bold text-yellow-600">{riskStats.L2}</p>
                </div>
                <Clock className="w-8 h-8 text-yellow-300" />
              </div>
            </Card>
            <Card className="p-4 bg-red-50 border-red-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-red-700">L3（吉田承認）</p>
                  <p className="text-2xl font-bold text-red-600">{riskStats.L3}</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-red-300" />
              </div>
            </Card>
          </div>

          {/* ポリシー定義 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {Object.entries(POLICY_DEFINITIONS).map(([key, policy]) => (
              <Card key={key}>
                <CardHeader>
                  <CardTitle className="text-sm">{policy.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-gray-500 mb-2">{policy.description}</p>
                  <ul className="text-xs space-y-1">
                    {policy.rules.map((rule, idx) => (
                      <li key={idx} className="flex items-start gap-1">
                        <span className="text-gray-400">•</span>
                        <span className="text-gray-700">{rule}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* FAQテンプレート一覧 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center">
                <BookOpen className="w-4 h-4 mr-2" />
                FAQテンプレート（{templates.length}件）
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(Object.keys(AI_REPLY_CATEGORY_LABELS) as AiReplyCategory[]).map((category) => {
                  const categoryTemplates = templatesByCategory[category] || [];
                  if (categoryTemplates.length === 0) return null;

                  const isExpanded = expandedCategories.has(category);

                  return (
                    <div key={category} className="border rounded-lg overflow-hidden">
                      <button
                        onClick={() => toggleCategory(category)}
                        className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-gray-500" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-500" />
                          )}
                          <span className="font-medium text-gray-900">
                            {AI_REPLY_CATEGORY_LABELS[category]}
                          </span>
                          <Badge className="bg-gray-200 text-gray-700">
                            {categoryTemplates.length}
                          </Badge>
                        </div>
                        <div className="flex gap-1">
                          {['L1', 'L2', 'L3'].map((level) => {
                            const count = categoryTemplates.filter(
                              t => t.riskLevel === level
                            ).length;
                            if (count === 0) return null;
                            return (
                              <Badge
                                key={level}
                                className={`${AI_REPLY_RISK_COLORS[level as AiReplyRiskLevel].bg} ${AI_REPLY_RISK_COLORS[level as AiReplyRiskLevel].text} text-xs`}
                              >
                                {level}: {count}
                              </Badge>
                            );
                          })}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="divide-y">
                          {categoryTemplates.map((tpl) => (
                            <div key={tpl.id} className="p-3 hover:bg-gray-50">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge
                                  className={`${AI_REPLY_RISK_COLORS[tpl.riskLevel].bg} ${AI_REPLY_RISK_COLORS[tpl.riskLevel].text}`}
                                >
                                  {tpl.riskLevel}
                                </Badge>
                                <span className="font-medium text-gray-900">
                                  {tpl.title}
                                </span>
                              </div>
                              <p className="text-sm text-gray-600 line-clamp-2 mb-2">
                                {tpl.templateText.split('\n')[0]}
                              </p>
                              {tpl.keywords && (
                                <div className="flex flex-wrap gap-1">
                                  {tpl.keywords.map((kw, idx) => (
                                    <span
                                      key={idx}
                                      className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded"
                                    >
                                      {kw}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
