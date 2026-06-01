'use client';

import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import {
  BookOpen,
  ExternalLink,
  MessageCircle,
  Building2,
  Users,
  Settings,
  Info,
  ArrowRight,
  Shield,
} from 'lucide-react';

// NotebookLM URL
const NOTEBOOKLM_URL = 'https://notebooklm.google.com/notebook/6ca2fe2f-2716-4add-8ea2-3faeb5c6750e';

// 知識カテゴリ定義
interface KnowledgeItem {
  title: string;
  description: string;
}

interface KnowledgeCategory {
  title: string;
  icon: typeof BookOpen;
  iconColor: string;
  bgColor: string;
  items: KnowledgeItem[];
}

const KNOWLEDGE_CATEGORIES: KnowledgeCategory[] = [
  {
    title: '経営・思想',
    icon: Building2,
    iconColor: 'text-blue-600',
    bgColor: 'bg-blue-100',
    items: [
      {
        title: 'DHP.OS.HUB ブランド思想',
        description: '判断は、ひとりで背負わない。責任は、最後まで引き受ける。',
      },
      {
        title: '経営理念・ビジョン',
        description: '組織の目指す方向性と価値観',
      },
      {
        title: '意思決定ガイドライン',
        description: '判断に迷ったときの指針',
      },
    ],
  },
  {
    title: '人事・組織',
    icon: Users,
    iconColor: 'text-green-600',
    bgColor: 'bg-green-100',
    items: [
      {
        title: '就業規則・人事制度',
        description: '働き方のルールと制度',
      },
      {
        title: '評価・等級制度',
        description: '成長と評価の仕組み',
      },
      {
        title: '福利厚生・手当',
        description: '各種手当と福利厚生制度',
      },
    ],
  },
  {
    title: '運用・実務',
    icon: Settings,
    iconColor: 'text-purple-600',
    bgColor: 'bg-purple-100',
    items: [
      {
        title: '業務マニュアル',
        description: '日常業務の手順と注意点',
      },
      {
        title: '報告・申請フロー',
        description: '各種申請の方法と承認フロー',
      },
      {
        title: 'トラブル対応ガイド',
        description: '緊急時・例外時の対応方法',
      },
    ],
  },
];

export default function KnowledgeHubPage() {
  const handleOpenContent = () => {
    window.open(NOTEBOOKLM_URL, '_blank', 'noopener,noreferrer');
  };

  const handleAskQuestion = () => {
    window.open(NOTEBOOKLM_URL, '_blank', 'noopener,noreferrer');
  };

  return (
    <main className="pb-8">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* ヘッダー */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg">
            <BookOpen className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">知識ハブ</h1>
            <p className="text-sm text-gray-500">公式ドキュメント・AI参照</p>
          </div>
        </div>

        {/* 説明カード */}
        <Card className="mb-6 bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-2">
                  組織の知識を、いつでも・誰でも・すぐに参照できる場所
                </p>
                <p className="text-blue-700">
                  NotebookLMを活用し、公式ドキュメントをAIが読み解きます。
                  内容を見たり、質問したりすることで、必要な情報にすばやくアクセスできます。
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 判断と責任のOS リンク */}
        <Link href="/dashboard/os/decision">
          <Card className="mb-6 bg-gradient-to-r from-zinc-50 to-blue-50 border-zinc-200 hover:border-blue-300 transition-colors cursor-pointer">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Shield className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-zinc-900">判断と責任のOS</p>
                    <p className="text-sm text-zinc-500">判断は下から上へ、責任は上で止まる</p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-zinc-400" />
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* 知識カテゴリ */}
        <div className="space-y-6 mb-8">
          {KNOWLEDGE_CATEGORIES.map((category) => (
            <Card key={category.title}>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <div className={`p-1.5 ${category.bgColor} rounded-lg`}>
                    <category.icon className={`w-4 h-4 ${category.iconColor}`} />
                  </div>
                  {category.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {category.items.map((item) => (
                    <div
                      key={item.title}
                      className="p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div className="flex-1">
                          <h3 className="font-medium text-gray-900">{item.title}</h3>
                          <p className="text-sm text-gray-500 mt-0.5">{item.description}</p>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={handleOpenContent}
                            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                          >
                            <BookOpen className="w-4 h-4" />
                            内容を見る
                            <ExternalLink className="w-3 h-3" />
                          </button>
                          <button
                            onClick={handleAskQuestion}
                            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors"
                          >
                            <MessageCircle className="w-4 h-4" />
                            質問する
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* フッター注記 */}
        <Card className="bg-gray-50 border-gray-200">
          <CardContent className="p-4">
            <div className="text-sm text-gray-600 space-y-2">
              <p className="font-medium text-gray-700">知識ハブについて</p>
              <ul className="space-y-1 text-gray-500">
                <li>・ 各項目は NotebookLM にリンクしています</li>
                <li>・ AIが公式ドキュメントを読み込み、質問に回答します</li>
                <li>・ 回答は参考情報です。重要な判断は上長に確認してください</li>
                <li>・ ドキュメントの追加・更新は管理者にお問い合わせください</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
