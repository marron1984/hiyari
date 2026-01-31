'use client';

import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import {
  Brain,
  Users,
  Heart,
  Calculator,
  BookOpen,
  MessageSquare,
  Inbox,
  Building2,
  ListTodo,
  Shield,
  Activity,
  Clock,
  ArrowRight,
  Lock,
  HelpCircle,
} from 'lucide-react';

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
        description: '副社長への質問・相談',
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

export default function AiVpHubPage() {
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
