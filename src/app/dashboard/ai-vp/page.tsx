'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent, Badge } from '@/components/ui';
import {
  Brain,
  Users,
  Heart,
  Calculator,
  BookOpen,
  MessageSquare,
  Inbox,
  ListTodo,
  Shield,
  Activity,
  Clock,
  ArrowRight,
  Lock,
  HelpCircle,
  AlertTriangle,
  TrendingUp,
  Zap,
  Target,
  Flame,
  Calendar,
  ChevronRight,
  Building2,
  ExternalLink,
} from 'lucide-react';
import type { ActionCandidate, BusinessTop3Result } from '@/lib/aiVp/businessTop3';

// 事業別Top3 APIレスポンス型
interface BusinessTop3ApiResponse {
  businessUnits: BusinessTop3Result[];
  topActions: ActionCandidate[];
  globalAlerts: ActionCandidate[];
  generatedAt: string;
}
import {
  OS_FEATURES,
  calculateCompositeScore,
  type OSFeature,
} from '@/config/osFeatures';

// メニュー項目の型定義
interface MenuItem {
  href: string;
  icon: typeof Brain;
  title: string;
  description: string;
  bgColor: string;
  iconColor: string;
  status: 'available' | 'preparing';
}

interface MenuCategory {
  title: string;
  description: string;
  items: MenuItem[];
}

// AI副社長機能メニュー
const MENU_CATEGORIES: MenuCategory[] = [
  {
    title: '予測・分析',
    description: '人材・組織の状態を可視化',
    items: [
      {
        href: '/dashboard/ai-vp/human-risk',
        icon: Users,
        title: '人材リスク予測',
        description: '離職・メンタル不調の早期検知',
        bgColor: 'bg-red-100',
        iconColor: 'text-red-600',
        status: 'available',
      },
      {
        href: '/dashboard/ai/organization-health',
        icon: Heart,
        title: '組織健康モニタリング',
        description: 'チームの健康度を可視化',
        bgColor: 'bg-pink-100',
        iconColor: 'text-pink-600',
        status: 'available',
      },
      {
        href: '/admin/ai-vp/condition',
        icon: Activity,
        title: 'コンディション管理',
        description: 'スタッフの日々の状態を把握',
        bgColor: 'bg-emerald-100',
        iconColor: 'text-emerald-600',
        status: 'available',
      },
    ],
  },
  {
    title: '意思決定支援',
    description: 'AIによる判断・説明のサポート',
    items: [
      {
        href: '/dashboard/ai-vp/simulation',
        icon: Calculator,
        title: 'シミュレーション',
        description: '採用・離職の影響を予測',
        bgColor: 'bg-indigo-100',
        iconColor: 'text-indigo-600',
        status: 'preparing',
      },
      {
        href: '/dashboard/ai-vp/yoshida-learning',
        icon: BookOpen,
        title: '吉田式学習',
        description: '意思決定パターンをAIが学習',
        bgColor: 'bg-amber-100',
        iconColor: 'text-amber-600',
        status: 'preparing',
      },
      {
        href: '/dashboard/ai-vp/explanation',
        icon: MessageSquare,
        title: 'AI説明文作成',
        description: '金融・医療・行政向け説明生成',
        bgColor: 'bg-cyan-100',
        iconColor: 'text-cyan-600',
        status: 'preparing',
      },
    ],
  },
  {
    title: 'コミュニケーション',
    description: 'AIによるメッセージ・タスク管理',
    items: [
      {
        href: '/dashboard/ai-vp/ask',
        icon: HelpCircle,
        title: 'ふくしゃに聞く',
        description: '判断相談（AI一次整理）',
        bgColor: 'bg-purple-100',
        iconColor: 'text-purple-600',
        status: 'available',
      },
      {
        href: '/dashboard/ai/inbox',
        icon: Inbox,
        title: 'AI受信箱',
        description: 'LWメッセージのAI返信管理',
        bgColor: 'bg-violet-100',
        iconColor: 'text-violet-600',
        status: 'available',
      },
      {
        href: '/dashboard/ai/todos',
        icon: ListTodo,
        title: 'AIタスク',
        description: 'AIからの提案タスク一覧',
        bgColor: 'bg-orange-100',
        iconColor: 'text-orange-600',
        status: 'available',
      },
      {
        href: '/dashboard/ai/policies',
        icon: Shield,
        title: 'ポリシー管理',
        description: 'AI動作ルールの設定',
        bgColor: 'bg-slate-100',
        iconColor: 'text-slate-600',
        status: 'preparing',
      },
    ],
  },
];

// 推奨アクションを判定
function getRecommendedAction(feature: OSFeature): { action: string; color: string } {
  const score = calculateCompositeScore(feature);
  if (score >= 14) return { action: '放置不可', color: 'text-red-600' };
  if (score >= 12) return { action: '今週着手', color: 'text-orange-600' };
  if (feature.roi && feature.roi >= 4) return { action: '短期効果大', color: 'text-green-600' };
  if (feature.priority && feature.priority >= 4) return { action: '要設計', color: 'text-blue-600' };
  return { action: '計画検討', color: 'text-zinc-600' };
}

// リスク種別を判定
function getRiskType(feature: OSFeature): string {
  const category = feature.category;
  if (category === 'risk') return '事故・炎上リスク';
  if (category === 'people') return '属人化リスク';
  if (category === 'document') return 'コンプライアンスリスク';
  if (category === 'finance') return '財務リスク';
  if (category === 'communication') return '情報伝達不全リスク';
  if (category === 'approval') return 'ガバナンスリスク';
  return '業務停滞リスク';
}

// 推奨期限を判定
function getRecommendedDeadline(feature: OSFeature): string {
  const risk = feature.risk ?? 0;
  if (risk >= 5) return '今週中';
  if (risk >= 4) return '今月中';
  return '今四半期';
}

export default function AiVpHubPage() {
  // 意思決定サマリーの計算
  const decisionSummary = useMemo(() => {
    // 今週やるべきTop3（planned or developing、スコア高い順）
    const actionableFeatures = OS_FEATURES
      .filter((f) => f.status === 'planned' || f.status === 'developing')
      .sort((a, b) => calculateCompositeScore(b) - calculateCompositeScore(a));
    const top3 = actionableFeatures.slice(0, 3);

    // 放置リスク警告（risk >= 4、status !== active）
    const riskWarnings = OS_FEATURES
      .filter((f) => (f.risk ?? 0) >= 4 && f.status !== 'active')
      .sort((a, b) => (b.risk ?? 0) - (a.risk ?? 0));

    // 次スプリント候補（ROI高い順、priority >= 3）
    const sprintCandidates = OS_FEATURES
      .filter((f) => (f.priority ?? 0) >= 3 && f.status === 'planned')
      .sort((a, b) => (b.roi ?? 0) - (a.roi ?? 0))
      .slice(0, 5);

    return { top3, riskWarnings, sprintCandidates };
  }, []);

  // 事業別Top3の取得
  const [businessTop3, setBusinessTop3] = useState<BusinessTop3ApiResponse | null>(null);
  const [businessTop3Loading, setBusinessTop3Loading] = useState(true);

  useEffect(() => {
    async function fetchBusinessTop3() {
      try {
        const res = await fetch('/api/ai-vp/business-top3');
        if (res.ok) {
          const data = await res.json();
          setBusinessTop3(data);
        }
      } catch (e) {
        console.error('[AI-VP] Failed to fetch business top3:', e);
      } finally {
        setBusinessTop3Loading(false);
      }
    }
    fetchBusinessTop3();
  }, []);

  // severity に応じたバッジスタイル
  const getSeverityBadgeStyle = (severity: ActionCandidate['severity']) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-700';
      case 'warning':
        return 'bg-amber-100 text-amber-700';
      default:
        return 'bg-blue-100 text-blue-700';
    }
  };

  return (
    <main className="pb-8">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* ヘッダー */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg">
            <Brain className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">AI副社長</h1>
            <p className="text-sm text-gray-500">経営判断支援・業務自動化アシスタント</p>
          </div>
        </div>

        {/* ===== 意思決定サマリー ===== */}
        <div className="mb-8 space-y-4">
          {/* セクション①：今週のTop3 */}
          <Card className="border-2 border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-orange-500 rounded-lg">
                  <Target className="w-4 h-4 text-white" />
                </div>
                <CardTitle className="text-lg text-orange-800">今週やるべき Top3</CardTitle>
              </div>
              <p className="text-sm text-orange-600 mt-1">
                経営優先度スコアに基づき、今週着手すべき機能を提示します
              </p>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3">
                {decisionSummary.top3.map((feature, index) => {
                  const score = calculateCompositeScore(feature);
                  const action = getRecommendedAction(feature);
                  return (
                    <Link
                      key={feature.id}
                      href={feature.path}
                      className="block p-3 bg-white rounded-lg border border-orange-100 hover:shadow-md transition-all"
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 flex items-center justify-center rounded-full font-bold text-sm ${
                          index === 0 ? 'bg-yellow-400 text-yellow-900' :
                          index === 1 ? 'bg-zinc-300 text-zinc-700' :
                          'bg-orange-300 text-orange-800'
                        }`}>
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-bold text-zinc-800">{feature.name}</h4>
                            <Badge className="bg-orange-100 text-orange-700 text-xs">
                              {score}/15
                            </Badge>
                            <span className={`text-xs font-medium ${action.color}`}>
                              {action.action}
                            </span>
                          </div>
                          <p className="text-sm text-zinc-600 mt-1">
                            優先度{feature.priority} / ROI{feature.roi} / リスク{feature.risk}
                            {' — '}{feature.description}
                          </p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-orange-400 flex-shrink-0" />
                      </div>
                    </Link>
                  );
                })}
                {decisionSummary.top3.length === 0 && (
                  <div className="text-center py-4 text-orange-600">
                    現在、未着手の高優先機能はありません
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* セクション①-B：事業別Top3（Task 042） */}
          <Card className="border-2 border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-emerald-500 rounded-lg">
                  <Building2 className="w-4 h-4 text-white" />
                </div>
                <CardTitle className="text-lg text-emerald-800">事業別 Top3</CardTitle>
                {businessTop3 && (
                  <Badge className="bg-emerald-100 text-emerald-700">
                    {businessTop3.businessUnits.length}事業
                  </Badge>
                )}
              </div>
              <p className="text-sm text-emerald-600 mt-1">
                各事業の今週やるべきアクションをスコア順で提示します
              </p>
            </CardHeader>
            <CardContent className="pt-0">
              {businessTop3Loading ? (
                <div className="text-center py-6 text-emerald-600">
                  読み込み中...
                </div>
              ) : businessTop3 && businessTop3.businessUnits.length > 0 ? (
                <div className="space-y-4">
                  {businessTop3.businessUnits.map((bu) => (
                    <div key={bu.businessUnitId} className="bg-white rounded-lg border border-emerald-100 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-bold text-zinc-800">{bu.businessUnitName}</span>
                        <Badge className="bg-zinc-100 text-zinc-600 text-xs">
                          {bu.businessUnitType}
                        </Badge>
                      </div>
                      {bu.actions.length > 0 ? (
                        <div className="space-y-2">
                          {bu.actions.map((action, idx) => (
                            <Link
                              key={action.key}
                              href={action.url}
                              className="flex items-start gap-2 p-2 rounded hover:bg-emerald-50 transition-all group"
                            >
                              <div className={`w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold flex-shrink-0 ${
                                idx === 0 ? 'bg-emerald-500 text-white' :
                                idx === 1 ? 'bg-emerald-300 text-emerald-800' :
                                'bg-emerald-200 text-emerald-700'
                              }`}>
                                {idx + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-zinc-800">{action.title}</span>
                                  <Badge className={`text-xs ${getSeverityBadgeStyle(action.severity)}`}>
                                    {action.severity === 'critical' ? '重大' :
                                     action.severity === 'warning' ? '注意' : '情報'}
                                  </Badge>
                                </div>
                                <p className="text-xs text-zinc-500 mt-0.5">{action.reason}</p>
                              </div>
                              <ExternalLink className="w-4 h-4 text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-zinc-500">今週の重要アクションはありません</p>
                      )}
                    </div>
                  ))}

                  {/* 全社アラート（globalAlerts）*/}
                  {businessTop3.globalAlerts && businessTop3.globalAlerts.length > 0 && (
                    <div className="bg-red-50 rounded-lg border border-red-100 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                        <span className="font-bold text-red-800">全社アラート Top3</span>
                      </div>
                      <div className="space-y-2">
                        {businessTop3.globalAlerts.map((alert, idx) => (
                          <Link
                            key={alert.key}
                            href={alert.url}
                            className="flex items-start gap-2 p-2 rounded hover:bg-red-100 transition-all group"
                          >
                            <div className={`w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold flex-shrink-0 ${
                              idx === 0 ? 'bg-red-500 text-white' :
                              idx === 1 ? 'bg-red-300 text-red-800' :
                              'bg-red-200 text-red-700'
                            }`}>
                              {idx + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-zinc-800">{alert.title}</span>
                                <Badge className={`text-xs ${getSeverityBadgeStyle(alert.severity)}`}>
                                  {alert.severity === 'critical' ? '重大' :
                                   alert.severity === 'warning' ? '注意' : '情報'}
                                </Badge>
                              </div>
                              <p className="text-xs text-zinc-500 mt-0.5">{alert.reason}</p>
                            </div>
                            <ExternalLink className="w-4 h-4 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-4 text-emerald-600">
                  閲覧可能な事業がありません（権限を確認してください）
                </div>
              )}
            </CardContent>
          </Card>

          {/* セクション②：放置リスク警告 */}
          {decisionSummary.riskWarnings.length > 0 && (
            <Card className="border-2 border-red-200 bg-gradient-to-r from-red-50 to-rose-50">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-red-500 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-white" />
                  </div>
                  <CardTitle className="text-lg text-red-800">放置リスク警告</CardTitle>
                  <Badge className="bg-red-100 text-red-700">
                    {decisionSummary.riskWarnings.length}件
                  </Badge>
                </div>
                <p className="text-sm text-red-600 mt-1">
                  放置すると経営リスクにつながる可能性のある機能です
                </p>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {decisionSummary.riskWarnings.slice(0, 5).map((feature) => (
                    <Link
                      key={feature.id}
                      href={feature.path}
                      className="flex items-center justify-between p-3 bg-white rounded-lg border border-red-100 hover:shadow-md transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <Flame className="w-4 h-4 text-red-500" />
                        <div>
                          <span className="font-medium text-zinc-800">{feature.name}</span>
                          <span className="text-sm text-red-600 ml-2">
                            — {getRiskType(feature)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-red-100 text-red-700 text-xs flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {getRecommendedDeadline(feature)}
                        </Badge>
                        <ChevronRight className="w-4 h-4 text-red-400" />
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* セクション③：次スプリント候補 */}
          <Card className="border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-500 rounded-lg">
                  <Zap className="w-4 h-4 text-white" />
                </div>
                <CardTitle className="text-lg text-blue-800">次スプリント候補</CardTitle>
              </div>
              <p className="text-sm text-blue-600 mt-1">
                ROIが高く、短期効果が見込める機能です
              </p>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {decisionSummary.sprintCandidates.map((feature) => (
                  <Link
                    key={feature.id}
                    href={feature.path}
                    className="flex items-center gap-3 p-3 bg-white rounded-lg border border-blue-100 hover:shadow-md transition-all"
                  >
                    <TrendingUp className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-zinc-800 truncate">{feature.name}</div>
                      <div className="text-xs text-blue-600">
                        ROI {feature.roi}/5 — {feature.description.slice(0, 20)}...
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  </Link>
                ))}
                {decisionSummary.sprintCandidates.length === 0 && (
                  <div className="col-span-2 text-center py-4 text-blue-600">
                    現在、候補となる機能はありません
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* クイックリンク */}
          <div className="flex flex-wrap justify-center gap-6">
            <Link
              href="/dashboard/executive-summary"
              className="inline-flex items-center gap-2 text-sm text-indigo-500 hover:text-indigo-700"
            >
              経営会議用サマリー
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/dashboard/os-map"
              className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-700"
            >
              全機能の優先度を確認 → OSマップ
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/dashboard/tickets"
              className="inline-flex items-center gap-2 text-sm text-violet-500 hover:text-violet-700"
            >
              開発チケット一覧を確認
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* 注意書き */}
        <Card className="mb-6 bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-blue-800">
                  AI副社長は経営判断の参考情報を提供します
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  個人の評価・査定には使用しません。最終的な判断は人間が行います。
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* メニューカテゴリ */}
        <div className="space-y-6">
          {MENU_CATEGORIES.map((category) => (
            <Card key={category.title}>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">{category.title}</CardTitle>
                <p className="text-sm text-gray-500">{category.description}</p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {category.items.map((item) => {
                    const isAvailable = item.status === 'available';

                    const content = (
                      <div
                        className={`p-4 border rounded-lg transition-all ${
                          isAvailable
                            ? 'hover:shadow-md hover:bg-gray-50 cursor-pointer'
                            : 'opacity-60 cursor-not-allowed bg-gray-50'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`p-2 ${item.bgColor} rounded-lg flex-shrink-0`}>
                            <item.icon className={`w-5 h-5 ${item.iconColor}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium text-gray-900">{item.title}</h3>
                              {!isAvailable && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-200 text-gray-600 text-xs rounded-full">
                                  <Clock className="w-3 h-3" />
                                  準備中
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-500 mt-1">{item.description}</p>
                          </div>
                          {isAvailable ? (
                            <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          ) : (
                            <Lock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          )}
                        </div>
                      </div>
                    );

                    if (isAvailable) {
                      return (
                        <Link key={item.href} href={item.href} className="block">
                          {content}
                        </Link>
                      );
                    }

                    return (
                      <div key={item.href}>
                        {content}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* 管理者向けリンク */}
        <div className="mt-8 text-center">
          <Link
            href="/admin/ai-vp"
            className="text-sm text-gray-500 hover:text-gray-700 hover:underline"
          >
            管理者向け設定・抽出管理 →
          </Link>
        </div>
      </div>
    </main>
  );
}
