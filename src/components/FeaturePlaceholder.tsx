'use client';

import Link from 'next/link';
import { Card, CardContent, Button } from '@/components/ui';
import { Construction, ArrowLeft, MessageSquare, ExternalLink, Clock, EyeOff } from 'lucide-react';
import { OS_FEATURE_STATUS_CONFIG, type OSFeatureStatus } from '@/config/osFeatures';

interface FeaturePlaceholderProps {
  title: string;
  description: string;
  category?: string;
  status: OSFeatureStatus;
}

const NOTEBOOKLM_URL = 'https://notebooklm.google.com/notebook/6ca2fe2f-2716-4add-8ea2-3faeb5c6750e';

/**
 * 機能プレースホルダ
 * 「存在したら表示」の思想に基づき、全ステータスのページを表示する
 */
export function FeaturePlaceholder({
  title,
  description,
  category,
  status,
}: FeaturePlaceholderProps) {
  const statusConfig = OS_FEATURE_STATUS_CONFIG[status];

  const handleOpenNotebookLM = () => {
    window.open(NOTEBOOKLM_URL, '_blank', 'noopener,noreferrer');
  };

  // ステータスに応じたアイコンとメッセージ
  const getStatusInfo = () => {
    switch (status) {
      case 'developing':
        return {
          icon: Clock,
          iconBg: 'bg-yellow-100',
          iconColor: 'text-yellow-600',
          message: 'この機能は現在開発中です。近日中に利用可能になる予定です。',
        };
      case 'planned':
        return {
          icon: Construction,
          iconBg: 'bg-red-100',
          iconColor: 'text-red-600',
          message: 'この機能は現在 未着手 ステータスです。OS上で管理されており、今後実装予定です。',
        };
      case 'hidden':
        return {
          icon: EyeOff,
          iconBg: 'bg-zinc-200',
          iconColor: 'text-zinc-600',
          message: 'この機能は現在 非公開 ステータスです。管理者のみがアクセスできます。',
        };
      default:
        return {
          icon: Construction,
          iconBg: 'bg-zinc-100',
          iconColor: 'text-zinc-600',
          message: 'この機能は準備中です。',
        };
    }
  };

  const statusInfo = getStatusInfo();
  const StatusIcon = statusInfo.icon;

  return (
    <main className="pb-8">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <Card className="text-center">
          <CardContent className="p-8">
            {/* アイコン */}
            <div className={`w-16 h-16 mx-auto mb-6 ${statusInfo.iconBg} rounded-full flex items-center justify-center`}>
              <StatusIcon className={`w-8 h-8 ${statusInfo.iconColor}`} />
            </div>

            {/* タイトル */}
            <h1 className="text-2xl font-bold text-zinc-800 mb-2">{title}</h1>
            {category && (
              <p className="text-sm text-zinc-500 mb-4">{category}</p>
            )}

            {/* 説明 */}
            <p className="text-zinc-600 mb-6">{description}</p>

            {/* ステータスバッジ */}
            <div className={`inline-flex items-center gap-2 px-4 py-2 ${statusConfig.bgColor} ${statusConfig.color} rounded-full text-sm font-medium mb-8`}>
              <span>{statusConfig.emoji}</span>
              {statusConfig.label}
            </div>

            {/* メッセージ */}
            <div className="bg-zinc-50 rounded-lg p-4 mb-6 text-left">
              <p className="text-sm text-zinc-600">
                {statusInfo.message}
              </p>
            </div>

            {/* アクション */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/dashboard/os-map">
                <Button variant="outline" className="w-full sm:w-auto">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  OSマップに戻る
                </Button>
              </Link>
              <button
                onClick={handleOpenNotebookLM}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              >
                <MessageSquare className="w-4 h-4" />
                AI副社長に相談する
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          </CardContent>
        </Card>

        {/* フッター */}
        <p className="text-center text-sm text-zinc-400 mt-6">
          AA.OS.HUB — 全体を見渡し、一つずつ前へ。
        </p>
      </div>
    </main>
  );
}
